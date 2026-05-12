import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { Camera, CheckCircle2, XCircle, Loader2, AlertTriangle, ScanFace, LogIn, LogOut, Pencil, Trash2, Save, ShieldCheck, Activity } from 'lucide-react';
import { Staff, Attendance } from '../types';
import { useFaceApi, eyeAspectRatio, textureLivenessScore } from '../hooks/useFaceApi';
import { faceEmbeddingService, FaceEmbedding } from '../services/faceEmbeddingService';
import { attendanceService } from '../services/attendanceService';
import { punchEventService } from '../services/punchEventService';
import { isSunday } from '../utils/salaryCalculations';
import { shiftService, determineStatus, formatTime12h, ShiftWindows } from '../services/shiftService';

interface Props {
  staff: Staff[];                 // already location-scoped by App
  attendance: Attendance[];
  onAttendanceUpdated?: () => void;
  userRole: 'admin' | 'manager';
}

// Tighter than the standard face-api 0.6 to reduce false positives
const MATCH_THRESHOLD = 0.5;
// Minimum gap between two punches for the SAME staff (smart toggle IN<->OUT)
const TOGGLE_MIN_SECONDS = 5 * 60;     // 5 minutes
// Cooldown for the same kind (prevents double-IN flooding)
const SAME_KIND_COOLDOWN = 60;         // 1 minute
// Frames of stable detection required before accepting a match (passive liveness)
const REQUIRED_STABLE_FRAMES = 3;
// EAR threshold under which an eye is considered "closed" (blink challenge)
const EAR_CLOSED = 0.21;

type RecentEvent = {
  staffId: string;
  staffName: string;
  kind: 'in' | 'out';
  time: string;
  distance: number;
};

const formatNow = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
};

