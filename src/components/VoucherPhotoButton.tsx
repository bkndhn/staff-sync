import React, { useRef, useState } from 'react';
import { Camera, X, Loader2 } from 'lucide-react';
import { compressImage } from '../utils/imageCompression';

interface Props {
  value?: string | null;
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
}

/** Attach a receipt/voucher photo (camera or gallery). Stored compressed (~800px JPEG). */
const VoucherPhotoButton: React.FC<Props> = ({ value, onChange, disabled }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);

  const pick = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try { onChange(await compressImage(file, 800, 800)); } finally { setBusy(false); }
  };

  return (
    <>
      {value ? (
        <button type="button" onClick={() => setPreview(true)} className="h-9 w-9 shrink-0 rounded-lg overflow-hidden border border-emerald-400" title="View voucher">
          <img src={value} alt="Voucher" className="h-full w-full object-cover" />
        </button>
      ) : (
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
          className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-40"
          title="Attach voucher photo"
          aria-label="Attach voucher photo"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => { pick(e.target.files?.[0]); e.target.value = ''; }} />
      {preview && value && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex flex-col items-center justify-center p-4" onClick={() => setPreview(false)}>
          <img src={value} alt="Voucher" className="max-h-[80vh] max-w-full rounded-xl" />
          <div className="mt-4 flex gap-3" onClick={e => e.stopPropagation()}>
            {!disabled && (
              <>
                <button className="px-4 py-2 rounded-lg bg-white text-slate-900 text-sm font-semibold" onClick={() => { setPreview(false); inputRef.current?.click(); }}>Replace</button>
                <button className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold flex items-center gap-1" onClick={() => { onChange(null); setPreview(false); }}><X size={14} /> Remove</button>
              </>
            )}
            <button className="px-4 py-2 rounded-lg bg-slate-700 text-white text-sm font-semibold" onClick={() => setPreview(false)}>Close</button>
          </div>
        </div>
      )}
    </>
  );
};

export default VoucherPhotoButton;
