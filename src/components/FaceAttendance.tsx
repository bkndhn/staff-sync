import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CheckCircle2, XCircle, Loader2, AlertTriangle, ScanFace, LogIn, LogOut, Pencil, Trash2, Save, ShieldCheck, Activity, Zap } from 'lucide-react';
import { Staff, Attendance } from '../types';
import { useFaceEngine } from '../hooks/useFaceEngine';
import { faceEmbeddingService, FaceEmbedding } from '../services/faceEmbeddingService';
import { attendanceService } from '../services/attendanceService';
import { punchEventService } from '../services/punchEventService';
import { isSunday } from '../utils/salaryCalculations';
import { shiftService, formatTime12h, ShiftWindows, minutesBetween } from '../services/shiftService';
import { locationShiftService, LocationShiftConfig, DEFAULT_LOCATION_CONFIG } from '../services/locationShiftService';
import { appSettingsService } from '../services/appSettingsService';
import { calculateAttendanceStatus, resolveAttendanceRules } from '../utils/attendanceRules';
import { buildCentroidIndex, findBestMatch as findCosineMatch, type StaffEmbedding } from '../lib/embeddingMatcher';
import { createLivenessState, updateLiveness, evaluateLiveness, type LivenessState } from '../lib/livenessEngine';
import { db } from '../lib/db';

interface Props {
  staff: Staff[];                 // already location-scoped by App
  attendance: Attendance[];
  /** Instant zero-latency patch — surgically updates a single record in App state */
  onAttendancePatch?: (updated: Attendance) => void;
  /** Full reload callback (used only for background cache invalidation, not UI) */
  onAttendanceUpdated?: () => void;
  userRole: 'admin' | 'manager';
}

// Cosine distance threshold for ArcFace-style embeddings
// Lower = stricter. 0.38 = good balance for 40 staff.
let COSINE_THRESHOLD = 0.38;
// Minimum gap between two punches for the SAME staff (smart toggle IN<->OUT)
const TOGGLE_MIN_SECONDS = 5 * 60;     // 5 minutes
// Cooldown for the same kind (prevents double-IN flooding)
const SAME_KIND_COOLDOWN = 60;         // 1 minute

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

