/**
 * FaceAccuracyReport — how well face recognition is actually performing.
 *
 * Reads the last 30 days of punch events and the enrolled faceprints to show
 * recognition volume, match-confidence spread, weak matches, liveness rejects
 * and enrolment coverage per branch.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Loader2, AlertTriangle, TrendingUp } from 'lucide-react';
import { dataApi } from '../../lib/dataApi';
import { Staff } from '../../types';
import { faceEmbeddingService, FaceEmbedding } from '../../services/faceEmbeddingService';
import { ARCFACE_MODEL_VERSION } from '../../lib/arcfaceEngine';

interface Props {
  staff: Staff[];
  days?: number;
}

interface Row {
  matchDistance: number | null;
  livenessScore: number | null;
  source: string;
  location: string | null;
}

const BUCKETS = [
  { label: 'Excellent (<0.20)', max: 0.2, tone: 'bg-emerald-500' },
  { label: 'Strong (0.20–0.28)', max: 0.28, tone: 'bg-emerald-400' },
  { label: 'Fair (0.28–0.34)', max: 0.34, tone: 'bg-amber-400' },
  { label: 'Weak (0.34+)', max: Infinity, tone: 'bg-red-400' },
];

const FaceAccuracyReport: React.FC<Props> = ({ staff, days = 30 }) => {
  const [rows, setRows] = useState<Row[]>([]);
  const [embeddings, setEmbeddings] = useState<FaceEmbedding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
      const [punches, embs] = await Promise.all([
        dataApi
          .from('punch_events' as never)
          .select('match_distance, liveness_score, source, location')
          .gte('date', since)
          .order('id', { ascending: false })
          .limit(1000),
        faceEmbeddingService.getAllApproved(),
      ]);
      if (punches.error) throw punches.error;
      setRows(
        ((punches.data as unknown as Record<string, unknown>[]) || []).map((d) => ({
          matchDistance: (d.match_distance as number) ?? null,
          livenessScore: (d.liveness_score as number) ?? null,
          source: String(d.source ?? 'unknown'),
          location: (d.location as string) ?? null,
        })),
      );
      setEmbeddings(embs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load recognition data');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const face = rows.filter((r) => r.source === 'face');
    const distances = face.map((r) => r.matchDistance).filter((d): d is number => typeof d === 'number');
    const avg = distances.length ? distances.reduce((a, b) => a + b, 0) / distances.length : 0;
    const buckets = BUCKETS.map((b, i) => {
      const min = i === 0 ? -Infinity : BUCKETS[i - 1].max;
      return { ...b, count: distances.filter((d) => d > min && d <= b.max).length };
    });
    const weak = distances.filter((d) => d > 0.34).length;
    const lowLiveness = face.filter((r) => typeof r.livenessScore === 'number' && r.livenessScore < 0.5).length;

    const enrolledIds = new Set(embeddings.filter((e) => e.modelVersion === ARCFACE_MODEL_VERSION).map((e) => e.staffId));
    const byLocation = new Map<string, { total: number; enrolled: number }>();
    for (const s of staff) {
      const key = s.location || 'Unassigned';
      const entry = byLocation.get(key) || { total: 0, enrolled: 0 };
      entry.total += 1;
      if (enrolledIds.has(s.id)) entry.enrolled += 1;
      byLocation.set(key, entry);
    }

    return {
      totalPunches: rows.length,
      facePunches: face.length,
      qrPunches: rows.filter((r) => r.source === 'qr').length,
      manualPunches: rows.filter((r) => r.source !== 'face' && r.source !== 'qr').length,
      avgConfidence: distances.length ? (1 - avg) * 100 : 0,
      buckets,
      weak,
      lowLiveness,
      coverage: Array.from(byLocation.entries()).sort((a, b) => a[0].localeCompare(b[0])),
      enrolledCount: enrolledIds.size,
    };
  }, [rows, embeddings, staff]);

  const maxBucket = Math.max(1, ...stats.buckets.map((b) => b.count));

  return (
    <div className="rounded-2xl bg-[var(--bg-card)] border border-[var(--glass-border)] p-4 md:p-6">
      <div className="flex items-start justify-between gap-3 mb-3">
        <h4 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <TrendingUp size={16} className="text-emerald-400" /> Recognition accuracy · last {days} days
        </h4>
        <button
          onClick={load}
          className="px-3 py-1.5 rounded-lg text-xs border border-[var(--glass-border)] text-[var(--text-secondary)] hover:bg-black/10"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {loading ? (
        <div className="py-6 flex items-center justify-center text-[var(--text-secondary)] text-sm gap-2">
          <Loader2 size={16} className="animate-spin" /> Loading
        </div>
      ) : stats.totalPunches === 0 ? (
        <div className="py-6 text-center text-sm text-[var(--text-secondary)] flex flex-col items-center gap-2">
          <Activity size={24} className="opacity-60" />
          No punches recorded in this period yet.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: 'Face punches', value: stats.facePunches },
              { label: 'QR punches', value: stats.qrPunches },
              { label: 'Avg confidence', value: `${stats.avgConfidence.toFixed(0)}%` },
              { label: 'Weak matches', value: stats.weak },
            ].map((c) => (
              <div key={c.label} className="p-3 rounded-xl bg-black/10 border border-[var(--glass-border)]">
                <div className="text-lg font-bold text-[var(--text-primary)]">{c.value}</div>
                <div className="text-[11px] text-[var(--text-secondary)]">{c.label}</div>
              </div>
            ))}
          </div>

          <div>
            <div className="text-xs font-semibold text-[var(--text-primary)] mb-2">Match quality spread</div>
            <div className="space-y-1.5">
              {stats.buckets.map((b) => (
                <div key={b.label} className="flex items-center gap-2">
                  <span className="text-[11px] text-[var(--text-secondary)] w-36 shrink-0">{b.label}</span>
                  <div className="flex-1 h-2 rounded-full bg-black/20 overflow-hidden">
                    <div className={`h-full ${b.tone}`} style={{ width: `${(b.count / maxBucket) * 100}%` }} />
                  </div>
                  <span className="text-[11px] text-[var(--text-secondary)] w-8 text-right">{b.count}</span>
                </div>
              ))}
            </div>
            {stats.lowLiveness > 0 && (
              <p className="text-[11px] text-amber-400 mt-2">
                {stats.lowLiveness} punch(es) had a low liveness score — worth reviewing.
              </p>
            )}
          </div>

          <div>
            <div className="text-xs font-semibold text-[var(--text-primary)] mb-2">
              Registration coverage ({stats.enrolledCount} of {staff.length} on the new faceprint)
            </div>
            <div className="space-y-1.5">
              {stats.coverage.map(([loc, c]) => {
                const p = c.total ? Math.round((c.enrolled / c.total) * 100) : 0;
                return (
                  <div key={loc} className="flex items-center gap-2">
                    <span className="text-[11px] text-[var(--text-secondary)] w-36 shrink-0 truncate">{loc}</span>
                    <div className="flex-1 h-2 rounded-full bg-black/20 overflow-hidden">
                      <div className={`h-full ${p >= 80 ? 'bg-emerald-500' : p >= 40 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${p}%` }} />
                    </div>
                    <span className="text-[11px] text-[var(--text-secondary)] w-14 text-right">{c.enrolled}/{c.total}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FaceAccuracyReport;
