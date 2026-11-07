import React, { useEffect, useMemo, useState } from 'react';
import { Calculator, Loader2, Save, CheckCircle2, Clock, XCircle } from 'lucide-react';
import type { Staff } from '../../types';
import { taxDeclarationService, currentFy, type TaxDeclaration } from '../../services/taxDeclarationService';
import { compareRegimes, LIMITS, type DeclarationItems } from '../../utils/taxDeclarations';
import type { TaxRegime } from '../../utils/tdsCalculations';

const inr = (v: number) => `Rs. ${Math.round(v).toLocaleString('en-IN')}`;
const inputCls = 'w-full rounded-xl border border-[var(--glass-border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]';

const FIELDS: { key: keyof DeclarationItems; label: string; hint: string; cap?: number }[] = [
  { key: 'sec80c', label: '80C investments', hint: 'LIC, PPF, ELSS, tuition fees, home-loan principal. Your PF is added automatically.', cap: LIMITS.sec80c },
  { key: 'sec80d', label: '80D health insurance', hint: 'Premiums for self, family and parents.', cap: LIMITS.sec80d },
  { key: 'sec80ccd1b', label: '80CCD(1B) extra NPS', hint: 'Your own NPS contribution beyond 80C.', cap: LIMITS.sec80ccd1b },
  { key: 'sec24b', label: 'Home-loan interest (24b)', hint: 'Self-occupied house.', cap: LIMITS.sec24b },
  { key: 'sec80e', label: '80E education-loan interest', hint: 'No upper limit.' },
  { key: 'sec80g', label: '80G donations', hint: 'Qualifying amount only.' },
  { key: 'rentPaid', label: 'Rent paid this year (HRA)', hint: 'Total yearly rent. Keep rent receipts ready.' },
];

export const TaxDeclarationTab: React.FC<{ staff: Staff }> = ({ staff }) => {
  const fy = currentFy();
  const [decl, setDecl] = useState<TaxDeclaration | null>(null);
  const [items, setItems] = useState<DeclarationItems>({});
  const [regime, setRegime] = useState<TaxRegime>('new');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!staff.id) return;
    taxDeclarationService.mine(staff.id, fy)
      .then(d => { if (d) { setDecl(d); setItems(d.items); setRegime(d.regime); } })
      .catch(e => setMsg(e.message))
      .finally(() => setLoading(false));
  }, [staff.id, fy]);

  const monthly = useMemo(() => {
    const basic = Number(staff.basicSalary) || 0;
    const hra = Number(staff.hra) || 0;
    const gross = Number(staff.totalSalary) || basic + hra + (Number(staff.incentive) || 0);
    const pfOn = !!staff.statutoryDeductions?.pf?.enabled;
    return { gross, basic, hra, pf: pfOn ? Math.round(Math.min(basic, 15000) * 0.12) : 0 };
  }, [staff]);

  const now = new Date();
  const cmp = useMemo(() => compareRegimes(monthly, items, now.getMonth(), now.getFullYear()), [monthly, items]); // eslint-disable-line react-hooks/exhaustive-deps

  const setNum = (k: keyof DeclarationItems, v: string) =>
    setItems(prev => ({ ...prev, [k]: v === '' ? undefined : Math.max(0, Math.min(10_000_000, Number(v) || 0)) }));

  const save = async () => {
    if (!staff.id) return;
    setSaving(true); setMsg(null);
    try {
      await taxDeclarationService.save({ id: decl?.id, staffId: staff.id, fy, regime, items });
      const fresh = await taxDeclarationService.mine(staff.id, fy);
      setDecl(fresh);
      setMsg('Sent to your manager for approval.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not save.');
    } finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]"><Loader2 size={16} className="animate-spin" /> Loading…</div>;

  const status = decl?.status;
  const StatusIcon = status === 'Approved' ? CheckCircle2 : status === 'Rejected' ? XCircle : Clock;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--bg-card)] border border-[var(--glass-border)] rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 font-semibold text-[var(--text-primary)]">
            <Calculator size={18} /> Tax declaration · FY {fy}
          </div>
          {status && (
            <span className="flex items-center gap-1 text-xs font-semibold text-[var(--text-secondary)]">
              <StatusIcon size={14} /> {status === 'Submitted' ? 'Waiting for approval' : status}
            </span>
          )}
        </div>
        {decl?.reviewNotes && <p className="text-xs text-[var(--text-secondary)]">Manager note: {decl.reviewNotes}</p>}

        <div className="grid grid-cols-2 gap-3">
          {(['new', 'old'] as TaxRegime[]).map(r => {
            const res = cmp[r];
            const active = regime === r;
            return (
              <button key={r} type="button" onClick={() => setRegime(r)}
                className={`text-left rounded-2xl border p-3 transition ${active ? 'border-blue-500 ring-2 ring-blue-500/30' : 'border-[var(--glass-border)]'}`}>
                <div className="text-xs text-[var(--text-secondary)]">{r === 'new' ? 'New regime' : 'Old regime'}</div>
                <div className="text-lg font-bold text-[var(--text-primary)]">{inr(res.annualTax)}<span className="text-xs font-normal"> /year</span></div>
                <div className="text-[11px] text-[var(--text-secondary)]">≈ {inr(res.annualTax / 12)} per month</div>
                {cmp.better === r && cmp.saving > 0 && <div className="mt-1 text-[11px] font-semibold text-emerald-500">Saves {inr(cmp.saving)}</div>}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-[var(--text-secondary)]">
          Estimate from your current salary. Deductions below count only in the old regime.
        </p>
      </div>

      <div className="bg-[var(--bg-card)] border border-[var(--glass-border)] rounded-2xl p-4 space-y-3">
        <div className="font-semibold text-sm text-[var(--text-primary)]">Investments and deductions (yearly)</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {FIELDS.map(f => (
            <label key={f.key} className="text-xs text-[var(--text-secondary)] space-y-1">
              <span className="font-medium text-[var(--text-primary)]">{f.label}{f.cap ? ` (max ${inr(f.cap)})` : ''}</span>
              <input type="number" inputMode="numeric" min="0" value={(items[f.key] as number | undefined) ?? ''}
                onChange={e => setNum(f.key, e.target.value)} className={inputCls} placeholder="0" />
              <span className="block text-[11px]">{f.hint}</span>
            </label>
          ))}
          <label className="flex items-center gap-2 text-xs text-[var(--text-primary)]">
            <input type="checkbox" checked={!!items.metroCity} onChange={e => setItems(p => ({ ...p, metroCity: e.target.checked }))} />
            I live in Delhi, Mumbai, Kolkata or Chennai
          </label>
        </div>
        <button type="button" onClick={save} disabled={saving}
          className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-50">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {decl ? 'Update and resend' : 'Submit declaration'}
        </button>
        {msg && <p className="text-xs text-[var(--text-secondary)]">{msg}</p>}
      </div>
    </div>
  );
};
