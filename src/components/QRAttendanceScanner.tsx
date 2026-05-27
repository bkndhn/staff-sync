import React, { useEffect, useState, useRef, useCallback } from 'react';
import { QrCode, XCircle, CheckCircle2, AlertTriangle, Loader2, Zap } from 'lucide-react';
import { validateQRPayload } from '../utils/qrCrypto';
import jsQR from 'jsqr';

export interface ScanConfirmation {
  ok: boolean;
  title: string;     // e.g. "Ravi Kumar"
  subtitle?: string; // e.g. "Clocked IN at 09:14"
}

interface Props {
  staffLocation: string;
  /** Return a confirmation object — scanner will display it briefly and resume scanning. */
  onScanSuccess: (payload: any) => Promise<ScanConfirmation> | ScanConfirmation;
  onClose: () => void;
}

/** Check if native BarcodeDetector (hardware-accelerated) is available */
const getNativeDetector = (() => {
  let detector: any = null;
  let checked = false;
  return async () => {
    if (checked) return detector;
    checked = true;
    if (!('BarcodeDetector' in window)) return null;
    try {
      const formats = await (window as any).BarcodeDetector.getSupportedFormats();
      if (formats.includes('qr_code')) {
        detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
      }
    } catch { /* ignore */ }
    return detector;
  };
})();

