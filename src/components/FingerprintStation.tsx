import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Staff, Attendance } from '../types';
import { attendanceService } from '../services/attendanceService';
import { punchEventService } from '../services/punchEventService';
import { syncServerTime, serverNow } from '../lib/serverTime';
import { localDateKey, localTimeKey } from '../lib/localDate';
import { isSunday } from '../utils/salaryCalculations';
import { speakName } from '../lib/fingerprintSpeak';
import { fingerprintCloudService, CloudFingerprint } from '../services/fingerprintCloudService';
import {
  decideFingerPunch, FP_COOLDOWN_MS, FP_MAX_FAILS, registerFail, lockSecondsLeft, FailState,
} from '../utils/fingerprintPunch';

/**
 * Fingerprint station (shared master phone).
 * Fingerprints are phone passkeys: the finger image never leaves the sensor. The
 * passkey ID ↔ staff link is saved in the cloud, so a replacement phone signed in
 * to the same Google / Apple account (passkeys sync there) recognises everyone
 * without re-enrolling. Anti-abuse: GPS + mock-location check, lockout after wrong
 * touches, kiosk PIN for enrolment, server time only, cooldown between punches.
 */
const LEGACY_KEY = 'fp:enrolled:v1';
const LAST_KEY = 'fp:lastPunch:v1';
const FAIL_KEY = 'fp:fails:v1';

const b64u = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = (s: string) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, c => c.charCodeAt(0));
};
const load = <T,>(k: string, d: T): T => { try { return (JSON.parse(localStorage.getItem(k) || 'null') as T) ?? d; } catch { return d; } };
const hashPin = async (pin: string) => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`kiosk:${pin}`));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
};
const fenceCache = new Map<string, any>();

async function branchFence(branch?: string) {
  const key = `branch_fence_${branch || ''}`;
  if (fenceCache.has(key)) return fenceCache.get(key);
  try {
    const { locationService } = await import('../services/locationService');
    const cfg: any = (await locationService.getLocations()).find(l => l.name === branch) || null;
    if (cfg) localStorage.setItem(key, JSON.stringify(cfg));
    const r = cfg ? { latitude: cfg.latitude, longitude: cfg.longitude, radius_meters: cfg.radius_meters, name: branch } : null;
    fenceCache.set(key, r);
    return r;
  } catch {
    const cfg: any = load(key, null);
    return cfg ? { latitude: cfg.latitude, longitude: cfg.longitude, radius_meters: cfg.radius_meters, name: branch } : null;
  }
}

interface Props {
  staff: Staff[];
  attendance: Attendance[];
  userLocation?: string;
  onAttendanceUpdated?: () => void;
  /** Full-screen page mode (/fingerprint) instead of the floating button. */
  page?: boolean;
  onExit?: () => void;
}

