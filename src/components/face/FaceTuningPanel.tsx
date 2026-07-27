import React, { useEffect, useState } from 'react';
import { Sliders, Info, CheckCircle2 } from 'lucide-react';

/**
 * Batch 5: Face Recognition Tuning
 * - Admin-configurable cosine-distance threshold (persisted in localStorage)
 * - Camera reliability tips (lighting, distance, angle)
 * - Read by FaceAttendance / useFaceEngine via getFaceThreshold()
 */

const KEY = 'faceMatchThresholdV2';
const DEFAULT_THRESHOLD = 0.42;

export function getFaceThreshold(): number {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_THRESHOLD;
    const n = parseFloat(raw);
    if (Number.isFinite(n) && n > 0.2 && n < 0.9) return n;
  } catch {}
  return DEFAULT_THRESHOLD;
}

const FaceTuningPanel: React.FC = () => {
  const [threshold, setThreshold] = useState<number>(getFaceThreshold());
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(KEY, String(threshold)); } catch {}
    setSaved(true);
    const t = setTimeout(() => setSaved(false), 1500);
    return () => clearTimeout(t);
  }, [threshold]);

  return (
    <div className="rounded-2xl bg-white shadow-sm border border-blue-100 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Sliders size={18} className="text-blue-600" />
        <h3 className="font-semibold text-gray-800">Face Recognition Tuning</h3>
        {saved && <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 size={12} /> saved</span>}
      </div>

      <div>
        <div className="flex justify-between text-sm mb-1">
          <label className="text-gray-700">Match threshold (cosine distance)</label>
          <span className="font-mono text-blue-700">{threshold.toFixed(2)}</span>
        </div>
        <input
          type="range"
          min={0.25} max={0.65} step={0.01}
          value={threshold}
          onChange={e => setThreshold(parseFloat(e.target.value))}
          className="w-full accent-blue-600"
        />
        <div className="flex justify-between text-[10px] text-gray-500 mt-1">
          <span>Strict (fewer false matches)</span>
          <span>Lenient (fewer misses)</span>
        </div>
      </div>

      <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 text-xs text-blue-900 space-y-1.5">
        <div className="flex items-center gap-1.5 font-semibold"><Info size={12} /> Tips for reliable recognition</div>
        <ul className="list-disc pl-5 space-y-1">
          <li>Register 3–5 samples per person from slightly different angles & lighting.</li>
          <li>Keep the face centered, 40–70 cm from the camera.</li>
          <li>Avoid heavy backlight (window behind the person).</li>
          <li>Clean the lens weekly — dust adds noise to embeddings.</li>
          <li>Re-register if the person changes glasses / hair drastically.</li>
        </ul>
      </div>
    </div>
  );
};

export default FaceTuningPanel;
