import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CheckCircle2, XCircle, Loader2, AlertTriangle, ScanFace, LogIn, LogOut, Pencil, Trash2, Save, ShieldCheck } from 'lucide-react';
import { Staff, Attendance } from '../types';
import { useFaceApi } from '../hooks/useFaceApi';
import { faceEmbeddingService, FaceEmbedding, euclideanDistance } from '../services/faceEmbeddingService';
import { attendanceService } from '../services/attendanceService';
import { isSunday } from '../utils/salaryCalculations';
import { shiftService, determineStatus, formatTime12h, ShiftWindows } from '../services/shiftService';

interface Props {
  staff: Staff[];
  attendance: Attendance[];
  onAttendanceUpdated?: () => void;
  userRole: 'admin' | 'manager';
}

// Standard face-api euclidean threshold
const MATCH_THRESHOLD = 0.5;
// Per-staff cooldown to avoid duplicate punches in seconds
const COOLDOWN_SECONDS = 30;

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
  const lastPunchRef = useRef<Record<string, number>>({});

  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [embeddings, setEmbeddings] = useState<FaceEmbedding[]>([]);
  const [loadingEmbeddings, setLoadingEmbeddings] = useState(true);
  const [shiftWindows, setShiftWindows] = useState<ShiftWindows | null>(null);
  const [scanning, setScanning] = useState(false);
  const [recent, setRecent] = useState<RecentEvent[]>([]);
  const [lastMatch, setLastMatch] = useState<{ name: string; distance: number; ts: number } | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err' | 'warn'; text: string } | null>(null);
  const [editing, setEditing] = useState<Record<string, { arrival: string; leaving: string }>>({});

  // Today's date string
  const today = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Today's full-time punches for override panel
  const todaysPunches = useMemo(() => {
    return attendance
      .filter(a => a.date === today && !a.isPartTime && (a.arrivalTime || a.leavingTime))
      .map(a => ({ ...a, staff: staff.find(s => s.id === a.staffId) }))
      .sort((a, b) => (a.arrivalTime || '').localeCompare(b.arrivalTime || ''));
  }, [attendance, today, staff]);

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
        staffId: rec.staffId,
        date: rec.date,
        status,
        attendanceValue: value,
        isSunday: rec.isSunday,
        isPartTime: false,
        staffName: rec.staffName,
        shift: rec.shift,
        location: rec.location,
        arrivalTime: edit.arrival || undefined,
        leavingTime: edit.leaving || undefined,
        isUninformed: rec.isUninformed,
        salaryOverride: true,
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
        staffId: rec.staffId,
        date: rec.date,
        status: 'Absent',
        attendanceValue: 0,
        isSunday: rec.isSunday,
        isPartTime: false,
        staffName: rec.staffName,
        shift: rec.shift,
        location: rec.location,
        arrivalTime: undefined,
        leavingTime: undefined,
        isUninformed: rec.isUninformed,
      } as any);
      setMessage({ kind: 'warn', text: `Cleared punches for ${rec.staffName}` });
      onAttendanceUpdated?.();
    } catch (e: any) {
      setMessage({ kind: 'err', text: `Clear failed: ${e?.message || e}` });
    }
  };

  // Load all approved embeddings once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingEmbeddings(true);
        const [list, sw] = await Promise.all([
          faceEmbeddingService.getAllApproved(),
          shiftService.loadGlobal(true),
        ]);
        if (!cancelled) {
          setEmbeddings(list);
          setShiftWindows(sw);
        }
      } catch (e: any) {
        if (!cancelled) setMessage({ kind: 'err', text: e?.message || 'Failed to load face data' });
      } finally {
        if (!cancelled) setLoadingEmbeddings(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const staffById = useMemo(() => {
    const map = new Map<string, Staff>();
    staff.forEach(s => map.set(s.id, s));
    return map;
  }, [staff]);

  const enrolledStaffIds = useMemo(() => new Set(embeddings.map(e => e.staffId)), [embeddings]);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 540 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraOn(true);
      setScanning(true);
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
    setScanning(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // Find best match for a descriptor across all embeddings
  const findBestMatch = useCallback((descriptor: number[]) => {
    let bestStaffId: string | null = null;
    let bestDist = Infinity;
    for (const e of embeddings) {
      const d = euclideanDistance(descriptor, e.descriptor);
      if (d < bestDist) {
        bestDist = d;
        bestStaffId = e.staffId;
      }
    }
    return { staffId: bestStaffId, distance: bestDist };
  }, [embeddings]);

  // Punch in / out logic — first detection of the day = IN, subsequent = OUT (updates leaving_time)
  const punch = useCallback(async (s: Staff, distance: number) => {
    const existing = attendance.find(a => a.staffId === s.id && a.date === today && !a.isPartTime);
    const time = formatNow();
    let kind: 'in' | 'out' = 'in';

    const arrivalTime = existing?.arrivalTime || time;
    const leavingTime = existing?.arrivalTime ? time : existing?.leavingTime;

    // Auto-determine status from punch times using shift window
    let autoStatus: 'Present' | 'Half Day' | 'Absent' = 'Present';
    let autoValue = 1;
    if (shiftWindows) {
      const win = shiftService.resolve(s, shiftWindows);
      const { status } = determineStatus(arrivalTime, leavingTime, win);
      autoStatus = status;
      autoValue = status === 'Present' ? 1 : status === 'Half Day' ? 0.5 : 0;
    }

    const record = {
      staffId: s.id,
      date: today,
      status: autoStatus,
      attendanceValue: autoValue,
      isSunday: isSunday(today),
      isPartTime: false,
      staffName: s.name,
      shift: s.shift,
      location: s.location,
      arrivalTime,
      leavingTime,
      isUninformed: false,
    };

    if (existing?.arrivalTime) {
      kind = 'out';
    }

    try {
      await attendanceService.upsert(record);
      setRecent(prev => [{ staffId: s.id, staffName: s.name, kind, time, distance }, ...prev].slice(0, 20));
      setMessage({
        kind: autoStatus === 'Absent' ? 'warn' : 'ok',
        text: `${kind === 'in' ? 'Punched IN' : 'Punched OUT'}: ${s.name} @ ${formatTime12h(time)} · ${autoStatus}`,
      });
      onAttendanceUpdated?.();
    } catch (e: any) {
      setMessage({ kind: 'err', text: `Failed to punch ${s.name}: ${e?.message || e}` });
    }
  }, [attendance, today, onAttendanceUpdated, shiftWindows]);

  // Recognition loop
  useEffect(() => {
    if (!scanning || !ready || !cameraOn || embeddings.length === 0) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (cancelled || !videoRef.current || videoRef.current.readyState < 2) {
        timer = setTimeout(tick, 600);
        return;
      }
      try {
        const r = await detect(videoRef.current);
        if (!cancelled && r) {
          const { staffId, distance } = findBestMatch(r.descriptor);
          if (staffId && distance < MATCH_THRESHOLD) {
            const s = staffById.get(staffId);
            if (s && s.isActive) {
              setLastMatch({ name: s.name, distance, ts: Date.now() });
              const last = lastPunchRef.current[staffId] || 0;
              if (Date.now() - last > COOLDOWN_SECONDS * 1000) {
                lastPunchRef.current[staffId] = Date.now();
                await punch(s, distance);
              }
            }
          } else {
            setLastMatch({ name: 'Unknown', distance, ts: Date.now() });
          }
        } else if (!cancelled) {
          setLastMatch(null);
        }
      } catch { /* ignore */ }
      if (!cancelled) timer = setTimeout(tick, 800);
    };
    tick();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [scanning, ready, cameraOn, embeddings.length, detect, findBestMatch, staffById, punch]);

  const enrolledCount = enrolledStaffIds.size;
  const totalActive = staff.filter(s => s.isActive).length;

  return (
    <div className="space-y-4 max-w-5xl mx-auto py-4">
      <div className="rounded-2xl bg-[var(--bg-card)] border border-[var(--glass-border)] p-4 md:p-6">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
          <div>
            <h2 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
              <ScanFace size={22} className="text-indigo-400" />
              Face Attendance
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              Live recognition. First detection of the day = IN, next detections update OUT time.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="text-xs px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-400/30 text-indigo-300">
              {enrolledCount}/{totalActive} enrolled
            </span>
            <span className="text-xs px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-400/30 text-emerald-300">
              Threshold {MATCH_THRESHOLD.toFixed(2)}
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
            {loading ? 'Loading face models…' : `Loading ${embeddings.length} face samples…`}
          </div>
        )}
        {!loadingEmbeddings && embeddings.length === 0 && (
          <div className="mb-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm flex items-center gap-2">
            <AlertTriangle size={16} /> No face samples enrolled yet. Register staff in their portal or via Staff Management.
          </div>
        )}

        {/* Camera preview */}
        <div className="relative w-full max-w-2xl mx-auto aspect-[4/3] bg-black/50 rounded-2xl overflow-hidden border border-[var(--glass-border)]">
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
          {!cameraOn && (
            <div className="absolute inset-0 flex items-center justify-center text-[var(--text-secondary)] text-sm">
              Camera is off
            </div>
          )}
          {cameraOn && lastMatch && (
            <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-xs">
              <span className={`px-3 py-1.5 rounded-full font-semibold ${
                lastMatch.name === 'Unknown' ? 'bg-amber-500/80 text-white' : 'bg-emerald-500/90 text-white'
              }`}>
                {lastMatch.name}
              </span>
              <span className="px-3 py-1.5 rounded-full bg-black/70 text-white">
                d {lastMatch.distance.toFixed(2)}
              </span>
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
              disabled={!ready || embeddings.length === 0}
              className="px-5 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white font-semibold flex items-center gap-2"
            >
              <Camera size={16} /> Start Recognition
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
                      {r.kind === 'in' ? 'Punched IN' : 'Updated OUT'} · d {r.distance.toFixed(2)}
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
                      <div className="text-[11px] text-[var(--text-secondary)]">
                        {rec.location} · {rec.status}
                      </div>
                    </div>
                    {isEditing ? (
                      <>
                        <label className="text-[11px] text-[var(--text-secondary)] flex flex-col">
                          IN
                          <input
                            type="time"
                            value={edit.arrival}
                            onChange={(e) => setEditing(p => ({ ...p, [rec.id!]: { ...edit, arrival: e.target.value } }))}
                            className="px-2 py-1 rounded-lg bg-black/30 border border-[var(--glass-border)] text-sm text-[var(--text-primary)]"
                          />
                        </label>
                        <label className="text-[11px] text-[var(--text-secondary)] flex flex-col">
                          OUT
                          <input
                            type="time"
                            value={edit.leaving}
                            onChange={(e) => setEditing(p => ({ ...p, [rec.id!]: { ...edit, leaving: e.target.value } }))}
                            className="px-2 py-1 rounded-lg bg-black/30 border border-[var(--glass-border)] text-sm text-[var(--text-primary)]"
                          />
                        </label>
                        <button
                          onClick={() => saveOverride(rec)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1"
                        >
                          <Save size={12} /> Save
                        </button>
                        <button
                          onClick={() => setEditing(p => { const n = { ...p }; delete n[rec.id!]; return n; })}
                          className="px-3 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--glass-border)] text-[var(--text-primary)] text-xs"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="text-xs font-mono text-emerald-300">IN {formatTime12h(rec.arrivalTime)}</span>
                        <span className="text-xs font-mono text-blue-300">OUT {formatTime12h(rec.leavingTime)}</span>
                        <button
                          onClick={() => setEditing(p => ({ ...p, [rec.id!]: { arrival: rec.arrivalTime || '', leaving: rec.leavingTime || '' } }))}
                          className="px-3 py-1.5 rounded-lg bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs flex items-center gap-1 hover:bg-indigo-500/30"
                        >
                          <Pencil size={12} /> Edit
                        </button>
                        <button
                          onClick={() => clearPunches(rec)}
                          className="px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-400/30 text-red-300 text-xs flex items-center gap-1 hover:bg-red-500/30"
                        >
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