import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, Trash2, CheckCircle2, XCircle, RefreshCw, AlertTriangle, Loader2, ShieldCheck, ShieldOff } from 'lucide-react';
import { Staff } from '../types';
import { useFaceApi } from '../hooks/useFaceApi';
import { faceEmbeddingService, FaceEmbedding, euclideanDistance } from '../services/faceEmbeddingService';

interface Props {
  staff: Staff;
  isAdmin?: boolean;
  capturedBy?: string;
}

const ANGLES = [
  { id: 'front', label: 'Front', hint: 'Look straight at camera' },
  { id: 'left', label: 'Left', hint: 'Turn head slightly left' },
  { id: 'right', label: 'Right', hint: 'Turn head slightly right' },
  { id: 'up', label: 'Up', hint: 'Tilt head up' },
  { id: 'down', label: 'Down', hint: 'Tilt head down' },
  { id: 'glasses', label: 'With glasses', hint: 'If you wear glasses' },
  { id: 'low-light', label: 'Low light', hint: 'Slightly dimmer area' },
];

// face-api recommends ~0.6 euclidean as match threshold; use tighter for duplicate dedup
const DUP_THRESHOLD = 0.35;

const FaceRegistration: React.FC<Props> = ({ staff, isAdmin = false, capturedBy }) => {
  const { ready: modelsReady, loading: modelsLoading, error: modelsError, detect } = useFaceApi(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [activeAngle, setActiveAngle] = useState<string>('front');
  const [samples, setSamples] = useState<FaceEmbedding[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err' | 'warn'; text: string } | null>(null);
  const [livePreview, setLivePreview] = useState<{ faces: number; quality: number } | null>(null);

  // Load existing samples
  const loadSamples = useCallback(async () => {
    try {
      const list = await faceEmbeddingService.getByStaff(staff.id);
      setSamples(list);
      // Load signed URLs in parallel
      const urlEntries = await Promise.all(
        list.filter(s => s.imagePath).map(async (s) => {
          const url = await faceEmbeddingService.getSignedImageUrl(s.imagePath!);
          return [s.id, url || ''] as const;
        })
      );
      setImageUrls(Object.fromEntries(urlEntries));
    } catch (e: any) {
      setMessage({ kind: 'err', text: e?.message || 'Failed to load samples' });
    }
  }, [staff.id]);

  useEffect(() => { loadSamples(); }, [loadSamples]);

  // Camera lifecycle
  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
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
    setLivePreview(null);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // Live preview detection loop (lightweight)
  useEffect(() => {
    if (!cameraOn || !modelsReady) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (cancelled || !videoRef.current || videoRef.current.readyState < 2) {
        timer = setTimeout(tick, 600);
        return;
      }
      try {
        const r = await detect(videoRef.current);
        if (!cancelled) {
          setLivePreview(r ? { faces: r.faceCount, quality: r.qualityScore } : { faces: 0, quality: 0 });
        }
      } catch { /* ignore */ }
      if (!cancelled) timer = setTimeout(tick, 700);
    };
    tick();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [cameraOn, modelsReady, detect]);

  const captureSample = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await detect(videoRef.current);
      if (!result) {
        setMessage({ kind: 'err', text: 'No face detected. Center your face and try again.' });
        return;
      }
      if (result.faceCount > 1) {
        setMessage({ kind: 'err', text: 'Multiple faces detected. Only one person should be in frame.' });
        return;
      }
      if (result.qualityScore < 0.55) {
        setMessage({ kind: 'warn', text: 'Low quality detection. Improve lighting and try again.' });
        return;
      }

      // Duplicate check against own existing samples for this angle
      const sameAngleDupes = samples.filter(s => s.angleLabel === activeAngle);
      for (const s of sameAngleDupes) {
        const d = euclideanDistance(result.descriptor, s.descriptor);
        if (d < DUP_THRESHOLD) {
          setMessage({ kind: 'warn', text: `Very similar to an existing "${activeAngle}" sample. Try a different angle or expression.` });
          return;
        }
      }

      // Snapshot to canvas → blob
      const v = videoRef.current;
      const c = canvasRef.current;
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      const ctx = c.getContext('2d');
      if (ctx) ctx.drawImage(v, 0, 0, c.width, c.height);
      const blob: Blob | null = await new Promise(res => c.toBlob(b => res(b), 'image/jpeg', 0.85));

      await faceEmbeddingService.create({
        staffId: staff.id,
        staffName: staff.name,
        angleLabel: activeAngle,
        descriptor: result.descriptor,
        qualityScore: result.qualityScore,
        imageBlob: blob || undefined,
        capturedBy,
      });
      setMessage({ kind: 'ok', text: `Saved "${activeAngle}" sample.` });
      await loadSamples();
    } catch (e: any) {
      setMessage({ kind: 'err', text: e?.message || 'Failed to save sample' });
    } finally {
      setBusy(false);
    }
  }, [activeAngle, detect, samples, staff.id, staff.name, capturedBy, loadSamples]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this face sample?')) return;
    try {
      await faceEmbeddingService.delete(id, capturedBy);
      await loadSamples();
    } catch (e: any) {
      setMessage({ kind: 'err', text: e?.message || 'Failed to delete' });
    }
  };

  const handleApproval = async (id: string, approved: boolean) => {
    try {
      await faceEmbeddingService.setApproval(id, approved, capturedBy);
      await loadSamples();
    } catch (e: any) {
      setMessage({ kind: 'err', text: e?.message || 'Failed to update approval' });
    }
  };

  const samplesByAngle = ANGLES.map(a => ({
    ...a,
    count: samples.filter(s => s.angleLabel === a.id).length,
  }));
  const totalApproved = samples.filter(s => s.isApproved).length;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-[var(--bg-card)] border border-[var(--glass-border)] p-4 md:p-6">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
          <div>
            <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Camera size={20} className="text-indigo-400" />
              Face Registration
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              Capture multiple angles for reliable attendance recognition. Aim for 5–10 approved samples.
            </p>
          </div>
          <div className="text-xs px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-400/30 text-indigo-300">
            {totalApproved} approved · {samples.length} total
          </div>
        </div>

        {modelsError && (
          <div className="mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm flex items-center gap-2">
            <AlertTriangle size={16} /> {modelsError}
          </div>
        )}
        {modelsLoading && (
          <div className="mb-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-300 text-sm flex items-center gap-2">
            <Loader2 size={16} className="animate-spin" /> Loading face recognition models (~6 MB, one-time)...
          </div>
        )}

        {/* Angle selector */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
          {samplesByAngle.map(a => (
            <button
              key={a.id}
              onClick={() => setActiveAngle(a.id)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap border transition-all ${
                activeAngle === a.id
                  ? 'bg-indigo-500 text-white border-indigo-400'
                  : 'bg-transparent text-[var(--text-secondary)] border-[var(--glass-border)] hover:border-indigo-400/50'
              }`}
            >
              {a.label}
              {a.count > 0 && (
                <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px]">
                  {a.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <p className="text-xs text-[var(--text-secondary)] mb-3">
          Hint: <span className="text-[var(--text-primary)] font-medium">{ANGLES.find(a => a.id === activeAngle)?.hint}</span>
        </p>

        {/* Camera preview */}
        <div className="relative w-full max-w-md mx-auto aspect-[4/3] bg-black/50 rounded-2xl overflow-hidden border border-[var(--glass-border)]">
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
          <canvas ref={canvasRef} className="hidden" />
          {!cameraOn && (
            <div className="absolute inset-0 flex items-center justify-center text-[var(--text-secondary)] text-sm">
              Camera is off
            </div>
          )}
          {cameraOn && livePreview && (
            <div className="absolute top-2 left-2 right-2 flex items-center justify-between text-xs">
              <span className={`px-2 py-1 rounded-full ${livePreview.faces === 1 ? 'bg-emerald-500/80 text-white' : livePreview.faces === 0 ? 'bg-amber-500/80 text-white' : 'bg-red-500/80 text-white'}`}>
                {livePreview.faces === 0 ? 'No face' : livePreview.faces === 1 ? 'Face detected' : `${livePreview.faces} faces!`}
              </span>
              <span className="px-2 py-1 rounded-full bg-black/60 text-white">
                Q {(livePreview.quality * 100).toFixed(0)}%
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
              disabled={!modelsReady}
              className="px-5 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white font-semibold flex items-center gap-2"
            >
              <Camera size={16} /> Start Camera
            </button>
          ) : (
            <>
              <button
                onClick={captureSample}
                disabled={busy}
                className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold flex items-center gap-2"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                Capture "{ANGLES.find(a => a.id === activeAngle)?.label}"
              </button>
              <button
                onClick={stopCamera}
                className="px-5 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--glass-border)] text-[var(--text-primary)] font-semibold flex items-center gap-2"
              >
                <XCircle size={16} /> Stop
              </button>
            </>
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

      {/* Saved samples grid */}
      <div className="rounded-2xl bg-[var(--bg-card)] border border-[var(--glass-border)] p-4 md:p-6">
        <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Saved samples ({samples.length})</h4>
        {samples.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">No samples yet. Capture your first face above.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {samples.map(s => (
              <div key={s.id} className={`rounded-xl overflow-hidden border ${s.isApproved ? 'border-emerald-500/30' : 'border-amber-500/30'} bg-black/20`}>
                <div className="aspect-square bg-black/40 relative">
                  {imageUrls[s.id] ? (
                    <img src={imageUrls[s.id]} alt={s.angleLabel} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-[var(--text-secondary)]">No image</div>
                  )}
                  <div className="absolute top-1 left-1 px-2 py-0.5 rounded-full bg-black/70 text-white text-[10px]">
                    {s.angleLabel}
                  </div>
                  {s.qualityScore !== undefined && (
                    <div className="absolute top-1 right-1 px-2 py-0.5 rounded-full bg-black/70 text-white text-[10px]">
                      Q {Math.round((s.qualityScore || 0) * 100)}%
                    </div>
                  )}
                </div>
                <div className="p-2 flex items-center justify-between gap-1">
                  <span className={`text-[10px] font-semibold ${s.isApproved ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {s.isApproved ? 'Approved' : 'Pending'}
                  </span>
                  <div className="flex items-center gap-1">
                    {isAdmin && (
                      <button
                        onClick={() => handleApproval(s.id, !s.isApproved)}
                        title={s.isApproved ? 'Revoke approval' : 'Approve'}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-[var(--text-secondary)]"
                      >
                        {s.isApproved ? <ShieldOff size={14} /> : <ShieldCheck size={14} />}
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(s.id)}
                      title="Delete"
                      className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-[var(--text-secondary)] mt-3 flex items-center gap-1">
          <RefreshCw size={11} /> Tip: Recapture under different lighting if recognition fails later.
        </p>
      </div>
    </div>
  );
};

export default FaceRegistration;