const QRAttendanceScanner: React.FC<Props> = ({ staffLocation, onScanSuccess, onClose }) => {
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmation, setConfirmation] = useState<ScanConfirmation | null>(null);
  const [scanCount, setScanCount] = useState(0);
  const [useNative, setUseNative] = useState<boolean | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const processingRef = useRef(false);
  const activeRef = useRef(true);
  const lastDecodedRef = useRef<{ value: string; at: number } | null>(null);

  const processFrame = useCallback(async (detector: any) => {
    if (!activeRef.current || processingRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;

    let decoded: string | null = null;

    try {
      if (detector) {
        // Native BarcodeDetector — ~0-2ms
        const results = await detector.detect(video);
        if (results && results.length > 0) decoded = results[0].rawValue;
      } else {
        // jsQR fallback
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        
        // Scale down video frame for blazing fast ~1ms jsQR processing
        const MAX_W = 400;
        const scale = Math.min(1, MAX_W / video.videoWidth);
        canvas.width = video.videoWidth * scale;
        canvas.height = video.videoHeight * scale;
        
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert'
        });
        if (code) decoded = code.data;
      }
    } catch { /* ignore per-frame errors */ }

    if (decoded && !processingRef.current) {
      // Strong duplicate-frame protection: ignore the same payload within 4s,
      // regardless of whether the previous attempt succeeded or failed.
      const now = Date.now();
      const last = lastDecodedRef.current;
      if (last && last.value === decoded && now - last.at < 4000) return;
      lastDecodedRef.current = { value: decoded, at: now };

      processingRef.current = true;
      setIsProcessing(true);
      setError(null);
      setScanCount(c => c + 1);

      const finish = (card: ScanConfirmation, holdMs: number) => {
        if (!activeRef.current) return;
        setConfirmation(card);
        setTimeout(() => {
          if (!activeRef.current) return;
          setConfirmation(null);
          setIsProcessing(false);
          processingRef.current = false;
          // Refresh the dup timestamp so the scanner is immediately ready
          // for the next staff (different QR) without re-triggering this one.
          lastDecodedRef.current = { value: decoded, at: Date.now() };
        }, holdMs);
      };

      const validation = await validateQRPayload(decoded, staffLocation);

      if (!validation.valid) {
        finish({ ok: false, title: 'Invalid QR', subtitle: validation.reason || 'Please try again.' }, 2000);
        return;
      }

      try {
        const result = await onScanSuccess(JSON.parse(decoded));
        finish(result, 2500);
      } catch (e: any) {
        finish({ ok: false, title: 'Failed to record', subtitle: e?.message || 'Try again.' }, 2200);
      }
    }
  }, [staffLocation, onScanSuccess]);

  useEffect(() => {
    activeRef.current = true;
    let detector: any = null;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });
        if (!activeRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        detector = await getNativeDetector();
        setUseNative(!!detector);
        setIsReady(true);

        // Tight RAF loop — runs every animation frame (~16ms at 60fps)
        const loop = async () => {
          if (!activeRef.current) return;
          await processFrame(detector);
          rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
      } catch (err: any) {
        if (activeRef.current) {
          setError(err?.message?.includes('Permission') 
            ? 'Camera permission denied. Please allow camera access.' 
            : 'Cannot open camera. Try again.');
        }
      }
    };

    start();

    return () => {
      activeRef.current = false;
      cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, [processFrame]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/95 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-sm bg-[var(--bg-app)] rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl border border-[var(--glass-border)] flex flex-col my-auto">
        {/* Header */}
        <div className="p-3 sm:p-4 bg-[var(--bg-card)] border-b border-[var(--glass-border)] flex items-center justify-between">
          <h3 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
            <QrCode size={20} className="text-indigo-400" />
            Scan Attendance QR
          </h3>
          <div className="flex items-center gap-2">
            {useNative !== null && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${useNative ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                {useNative ? (
                  <span className="flex items-center gap-1"><Zap size={10} /> Native</span>
                ) : 'jsQR'}
              </span>
            )}
            <button onClick={onClose} className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-[var(--text-secondary)] hover:text-white transition-colors">
              <XCircle size={22} />
            </button>
          </div>
        </div>

        {/* Scanner viewport */}
        <div className="relative bg-black aspect-square flex items-center justify-center">
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
          <canvas ref={canvasRef} className="hidden" />

          {/* Target corners */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-56 h-56 relative">
              {/* Corner markers */}
              {[
                'top-0 left-0 border-t-4 border-l-4 rounded-tl-xl',
                'top-0 right-0 border-t-4 border-r-4 rounded-tr-xl',
                'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-xl',
                'bottom-0 right-0 border-b-4 border-r-4 rounded-br-xl',
              ].map((cls, i) => (
                <div key={i} className={`absolute w-8 h-8 border-indigo-400 ${cls} transition-all duration-300 ${isProcessing ? 'border-emerald-400 scale-110' : ''}`} />
              ))}

              {/* Scanning line */}
              {isReady && !isProcessing && !error && (
                <div className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-indigo-400 to-transparent shadow-[0_0_8px_2px_rgba(99,102,241,0.6)] animate-[scan_1.5s_ease-in-out_infinite]" />
              )}

              {/* Processing overlay */}
              {isProcessing && !error && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="bg-emerald-500/20 border border-emerald-400/40 rounded-2xl p-4">
                    <CheckCircle2 size={32} className="text-emerald-400 animate-bounce" />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Loading overlay */}
          {!isReady && !error && (
            <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3">
              <Loader2 size={32} className="text-indigo-400 animate-spin" />
              <p className="text-white/60 text-sm">Opening camera...</p>
            </div>
          )}

          {/* Confirmation card — shows name + time, auto-dismisses */}
          {confirmation && (
            <div className="absolute inset-0 flex items-center justify-center p-4 animate-fade-in">
              <div className={`w-full max-w-xs rounded-2xl p-5 text-center shadow-2xl border ${
                confirmation.ok
                  ? 'bg-emerald-500/95 border-emerald-300/40 text-white'
                  : 'bg-amber-500/95 border-amber-300/40 text-white'
              }`}>
                <CheckCircle2 size={40} className="mx-auto mb-2 drop-shadow" />
                <p className="text-lg font-bold leading-tight">{confirmation.title}</p>
                {confirmation.subtitle && (
                  <p className="text-sm opacity-95 mt-1">{confirmation.subtitle}</p>
                )}
                <p className="text-[11px] opacity-80 mt-3">Ready for next staff…</p>
              </div>
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div className="absolute bottom-4 left-4 right-4 p-3 rounded-xl bg-red-500/90 backdrop-blur text-white text-sm flex items-start gap-2 shadow-xl animate-fade-in">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <p className="font-medium">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 text-center">
          <p className="text-sm font-medium text-[var(--text-secondary)]">
            Point at the <strong className="text-[var(--text-primary)]">QR code on the tablet</strong> to clock in/out
          </p>
          {scanCount > 0 && (
            <p className="text-xs text-emerald-400 mt-1">QR detected — verifying...</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default QRAttendanceScanner;
