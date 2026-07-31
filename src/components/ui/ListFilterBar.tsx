import React, { useState } from 'react';
import { Search, X, SlidersHorizontal, ArrowUpDown, Check } from 'lucide-react';

export interface ListColumn {
  key: string;
  label: string;
}

export interface SortOption {
  key: string;
  label: string;
}

interface ListFilterBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  placeholder?: string;
  sortKey: string;
  sortDir: 'asc' | 'desc';
  onSortChange: (key: string, dir: 'asc' | 'desc') => void;
  sortOptions: SortOption[];
  columns: ListColumn[];
  visibleColumns: string[];
  onColumnsChange: (keys: string[]) => void;
  resultCount?: number;
  accent?: 'purple' | 'blue';
}

/**
 * Shared top search + sort + column-visibility bar.
 * The selected columns/sort are also what PDF and WhatsApp exports use.
 */
const ListFilterBar: React.FC<ListFilterBarProps> = ({
  search,
  onSearchChange,
  placeholder = 'Search…',
  sortKey,
  sortDir,
  onSortChange,
  sortOptions,
  columns,
  visibleColumns,
  onColumnsChange,
  resultCount,
  accent = 'blue',
}) => {
  const [showColumns, setShowColumns] = useState(false);
  const ring = accent === 'purple' ? 'focus:ring-purple-500' : 'focus:ring-blue-500';
  const chip = accent === 'purple' ? 'text-purple-700 bg-purple-50 border-purple-200' : 'text-blue-700 bg-blue-50 border-blue-200';

  const toggleColumn = (key: string) => {
    onColumnsChange(
      visibleColumns.includes(key) ? visibleColumns.filter(k => k !== key) : [...visibleColumns, key]
    );
  };

  return (
    <div className="mb-3 space-y-2">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full pl-9 pr-9 py-3 text-base md:text-sm border border-gray-300 rounded-xl focus:ring-2 ${ring} focus:border-transparent`}
        />
        {search && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-400 active:text-gray-600"
            aria-label="Clear search"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[150px]">
          <ArrowUpDown size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <select
            value={`${sortKey}:${sortDir}`}
            onChange={e => {
              const [k, d] = e.target.value.split(':');
              onSortChange(k, d as 'asc' | 'desc');
            }}
            className={`w-full pl-8 pr-2 py-2.5 text-sm border border-gray-300 rounded-xl bg-white focus:ring-2 ${ring}`}
          >
            {sortOptions.map(o => (
              <React.Fragment key={o.key}>
                <option value={`${o.key}:asc`}>{o.label} ↑</option>
                <option value={`${o.key}:desc`}>{o.label} ↓</option>
              </React.Fragment>
            ))}
          </select>
        </div>

        <button
          onClick={() => setShowColumns(s => !s)}
          className={`min-h-[44px] px-3 rounded-xl border text-sm font-medium flex items-center gap-2 ${chip}`}
        >
          <SlidersHorizontal size={15} />
          Columns ({visibleColumns.length})
        </button>
      </div>

      {showColumns && (
        <div className="rounded-xl border border-gray-200 bg-white p-2 grid grid-cols-2 gap-1">
          {columns.map(c => {
            const on = visibleColumns.includes(c.key);
            return (
              <button
                key={c.key}
                onClick={() => toggleColumn(c.key)}
                className={`flex items-center gap-2 px-3 min-h-[44px] rounded-lg text-sm text-left ${on ? 'bg-gray-100 text-gray-900' : 'text-gray-500'}`}
              >
                <span className={`w-4 h-4 rounded border flex items-center justify-center ${on ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                  {on && <Check size={12} className="text-white" />}
                </span>
                {c.label}
              </button>
            );
          })}
        </div>
      )}

      {typeof resultCount === 'number' && (
        <p className="text-xs text-gray-500">{resultCount} record{resultCount === 1 ? '' : 's'}</p>
      )}
    </div>
  );
};

export default ListFilterBar;
