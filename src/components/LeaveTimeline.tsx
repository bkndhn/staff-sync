import React from 'react';
import { Check, X, Clock, Send } from 'lucide-react';
import type { LeaveRequest } from '../services/leaveService';

interface Props {
  leave: LeaveRequest;
  compact?: boolean;
}

const actionStyle = (action: string) => {
  if (action === 'approved') return { icon: Check, cls: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' };
  if (action === 'rejected') return { icon: X, cls: 'bg-red-500/15 text-red-600 border-red-500/30' };
  return { icon: Clock, cls: 'bg-blue-500/15 text-blue-600 border-blue-500/30' };
};

/** Vertical status timeline: submission -> each approval level -> outcome / pending. */
export const LeaveTimeline: React.FC<Props> = ({ leave, compact }) => {
  const history = leave.approvalHistory || [];
  const required = leave.requiredApprovalLevels || 1;
  const current = leave.currentApprovalLevel || 1;

  const fmt = (d: string) =>
    new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`space-y-0 ${compact ? 'text-[11px]' : 'text-xs'}`}>
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <span className="w-6 h-6 rounded-full border bg-indigo-500/15 text-indigo-600 border-indigo-500/30 flex items-center justify-center">
            <Send size={12} />
          </span>
          <span className="flex-1 w-px bg-[var(--glass-border)] my-1" />
        </div>
        <div className="pb-3">
          <p className="font-semibold text-[var(--text-primary)]">Request submitted</p>
          <p className="text-[var(--text-muted)]">{fmt(leave.createdAt)}</p>
        </div>
      </div>

      {history.map((h, i) => {
        const { icon: Icon, cls } = actionStyle(h.action);
        const last = i === history.length - 1 && leave.status !== 'pending';
        return (
          <div key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className={`w-6 h-6 rounded-full border flex items-center justify-center ${cls}`}>
                <Icon size={12} />
              </span>
              {!last && <span className="flex-1 w-px bg-[var(--glass-border)] my-1" />}
            </div>
            <div className="pb-3">
              <p className="font-semibold text-[var(--text-primary)]">
                Level {h.level} · {h.action.charAt(0).toUpperCase() + h.action.slice(1)} by {h.user}
                <span className="text-[var(--text-muted)] font-normal"> ({h.role})</span>
              </p>
              <p className="text-[var(--text-muted)]">{fmt(h.date)}</p>
              {h.comment && <p className="text-[var(--text-secondary)] mt-0.5">“{h.comment}”</p>}
            </div>
          </div>
        );
      })}

      {leave.status === 'pending' && (
        <div className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className="w-6 h-6 rounded-full border border-dashed border-amber-500/40 bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <Clock size={12} />
            </span>
          </div>
          <div>
            <p className="font-semibold text-amber-600">
              Awaiting approval — level {Math.min(current, required)} of {required}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeaveTimeline;
