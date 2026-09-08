/**
 * FaceMigrationPanel — guided move from the legacy 128-d faceprint
 * to the new ArcFace 512-d faceprint.
 *
 * Shows who is still on the old faceprint, walks an admin through
 * re-capturing each person, and lets them retire the old samples
 * once enough new ones exist.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, ScanFace, CheckCircle2, ChevronRight, Trash2, X, Loader2, AlertTriangle } from 'lucide-react';
import { Staff } from '../../types';
import { faceEmbeddingService, FaceEmbedding } from '../../services/faceEmbeddingService';
import { ARCFACE_MODEL_VERSION } from '../../lib/arcfaceEngine';
import FaceRegistration from '../FaceRegistration';
import { customConfirm } from '../CustomDialog';

interface Props {
  staff: Staff[];
  capturedBy?: string;
}

/** Minimum new samples before a person counts as migrated. */
const TARGET_NEW_SAMPLES = 3;

interface Row {
  staff: Staff;
  legacy: number;
  modern: number;
  done: boolean;
}

const FaceMigrationPanel: React.FC<Props> = ({ staff, capturedBy }) => {
  const [embeddings, setEmbeddings] = useState<FaceEmbedding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<Staff | null>(null);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEmbeddings(await faceEmbeddingService.getAllApproved());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load face samples');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rows: Row[] = useMemo(() => {
    const byStaff = new Map<string, FaceEmbedding[]>();
    for (const e of embeddings) {
      if (!byStaff.has(e.staffId)) byStaff.set(e.staffId, []);
      byStaff.get(e.staffId)!.push(e);
    }
    return staff
      .map((s) => {
        const list = byStaff.get(s.id) || [];
        const modern = list.filter((e) => e.modelVersion === ARCFACE_MODEL_VERSION).length;
        const legacy = list.length - modern;
        return { staff: s, legacy, modern, done: modern >= TARGET_NEW_SAMPLES };
      })
      .filter((r) => r.legacy > 0 || r.modern > 0)
      .sort((a, b) => Number(a.done) - Number(b.done) || a.staff.name.localeCompare(b.staff.name));
  }, [embeddings, staff]);

  const migrated = rows.filter((r) => r.done).length;
  const pct = rows.length ? Math.round((migrated / rows.length) * 100) : 0;
  const visible = showDone ? rows : rows.filter((r) => !r.done);

  const retireLegacy = async (row: Row) => {
    if (!row.done) return;
    if (!(await customConfirm(`Remove ${row.legacy} old face sample(s) for ${row.staff.name}?`))) return;
    const olds = embeddings.filter((e) => e.staffId === row.staff.id && e.modelVersion !== ARCFACE_MODEL_VERSION);
    for (const o of olds) {
      try { await faceEmbeddingService.delete(o.id, capturedBy, 'Replaced by upgraded faceprint'); } catch { /* keep going */ }
    }
    await load();
  };

  return (
    <div className="rounded-2xl bg-[var(--bg-card)] border border-[var(--glass-border)] p-4 md:p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h4 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <RefreshCw size={16} className="text-indigo-400" /> Upgrade face registrations
          </h4>
          <p className="text-[11px] text-[var(--text-secondary)] mt-1">
            Re-capture each person once so they move to the new, far more accurate faceprint.
          </p>
        </div>
        <button
          onClick={load}
          className="px-3 py-1.5 rounded-lg text-xs border border-[var(--glass-border)] text-[var(--text-secondary)] hover:bg-black/10"
        >
          Refresh
        </button>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] mb-1">
          <span>{migrated} of {rows.length} upgraded</span>
          <span>{pct}%</span>
        </div>
        <div className="h-2 rounded-full bg-black/20 overflow-hidden">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
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
      ) : visible.length === 0 ? (
        <div className="py-6 text-center text-sm text-[var(--text-secondary)] flex flex-col items-center gap-2">
          <CheckCircle2 size={24} className="text-emerald-400" />
          Everyone registered is already on the new faceprint.
        </div>
      ) : (
        <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1 custom-scrollbar">
          {visible.map((r) => (
            <div key={r.staff.id} className="p-3 rounded-xl bg-black/10 border border-[var(--glass-border)]">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[var(--text-primary)] truncate">{r.staff.name}</div>
                  <div className="text-[11px] text-[var(--text-secondary)]">
                    {r.staff.location}
                    {' · '}
                    <span className={r.done ? 'text-emerald-400' : 'text-amber-400'}>
                      {r.modern} new
                    </span>
                    {r.legacy > 0 && ` · ${r.legacy} old`}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {r.done && r.legacy > 0 && (
                    <button
                      onClick={() => retireLegacy(r)}
                      className="px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-1 hover:bg-red-500/20"
                    >
                      <Trash2 size={12} /> Old
                    </button>
                  )}
                  <button
                    onClick={() => setActive(r.staff)}
                    className="px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold flex items-center gap-1"
                  >
                    <ScanFace size={12} /> {r.done ? 'Add more' : 'Re-register'} <ChevronRight size={12} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {rows.some((r) => r.done) && (
        <button
          onClick={() => setShowDone((v) => !v)}
          className="mt-3 text-[11px] text-[var(--text-secondary)] underline"
        >
          {showDone ? 'Hide upgraded people' : `Show upgraded people (${migrated})`}
        </button>
      )}

      {active && (
        <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-3">
          <div className="w-full max-w-3xl my-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--glass-border)] p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-[var(--text-primary)]">
                Re-register {active.name}
              </h4>
              <button
                onClick={async () => { setActive(null); await load(); }}
                className="p-2 rounded-lg hover:bg-black/20 text-[var(--text-secondary)]"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] mb-3">
              Capture at least {TARGET_NEW_SAMPLES} shots — front, slight left, slight right.
            </p>
            <FaceRegistration staff={active} isAdmin capturedBy={capturedBy} />
          </div>
        </div>
      )}
    </div>
  );
};

export default FaceMigrationPanel;
