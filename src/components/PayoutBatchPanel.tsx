import React, { useCallback, useEffect, useState } from 'react';
import { Banknote, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import type { PayrollDetail, Staff } from '../types';
import { downloadBankPaymentFile, type BankFormat } from '../utils/bankExport';
import { planPayoutBatch, exportApprovedBatch, canApprove, canMarkPaid, canComplete, markTestFile, type PayoutLine } from '../utils/payoutBatch';
import { payoutBatchService, type PayoutBatch } from '../services/payoutBatchService';
import { supabase } from '../lib/supabase';
import { customAlert, customConfirm } from './CustomDialog';

const rs = (v: number) => `Rs. ${Math.round(v).toLocaleString('en-IN')}`;
const FORMATS: { key: BankFormat; label: string }[] = [
  { key: 'hdfc', label: 'HDFC ENet' }, { key: 'icici', label: 'ICICI CIB' }, { key: 'sbi', label: 'SBI CINB' }, { key: 'generic', label: 'Generic NEFT' },
];
const STATUS_STYLE: Record<string, string> = {
  Draft: 'bg-muted text-muted-foreground', Approved: 'bg-primary/10 text-primary', Exported: 'bg-accent text-accent-foreground',
  Completed: 'bg-primary text-primary-foreground', Cancelled: 'bg-destructive/10 text-destructive',
  Pending: 'bg-muted text-muted-foreground', Paid: 'bg-primary text-primary-foreground', Failed: 'bg-destructive/10 text-destructive',
};

interface Props { details: PayrollDetail[]; staff: Staff[]; month: number /* 0-indexed */; year: number }

export const PayoutBatchPanel: React.FC<Props> = ({ details, staff, month, year }) => {
  const m = month + 1;
  const [batches, setBatches] = useState<PayoutBatch[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [lines, setLines] = useState<PayoutLine[]>([]);
  const [format, setFormat] = useState<BankFormat>('generic');
  const [debit, setDebit] = useState('');
  const [busy, setBusy] = useState(false);
  const [me, setMe] = useState('');
  const [testMode, setTestMode] = useState(false);
  const [refs, setRefs] = useState<Record<string, string>>({});

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setMe(data.user?.email || '')).catch(() => {}); }, []);
  const reload = useCallback(async () => {
    try { setBatches(await payoutBatchService.list(m, year)); } catch { setBatches([]); }
  }, [m, year]);
  useEffect(() => { reload(); setOpen(null); }, [reload]);
  useEffect(() => { if (open) payoutBatchService.lines(open).then(setLines).catch(() => setLines([])); }, [open, batches]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); await reload(); } catch (e) { customAlert((e as Error).message); } finally { setBusy(false); }
  };

  const create = () => run(async () => {
    const plan = planPayoutBatch(details, staff, m, year, await payoutBatchService.queuedStaff(m, year, testMode));
    if (!plan.lines.length) throw new Error(`Nobody can be added. ${plan.skipped.slice(0, 5).map(s => `${s.name}: ${s.reason}`).join('; ')}`);
    const ok = await customConfirm(`${testMode ? 'TEST batch: no salary is marked paid and no staff alerts are sent.\n\n' : ''}Create a draft payout batch for ${plan.lines.length} people, total ${rs(plan.total)}?${plan.skipped.length ? `\n\n${plan.skipped.length} left out (cash, bad bank details, or already queued).` : ''}\n\nNo money moves until another admin approves and you upload the file to your bank.`);
    if (ok) await payoutBatchService.create(m, year, format, debit, plan.lines, testMode);
  });

  const approve = (b: PayoutBatch) => run(async () => {
    const ok = await customConfirm(`Approve paying ${rs(b.totalAmount)} to ${b.payeeCount} people?\n\nAmounts and bank details are frozen after approval.`);
    if (ok) await payoutBatchService.setStatus(b.id, 'Approved');
  });

  const exportFile = (b: PayoutBatch) => run(async () => {
    const file = exportApprovedBatch(b.status, await payoutBatchService.lines(b.id), m, year, b.bankFormat, b.debitAccount);
    downloadBankPaymentFile(b.isTest ? markTestFile(file) : file);
    await payoutBatchService.markExported(b.id);
    customAlert('Bank file downloaded. Salaries are NOT marked paid yet — enter the bank reference (UTR) for each person once the bank confirms.');
  });

  const confirm = (b: PayoutBatch, l: PayoutLine, outcome: 'Paid' | 'Failed') => run(async () => {
    await payoutBatchService.confirmLine(b, l, m, year, outcome, refs[l.id!] || '');
  });

  const active = batches.find(b => b.id === open);

  return (
    <div className="border border-border rounded-xl bg-card p-4 space-y-3">
      <div className="flex items-center gap-2 font-semibold text-foreground"><Banknote size={16} className="text-primary" /> Salary payout batches</div>
      <p className="text-xs text-muted-foreground">Create a batch, have a second admin approve it, then download the bank file. A salary counts as paid only after you enter the bank reference.</p>
      <div className="flex flex-col sm:flex-row gap-2">
        <select value={format} onChange={e => setFormat(e.target.value as BankFormat)} className="flex-1 px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground">
          {FORMATS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
        <input value={debit} onChange={e => setDebit(e.target.value)} placeholder="Company debit account no." className="flex-1 px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground" />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap self-center">
          <input type="checkbox" checked={testMode} onChange={e => setTestMode(e.target.checked)} /> Test batch
        </label>
        <button disabled={busy} onClick={create} className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground disabled:opacity-50">
          {busy ? <Loader2 size={14} className="animate-spin inline" /> : 'New payout batch'}
        </button>
      </div>

      {batches.length === 0 ? <p className="text-sm text-muted-foreground">No payout batches for this month yet.</p> : (
        <ul className="space-y-2">
          {batches.map(b => (
            <li key={b.id} className="border border-border rounded-lg p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button className="text-left" onClick={() => setOpen(open === b.id ? null : b.id)}>
                  {b.isTest && <span className="text-xs px-2 py-0.5 rounded-full mr-2 bg-destructive text-destructive-foreground font-semibold">TEST</span>}
                  <span className={`text-xs px-2 py-0.5 rounded-full mr-2 ${STATUS_STYLE[b.status]}`}>{b.status}</span>
                  <span className="text-sm font-medium text-foreground">{b.payeeCount} people · {rs(b.totalAmount)}</span>
                  <span className="block text-xs text-muted-foreground">Created by {b.createdBy || '—'}{b.approvedBy ? ` · approved by ${b.approvedBy}` : ''}</span>
                </button>
                <div className="flex gap-2">
                  {b.status === 'Draft' && ((me ? canApprove(b.status, b.createdBy, me) : true)
                    ? <button disabled={busy} onClick={() => approve(b)} className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground">Approve</button>
                    : <span className="text-xs text-muted-foreground self-center">Needs another admin to approve</span>)}
                  {(b.status === 'Approved' || b.status === 'Exported') && <button disabled={busy} onClick={() => exportFile(b)} className="px-3 py-1.5 text-xs rounded-lg border border-primary text-primary">{b.status === 'Exported' ? 'Download again' : 'Download bank file'}</button>}
                  {['Draft', 'Approved', 'Exported'].includes(b.status) && <button disabled={busy} onClick={async () => { if (await customConfirm('Cancel this batch? People in it can be added to a new batch.')) run(() => payoutBatchService.setStatus(b.id, 'Cancelled', 'Cancelled by admin')); }} className="px-3 py-1.5 text-xs rounded-lg border border-border text-muted-foreground">Cancel</button>}
                  {b.isTest && <button disabled={busy} onClick={async () => { if (await customConfirm('Delete this test batch?')) run(() => payoutBatchService.deleteTestBatch(b)); }} className="px-3 py-1.5 text-xs rounded-lg border border-destructive text-destructive">Delete test</button>}
                  {b.id === open && canComplete(b.status, lines) && <button disabled={busy} onClick={() => run(() => payoutBatchService.setStatus(b.id, 'Completed'))} className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground">Close batch</button>}
                </div>
              </div>
              {active?.id === b.id && (
                <ul className="mt-3 divide-y divide-border text-sm">
                  {lines.map(l => (
                    <li key={l.id} className="py-2 flex flex-wrap items-center gap-2">
                      <span className="flex-1 min-w-[140px] text-foreground">{l.staffName}<span className="block text-xs text-muted-foreground">{l.ifscCode} · ••••{l.bankAccountNumber.slice(-4)} · {l.paymentMode}</span></span>
                      <span className="font-medium text-foreground">{rs(l.netAmount)}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[l.status]}`}>{l.status}{b.isTest && l.status === 'Paid' ? ' (test)' : ''}</span>
                      {l.utrRef && <span className="text-xs text-muted-foreground">UTR {l.utrRef}</span>}
                      {b.status === 'Exported' && (l.status === 'Exported' || l.status === 'Pending') && (
                        <>
                          <input value={refs[l.id!] || ''} onChange={e => setRefs(r => ({ ...r, [l.id!]: e.target.value }))} placeholder="Bank UTR / reason" className="w-36 px-2 py-1 text-xs rounded border border-input bg-background text-foreground" />
                          <button disabled={busy || !canMarkPaid(b.status, l.status, refs[l.id!] || '')} onClick={() => confirm(b, l, 'Paid')} title="Mark paid" className="text-primary disabled:opacity-30"><CheckCircle2 size={18} /></button>
                          <button disabled={busy} onClick={() => confirm(b, l, 'Failed')} title="Bank returned / failed" className="text-destructive"><XCircle size={18} /></button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default PayoutBatchPanel;