const FaceAttendance: React.FC<Props> = ({ staff, attendance, onAttendanceUpdated, userRole }) => {
  const { ready, loading, error, detect } = useFaceApi(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastPunchRef = useRef<Record<string, { ts: number; kind: 'in' | 'out' }>>({});
  // FaceMatcher — rebuilt when embeddings change, gives O(1) lookup
  const matcherRef = useRef<faceapi.FaceMatcher | null>(null);
  // Liveness tracking
  const candidateRef = useRef<{
    staffId: string | null;
    frames: number;
    boxes: { x: number; y: number; w: number; h: number }[];
    earSeries: number[];
    blinkSeen: boolean;
    textureScores: number[];
  }>({ staffId: null, frames: 0, boxes: [], earSeries: [], blinkSeen: false, textureScores: [] });

  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [allEmbeddings, setAllEmbeddings] = useState<FaceEmbedding[]>([]);
  const [loadingEmbeddings, setLoadingEmbeddings] = useState(true);
  const [shiftWindows, setShiftWindows] = useState<ShiftWindows | null>(null);
  const [recent, setRecent] = useState<RecentEvent[]>([]);
  const [lastMatch, setLastMatch] = useState<{ name: string; distance: number; ts: number; status: 'matching' | 'live-check' | 'blink-please' | 'ok' | 'wrong-loc' | 'spoof' | 'unknown' } | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err' | 'warn'; text: string } | null>(null);
  const [editing, setEditing] = useState<Record<string, { arrival: string; leaving: string }>>({});

  const today = useMemo(() => new Date().toISOString().split('T')[0], []);

  const todaysPunches = useMemo(() => {
    return attendance
      .filter(a => a.date === today && !a.isPartTime && (a.arrivalTime || a.leavingTime))
      .map(a => ({ ...a, staff: staff.find(s => s.id === a.staffId) }))
      .sort((a, b) => (a.arrivalTime || '').localeCompare(b.arrivalTime || ''));
  }, [attendance, today, staff]);

  // ---- Location scoping -----------------------------------------------------
  // staff[] is already location-scoped by App.tsx for managers. Build a quick
  // lookup of allowed staff IDs and a SEPARATE map of all enrolled embeddings
  // so we can detect "wrong location" attempts and surface a clear error.
  const allowedStaffIds = useMemo(() => new Set(staff.map(s => s.id)), [staff]);
  const scopedEmbeddings = useMemo(
    () => allEmbeddings.filter(e => allowedStaffIds.has(e.staffId)),
    [allEmbeddings, allowedStaffIds],
  );

  const staffById = useMemo(() => {
    const map = new Map<string, Staff>();
    staff.forEach(s => map.set(s.id, s));
    return map;
  }, [staff]);

  const enrolledStaffIds = useMemo(() => new Set(scopedEmbeddings.map(e => e.staffId)), [scopedEmbeddings]);

  // ---- Rebuild FaceMatcher whenever embeddings change ----------------------
  // Groups all embeddings by staffId into LabeledFaceDescriptors for O(1) match
  useEffect(() => {
    if (allEmbeddings.length === 0) { matcherRef.current = null; return; }
    const groups = faceEmbeddingService.toFloat32Groups(allEmbeddings);
    const labeled = Array.from(groups.entries()).map(
      ([id, descs]) => new faceapi.LabeledFaceDescriptors(id, descs)
    );
    matcherRef.current = new faceapi.FaceMatcher(labeled, MATCH_THRESHOLD);
  }, [allEmbeddings]);

  // ---- Helpers --------------------------------------------------------------
  const recomputeStatus = (arrival: string, leaving: string, s?: Staff) => {
    if (!shiftWindows || !s) return { status: 'Present' as const, value: 1 };
    const win = shiftService.resolve(s, shiftWindows);
    const { status } = determineStatus(arrival || undefined, leaving || undefined, win);
    return { status, value: status === 'Present' ? 1 : status === 'Half Day' ? 0.5 : 0 };
  };

  const saveOverride = async (rec: Attendance) => {
    const edit = editing[rec.id!];
    if (!edit) return;
    const s = staff.find(x => x.id === rec.staffId);
    const { status, value } = recomputeStatus(edit.arrival, edit.leaving, s);
    try {
      await attendanceService.upsert({
        staffId: rec.staffId, date: rec.date, status, attendanceValue: value,
        isSunday: rec.isSunday, isPartTime: false, staffName: rec.staffName,
        shift: rec.shift, location: rec.location,
        arrivalTime: edit.arrival || undefined, leavingTime: edit.leaving || undefined,
        isUninformed: rec.isUninformed, salaryOverride: true,
      } as any);
      setEditing(p => { const n = { ...p }; delete n[rec.id!]; return n; });
      setMessage({ kind: 'ok', text: `Updated ${rec.staffName} → ${status}` });
      onAttendanceUpdated?.();
    } catch (e: any) {
      setMessage({ kind: 'err', text: `Save failed: ${e?.message || e}` });
    }
  };

  const clearPunches = async (rec: Attendance) => {
    if (!window.confirm(`Clear today's punches for ${rec.staffName}?`)) return;
    try {
      await attendanceService.upsert({
        staffId: rec.staffId, date: rec.date, status: 'Absent', attendanceValue: 0,
        isSunday: rec.isSunday, isPartTime: false, staffName: rec.staffName,
        shift: rec.shift, location: rec.location,
        arrivalTime: undefined, leavingTime: undefined, isUninformed: rec.isUninformed,
      } as any);
      setMessage({ kind: 'warn', text: `Cleared punches for ${rec.staffName}` });
      onAttendanceUpdated?.();
    } catch (e: any) {
      setMessage({ kind: 'err', text: `Clear failed: ${e?.message || e}` });
    }
  };

  // Load all approved embeddings + shift windows once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingEmbeddings(true);
        const [list, sw] = await Promise.all([
          faceEmbeddingService.getAllApproved(),
          shiftService.loadGlobal(true),
        ]);
        if (!cancelled) { setAllEmbeddings(list); setShiftWindows(sw); }
      } catch (e: any) {
        if (!cancelled) setMessage({ kind: 'err', text: e?.message || 'Failed to load face data' });
      } finally {
        if (!cancelled) setLoadingEmbeddings(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ---- Camera ---------------------------------------------------------------
  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      // 640×480 is plenty for close-up kiosk — faster inference than 1280×720
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraOn(true);
    } catch (e: any) {
      setCameraError(e?.message || 'Camera access denied');
      setCameraOn(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  }, []);

  // Auto-start camera as soon as models + embeddings are ready
  useEffect(() => {
    if (ready && !loadingEmbeddings && scopedEmbeddings.length > 0 && !cameraOn && !cameraError) {
      startCamera();
    }
  }, [ready, loadingEmbeddings, scopedEmbeddings.length, cameraOn, cameraError, startCamera]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // ---- Match search via FaceMatcher (O(1) vs O(n) raw loop) ---------------
  const findBestMatch = useCallback((descriptor: Float32Array) => {
    if (!matcherRef.current) return { staffId: null as string | null, distance: Infinity };
    const result = matcherRef.current.findBestMatch(descriptor);
    if (result.label === 'unknown') return { staffId: null as string | null, distance: result.distance };
    return { staffId: result.label, distance: result.distance };
  }, []);

  // ---- Smart multi-punch toggle --------------------------------------------
  const punch = useCallback(async (s: Staff, distance: number, livenessScore: number) => {
    const time = formatNow();
    const last = lastPunchRef.current[s.id];
    const existing = attendance.find(a => a.staffId === s.id && a.date === today && !a.isPartTime);
    const sinceLast = last ? (Date.now() - last.ts) / 1000 : Infinity;

    // Determine kind: toggle if past min gap, else repeat last kind only after same-kind cooldown
    let kind: 'in' | 'out';
    if (last) {
      if (sinceLast >= TOGGLE_MIN_SECONDS) {
        kind = last.kind === 'in' ? 'out' : 'in';
      } else if (sinceLast >= SAME_KIND_COOLDOWN) {
        return; // too soon to toggle, ignore
      } else {
        return;
      }
    } else {
      // First punch today (or after server reload) — IN if no existing arrival, else OUT
      kind = existing?.arrivalTime ? 'out' : 'in';
    }

    // Save audit event
    await punchEventService.insert({
      staffId: s.id, staffName: s.name, location: s.location,
      date: today, eventTime: time, kind, source: 'face',
      matchDistance: distance, livenessScore,
    });

    // Refresh attendance row using ALL today's events for this staff
    const events = await punchEventService.listByDate(today, s.id);
    const summary = punchEventService.summarize(events);
    const arrivalTime = summary.firstIn || (kind === 'in' ? time : existing?.arrivalTime);
    const leavingTime = summary.lastOut || (kind === 'out' ? time : existing?.leavingTime);

    let autoStatus: 'Present' | 'Half Day' | 'Absent' = 'Present';
    let autoValue = 1;
    if (shiftWindows) {
      const win = shiftService.resolve(s, shiftWindows);
      // Use total worked minutes from events for richer status
      const hours = summary.minutes / 60;
      const { status } = determineStatus(arrivalTime, leavingTime, win);
      autoStatus = status;
      // If total worked hours satisfy full-day threshold, lift to Present
      if (hours >= win.minHoursFull) { autoStatus = 'Present'; autoValue = 1; }
      else if (hours >= win.minHoursHalf) { autoStatus = autoStatus === 'Absent' ? 'Half Day' : autoStatus; autoValue = autoStatus === 'Present' ? 1 : 0.5; }
      else { autoValue = autoStatus === 'Present' ? 1 : autoStatus === 'Half Day' ? 0.5 : 0; }
    }

    try {
      await attendanceService.upsert({
        staffId: s.id, date: today, status: autoStatus, attendanceValue: autoValue,
        isSunday: isSunday(today), isPartTime: false, staffName: s.name,
        shift: s.shift, location: s.location,
        arrivalTime, leavingTime, isUninformed: false,
      });
      lastPunchRef.current[s.id] = { ts: Date.now(), kind };
      setRecent(prev => [{ staffId: s.id, staffName: s.name, kind, time, distance }, ...prev].slice(0, 20));
      setMessage({
        kind: autoStatus === 'Absent' ? 'warn' : 'ok',
        text: `${kind === 'in' ? 'Punched IN' : 'Punched OUT'}: ${s.name} @ ${formatTime12h(time)} · ${autoStatus} · ${summary.count} event(s)`,
      });
      onAttendanceUpdated?.();
    } catch (e: any) {
      setMessage({ kind: 'err', text: `Failed to punch ${s.name}: ${e?.message || e}` });
    }
  }, [attendance, today, onAttendanceUpdated, shiftWindows]);

  // ---- Continuous recognition loop (requestAnimationFrame, frame-skipped) ---
  useEffect(() => {
    if (!ready || !cameraOn || allEmbeddings.length === 0) return;
    let cancelled = false;
    let rafId = 0;
    let frameCount = 0;
    let processing = false; // prevent overlapping async inference

    const resetCandidate = () => {
      candidateRef.current = { staffId: null, frames: 0, boxes: [], earSeries: [], blinkSeen: false, textureScores: [] };
    };

    const onFrame = async () => {
      if (cancelled) return;
      frameCount++;
      // Run inference every 3rd frame (~10/s at 30fps) — responsive but not GPU-hammering
      if (frameCount % 3 === 0 && !processing && videoRef.current && videoRef.current.readyState >= 2) {
        processing = true;
        try {
          // inputSize 224 → ~80-150 ms vs 400-600 ms at 416
          const r = await detect(videoRef.current, { inputSize: 224, scoreThreshold: 0.4, withLandmarks: true });

          if (!r) {
            setLastMatch(null);
            resetCandidate();
          } else {
            const desc32 = new Float32Array(r.descriptor);
            const { staffId, distance } = findBestMatch(desc32);

            if (!staffId || distance >= MATCH_THRESHOLD) {
              setLastMatch({ name: 'Unknown face', distance, ts: Date.now(), status: 'unknown' });
              resetCandidate();
            } else if (!allowedStaffIds.has(staffId)) {
              // Wrong location
              const wrongStaff = allEmbeddings.find(e => e.staffId === staffId);
              setLastMatch({ name: wrongStaff?.staffName || 'Other location', distance, ts: Date.now(), status: 'wrong-loc' });
              setMessage({ kind: 'err', text: `${wrongStaff?.staffName || 'This staff'} does not belong to this location.` });
              resetCandidate();
            } else {
              const s = staffById.get(staffId);
              if (!s || !s.isActive) {
                setLastMatch({ name: 'Inactive staff', distance, ts: Date.now(), status: 'unknown' });
                resetCandidate();
              } else {
                // ── Passive liveness tracking ────────────────────────────
                const cand = candidateRef.current;
                if (cand.staffId !== staffId) { resetCandidate(); cand.staffId = staffId; }
                cand.frames++;
                cand.boxes.push({ x: r.box.x, y: r.box.y, w: r.box.width, h: r.box.height });
                if (cand.boxes.length > 6) cand.boxes.shift();

                // EAR blink
                if (r.landmarks) {
                  const ear = (eyeAspectRatio(r.landmarks.getLeftEye()) + eyeAspectRatio(r.landmarks.getRightEye())) / 2;
                  cand.earSeries.push(ear);
                  if (cand.earSeries.length > 12) cand.earSeries.shift();
                  if (ear < EAR_CLOSED) cand.blinkSeen = true;
                }

                // Texture liveness (green-channel local variance — catches photos/screens)
                const tex = textureLivenessScore(videoRef.current!, r.box);
                cand.textureScores.push(tex);
                if (cand.textureScores.length > 6) cand.textureScores.shift();
                const avgTexture = cand.textureScores.reduce((a, b) => a + b, 0) / cand.textureScores.length;

                // Box movement
                let boxMovement = 0;
                for (let i = 1; i < cand.boxes.length; i++) {
                  boxMovement += Math.abs(cand.boxes[i].x - cand.boxes[i-1].x) + Math.abs(cand.boxes[i].y - cand.boxes[i-1].y);
                }

                // EAR variance
                let earVariance = 0;
                if (cand.earSeries.length >= 4) {
                  const mean = cand.earSeries.reduce((a, b) => a + b, 0) / cand.earSeries.length;
                  earVariance = cand.earSeries.reduce((a, b) => a + (b - mean) ** 2, 0) / cand.earSeries.length;
                }

                const passiveLive = boxMovement > 2 || earVariance > 0.0008;
                const livenessScore = Math.min(1, (boxMovement / 30) + earVariance * 200 + (cand.blinkSeen ? 0.4 : 0) + avgTexture * 0.3);

                if (cand.frames < REQUIRED_STABLE_FRAMES) {
                  setLastMatch({ name: s.name, distance, ts: Date.now(), status: 'matching' });
                } else if (!passiveLive && !cand.blinkSeen) {
                  setLastMatch({ name: s.name, distance, ts: Date.now(), status: 'blink-please' });
                } else if (cand.frames >= 8 && boxMovement < 1 && earVariance < 0.0002 && !cand.blinkSeen && avgTexture < 0.35) {
                  // Spoof: no movement + no blink + flat texture (photo/screen)
                  setLastMatch({ name: s.name, distance, ts: Date.now(), status: 'spoof' });
                  setMessage({ kind: 'err', text: `Liveness failed for ${s.name} — possible photo spoof. Please blink.` });
                  resetCandidate();
                } else {
                  setLastMatch({ name: s.name, distance, ts: Date.now(), status: 'ok' });
                  await punch(s, distance, livenessScore);
                  resetCandidate();
                  // Pause 1.2 s before scanning next person
                  await new Promise(res => setTimeout(res, 1200));
                }
              }
            }
          }
        } catch { /* ignore frame errors */ }
        processing = false;
      }
      if (!cancelled) rafId = requestAnimationFrame(onFrame);
    };

    rafId = requestAnimationFrame(onFrame);
    return () => { cancelled = true; cancelAnimationFrame(rafId); };
  }, [ready, cameraOn, allEmbeddings, detect, findBestMatch, staffById, allowedStaffIds, punch]);

  const enrolledCount = enrolledStaffIds.size;
  const totalActive = staff.filter(s => s.isActive).length;

  const statusBadge = (status: NonNullable<typeof lastMatch>['status']) => {
    const map: Record<string, string> = {
      matching: 'bg-blue-500/80',
      'live-check': 'bg-blue-500/80',
      'blink-please': 'bg-amber-500/90',
      ok: 'bg-emerald-500/90',
      'wrong-loc': 'bg-red-500/90',
      spoof: 'bg-red-600/90',
      unknown: 'bg-amber-500/80',
    };
    const text: Record<string, string> = {
      matching: 'Verifying…',
      'live-check': 'Live check…',
      'blink-please': 'Please blink',
      ok: 'Verified',
      'wrong-loc': 'Wrong location',
      spoof: 'Spoof detected',
      unknown: 'Unknown',
    };
    return <span className={`px-3 py-1.5 rounded-full font-semibold text-white ${map[status]}`}>{text[status]}</span>;
  };

  return (
    <div className="space-y-4 w-full max-w-6xl mx-auto py-4">
      <div className="rounded-2xl bg-[var(--bg-card)] border border-[var(--glass-border)] p-4 md:p-6">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
          <div>
            <h2 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
              <ScanFace size={22} className="text-indigo-400" />
              Face Attendance · Kiosk mode
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              Always-on recognition with liveness check. First match = IN, then auto-toggles IN↔OUT every {TOGGLE_MIN_SECONDS/60} min for lunch/tea/errands.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="text-xs px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-400/30 text-indigo-300">
              {enrolledCount}/{totalActive} enrolled
            </span>
            <span className="text-xs px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-400/30 text-emerald-300 flex items-center gap-1">
              <Activity size={12} /> Liveness on
            </span>
          </div>
        </div>

        {error && (
          <div className="mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm flex items-center gap-2">
            <AlertTriangle size={16} /> {error}
          </div>
        )}
        {(loading || loadingEmbeddings) && (
          <div className="mb-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-300 text-sm flex items-center gap-2">
            <Loader2 size={16} className="animate-spin" />
            {loading ? 'Loading face models…' : `Loading ${allEmbeddings.length} face samples…`}
          </div>
        )}
        {!loadingEmbeddings && scopedEmbeddings.length === 0 && (
          <div className="mb-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm flex items-center gap-2">
            <AlertTriangle size={16} /> No face samples enrolled for this location yet. Register staff in their portal or via Staff Management.
          </div>
        )}

        <div className="relative w-full max-w-3xl mx-auto aspect-[4/3] bg-black/50 rounded-2xl overflow-hidden border border-[var(--glass-border)]">
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
          {!cameraOn && (
            <div className="absolute inset-0 flex items-center justify-center text-[var(--text-secondary)] text-sm">
              {cameraError ? 'Camera blocked' : 'Starting camera…'}
            </div>
          )}
          {cameraOn && lastMatch && (
            <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                {statusBadge(lastMatch.status)}
                <span className="px-3 py-1.5 rounded-full bg-black/70 text-white">{lastMatch.name}</span>
              </div>
              <span className="px-3 py-1.5 rounded-full bg-black/70 text-white">d {lastMatch.distance.toFixed(2)}</span>
            </div>
          )}
        </div>

        {cameraError && (
          <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
            {cameraError}
          </div>
        )}

        <div className="flex flex-wrap gap-2 justify-center mt-4">
          {!cameraOn ? (
            <button
              onClick={startCamera}
              disabled={!ready || scopedEmbeddings.length === 0}
              className="px-5 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white font-semibold flex items-center gap-2"
            >
              <Camera size={16} /> Start Camera
            </button>
          ) : (
            <button
              onClick={stopCamera}
              className="px-5 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--glass-border)] text-[var(--text-primary)] font-semibold flex items-center gap-2"
            >
              <XCircle size={16} /> Stop
            </button>
          )}
        </div>

        {message && (
          <div className={`mt-3 p-3 rounded-lg text-sm border flex items-center gap-2 ${
            message.kind === 'ok' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' :
            message.kind === 'warn' ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' :
            'bg-red-500/10 border-red-500/30 text-red-300'
          }`}>
            {message.kind === 'ok' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            {message.text}
          </div>
        )}
      </div>

      {/* Recent events */}
      <div className="rounded-2xl bg-[var(--bg-card)] border border-[var(--glass-border)] p-4 md:p-6">
        <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Recent punches</h4>
        {recent.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Nothing yet — recognized staff will appear here.</p>
        ) : (
          <div className="space-y-2">
            {recent.map((r, idx) => (
              <div key={idx} className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-black/10 border border-[var(--glass-border)]">
                <div className="flex items-center gap-2">
                  {r.kind === 'in'
                    ? <span className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400"><LogIn size={14} /></span>
                    : <span className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400"><LogOut size={14} /></span>}
                  <div>
                    <div className="text-sm font-semibold text-[var(--text-primary)]">{r.staffName}</div>
                    <div className="text-[11px] text-[var(--text-secondary)]">
                      {r.kind === 'in' ? 'Punched IN' : 'Punched OUT'} · d {r.distance.toFixed(2)}
                    </div>
                  </div>
                </div>
                <span className="text-xs font-mono text-[var(--text-secondary)]">{formatTime12h(r.time)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Admin override panel */}
      {userRole === 'admin' && (
        <div className="rounded-2xl bg-[var(--bg-card)] border border-[var(--glass-border)] p-4 md:p-6">
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <h4 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <ShieldCheck size={16} className="text-emerald-400" />
              Override panel — today's punches
            </h4>
            <span className="text-xs text-[var(--text-secondary)]">{todaysPunches.length} record(s)</span>
          </div>
          {todaysPunches.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">No punches recorded today yet.</p>
          ) : (
            <div className="space-y-2">
              {todaysPunches.map(rec => {
                const edit = editing[rec.id!];
                const isEditing = !!edit;
                return (
                  <div key={rec.id} className="p-3 rounded-xl bg-black/10 border border-[var(--glass-border)] flex items-center gap-3 flex-wrap">
                    <div className="flex-1 min-w-[160px]">
                      <div className="text-sm font-semibold text-[var(--text-primary)]">{rec.staffName}</div>
                      <div className="text-[11px] text-[var(--text-secondary)]">{rec.location} · {rec.status}</div>
                    </div>
                    {isEditing ? (
                      <>
                        <label className="text-[11px] text-[var(--text-secondary)] flex flex-col">
                          IN
                          <input type="time" value={edit.arrival}
                            onChange={(e) => setEditing(p => ({ ...p, [rec.id!]: { ...edit, arrival: e.target.value } }))}
                            className="px-2 py-1 rounded-lg bg-black/30 border border-[var(--glass-border)] text-sm text-[var(--text-primary)]" />
                        </label>
                        <label className="text-[11px] text-[var(--text-secondary)] flex flex-col">
                          OUT
                          <input type="time" value={edit.leaving}
                            onChange={(e) => setEditing(p => ({ ...p, [rec.id!]: { ...edit, leaving: e.target.value } }))}
                            className="px-2 py-1 rounded-lg bg-black/30 border border-[var(--glass-border)] text-sm text-[var(--text-primary)]" />
                        </label>
                        <button onClick={() => saveOverride(rec)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1">
                          <Save size={12} /> Save
                        </button>
                        <button onClick={() => setEditing(p => { const n = { ...p }; delete n[rec.id!]; return n; })}
                          className="px-3 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--glass-border)] text-[var(--text-primary)] text-xs">
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="text-xs font-mono text-emerald-300">IN {formatTime12h(rec.arrivalTime)}</span>
                        <span className="text-xs font-mono text-blue-300">OUT {formatTime12h(rec.leavingTime)}</span>
                        <button onClick={() => setEditing(p => ({ ...p, [rec.id!]: { arrival: rec.arrivalTime || '', leaving: rec.leavingTime || '' } }))}
                          className="px-3 py-1.5 rounded-lg bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs flex items-center gap-1 hover:bg-indigo-500/30">
                          <Pencil size={12} /> Edit
                        </button>
                        <button onClick={() => clearPunches(rec)}
                          className="px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-400/30 text-red-300 text-xs flex items-center gap-1 hover:bg-red-500/30">
                          <Trash2 size={12} /> Clear
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FaceAttendance;
