import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Staff, Attendance } from '../types';
import { speakName } from '../lib/fingerprintSpeak';
import { fingerprintCloudService, CloudFingerprint } from '../services/fingerprintCloudService';
import {
  FP_COOLDOWN_MS, FP_MAX_FAILS, registerFail, lockSecondsLeft, FailState,
} from '../utils/fingerprintPunch';

/**
 * Fingerprint station (shared master phone + external fingerprint reader / security key).
 * A phone's own fingerprint unlock only proves "someone enrolled on this phone", so it is
 * never accepted for shared attendance. Each staff member gets a FIDO2 fingerprint key/reader
 * credential; the server stores its public key and verifies every touch's signature and
 * identifies the staff member itself. Works on any station phone (keys live on the reader).
 */
const FAIL_KEY = 'fp:fails:v1';

const load = <T,>(k: string, d: T): T => { try { return (JSON.parse(localStorage.getItem(k) || 'null') as T) ?? d; } catch { return d; } };
const hashPin = async (pin: string) => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`kiosk:${pin}`));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
};
interface Props {
  staff: Staff[];
  attendance?: Attendance[];
  userLocation?: string;
  onAttendanceUpdated?: () => void;
  /** Full-screen page mode (/fingerprint) instead of the floating button. */
  page?: boolean;
  onExit?: () => void;
}

