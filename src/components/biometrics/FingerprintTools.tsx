import React, { useMemo, useState } from 'react';
import { Stethoscope, Hand, KeyRound, CheckCircle2, XCircle, Loader2, RefreshCw, Trash2, Search } from 'lucide-react';
import { Staff } from '../../types';
import { fingerprintCloudService, CloudFingerprint } from '../../services/fingerprintCloudService';

type Check = { label: string; ok: boolean | null; hint: string };

async function runChecks(): Promise<Check[]> {
  const pkc: any = (window as any).PublicKeyCredential;
  const secure = window.isSecureContext;
  let platform: boolean | null = null, conditional: boolean | null = null;
  try { platform = pkc ? await pkc.isUserVerifyingPlatformAuthenticatorAvailable() : false; } catch { platform = null; }
  try { conditional = pkc?.isConditionalMediationAvailable ? await pkc.isConditionalMediationAvailable() : null; } catch { conditional = null; }
  const usb = 'usb' in navigator, nfc = 'NDEFReader' in window, bt = 'bluetooth' in navigator;
  return [
    { label: 'Secure web address (https)', ok: secure, hint: secure ? 'OK' : 'Open the app over https.' },
    { label: 'Browser supports security keys', ok: !!pkc, hint: pkc ? 'OK' : 'Use latest Chrome, Edge or Safari.' },
    { label: 'Connection: USB / NFC / Bluetooth', ok: usb || nfc || bt || !!pkc, hint: [usb && 'USB', nfc && 'NFC', bt && 'Bluetooth'].filter(Boolean).join(' · ') || 'Browser handles the reader itself' },
    { label: 'Phone screen lock (not used for attendance)', ok: null, hint: platform ? 'Present — ignored on purpose; staff must use the reader.' : 'Not present' },
    { label: 'Autofill sign-in', ok: conditional, hint: conditional ? 'Available' : 'Not needed' },
    { label: 'Online', ok: navigator.onLine, hint: navigator.onLine ? 'OK' : 'Touches need internet to verify.' },
  ];
}

const when = (iso?: string) => iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Never';

interface Props { staff: Staff[]; prints: CloudFingerprint[]; canManage: boolean; onChange: (p: CloudFingerprint[]) => void }

