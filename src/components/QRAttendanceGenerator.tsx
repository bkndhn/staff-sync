import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { QrCode, RefreshCw } from 'lucide-react';
import { generateQRPayload, QR_EXPIRATION_SECONDS } from '../utils/qrCrypto';

interface Props {
  location: string;
}

const QRAttendanceGenerator: React.FC<Props> = ({ location }) => {
  const [payload, setPayload] = useState<string>('');
  const [timeLeft, setTimeLeft] = useState<number>(QR_EXPIRATION_SECONDS);

  useEffect(() => {
    let active = true;

    const generate = async () => {
      const newPayload = await generateQRPayload(location);
      if (active) {
        setPayload(newPayload);
        setTimeLeft(QR_EXPIRATION_SECONDS);
      }
    };

    // Initial generation
    generate();

    // Timer interval
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          generate();
          return QR_EXPIRATION_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [location]);

  if (!payload) return null;

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-[var(--bg-card)] rounded-2xl border border-[var(--glass-border)] shadow-xl w-full max-w-sm mx-auto">
      <div className="flex items-center gap-2 mb-4 text-indigo-400">
        <QrCode size={24} />
        <h3 className="text-lg font-bold text-[var(--text-primary)]">Scan to Clock In/Out</h3>
      </div>
      
      <div className="bg-white p-4 rounded-xl shadow-inner mb-6 relative group overflow-hidden">
        <QRCodeSVG 
          value={payload} 
          size={240} 
          level="H"
          className="transition-transform duration-300 group-hover:scale-105"
        />
        
        {/* Scanning scanning overlay effect */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl">
          <div className="w-full h-1 bg-indigo-500/50 shadow-[0_0_8px_2px_rgba(99,102,241,0.5)] absolute top-0 animate-[scan_3s_ease-in-out_infinite]"></div>
        </div>
      </div>

      <div className="w-full px-4">
        <div className="flex justify-between text-xs text-[var(--text-secondary)] mb-1 font-medium">
          <span className="flex items-center gap-1"><RefreshCw size={12} className={timeLeft <= 2 ? 'animate-spin text-orange-400' : ''} /> Refreshes in</span>
          <span className={timeLeft <= 2 ? 'text-orange-400 font-bold' : ''}>{timeLeft}s</span>
        </div>
        <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all duration-1000 ease-linear ${timeLeft <= 2 ? 'bg-orange-400' : 'bg-indigo-500'}`}
            style={{ width: `${(timeLeft / QR_EXPIRATION_SECONDS) * 100}%` }}
          />
        </div>
      </div>
      
      <p className="mt-6 text-xs text-center text-[var(--text-secondary)]">
        Open the <strong>Staff App</strong> on your phone and scan this code to mark attendance.
      </p>
    </div>
  );
};

export default QRAttendanceGenerator;
