import React from 'react';

/**
 * Skeleton — themed loading placeholder.
 * Uses CSS tokens so it works in both light and dark themes.
 */
export const Skeleton: React.FC<{ className?: string; rounded?: string }> = ({
  className = '',
  rounded = 'rounded-lg',
}) => (
  <div
    className={`animate-pulse bg-[var(--glass-border)] ${rounded} ${className}`}
    style={{ opacity: 0.55 }}
    aria-hidden="true"
  />
);

/** Stacked skeleton rows — good for lists / tables. */
export const SkeletonList: React.FC<{ rows?: number; className?: string }> = ({
  rows = 4,
  className = '',
}) => (
  <div className={`space-y-2 ${className}`} role="status" aria-label="Loading">
    {Array.from({ length: rows }).map((_, i) => (
      <div
        key={i}
        className="p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--glass-border)] flex items-center gap-3"
      >
        <Skeleton className="h-10 w-10" rounded="rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
        <Skeleton className="h-3 w-12" />
      </div>
    ))}
  </div>
);

/** Skeleton block sized to a video/camera feed. */
export const SkeletonMedia: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div
    className={`relative overflow-hidden bg-[var(--bg-card)] ${className}`}
    role="status"
    aria-label="Loading camera"
  >
    <div className="absolute inset-0 animate-pulse bg-[var(--glass-border)]" style={{ opacity: 0.35 }} />
  </div>
);

export default Skeleton;