const FingerprintStation: React.FC<Props> = ({ staff, userLocation, onAttendanceUpdated, page, onExit }) => {
  const [open, setOpen] = useState(!!page);
  const [tab, setTab] = useState<'punch' | 'enrol'>('punch');
  const [prints, setPrints] = useState<CloudFingerprint[]>(() => fingerprintCloudService.cached());
  const [cloudOk, setCloudOk] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | false>(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; kind?: 'in' | 'out' } | null>(null);
  const [fails, setFails] = useState<FailState>(() => load(FAIL_KEY, { count: 0, lockedUntil: 0 }));
  const [now, setNow] = useState(Date.now());
  const [enrolUnlocked, setEnrolUnlocked] = useState(false);
  const [pin, setPin] = useState('');
  const [search, setSearch] = useState('');
  const [clock, setClock] = useState(new Date());
  const supported = typeof window !== 'undefined' && !!window.PublicKeyCredential && window.isSecureContext;
  const lockLeft = lockSecondsLeft(fails, now);

  useEffect(() => { if (!page) return; const t = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(t); }, [page]);
  useEffect(() => {
    if (!lockLeft) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [lockLeft]);

  const refresh = useCallback(async () => {
    const rows = await fingerprintCloudService.list();
    setPrints(rows);
    setCloudOk(navigator.onLine);
    return rows;
  }, []);

  useEffect(() => { if (open) void refresh(); }, [open, refresh]);

  const activeStaff = useMemo(
    () => staff.filter(s => s.isActive && (!userLocation || s.location === userLocation)).sort((a, b) => a.name.localeCompare(b.name)),
    [staff, userLocation],
  );
    const byStaff = useMemo(() => {
    const m = new Map<string, CloudFingerprint[]>();
    for (const p of prints.filter(x => x.verified)) { if (!m.has(p.staffId)) m.set(p.staffId, []); m.get(p.staffId)!.push(p); }
    return m;
  }, [prints]);
  const enrolledCount = activeStaff.filter(s => byStaff.has(s.id)).length;

  const saveFails = (f: FailState) => { setFails(f); setNow(Date.now()); localStorage.setItem(FAIL_KEY, JSON.stringify(f)); };
  const fail = (text: string) => {
    const next = registerFail(fails, Date.now());
    saveFails(next);
    const left = lockSecondsLeft(next, Date.now());
    if (navigator.vibrate) navigator.vibrate([80, 60, 80]);
    setMsg({ ok: false, text: left ? `Too many wrong touches. Station locked for ${left}s.` : `${text} (${FP_MAX_FAILS - next.count} tries left)` });
  };

  const openEnrol = () => {
    setMsg(null); setTab('enrol');
    if (!localStorage.getItem('kioskPinHash')) setEnrolUnlocked(true);
  };
  const unlockEnrol = async () => {
    if (!/^\d{4,8}$/.test(pin)) { setMsg({ ok: false, text: 'Enter the 4–8 digit kiosk PIN.' }); return; }
    if ((await hashPin(pin)) === localStorage.getItem('kioskPinHash')) { setEnrolUnlocked(true); setMsg(null); }
    else setMsg({ ok: false, text: 'Wrong PIN.' });
    setPin('');
  };

  const errText = (e: any, fallback: string) =>
    e?.name === 'NotAllowedError' ? 'Cancelled or fingerprint not recognised.' : e?.name === 'InvalidStateError' ? 'This key is already enrolled.' : e?.message || fallback;

  const enrol = async (s: Staff) => {
    if (!navigator.onLine) { setMsg({ ok: false, text: 'Connect to the internet to enrol fingerprints.' }); return; }
    if (byStaff.has(s.id) && !window.confirm(`${s.name} already has a fingerprint key. Add another?`)) return;
    setBusy(s.id); setMsg({ ok: true, text: `Plug in / tap the fingerprint reader, then ${s.name} touches it…` });
    try {
      await fingerprintCloudService.enrol(s.id);
      await refresh();
      if (navigator.vibrate) navigator.vibrate(60);
      setMsg({ ok: true, text: `✓ ${s.name}'s fingerprint key verified by the server and saved.` });
    } catch (e: any) {
      setMsg({ ok: false, text: errText(e, 'Could not save fingerprint.') });
    } finally { setBusy(false); }
  };

  const removePrint = async (p: CloudFingerprint) => {
    if (!window.confirm(`Remove this fingerprint for ${p.staffName || 'staff'} from all phones?`)) return;
    try { setPrints(await fingerprintCloudService.remove(p.id)); } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Could not remove.' }); }
  };

  const punch = async () => {
    if (lockSecondsLeft(fails, Date.now())) return;
    setBusy('punch'); setMsg(null);
    try {
      if (!navigator.onLine) throw new Error('Fingerprint punches need internet so the server can verify the touch.');
      // Station position goes to the server, which does the fence check itself.
      const pos = await new Promise<{ lat: number; lng: number; accuracy?: number } | undefined>(res => {
        if (!navigator.geolocation) return res(undefined);
        navigator.geolocation.getCurrentPosition(
          p => res({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
          () => res(undefined), { enableHighAccuracy: true, timeout: 6000, maximumAge: 30000 });
      });
      let r: Awaited<ReturnType<typeof fingerprintCloudService.punch>>;
      try { r = await fingerprintCloudService.punch(pos); }
      catch (e: any) {
        // Only an unrecognised/cancelled touch counts toward the lock; rule refusals don't.
        if (e?.name === 'NotAllowedError' || /not recognised|not registered|cloned/i.test(e?.message || '')) fail(errText(e, 'Fingerprint failed.'));
        else setMsg({ ok: false, text: errText(e, 'Punch failed.') });
        return;
      }
      saveFails({ count: 0, lockedUntil: 0 });
      const [hh, mm] = r.time.split(':').map(Number);
      const t12 = `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'am' : 'pm'}`;
      const name = r.staffName || 'Staff';
      if (navigator.vibrate) navigator.vibrate(40);
      setMsg({ ok: true, kind: r.kind, text: `${name} — ${r.kind === 'in' ? 'IN' : 'OUT'} at ${t12} · saved by server` });
      speakName(`${r.kind === 'in' ? 'Welcome' : 'Goodbye'} ${name}`);
      onAttendanceUpdated?.();
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || 'Punch failed.' });
    } finally { setBusy(false); }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="fixed left-3 bottom-24 z-[60] btn-premium px-4 py-2 text-sm rounded-full shadow-lg">
        👆 Fingerprint
      </button>
    );
  }

  const close = () => { if (page) onExit?.(); else { setOpen(false); setEnrolUnlocked(false); setTab('punch'); } };
  const shown = activeStaff.filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()) || (s.employeeCode || '').toLowerCase().includes(search.toLowerCase()));

  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="font-bold text-lg">Fingerprint In / Out</h3>
          <p className="text-xs text-muted-foreground">
            {cloudOk === false ? 'Offline · punches need internet' : 'Server verified'} · {enrolledCount}/{activeStaff.length} staff enrolled
          </p>
        </div>
        <button onClick={close} className="text-sm opacity-70 px-2">{page ? 'Exit' : 'Close'}</button>
      </div>
      {!supported ? (
        <p className="text-sm text-destructive">This phone or browser does not support fingerprint sign-in. Use Chrome on Android, opened from the installed app or https link.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => { setTab('punch'); setMsg(null); setEnrolUnlocked(false); }}
              className={`py-2 rounded-xl text-sm font-semibold ${tab === 'punch' ? 'btn-premium' : 'btn-secondary'}`}>Touch to Punch</button>
            <button onClick={openEnrol}
              className={`py-2 rounded-xl text-sm font-semibold ${tab === 'enrol' ? 'btn-premium' : 'btn-secondary'}`}>Staff Onboarding</button>
          </div>

          {tab === 'punch' ? (
            <button onClick={punch} disabled={!!busy || lockLeft > 0}
              className="w-full aspect-square max-h-[46vh] rounded-full btn-premium flex flex-col items-center justify-center gap-2 text-xl font-bold disabled:opacity-60 mx-auto">
              <span className={`text-7xl ${busy ? 'animate-pulse' : ''}`}>👆</span>
              {lockLeft > 0 ? `Locked · ${lockLeft}s` : busy ? 'Checking…' : 'Touch to punch'}
            </button>
          ) : !enrolUnlocked ? (
            <div className="space-y-2">
              <p className="text-sm">Enter the kiosk PIN to add or change fingerprints.</p>
              <input type="password" inputMode="numeric" maxLength={8} value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                onKeyDown={e => e.key === 'Enter' && unlockEnrol()}
                className="input-premium w-full text-center tracking-[0.5em]" placeholder="••••" />
              <button onClick={unlockEnrol} className="w-full py-3 rounded-xl btn-premium font-semibold">Unlock</button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${activeStaff.length ? (enrolledCount / activeStaff.length) * 100 : 0}%` }} />
              </div>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search staff name or code…" className="input-premium w-full" />
              <ul className="divide-y divide-border text-sm rounded-xl border border-border max-h-[45vh] overflow-y-auto">
                {shown.map(s => {
                  const mine = byStaff.get(s.id) || [];
                  return (
                    <li key={s.id} className="px-3 py-2 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{s.name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {s.employeeCode || '—'} · {s.location}{mine.length ? ` · ✓ ${mine.length} verified` : (prints.some(p => p.staffId === s.id) ? ' · Old phone-lock entry — re-enrol' : ' · Not enrolled')}
                          </p>
                        </div>
                        <button onClick={() => enrol(s)} disabled={!!busy}
                          className={`text-xs px-3 py-1.5 rounded-lg whitespace-nowrap font-semibold ${mine.length ? 'btn-secondary' : 'btn-premium'}`}>
                          {busy === s.id ? 'Touch…' : mine.length ? 'Add finger' : 'Enrol'}
                        </button>
                      </div>
                      {prints.filter(p => p.staffId === s.id).map(p => (
                        <div key={p.id} className="flex items-center justify-between text-[11px] text-muted-foreground pl-2">
                          <span className="truncate">{p.verified ? '🔑' : '⚠️ old'} {p.deviceLabel || 'Phone'} · {new Date(p.enrolledAt).toLocaleDateString('en-IN')}{p.lastUsedAt ? ` · used ${new Date(p.lastUsedAt).toLocaleDateString('en-IN')}` : ''}</span>
                          <button onClick={() => removePrint(p)} className="text-destructive ml-2">Remove</button>
                        </div>
                      ))}
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs text-muted-foreground">
                Two supported setups. <b>Personal fingerprint keys</b> (e.g. YubiKey Bio, Feitian BioPass): each staff member owns one key, enrolled to them here; at punch time they plug in / tap their own key and touch it. <b>Shared reader</b>: only a FIDO2 multi-user biometric key/reader that stores several fingerprints and gives each person a separate credential (enrol each staff member on it one by one). An ordinary USB fingerprint scanner, a ZKTeco-style terminal or the phone's own fingerprint will not work here — ZKTeco devices use the Biometric Devices page instead. Keys live on the reader, so any phone can be the station if this one is lost.
                Steps: 1) set up the staff member's finger on the key, 2) tap Enrol, 3) they touch the key. The fingerprint stays on the key; the server keeps only its public key, so any station phone works with the same key.
              </p>
            </div>
          )}
          {msg && (
            <p className={`text-sm font-semibold rounded-xl p-3 ${msg.ok ? 'bg-primary/15 text-primary' : 'bg-destructive/15 text-destructive'}`}>{msg.text}</p>
          )}
          <p className="text-[11px] text-muted-foreground">
            Rules: inside the branch (no fake GPS), {Math.round(FP_COOLDOWN_MS / 60000)}-min gap between punches, OUT only 30 min after IN,
            one IN/OUT per day, {FP_MAX_FAILS} wrong touches lock for 1 min, server time only, every touch verified by the server.
          </p>
        </>
      )}
    </>
  );

  if (page) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center p-4">
        <div className="w-full max-w-md space-y-4">
          <p className="text-center text-4xl font-bold tabular-nums">{clock.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })}</p>
          <p className="text-center text-sm text-muted-foreground -mt-3">{clock.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}{userLocation ? ` · ${userLocation}` : ''}</p>
          {body}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 flex items-end sm:items-center justify-center p-3" onClick={() => !busy && close()}>
      <div className="glass-card w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl p-4 space-y-4 bg-card" onClick={e => e.stopPropagation()}>
        {body}
        {!page && <a href="/fingerprint" className="block text-center text-xs text-primary underline">Open full-screen fingerprint page</a>}
      </div>
    </div>
  );
};

export default FingerprintStation;
