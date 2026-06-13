import React, { useEffect, useState } from 'react';
import { Coffee, Pause, Play, Loader2, AlertTriangle } from 'lucide-react';
import { breakTypeService, breakEventService } from '../services/breakService';
import { BreakType, BreakEvent, Staff } from '../types';

interface Props {
  staff: Staff;
  source?: 'web' | 'mobile';
  performedBy?: string;
  compact?: boolean;
  onChanged?: () => void;
}

const BreakControls: React.FC<Props> = ({ staff, source = 'web', performedBy, compact, onChanged }) => {
  const [types, setTypes] = useState<BreakType[]>([]);
  const [openBreak, setOpenBreak] = useState<BreakEvent | null>(null);
  const [loading, setLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [elapsedTick, setElapsedTick] = useState(0);

  useEffect(() => {
    breakTypeService.list(true).then(setTypes);
    breakEventService.openBreak(staff.id).then(setOpenBreak);
  }, [staff.id]);

  useEffect(() => {
    if (!openBreak) return;
    const t = setInterval(() => setElapsedTick(x => x + 1), 30 * 1000);
    return () => clearInterval(t);
  }, [openBreak]);

  const elapsedMin = openBreak
    ? Math.floor((Date.now() - new Date(`${openBreak.date}T${openBreak.startTime}`).getTime()) / 60000)
    : 0;
  const activeType = openBreak ? types.find(t => t.id === openBreak.breakTypeId) : null;
  const overLimit = activeType ? elapsedMin > activeType.maxMinutes : false;

  const startBreak = async (type: BreakType) => {
    setLoading(true);
    const ev = await breakEventService.start({
      staffId: staff.id, staffName: staff.name, location: staff.location,
      breakType: type, source, createdBy: performedBy || staff.name,
    });
    if (ev) setOpenBreak(ev);
    setLoading(false);
    setPickerOpen(false);
    onChanged?.();
  };

  const endBreak = async () => {
    if (!openBreak) return;
    setLoading(true);
    const type = types.find(t => t.id === openBreak.breakTypeId);
    await breakEventService.end({
      eventId: openBreak.id, staffId: staff.id, staffName: staff.name,
      breakType: type, createdBy: performedBy || staff.name,
    });
    setOpenBreak(null);
    setLoading(false);
    onChanged?.();
  };

  if (openBreak) {
    return (
      <div className={`rounded-2xl border ${overLimit ? 'border-red-500/40 bg-red-500/10' : 'border-amber-500/40 bg-amber-500/10'} p-4 ${compact ? '' : 'space-y-3'}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Coffee size={18} className={overLimit ? 'text-red-500' : 'text-amber-500'} />
            <div>
              <div className="text-sm font-semibold">On break: {activeType?.name || 'Break'}</div>
              <div className="text-xs text-[var(--text-muted)]">
                Started {openBreak.startTime.slice(0, 5)} · {elapsedMin}m elapsed
                {activeType && ` / ${activeType.maxMinutes}m max`}
              </div>
            </div>
          </div>
          <button
            onClick={endBreak}
            disabled={loading}
            className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            End Break
          </button>
        </div>
        {overLimit && (
          <div className="flex items-center gap-1.5 text-xs text-red-500">
            <AlertTriangle size={12} /> Break limit exceeded — will be flagged as violation.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        onClick={() => setPickerOpen(p => !p)}
        disabled={loading || types.length === 0}
        className="w-full px-3 py-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-600 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <Pause size={16} /> Start Break
      </button>
      {pickerOpen && (
        <div className="grid grid-cols-1 gap-2 p-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)]">
          {types.map(t => (
            <button
              key={t.id}
              onClick={() => startBreak(t)}
              disabled={loading}
              className="text-left px-3 py-2 rounded-lg hover:bg-white/5 border border-transparent hover:border-[var(--glass-border)] disabled:opacity-50"
            >
              <div className="text-sm font-semibold">{t.name}</div>
              <div className="text-[11px] text-[var(--text-muted)]">
                Default {t.defaultMinutes}m · max {t.maxMinutes}m · {t.isPaid ? 'Paid' : 'Unpaid'}
              </div>
            </button>
          ))}
          {types.length === 0 && (
            <div className="text-xs text-[var(--text-muted)] p-2">No break types configured.</div>
          )}
        </div>
      )}
    </div>
  );
};

export default BreakControls;
