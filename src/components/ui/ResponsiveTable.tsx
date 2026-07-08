import React from 'react';

/**
 * ResponsiveTable — one data set, two layouts.
 *
 * Renders a proper `<table>` on `md+` screens and stacked cards on mobile,
 * using the same column definitions. No horizontal scroll on phones.
 *
 * Usage:
 *   <ResponsiveTable
 *     columns={[
 *       { key: 'name', header: 'Name', cell: r => r.name },
 *       { key: 'role', header: 'Role', cell: r => r.role },
 *     ]}
 *     rows={staff}
 *     rowKey={r => r.id}
 *   />
 */
export interface ResponsiveColumn<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T, index: number) => React.ReactNode;
  /** Hide this column entirely (e.g. based on role). */
  hidden?: boolean;
  /** Emphasise this column in the mobile card header. */
  primary?: boolean;
  className?: string;
}

interface Props<T> {
  columns: ResponsiveColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => React.Key;
  empty?: React.ReactNode;
  loading?: boolean;
  loadingRows?: number;
  onRowClick?: (row: T) => void;
  className?: string;
}

export function ResponsiveTable<T>({
  columns, rows, rowKey, empty, loading, loadingRows = 4, onRowClick, className = '',
}: Props<T>) {
  const cols = columns.filter(c => !c.hidden);

  if (loading) {
    return (
      <div className={className}>
        <div className="hidden md:block">
          <div className="w-full overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--text-secondary)]">
                  {cols.map(c => <th key={c.key} className="p-3 font-semibold">{c.header}</th>)}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: loadingRows }).map((_, i) => (
                  <tr key={i} className="border-t border-[var(--glass-border)]">
                    {cols.map(c => (
                      <td key={c.key} className="p-3">
                        <div className="h-3 w-3/4 bg-[var(--glass-border)] rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="md:hidden space-y-2">
          {Array.from({ length: loadingRows }).map((_, i) => (
            <div key={i} className="p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--glass-border)] space-y-2">
              <div className="h-3 w-1/2 bg-[var(--glass-border)] rounded animate-pulse" />
              <div className="h-3 w-3/4 bg-[var(--glass-border)] rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className={`p-6 text-center text-sm text-[var(--text-secondary)] ${className}`}>
        {empty ?? 'No records to display.'}
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Desktop / tablet — proper table */}
      <div className="hidden md:block w-full overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--text-secondary)] border-b border-[var(--glass-border)]">
              {cols.map(c => (
                <th key={c.key} className={`p-3 font-semibold ${c.className || ''}`}>{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={rowKey(row, i)}
                className={`border-t border-[var(--glass-border)] ${onRowClick ? 'cursor-pointer hover:bg-[var(--glass-border)]/30' : ''}`}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {cols.map(c => (
                  <td key={c.key} className={`p-3 align-top ${c.className || ''}`}>
                    {c.cell(row, i)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile — stacked cards */}
      <div className="md:hidden space-y-2">
        {rows.map((row, i) => {
          const primary = cols.find(c => c.primary) ?? cols[0];
          const rest = cols.filter(c => c !== primary);
          return (
            <div
              key={rowKey(row, i)}
              className={`p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--glass-border)] ${onRowClick ? 'active:opacity-80' : ''}`}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              <div className="text-base font-semibold text-[var(--text-primary)] mb-2">
                {primary.cell(row, i)}
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                {rest.map(c => (
                  <React.Fragment key={c.key}>
                    <dt className="text-[var(--text-secondary)]">{c.header}</dt>
                    <dd className="text-[var(--text-primary)] text-right">{c.cell(row, i)}</dd>
                  </React.Fragment>
                ))}
              </dl>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ResponsiveTable;
