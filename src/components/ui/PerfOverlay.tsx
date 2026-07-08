import React, { useEffect, useState } from 'react';
import { perfEnabled, perfSnapshot, perfSubscribe, readHeapMB, type PerfSnapshot } from '../../lib/perfProfiler';
import { getDeviceProfile } from '../../lib/deviceProfile';

/**
 * PerfOverlay — floating chip visible only when ?perf=1 is set.
 * Shows top timings + heap. Zero cost when disabled.
 */
const PerfOverlay: React.FC = () => {
  const [snap, setSnap] = useState<PerfSnapshot[]>([]);
  const [heap, setHeap] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!perfEnabled()) return;
    const upd = () => { setSnap(perfSnapshot()); setHeap(readHeapMB()); };
    upd();
    const off = perfSubscribe(upd);
    const iv = window.setInterval(upd, 1000);
    return () => { off(); clearInterval(iv); };
  }, []);

  if (!perfEnabled()) return null;
  const dev = getDeviceProfile();

  return (
    <div className="fixed bottom-3 left-3 z-[9999] font-mono text-[10px]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="px-2 py-1 rounded-md bg-black/70 text-emerald-300 border border-emerald-500/40 backdrop-blur"
        aria-label="Toggle performance overlay"
      >
        perf {snap.find(s => s.name === 'face.detect')?.last.toFixed(0) ?? '–'}ms
        {heap != null && ` · ${heap}MB`}
      </button>
      {open && (
        <div className="mt-1 max-w-[280px] p-2 rounded-md bg-black/85 text-white/90 border border-white/20 backdrop-blur space-y-1">
          <div className="text-emerald-300">
            {dev.isLowEnd ? 'low-end' : 'high-end'} · {dev.cores}c · in={dev.detectorInputSize} · gap={dev.minDetectIntervalMs}ms
          </div>
          {snap.length === 0 && <div className="text-white/50">No samples yet…</div>}
          {snap.map((s) => (
            <div key={s.name} className="flex justify-between gap-3">
              <span className="text-white/60">{s.name}</span>
              <span>
                {s.last.toFixed(1)} <span className="text-white/40">avg {s.avg.toFixed(1)} · max {s.max.toFixed(0)} · n{s.count}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PerfOverlay;