const FingerprintStation: React.FC<Props> = ({ staff, attendance, userLocation, onAttendanceUpdated, page, onExit }) => {
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

  // Load from cloud; move any fingerprints saved only on this phone (older version) up to the cloud.
  useEffect(() => {
    if (!open) return;
    (async () => {
      const rows = await refresh();
      const legacy = load<Record<string, { staffId: string; name: string }>>(LEGACY_KEY, {});
      const have = new Set(rows.map(r => r.credentialId));
      const missing = Object.entries(legacy).filter(([id]) => !have.has(id));
      if (!missing.length || !navigator.onLine) return;
      try {
        for (const [credentialId, v] of missing) {
          await fingerprintCloudService.save({ staffId: v.staffId, staffName: v.name, credentialId, enrolledBy: 'moved from phone' });
        }
        localStorage.removeItem(LEGACY_KEY);
        await refresh();
      } catch { /* keep legacy copy for next try */ }
    })();
  }, [open, refresh]);

  const activeStaff = useMemo(
    () => staff.filter(s => s.isActive && (!userLocation || s.location === userLocation)).sort((a, b) => a.name.localeCompare(b.name)),
    [staff, userLocation],
  );
  const byCred = useMemo(() => new Map(prints.map(p => [p.credentialId, p])), [prints]);
  const byStaff = useMemo(() => {
    const m = new Map<string, CloudFingerprint[]>();
    for (const p of prints) { if (!m.has(p.staffId)) m.set(p.staffId, []); m.get(p.staffId)!.push(p); }
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

  /** Ask for the finger once; returns the passkey ID that matched. */
  const verifyTouch = async (ids?: string[]) => {
    const a = (await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: ids?.map(id => ({ type: 'public-key' as const, id: fromB64u(id) })) ?? [],
        userVerification: 'required',
        timeout: 30000,
      },
    })) as PublicKeyCredential | null;
    if (!a) throw Object.assign(new Error('Cancelled'), { name: 'NotAllowedError' });
    const flags = new Uint8Array((a.response as AuthenticatorAssertionResponse).authenticatorData)[32];
    if (!(flags & 0x04)) throw new Error('Fingerprint check was skipped.');
    return b64u(a.rawId);
  };

  const enrol = async (s: Staff) => {
    if (!navigator.onLine) { setMsg({ ok: false, text: 'Connect to the internet to save fingerprints to the cloud.' }); return; }
    if (byStaff.has(s.id) && !window.confirm(`${s.name} already has a fingerprint. Add another finger / phone for them?`)) return;
    setBusy(s.id); setMsg(null);
    try {
      const cred = (await navigator.credentials.create({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rp: { name: 'ZenHR Attendance' },
          user: { id: new TextEncoder().encode(s.id), name: `${s.employeeCode || s.name} · ZenHR`, displayName: s.name },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
          authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'required' },
          excludeCredentials: (byStaff.get(s.id) || []).map(p => ({ type: 'public-key' as const, id: fromB64u(p.credentialId) })),
          timeout: 60000,
        },
      })) as PublicKeyCredential | null;
      if (!cred) throw new Error('Cancelled');
      const credentialId = b64u(cred.rawId);
      // Accuracy check: the same finger must match once more before we save it.
      setMsg({ ok: true, text: `Touch again to confirm ${s.name}'s finger…` });
      const again = await verifyTouch([credentialId]);
      if (again !== credentialId) throw new Error('Second touch did not match. Try again.');
      await fingerprintCloudService.save({ staffId: s.id, staffName: s.name, credentialId, enrolledBy: 'master phone' });
      await refresh();
      if (navigator.vibrate) navigator.vibrate(60);
      setMsg({ ok: true, text: `✓ ${s.name}'s fingerprint saved to the cloud.` });
    } catch (e: any) {
      setMsg({ ok: false, text: e?.name === 'InvalidStateError' ? `${s.name} is already saved on this phone.` : e?.name === 'NotAllowedError' ? 'Cancelled or fingerprint not recognised.' : e?.message || 'Could not save fingerprint.' });
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
      if (!prints.length) throw new Error('No fingerprints saved yet. Ask a manager to add staff first.');
      let credId: string;
      // Empty list = phone picks the matching saved finger itself (fastest, no list sent).
      try { credId = await verifyTouch(); }
      catch (e: any) { fail(e?.name === 'NotAllowedError' ? 'Cancelled or fingerprint not recognised.' : e?.message || 'Fingerprint failed.'); return; }
      let entry = byCred.get(credId);
      if (!entry && navigator.onLine) entry = (await refresh()).find(p => p.credentialId === credId);
      if (!entry) { fail('Fingerprint not registered for any staff.'); return; }
      saveFails({ count: 0, lockedUntil: 0 });

      const s = staff.find(x => x.id === entry!.staffId);
      if (!s || !s.isActive) throw new Error(`${entry.staffName || 'This person'} is not an active staff member.`);

      const { enforcePunchLocation } = await import('../lib/geofence');
      const [geo] = await Promise.all([
        branchFence(s.location).then(f => enforcePunchLocation(f)),
        syncServerTime(true).catch(() => { /* offline: last known offset */ }),
      ]);
      if (!geo.ok) { setMsg({ ok: false, text: `${s.name}: ${geo.title}. ${geo.subtitle}` }); return; }

      const nowD = serverNow();
      const today = localDateKey(nowD);
      const time = localTimeKey(nowD);
      const rec = attendance.find(a => a.date === today && a.staffId === s.id && !a.isPartTime);
      const last = load<Record<string, number>>(LAST_KEY, {});
      const d = decideFingerPunch({ rec, nowMs: nowD.getTime(), lastPunchMs: last[s.id], nowTime: time });
      if (!d.ok) { setMsg({ ok: false, text: `${s.name}: ${d.reason}` }); return; }

      if (d.kind === 'in') {
        await attendanceService.upsert({
          staffId: s.id, staffName: s.name, location: s.location, date: today,
          status: 'Present' as any, attendanceValue: 1, isSunday: isSunday(today), isPartTime: false, arrivalTime: time,
        } as any);
      } else {
        await attendanceService.upsert({ ...rec!, leavingTime: time } as any);
      }
      void punchEventService.insert({
        staffId: s.id, staffName: s.name, location: s.location, date: today, eventTime: time,
        kind: d.kind, source: 'master_fingerprint',
        deviceLabel: `Master Phone Fingerprint${geo.distance != null ? ` · ${Math.round(geo.distance)}m` : ''}`,
      });
      void fingerprintCloudService.touch(entry.id);
      last[s.id] = nowD.getTime();
      localStorage.setItem(LAST_KEY, JSON.stringify(last));
      const t12 = nowD.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
      const offline = !navigator.onLine;
      if (navigator.vibrate) navigator.vibrate(40);
      setMsg({ ok: true, kind: d.kind, text: `${s.name} — ${d.kind === 'in' ? 'IN' : 'OUT'} at ${t12}${offline ? ' (saved offline, will sync)' : ''}` });
      speakName(`${d.kind === 'in' ? 'Welcome' : 'Goodbye'} ${s.name}`);
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
            {cloudOk === false ? 'Offline · using saved copy' : 'Cloud synced'} · {enrolledCount}/{activeStaff.length} staff enrolled
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
                            {s.employeeCode || '—'} · {s.location}{mine.length ? ` · ✓ ${mine.length} saved` : ' · Not enrolled'}
                          </p>
                        </div>
                        <button onClick={() => enrol(s)} disabled={!!busy}
                          className={`text-xs px-3 py-1.5 rounded-lg whitespace-nowrap font-semibold ${mine.length ? 'btn-secondary' : 'btn-premium'}`}>
                          {busy === s.id ? 'Touch…' : mine.length ? 'Add finger' : 'Enrol'}
                        </button>
                      </div>
                      {mine.map(p => (
                        <div key={p.id} className="flex items-center justify-between text-[11px] text-muted-foreground pl-2">
                          <span className="truncate">📱 {p.deviceLabel || 'Phone'} · {new Date(p.enrolledAt).toLocaleDateString('en-IN')}{p.lastUsedAt ? ` · used ${new Date(p.lastUsedAt).toLocaleDateString('en-IN')}` : ''}</span>
                          <button onClick={() => removePrint(p)} className="text-destructive ml-2">Remove</button>
                        </div>
                      ))}
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs text-muted-foreground">
                Steps: 1) add the staff member's finger in this phone's Settings → Security → Fingerprint, 2) tap Enrol, 3) touch twice to confirm.
                Saved to the cloud — a replacement phone signed in to the same Google account recognises everyone without re-enrolling.
              </p>
            </div>
          )}
          {msg && (
            <p className={`text-sm font-semibold rounded-xl p-3 ${msg.ok ? 'bg-primary/15 text-primary' : 'bg-destructive/15 text-destructive'}`}>{msg.text}</p>
          )}
          <p className="text-[11px] text-muted-foreground">
            Rules: inside the branch (no fake GPS), {Math.round(FP_COOLDOWN_MS / 60000)}-min gap between punches, OUT only 30 min after IN,
            one IN/OUT per day, {FP_MAX_FAILS} wrong touches lock for 1 min, server time only. Works offline and syncs later.
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
