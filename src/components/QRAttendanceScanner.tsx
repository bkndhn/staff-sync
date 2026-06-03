import React, { useEffect, useState, useRef } from 'react';
import { QrCode, XCircle, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { validateQRPayload } from '../utils/qrCrypto';
import { Html5Qrcode } from 'html5-qrcode';

export interface ScanConfirmation {
  ok: boolean;
  title: string;     // e.g. "Ravi Kumar"
  subtitle?: string; // e.g. "Clocked IN at 09:14"
}

interface Props {
  staffLocation: string;
  onScanSuccess: (payload: any) => Promise<ScanConfirmation> | ScanConfirmation;
  onClose: () => void;
}

const QRAttendanceScanner: React.FC<Props> = ({ staffLocation, onScanSuccess, onClose }) => {
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmation, setConfirmation] = useState<ScanConfirmation | null>(null);
  const [scanCount, setScanCount] = useState(0);

  const activeRef = useRef(true);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const processingRef = useRef(false);
  const lastDecodedRef = useRef<{ value: string; at: number } | null>(null);

  useEffect(() => {
    activeRef.current = true;
    const scanner = new Html5Qrcode("qr-reader");
    scannerRef.current = scanner;

    const startScanner = async () => {
      try {
        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
          },
          async (decodedText) => {
            if (!activeRef.current || processingRef.current) return;

            // Debounce
            const now = Date.now();
            const last = lastDecodedRef.current;
            if (last && last.value === decodedText && now - last.at < 2500) return;

            processingRef.current = true;
            setIsProcessing(true);
            setScanCount(c => c + 1);

            const validation = await validateQRPayload(decodedText, staffLocation);

            if (validation.valid) {
              lastDecodedRef.current = { value: decodedText, at: now };
              try {
                const result = await onScanSuccess(JSON.parse(decodedText));
                if (!activeRef.current) return;
                setConfirmation(result);
              } catch (e: any) {
                setConfirmation({ ok: false, title: 'Failed to record', subtitle: e?.message || 'Try again.' });
              }
              // Hold confirmation card
              setTimeout(() => {
                if (activeRef.current) {
                  setConfirmation(null);
                  setIsProcessing(false);
                  processingRef.current = false;
                }
              }, 2500);
            } else {
              setError(validation.reason || 'Invalid QR Code');
              setTimeout(() => {
                if (activeRef.current) {
                  setError(null);
                  setIsProcessing(false);
                  processingRef.current = false;
                }
              }, 1800);
            }
          },
          (errorMessage) => {
            // Ignore frame-level errors
          }
        );
        if (activeRef.current) setIsReady(true);
      } catch (err: any) {
        if (activeRef.current) {
          setError(err?.message?.includes('Permission') || err?.name === 'NotAllowedError'
            ? 'Camera permission denied. Please allow camera access.'
            : 'Cannot open camera. Try again.');
        }
      }
    };

    startScanner();

    return () => {
      activeRef.current = false;
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, [staffLocation, onScanSuccess]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/95 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-[var(--bg-app)] rounded-3xl overflow-hidden shadow-2xl border border-[var(--glass-border)] flex flex-col">
        {/* Header */}
        <div className="p-4 bg-[var(--bg-card)] border-b border-[var(--glass-border)] flex items-center justify-between">
          <h3 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
            <QrCode size={20} className="text-indigo-400" />
            Scan Attendance QR
          </h3>
          <button onClick={onClose} className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-[var(--text-secondary)] hover:text-white transition-colors">
            <XCircle size={22} />
          </button>
        </div>

        {/* Scanner viewport */}
        <div className="relative bg-black aspect-square flex items-center justify-center overflow-hidden">
          <div id="qr-reader" className="w-full h-full" />

          {/* Scanning line overlay */}
          {isReady && !isProcessing && !error && (
            <div className="absolute left-4 right-4 top-1/2 h-0.5 bg-gradient-to-r from-transparent via-indigo-400 to-transparent shadow-[0_0_8px_2px_rgba(99,102,241,0.6)] animate-[scan_1.5s_ease-in-out_infinite] z-10" style={{ transform: 'translateY(-50%)' }} />
          )}

          {/* Processing overlay */}
          {isProcessing && !error && (
            <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/40">
              <div className="bg-emerald-500/20 border border-emerald-400/40 rounded-2xl p-4">
                <CheckCircle2 size={32} className="text-emerald-400 animate-bounce" />
              </div>
            </div>
          )}

          {/* Loading overlay */}
          {!isReady && !error && (
            <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3 z-20">
              <Loader2 size={32} className="text-indigo-400 animate-spin" />
              <p className="text-white/60 text-sm">Opening camera...</p>
            </div>
          )}

          {/* Confirmation card */}
          {confirmation && (
            <div className="absolute inset-0 flex items-center justify-center p-4 animate-fade-in z-30">
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
            <div className="absolute bottom-4 left-4 right-4 p-3 rounded-xl bg-red-500/90 backdrop-blur text-white text-sm flex items-start gap-2 shadow-xl animate-fade-in z-30">
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
      <style>{`
        #qr-reader { border: none !important; }
        #qr-reader__scan_region { min-height: 100% !important; }
        #qr-reader__dashboard { display: none !important; }
        #qr-reader video { object-fit: cover !important; }
      `}</style>
    </div>
  );
};

export default QRAttendanceScanner;