const FaceAttendance: React.FC<Props> = ({ staff, attendance, onAttendancePatch, onAttendanceUpdated, userRole }) => {
  const { ready, loading, error, detect } = useFaceEngine(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastPunchRef = useRef<Record<string, { ts: number; kind: 'in' | 'out' }>>({});
  // Centroid index — rebuilt when embeddings change (cosine similarity matcher)
  const centroidIndexRef = useRef<Map<string, StaffEmbedding>>(new Map());
  // Per-candidate liveness state (new multi-layer engine)
  const livenessRef = useRef<{ staffId: string | null; state: LivenessState }>({
    staffId: null,
    state: createLivenessState(),
  });

  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [allEmbeddings, setAllEmbeddings] = useState<FaceEmbedding[]>([]);
  const [loadingEmbeddings, setLoadingEmbeddings] = useState(true);
  const [shiftWindows, setShiftWindows] = useState<ShiftWindows | null>(null);
  const [locationConfig, setLocationConfig] = useState<LocationShiftConfig | null>(null);
  const [managerCanOverride, setManagerCanOverride] = useState(true);
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

  // ---- Rebuild centroid index whenever embeddings change -------------------
  // Computes centroid (averaged embedding) per staff for cosine matching
  useEffect(() => {
    if (allEmbeddings.length === 0) { centroidIndexRef.current = new Map(); return; }
    centroidIndexRef.current = buildCentroidIndex(allEmbeddings);
  }, [allEmbeddings]);

  // ---- Helpers --------------------------------------------------------------
  const recomputeStatus = (arrival: string, leaving: string, s?: Staff) => {
    // Use new smart rules engine if location config is available
    if (locationConfig) {
      const rules = resolveAttendanceRules(locationConfig, s?.shiftWindow);
      const { status, attendanceValue } = calculateAttendanceStatus(arrival || undefined, leaving || undefined, rules);
      return { status, value: attendanceValue };
    }
    // Fallback to shift-window based calculation
    if (!shiftWindows || !s) return { status: 'Present' as const, value: 1 };
    const win = shiftService.resolve(s, shiftWindows);
    const { status } = shiftService.resolve ? { status: 'Present' as const } : { status: 'Present' as const };
    return { status, value: status === 'Present' ? 1 : status === 'Half Day' ? 0.5 : 0 };
  };

  const saveOverride = async (rec: Attendance) => {
    const edit = editing[rec.id!];
    if (!edit) return;
    const s = staff.find(x => x.id === rec.staffId);
    const { status, value } = recomputeStatus(edit.arrival, edit.leaving, s);
    try {
      const saved = await attendanceService.upsert({
        staffId: rec.staffId, date: rec.date, status, attendanceValue: value,
        isSunday: rec.isSunday, isPartTime: false, staffName: rec.staffName,
        shift: rec.shift, location: rec.location,
        arrivalTime: edit.arrival || undefined, leavingTime: edit.leaving || undefined,
        isUninformed: rec.isUninformed, salaryOverride: true,
      } as any);
      // ── Instant zero-latency patch into App state ──
      onAttendancePatch?.(saved);
      setEditing(p => { const n = { ...p }; delete n[rec.id!]; return n; });
      setMessage({ kind: 'ok', text: `Updated ${s?.name || rec.staffName} → ${status}` });
    } catch (e: any) {
      setMessage({ kind: 'err', text: `Save failed: ${e?.message || e}` });
    }
  };

  const clearPunches = async (rec: Attendance) => {
    const staffName = staff.find(x => x.id === rec.staffId)?.name || rec.staffName;
    if (!window.confirm(`Clear today's punches for ${staffName}?`)) return;
    try {
      const saved = await attendanceService.upsert({
        staffId: rec.staffId, date: rec.date, status: 'Absent', attendanceValue: 0,
        isSunday: rec.isSunday, isPartTime: false, staffName: rec.staffName,
        shift: rec.shift, location: rec.location,
        arrivalTime: undefined, leavingTime: undefined, isUninformed: rec.isUninformed,
      } as any);
      // ── Instant zero-latency patch into App state ──
      onAttendancePatch?.(saved);
      setMessage({ kind: 'warn', text: `Cleared punches for ${staffName}` });
    } catch (e: any) {
      setMessage({ kind: 'err', text: `Clear failed: ${e?.message || e}` });
    }
  };

  // Load all approved embeddings, shift windows, location config, and kiosk settings on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingEmbeddings(true);
        // Determine the location for this session
        const locationName = staff[0]?.location || '';
        
        // Fetch all offline-cached data from Dexie
        const [list, sw, locCfgArr, kioskSettings] = await Promise.all([
          db.faceEmbeddings.toArray(),
          shiftService.loadGlobal(true), // TODO: shiftService could also use Dexie, but keeping for now as config
          db.locationShiftConfig.where('locationName').equals(locationName).toArray(),
          appSettingsService.getKioskGlobalSettings(),
        ]);
        
        // Ensure format matches expected
        const filteredList = list.filter(e => e.approved !== false);
        const locCfg = locCfgArr.length > 0 ? locCfgArr[0] : null;

        if (!cancelled) {
          setAllEmbeddings(filteredList);
          setShiftWindows(sw);
          setLocationConfig(locCfg || { ...DEFAULT_LOCATION_CONFIG, locationName });
          setManagerCanOverride(kioskSettings.managerCanOverride);
          // Cosine threshold: settings value is in Euclidean space (0.6), convert roughly
          // Cosine ~0.38 ≈ Euclidean ~0.60 for 128-dim ResNet embeddings
          const rawThreshold = kioskSettings.matchThreshold || 0.60;
          COSINE_THRESHOLD = rawThreshold <= 1.0 ? Math.min(0.50, rawThreshold * 0.63) : 0.38;
        }
      } catch (e: any) {
        if (!cancelled) setMessage({ kind: 'err', text: e?.message || 'Failed to load face data' });
      } finally {
        if (!cancelled) setLoadingEmbeddings(false);
      }
    })();
    return () => { cancelled = true; };
  }, [staff]);

  // ---- Camera ---------------------------------------------------------------
  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      // 1080p for 10m range detection — allows finding small faces far away
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 } },
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

  // ---- Match search via cosine centroid index ------------------------------
  const findBestMatch = useCallback((descriptor: Float32Array) => {
    const result = findCosineMatch(descriptor, centroidIndexRef.current, COSINE_THRESHOLD);
    return { staffId: result.staffId, distance: result.distance };
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
      // First punch today (or after server reload)
      if (existing?.arrivalTime) {
        const gapMins = minutesBetween(existing.arrivalTime, time);
        if (gapMins < 5) {
          return; // Ignore repeated IN punch within 5 minutes
        }
        kind = 'out';
      } else {
        kind = 'in';
      }
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

    // ── Smart status calculation using location/staff rules ──────────────────
    let autoStatus: 'Present' | 'Half Day' | 'Absent' | 'Pending Full Day' | 'Manual Override' = 'Present';
    let autoValue = 1;

    if (locationConfig) {
      // Use new smart rules engine: morning cutoff + early-exit logic
      const rules = resolveAttendanceRules(locationConfig, s.shiftWindow);
      const decision = calculateAttendanceStatus(arrivalTime, leavingTime, rules);
      autoStatus = decision.status;
      autoValue = decision.attendanceValue;
    } else if (shiftWindows) {
      // Fallback to old shift-window engine
      const win = shiftService.resolve(s, shiftWindows);
      const hours = summary.minutes / 60;
      const { status } = shiftService.resolve(s, shiftWindows)
        ? { status: hours >= win.minHoursFull ? 'Present' : hours >= win.minHoursHalf ? 'Half Day' : 'Absent' }
        : { status: 'Present' };
      autoStatus = status as typeof autoStatus;
      autoValue = autoStatus === 'Present' || autoStatus === 'Pending Full Day' ? 1 : autoStatus === 'Half Day' ? 0.5 : 0;
    }

    try {
      const saved = await attendanceService.upsert({
        staffId: s.id, date: today, status: autoStatus, attendanceValue: autoValue,
        isSunday: isSunday(today), isPartTime: false, staffName: s.name,
        shift: s.shift, location: s.location,
        arrivalTime, leavingTime, isUninformed: false,
      });
      // ── Instant zero-latency patch into App state ──
      onAttendancePatch?.(saved);
      lastPunchRef.current[s.id] = { ts: Date.now(), kind };
      setRecent(prev => [{ staffId: s.id, staffName: s.name, kind, time, distance }, ...prev].slice(0, 20));
      setMessage({
        kind: autoStatus === 'Absent' ? 'warn' : 'ok',
        text: `${kind === 'in' ? 'Punched IN' : 'Punched OUT'}: ${s.name} @ ${formatTime12h(time)} · ${autoStatus} · ${summary.count} event(s)`,
      });
    } catch (e: any) {
      setMessage({ kind: 'err', text: `Failed to punch ${s.name}: ${e?.message || e}` });
    }
  }, [attendance, today, onAttendancePatch, shiftWindows]);

  // ---- Continuous recognition loop (requestAnimationFrame, frame-skipped) ---
  useEffect(() => {
    if (!ready || !cameraOn || allEmbeddings.length === 0) return;
    let cancelled = false;
    let rafId = 0;
    let frameCount = 0;
    let processing = false;

    const resetLiveness = (staffId: string | null = null) => {
      livenessRef.current = { staffId, state: createLivenessState() };
    };

    const onFrame = async () => {
      if (cancelled) return;
      frameCount++;
      // Every 4th frame (~7.5 fps at 30fps) — fast enough, less CPU heat
      if (frameCount % 4 === 0 && !processing && videoRef.current && videoRef.current.readyState >= 2) {
        processing = true;
        try {
          const r = await detect(videoRef.current, { scoreThreshold: 0.35, withLandmarks: true });

          if (!r) {
            setLastMatch(null);
            resetLiveness();
          } else {
            const desc32 = new Float32Array(r.descriptor);
            const { staffId, distance } = findBestMatch(desc32);

            if (!staffId) {
              setLastMatch({ name: 'Unknown face', distance, ts: Date.now(), status: 'unknown' });
              resetLiveness();
            } else if (!allowedStaffIds.has(staffId)) {
              const wrongStaff = allEmbeddings.find(e => e.staffId === staffId);
              setLastMatch({ name: wrongStaff?.staffName || 'Other location', distance, ts: Date.now(), status: 'wrong-loc' });
              setMessage({ kind: 'err', text: `${wrongStaff?.staffName || 'This staff'} does not belong to this location.` });
              resetLiveness();
            } else {
              const s = staffById.get(staffId);
              if (!s || !s.isActive) {
                setLastMatch({ name: 'Inactive staff', distance, ts: Date.now(), status: 'unknown' });
                resetLiveness();
              } else {
                // Reset if different person detected
                if (livenessRef.current.staffId !== staffId) resetLiveness(staffId);

                // ── Update multi-layer liveness engine ─────────────────────
                livenessRef.current.state = updateLiveness(
                  livenessRef.current.state,
                  videoRef.current!,
                  r.box,
                  r.landmarks,
                );

                const liveness = evaluateLiveness(livenessRef.current.state, videoRef.current!, r.box);

                if (liveness.reason === 'checking') {
                  setLastMatch({ name: s.name, distance, ts: Date.now(), status: 'matching' });
                } else if (liveness.reason === 'no-blink') {
                  setLastMatch({ name: s.name, distance, ts: Date.now(), status: 'blink-please' });
                } else if (liveness.reason === 'spoof') {
                  setLastMatch({ name: s.name, distance, ts: Date.now(), status: 'spoof' });
                  setMessage({ kind: 'err', text: `Spoof detected for ${s.name}. Blink naturally and try again.` });
                  resetLiveness();
                } else if (liveness.isLive) {
                  setLastMatch({ name: s.name, distance, ts: Date.now(), status: 'ok' });
                  await punch(s, distance, liveness.score);
                  resetLiveness();
                  // Brief pause so the success animation shows
                  await new Promise(res => setTimeout(res, 1800));
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
    <div className="flex flex-col lg:flex-row gap-4 w-full min-h-[calc(100vh-80px)] py-4 max-w-[1920px] mx-auto">
      {/* ── Left Side: Full Height Camera Feed ── */}
      <div className="flex-1 min-h-[500px] md:min-h-[600px] lg:min-h-[calc(100vh-120px)] rounded-2xl bg-[var(--bg-card)] border border-[var(--glass-border)] flex flex-col overflow-hidden relative">
        {/* HUD Overlay */}
        <div className="absolute top-0 left-0 right-0 z-10 p-4 md:p-6 bg-gradient-to-b from-black/80 to-transparent flex items-start justify-between gap-3 flex-wrap pointer-events-none">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <ScanFace size={22} className="text-indigo-400" />
              Face Attendance · Long-Range Kiosk
            </h2>
            <p className="text-xs text-white/70 mt-1 max-w-md">
              Stand up to 10m away. Always-on recognition with liveness check. First match = IN, then auto-toggles IN↔OUT every {TOGGLE_MIN_SECONDS/60} min.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 pointer-events-auto">
            <span className="text-xs px-3 py-1.5 rounded-full bg-black/50 border border-white/20 text-white">
              {enrolledCount}/{totalActive} enrolled
            </span>
            <span className="text-xs px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 flex items-center gap-1">
              <Activity size={12} /> Liveness v2
            </span>
            <span className="text-xs px-3 py-1.5 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 flex items-center gap-1">
              <Zap size={12} /> Cosine match
            </span>
          </div>
        </div>

        {/* Video Feed */}
        <div className="relative flex-1 bg-black w-full h-full">
          <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />
          {!cameraOn && (
            <div className="absolute inset-0 flex items-center justify-center text-[var(--text-secondary)] text-sm z-10 bg-black/80">
              {cameraError ? 'Camera blocked' : 'Starting camera…'}
            </div>
          )}
          {cameraOn && lastMatch && (
            <div className="absolute bottom-8 left-0 right-0 flex justify-center z-20 pointer-events-none">
              <div className="flex items-center gap-3 px-4 py-2.5 rounded-full bg-black/60 backdrop-blur border border-white/10 shadow-2xl scale-125">
                {statusBadge(lastMatch.status)}
                <span className="text-base font-bold text-white tracking-wide">{lastMatch.name}</span>
                <span className="text-xs font-mono text-white/50 bg-black/40 px-2 py-1 rounded">d {lastMatch.distance.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Floating Controls Overlay */}
        <div className="absolute bottom-4 right-4 z-20 flex flex-col items-end gap-2">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/90 backdrop-blur border border-red-400/50 text-white text-sm flex items-center gap-2 shadow-xl max-w-sm">
              <AlertTriangle size={16} /> {error}
            </div>
          )}
          {(loading || loadingEmbeddings) && (
            <div className="p-3 rounded-xl bg-blue-500/90 backdrop-blur border border-blue-400/50 text-white text-sm flex items-center gap-2 shadow-xl">
              <Loader2 size={16} className="animate-spin" />
              {loading ? 'Loading face models…' : `Loading ${allEmbeddings.length} face samples…`}
            </div>
          )}
          {!loadingEmbeddings && scopedEmbeddings.length === 0 && (
            <div className="p-3 rounded-xl bg-amber-500/90 backdrop-blur border border-amber-400/50 text-white text-sm flex items-center gap-2 shadow-xl max-w-sm">
              <AlertTriangle size={16} /> No face samples enrolled for this location.
            </div>
          )}
          {cameraError && (
            <div className="p-3 rounded-xl bg-red-500/90 backdrop-blur border border-red-400/50 text-white text-sm shadow-xl">
              {cameraError}
            </div>
          )}
          {message && (
            <div className={`p-3 rounded-xl text-sm font-medium flex items-center gap-2 shadow-xl backdrop-blur max-w-md ${ 
              message.kind === 'ok' ? 'bg-emerald-500/90 border border-emerald-400/50 text-white' : 
              message.kind === 'warn' ? 'bg-amber-500/90 border border-amber-400/50 text-white' : 
              'bg-red-500/90 border border-red-400/50 text-white'
            }`}>
              {message.kind === 'ok' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
              {message.text}
            </div>
          )}

          <div className="flex gap-2">
            {!cameraOn ? (
              <button
                onClick={startCamera}
                disabled={!ready || scopedEmbeddings.length === 0}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold flex items-center gap-2 shadow-xl"
              >
                <Camera size={16} /> Start Camera
              </button>
            ) : (
              <button
                onClick={stopCamera}
                className="px-5 py-2.5 rounded-xl bg-black/60 hover:bg-black/80 backdrop-blur border border-white/20 text-white font-semibold flex items-center gap-2 shadow-xl"
              >
                <XCircle size={16} /> Stop
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Right Side: Logs & Overrides Sidebar ── */}
      <div className="w-full lg:w-96 flex flex-col gap-4 overflow-y-auto shrink-0">
        {/* Recent events */}
        <div className="rounded-2xl bg-[var(--bg-card)] border border-[var(--glass-border)] p-4 md:p-6 shrink-0">
          <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Recent punches</h4>
          {recent.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">Nothing yet — recognized staff will appear here.</p>
          ) : (
            <div className="space-y-2 max-h-[30vh] overflow-y-auto pr-1 custom-scrollbar">
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
          <div className="rounded-2xl bg-[var(--bg-card)] border border-[var(--glass-border)] p-4 md:p-6 flex-1 flex flex-col min-h-[40vh]">
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap shrink-0">
              <h4 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <ShieldCheck size={16} className="text-emerald-400" />
                Override panel
              </h4>
              <span className="text-xs text-[var(--text-secondary)]">{todaysPunches.length} record(s)</span>
            </div>
            {todaysPunches.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">No punches recorded today yet.</p>
            ) : (
              <div className="space-y-2 overflow-y-auto pr-1 flex-1 custom-scrollbar">
                {todaysPunches.map(rec => {
                  const edit = editing[rec.id!];
                  const isEditing = !!edit;
                  return (
                    <div key={rec.id} className="p-3 rounded-xl bg-black/10 border border-[var(--glass-border)] flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-[var(--text-primary)] truncate">{rec.staff?.name || rec.staffName || rec.staffId}</div>
                          <div className="text-[11px] text-[var(--text-secondary)]">{rec.staff?.location || rec.location} · {rec.status}</div>
                        </div>
                        {!isEditing && (
                          <div className="flex flex-col items-end">
                            <span className="text-xs font-mono text-emerald-400/90 font-medium tracking-tight whitespace-nowrap">IN {formatTime12h(rec.arrivalTime)}</span>
                            <span className="text-xs font-mono text-blue-400/90 font-medium tracking-tight whitespace-nowrap">OUT {formatTime12h(rec.leavingTime)}</span>
                          </div>
                        )}
                      </div>

                      {isEditing ? (
                        <div className="flex flex-col gap-2 mt-1">
                          <div className="flex gap-2">
                            <label className="text-[11px] text-[var(--text-secondary)] flex-1 flex flex-col">
                              IN
                              <input type="time" value={edit.arrival}
                                onChange={(e) => setEditing(p => ({ ...p, [rec.id!]: { ...edit, arrival: e.target.value } }))}
                                className="px-2 py-1.5 mt-1 rounded-lg bg-black/30 border border-[var(--glass-border)] text-sm text-[var(--text-primary)] w-full" />
                            </label>
                            <label className="text-[11px] text-[var(--text-secondary)] flex-1 flex flex-col">
                              OUT
                              <input type="time" value={edit.leaving}
                                onChange={(e) => setEditing(p => ({ ...p, [rec.id!]: { ...edit, leaving: e.target.value } }))}
                                className="px-2 py-1.5 mt-1 rounded-lg bg-black/30 border border-[var(--glass-border)] text-sm text-[var(--text-primary)] w-full" />
                            </label>
                          </div>
                          <div className="flex gap-2 mt-2">
                            <button onClick={() => saveOverride(rec)}
                              className="flex-1 px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold flex items-center justify-center gap-1">
                              <Save size={14} /> Save
                            </button>
                            <button onClick={() => setEditing(p => { const n = { ...p }; delete n[rec.id!]; return n; })}
                              className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--glass-border)] text-[var(--text-primary)] hover:bg-black/20 text-xs font-medium">
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2 pt-2 mt-1 border-t border-[var(--glass-border)]">
                          <button onClick={() => setEditing(p => ({ ...p, [rec.id!]: { arrival: rec.arrivalTime || '', leaving: rec.leavingTime || '' } }))}
                            className="flex-1 px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-xs flex items-center justify-center gap-1 hover:bg-indigo-500/20 font-medium">
                            <Pencil size={12} /> Edit
                          </button>
                          <button onClick={() => clearPunches(rec)}
                            className="flex-1 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center justify-center gap-1 hover:bg-red-500/20 font-medium">
                            <Trash2 size={12} /> Clear
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default FaceAttendance;
