import React from 'react';
import { CheckCircle2, MapPinOff, AlertTriangle, WifiOff, X } from 'lucide-react';

export interface PunchDialogState {
  ok: boolean;
  title: string;
  subtitle: string;
  offline?: boolean;
}

const isLocationIssue = (t: string) => /location|gps|geofence|outside|mock|fake/i.test(t);

export const PunchResultDialog: React.FC<{ state: PunchDialogState | null; onClose: () => void }> = ({ state, onClose }) => {
  if (!state) return null;
  const loc = !state.ok && isLocationIssue(`${state.title} ${state.subtitle}`);
  const permission = /permission/i.test(state.title);
  const Icon = state.ok ? (state.offline ? WifiOff : CheckCircle2) : loc ? MapPinOff : AlertTriangle;
  const tone = state.ok ? 'text-emerald-500 bg-emerald-500/15' : 'text-red-500 bg-red-500/15';

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl bg-[var(--bg-elevated,var(--glass-bg))] border border-[var(--glass-border)] shadow-2xl p-6 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] animate-in slide-in-from-bottom-4"
        style={{ background: 'var(--card-bg, hsl(var(--background)))' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-[var(--glass-border)] sm:hidden" />
        <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 hidden sm:block text-[var(--text-muted)]"><X size={18} /></button>
        <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${tone}`}>
          <Icon size={32} />
        </div>
        <h3 className="text-center text-lg font-bold text-[var(--text-primary)]">{state.title}</h3>
        <p className="mt-2 text-center text-sm text-[var(--text-secondary)] leading-relaxed">{state.subtitle}</p>
        {state.offline && (
          <p className="mt-2 text-center text-xs text-amber-500">Saved on this phone — it will sync automatically when you are back online.</p>
        )}
        {permission && (
          <ol className="mt-4 space-y-1.5 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] p-3 text-xs text-[var(--text-secondary)] list-decimal list-inside">
            <li>Tap the lock / ⓘ icon next to the website address.</li>
            <li>Open <b>Permissions → Location</b> and choose <b>Allow</b>.</li>
            <li>On Android also turn on phone <b>Location</b> (GPS) in quick settings.</li>
            <li>Come back and tap Clock In again.</li>
          </ol>
        )}
        <button onClick={onClose} className={`mt-5 w-full rounded-2xl py-3 text-sm font-semibold text-white active:scale-[0.98] ${state.ok ? 'bg-emerald-600' : 'bg-indigo-600'}`}>
          {state.ok ? 'Done' : 'OK, got it'}
        </button>
      </div>
    </div>
  );
};

export default PunchResultDialog;