const FingerprintTools: React.FC<Props> = ({ staff, prints, canManage, onChange }) => {
  const [tab, setTab] = useState<'check' | 'test' | 'keys'>('check');
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<Array<{ ok: boolean; text: string; at: string }>>([]);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const roster = useMemo(() => staff.filter(s => s.isActive && s.name.toLowerCase().includes(q.toLowerCase())).map(s => {
    const keys = prints.filter(p => p.staffId === s.id);
    const last = keys.map(k => k.lastUsedAt).filter(Boolean).sort().pop();
    return { s, keys, verified: keys.filter(k => k.verified).length, last };
  }), [staff, prints, q]);

  const doCheck = async () => { setBusy('check'); setChecks(await runChecks()); setBusy(null); };
  const doTest = async () => {
    setBusy('test');
    const at = new Date().toLocaleTimeString('en-IN');
    try {
      const r = await fingerprintCloudService.testTouch();
      setLog(l => [{ ok: true, text: `Recognised ${r.staffName || 'staff'} · signature OK · no attendance saved`, at }, ...l].slice(0, 20));
      onChange(await fingerprintCloudService.list());
    } catch (e: any) {
      setLog(l => [{ ok: false, text: e?.message || 'Touch failed', at }, ...l].slice(0, 20));
    } finally { setBusy(null); }
  };
  const reEnrol = async (id: string, name: string) => {
    setBusy(`e:${id}`); setMsg(null);
    try { onChange(await fingerprintCloudService.enrol(id)); setMsg(`New key added for ${name}. Remove the old key if it is lost.`); }
    catch (e: any) { setMsg(e?.message || 'Enrolment failed'); } finally { setBusy(null); }
  };
  const revoke = async (k: CloudFingerprint) => {
    if (!confirm(`Revoke this key for ${k.staffName || 'staff'}? It will stop working immediately.`)) return;
    setBusy(`r:${k.id}`); setMsg(null);
    try { onChange(await fingerprintCloudService.remove(k.id)); setMsg('Key revoked.'); }
    catch (e: any) { setMsg(e?.message || 'Could not revoke'); } finally { setBusy(null); }
  };

  const Tab = ({ id, icon: I, label }: { id: typeof tab; icon: any; label: string }) => (
    <button onClick={() => setTab(id)} className={`flex-1 min-h-[44px] flex items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors ${tab === id ? 'bg-blue-600 text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
      <I className="w-4 h-4" /><span>{label}</span>
    </button>
  );

  return (
    <div className="glass-card rounded-2xl p-4 space-y-4">
      <div className="flex gap-1 p-1 rounded-2xl bg-muted/50">
        <Tab id="check" icon={Stethoscope} label="Reader check" />
        <Tab id="test" icon={Hand} label="Test touch" />
        <Tab id="keys" icon={KeyRound} label="Staff keys" />
      </div>

      {tab === 'check' && (
        <div className="space-y-3 animate-fade-in">
          <p className="text-sm text-muted-foreground">Checks whether this phone or computer can use an external fingerprint reader / security key.</p>
          <button onClick={doCheck} disabled={busy === 'check'} className="min-h-[44px] px-4 rounded-xl bg-blue-600 text-primary-foreground text-sm font-medium inline-flex items-center gap-2">
            {busy === 'check' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Run check
          </button>
          {checks && <ul className="divide-y divide-border rounded-xl border border-border">{checks.map(c => (
            <li key={c.label} className="flex items-start gap-3 p-3">
              {c.ok === null ? <span className="w-5 h-5 rounded-full bg-muted shrink-0" /> : c.ok ? <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" /> : <XCircle className="w-5 h-5 text-destructive shrink-0" />}
              <div><p className="text-sm font-medium">{c.label}</p><p className="text-xs text-muted-foreground">{c.hint}</p></div>
            </li>))}</ul>}
          {checks && <p className="text-xs text-muted-foreground">To confirm the reader itself works, use <b>Test touch</b>.</p>}
        </div>
      )}

      {tab === 'test' && (
        <div className="space-y-3 animate-fade-in">
          <p className="text-sm text-muted-foreground">Touch an enrolled reader to see who it belongs to. The server checks the signature but <b>never records attendance</b>.</p>
          <button onClick={doTest} disabled={!canManage || busy === 'test'} className="min-h-[44px] px-4 rounded-xl bg-blue-600 text-primary-foreground text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50">
            {busy === 'test' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Hand className="w-4 h-4" />} Start test touch
          </button>
          {!canManage && <p className="text-xs text-amber-500">Only admins and managers can run test touches.</p>}
          <ul className="space-y-1.5">{log.map((l, i) => (
            <li key={i} className={`text-sm flex items-center gap-2 p-2 rounded-lg ${l.ok ? 'bg-emerald-500/10' : 'bg-destructive/10'}`}>
              {l.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-destructive" />}
              <span className="flex-1">{l.text}</span><span className="text-xs text-muted-foreground">{l.at}</span>
            </li>))}</ul>
        </div>
      )}

      {tab === 'keys' && (
        <div className="space-y-3 animate-fade-in">
          <div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search staff" className="w-full min-h-[44px] pl-9 pr-3 rounded-xl bg-muted/50 border border-border text-sm" /></div>
          {msg && <p className="text-sm text-blue-500">{msg}</p>}
          <ul className="space-y-2 max-h-[480px] overflow-y-auto">{roster.map(({ s, keys, verified, last }) => (
            <li key={s.id} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium flex-1 min-w-[120px]">{s.name}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full ${verified ? 'bg-emerald-500/15 text-emerald-500' : 'bg-amber-500/15 text-amber-500'}`}>{verified ? `${verified} key${verified > 1 ? 's' : ''}` : 'Not enrolled'}</span>
                <span className="text-xs text-muted-foreground">Last touch: {when(last)}</span>
                {canManage && <button onClick={() => reEnrol(s.id, s.name)} disabled={!!busy} className="min-h-[36px] px-3 rounded-lg bg-blue-600/15 text-blue-500 text-xs font-medium inline-flex items-center gap-1">
                  {busy === `e:${s.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}{keys.length ? 'Re-enrol' : 'Enrol'}</button>}
              </div>
              {keys.length > 0 && <ul className="mt-2 space-y-1">{keys.map(k => (
                <li key={k.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <KeyRound className="w-3 h-3" /><span className="flex-1">{k.deviceLabel || 'Key'} · added {when(k.enrolledAt)}{!k.verified && ' · old phone entry (cannot punch)'}</span>
                  {canManage && <button onClick={() => revoke(k)} disabled={!!busy} className="text-destructive inline-flex items-center gap-1 min-h-[32px] px-2"><Trash2 className="w-3 h-3" />Revoke</button>}
                </li>))}</ul>}
            </li>))}</ul>
        </div>
      )}
    </div>
  );
};
export default FingerprintTools;
