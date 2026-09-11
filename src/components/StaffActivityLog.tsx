import React, { useEffect, useMemo, useState } from 'react';
import { Banknote, CalendarDays, Clock3, Loader2, RefreshCw } from 'lucide-react';
import { leaveService, type LeaveRequest } from '../services/leaveService';
import { punchEventService, type PunchEvent } from '../services/punchEventService';
import { salaryDisbursementService, type SalaryDisbursement } from '../services/salaryDisbursementService';

type ActivityFilter = 'all' | 'punch' | 'leave' | 'salary';

interface ActivityItem {
  id: string;
  type: Exclude<ActivityFilter, 'all'>;
  occurredAt: string;
  title: string;
  detail: string;
  meta?: string;
  tone: string;
}

interface StaffActivityLogProps {
  staffId: string;
}

const formatDateTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

const leaveRange = (leave: LeaveRequest) =>
  leave.leaveEndDate && leave.leaveEndDate !== leave.leaveDate
    ? `${leave.leaveDate} to ${leave.leaveEndDate}`
    : leave.leaveDate;

export const StaffActivityLog: React.FC<StaffActivityLogProps> = ({ staffId }) => {
  const [punches, setPunches] = useState<PunchEvent[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [payments, setPayments] = useState<SalaryDisbursement[]>([]);
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    Promise.all([
      punchEventService.listByStaffId(staffId),
      leaveService.getByStaffId(staffId),
      salaryDisbursementService.getByStaffId(staffId),
    ])
      .then(([nextPunches, nextLeaves, nextPayments]) => {
        if (!active) return;
        setPunches(nextPunches);
        setLeaves(nextLeaves);
        setPayments(nextPayments);
      })
      .catch(() => {
        if (active) setError('Activity could not be loaded. Please try again.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [staffId, refreshKey]);

  const items = useMemo<ActivityItem[]>(() => {
    const punchItems = punches.map((punch) => ({
      id: `punch-${punch.id}`,
      type: 'punch' as const,
      occurredAt: `${punch.date}T${punch.eventTime}`,
      title: `Clock ${punch.kind === 'in' ? 'in' : 'out'}`,
      detail: `${punch.date} at ${punch.eventTime.slice(0, 5)}`,
      meta: [punch.location, punch.source].filter(Boolean).join(' · '),
      tone: punch.kind === 'in' ? 'text-emerald-500 bg-emerald-500/10' : 'text-blue-500 bg-blue-500/10',
    }));

    const leaveItems = leaves.map((leave) => ({
      id: `leave-${leave.id}`,
      type: 'leave' as const,
      occurredAt: leave.createdAt || `${leave.leaveDate}T00:00:00`,
      title: `${leave.leaveType.charAt(0).toUpperCase()}${leave.leaveType.slice(1)} leave`,
      detail: leaveRange(leave),
      meta: `${leave.status.charAt(0).toUpperCase()}${leave.status.slice(1)}${leave.reason ? ` · ${leave.reason}` : ''}`,
      tone: leave.status === 'approved' ? 'text-emerald-500 bg-emerald-500/10' : leave.status === 'rejected' ? 'text-rose-500 bg-rose-500/10' : 'text-amber-500 bg-amber-500/10',
    }));

    const paymentItems = payments.map((payment) => ({
      id: `salary-${payment.id}`,
      type: 'salary' as const,
      occurredAt: payment.disbursedAt,
      title: `Salary credited · ₹${Number(payment.amount).toLocaleString('en-IN')}`,
      detail: payment.monthYear,
      meta: [payment.paymentMode?.toUpperCase(), payment.transactionRef].filter(Boolean).join(' · '),
      tone: 'text-violet-500 bg-violet-500/10',
    }));

    return [...punchItems, ...leaveItems, ...paymentItems]
      .filter((item) => filter === 'all' || item.type === filter)
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  }, [filter, leaves, payments, punches]);

  const filters: Array<{ key: ActivityFilter; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'punch', label: 'Punches' },
    { key: 'leave', label: 'Leave' },
    { key: 'salary', label: 'Salary' },
  ];

  if (loading) {
    return <div className="min-h-40 flex items-center justify-center text-[var(--text-muted)]"><Loader2 size={20} className="animate-spin mr-2" /> Loading activity…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1 overflow-x-auto pb-1">
          {filters.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setFilter(option.key)}
              className={`shrink-0 px-3 py-2 rounded-md text-xs font-semibold border transition-colors ${filter === option.key ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)]' : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--glass-border)]'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setRefreshKey((value) => value + 1)} className="shrink-0 p-2 rounded-md border border-[var(--glass-border)] text-[var(--text-secondary)]" title="Refresh activity" aria-label="Refresh activity">
          <RefreshCw size={16} />
        </button>
      </div>

      {error && <div className="p-3 rounded-md border border-rose-500/30 bg-rose-500/10 text-sm text-rose-500">{error}</div>}

      {!error && items.length === 0 ? (
        <div className="p-8 text-center border border-dashed border-[var(--glass-border)] rounded-lg">
          <p className="text-sm font-medium text-[var(--text-primary)]">No activity found</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Punches, leave requests and salary credits will appear here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const Icon = item.type === 'punch' ? Clock3 : item.type === 'leave' ? CalendarDays : Banknote;
            return (
              <article key={item.id} className="flex gap-3 p-3 rounded-lg border border-[var(--glass-border)] bg-[var(--bg-card)]">
                <div className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 ${item.tone}`}><Icon size={17} /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-0.5 sm:gap-3">
                    <h4 className="text-sm font-semibold text-[var(--text-primary)]">{item.title}</h4>
                    <time className="text-[11px] text-[var(--text-muted)] shrink-0">{formatDateTime(item.occurredAt)}</time>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">{item.detail}</p>
                  {item.meta && <p className="text-[11px] text-[var(--text-muted)] mt-1 break-words">{item.meta}</p>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};