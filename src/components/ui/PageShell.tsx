import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * Shared page chrome primitives.
 *
 * Every admin page uses the same header, stat tiles, empty state and error
 * state so the app reads as one product instead of a set of screens.
 * All colours come from theme tokens so light/dark both stay legible.
 */

export const PageHeader: React.FC<{
  title: string;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ title, subtitle, icon, actions }) => (
  <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
    <div className="flex items-start gap-3 min-w-0">
      {icon && (
        <div className="w-10 h-10 shrink-0 rounded-xl bg-[var(--glass-bg-strong)] border border-[var(--glass-border)] flex items-center justify-center text-[var(--primary-gradient)]">
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <h2 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] truncate">{title}</h2>
        {subtitle && (
          <p className="text-xs sm:text-sm text-[var(--text-muted)] mt-0.5 truncate">{subtitle}</p>
        )}
      </div>
    </div>
    {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
  </header>
);

export type StatTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

const toneStyles: Record<StatTone, string> = {
  neutral: 'border-[var(--glass-border)] bg-[var(--bg-card)] text-[var(--text-primary)]',
  primary: 'border-blue-500/25 bg-blue-500/10 text-blue-600',
  success: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600',
  warning: 'border-amber-500/25 bg-amber-500/10 text-amber-600',
  danger: 'border-red-500/25 bg-red-500/10 text-red-600',
  info: 'border-indigo-500/25 bg-indigo-500/10 text-indigo-600',
};

export const StatTile: React.FC<{
  label: string;
  value: React.ReactNode;
  tone?: StatTone;
  hint?: string;
  onClick?: () => void;
  active?: boolean;
}> = ({ label, value, tone = 'neutral', hint, onClick, active }) => {
  const Tag: any = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`text-left p-3 rounded-xl border transition-all ${toneStyles[tone]} ${
        onClick ? 'hover:shadow-[var(--shadow-soft)] active:scale-[0.98]' : ''
      } ${active ? 'ring-2 ring-[var(--primary-gradient)]/40' : ''}`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{label}</p>
      <p className="text-xl sm:text-2xl font-bold leading-tight">{value}</p>
      {hint && <p className="text-[10px] opacity-70 mt-0.5">{hint}</p>}
    </Tag>
  );
};

export const SectionCard: React.FC<{ className?: string; children: React.ReactNode }> = ({
  className = '',
  children,
}) => (
  <section
    className={`bg-[var(--bg-card)] border border-[var(--glass-border)] rounded-2xl shadow-[var(--shadow-soft)] ${className}`}
  >
    {children}
  </section>
);

export const EmptyState: React.FC<{
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}> = ({ icon, title, description, action }) => (
  <div className="py-12 px-6 text-center rounded-2xl border border-dashed border-[var(--glass-border)] bg-[var(--bg-card)]">
    {icon && (
      <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-[var(--glass-bg-strong)] flex items-center justify-center text-[var(--text-muted)]">
        {icon}
      </div>
    )}
    <p className="font-semibold text-[var(--text-primary)]">{title}</p>
    {description && (
      <p className="text-xs text-[var(--text-muted)] mt-1 max-w-sm mx-auto">{description}</p>
    )}
    {action && <div className="mt-4 flex justify-center">{action}</div>}
  </div>
);

export const ErrorState: React.FC<{
  message: string;
  onRetry?: () => void;
  compact?: boolean;
}> = ({ message, onRetry, compact }) =>
  compact ? (
    <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 text-sm">
      <AlertTriangle size={16} className="shrink-0 mt-0.5" />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="font-semibold underline underline-offset-2 shrink-0">
          Retry
        </button>
      )}
    </div>
  ) : (
    <div className="py-10 px-6 text-center rounded-2xl border border-red-500/20 bg-red-500/5">
      <AlertTriangle size={28} className="mx-auto mb-2 text-red-500" />
      <p className="font-semibold text-[var(--text-primary)]">Something went wrong</p>
      <p className="text-xs text-[var(--text-muted)] mt-1 max-w-sm mx-auto">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--primary-gradient)] text-[var(--on-primary)] text-sm font-semibold"
        >
          <RefreshCw size={15} /> Try again
        </button>
      )}
    </div>
  );

export default PageHeader;
