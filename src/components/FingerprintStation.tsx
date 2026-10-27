import React, { useEffect, useMemo, useState } from 'react';
import { Staff, Attendance } from '../types';
import { attendanceService } from '../services/attendanceService';
import { punchEventService } from '../services/punchEventService';
import { syncServerTime, serverNow } from '../lib/serverTime';
import { localDateKey, localTimeKey } from '../lib/localDate';
import { isSunday } from '../utils/salaryCalculations';
import { speakName } from '../lib/fingerprintSpeak';
import {
  decideFingerPunch, FP_COOLDOWN_MS, FP_MAX_FAILS, registerFail, lockSecondsLeft, FailState,
} from '../utils/fingerprintPunch';

/**
 * Master-phone fingerprint station.
 * One shared phone at the branch: managers enrol each staff member's fingerprint
 * (stored as a passkey that never leaves the phone), then staff touch to punch.
 * Anti-abuse: GPS + mock-location check on every punch, lockout after repeated
 * wrong touches, kiosk PIN required to add/replace fingerprints, server time only.
 */
const STORE_KEY = 'fp:enrolled:v1';
const LAST_KEY = 'fp:lastPunch:v1';
const FAIL_KEY = 'fp:fails:v1';

type Enrolled = Record<string, { staffId: string; name: string; enrolledAt: string }>;

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

/** Branch fence from the server, falling back to the copy cached on this phone. */
async function branchFence(branch?: string) {
  const key = `branch_fence_${branch || ''}`;
  try {
    const { locationService } = await import('../services/locationService');
    const cfg: any = (await locationService.getLocations()).find(l => l.name === branch) || null;
    if (cfg) localStorage.setItem(key, JSON.stringify(cfg));
    return cfg ? { latitude: cfg.latitude, longitude: cfg.longitude, radius_meters: cfg.radius_meters, name: branch } : null;
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
}

const FingerprintStation: React.FC<Props> = ({ staff, attendance, userLocation, onAttendanceUpdated }) => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'punch' | 'enrol'>('punch');
  const [enrolled, setEnrolled] = useState<Enrolled>(() => load(STORE_KEY, {}));
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [fails, setFails] = useState<FailState>(() => load(FAIL_KEY, { count: 0, lockedUntil: 0 }));
  const [now, setNow] = useState(Date.now());
  const [enrolUnlocked, setEnrolUnlocked] = useState(false);
  const [pin, setPin] = useState('');
  const supported = typeof window !== 'undefined' && !!window.PublicKeyCredential && window.isSecureContext;
  const lockLeft = lockSecondsLeft(fails, now);

  useEffect(() => {
    if (!lockLeft) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [lockLeft]);

  const activeStaff = useMemo(
    () => staff.filter(s => s.isActive && (!userLocation || s.location === userLocation)).sort((a, b) => a.name.localeCompare(b.name)),
    [staff, userLocation],
  );
  const enrolledIds = useMemo(() => new Set(Object.values(enrolled).map(e => e.staffId)), [enrolled]);

  const save = (e: Enrolled) => { setEnrolled(e); localStorage.setItem(STORE_KEY, JSON.stringify(e)); };
  const saveFails = (f: FailState) => { setFails(f); setNow(Date.now()); localStorage.setItem(FAIL_KEY, JSON.stringify(f)); };
  const fail = (text: string) => {
    const next = registerFail(fails, Date.now());
    saveFails(next);
    const left = lockSecondsLeft(next, Date.now());
    setMsg({ ok: false, text: left ? `Too many wrong touches. Station locked for ${left}s.` : `${text} (${FP_MAX_FAILS - next.count} tries left)` });
  };

  const openEnrol = () => {
    setMsg(null);
    if (!localStorage.getItem('kioskPinHash')) { setEnrolUnlocked(true); setTab('enrol'); return; }
    setTab('enrol');
  };
  const unlockEnrol = async () => {
    if (!/^\d{4,8}$/.test(pin)) { setMsg({ ok: false, text: 'Enter the 4–8 digit kiosk PIN.' }); return; }
    if ((await hashPin(pin)) === localStorage.getItem('kioskPinHash')) { setEnrolUnlocked(true); setMsg(null); }
    else setMsg({ ok: false, text: 'Wrong PIN.' });
    setPin('');
  };

  const enrol = async () => {
    const s = activeStaff.find(x => x.id === pick);
    if (!s) return;
    if (enrolledIds.has(s.id) && !window.confirm(`${s.name} already has a fingerprint here. Replace it?`)) return;
    setBusy(true); setMsg(null);
    try {
      const cred = (await navigator.credentials.create({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rp: { name: 'ZenHR Attendance' },
          user: { id: new TextEncoder().encode(s.id), name: s.employeeCode || s.name, displayName: s.name },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
          authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'required' },
          timeout: 60000,
        },
      })) as PublicKeyCredential | null;
      if (!cred) throw new Error('Cancelled');
      const next: Enrolled = {};
      for (const [k, v] of Object.entries(enrolled)) if (v.staffId !== s.id) next[k] = v;
      next[b64u(cred.rawId)] = { staffId: s.id, name: s.name, enrolledAt: new Date().toISOString() };
      save(next);
      setMsg({ ok: true, text: `Fingerprint saved for ${s.name}.` });
      setPick('');
    } catch (e: any) {
      setMsg({ ok: false, text: e?.name === 'NotAllowedError' ? 'Cancelled or fingerprint not recognised.' : e?.message || 'Could not save fingerprint.' });
    } finally { setBusy(false); }
  };

  const removeEnrolled = (staffId: string) => {
    const next: Enrolled = {};
    for (const [k, v] of Object.entries(enrolled)) if (v.staffId !== staffId) next[k] = v;
    save(next);
  };

  const punch = async () => {
    if (lockSecondsLeft(fails, Date.now())) return;
    setBusy(true); setMsg(null);
    try {
      const ids = Object.keys(enrolled);
      if (!ids.length) throw new Error('No fingerprints saved on this phone yet.');
      let assertion: PublicKeyCredential | null = null;
      try {
        assertion = (await navigator.credentials.get({
          publicKey: {
            challenge: crypto.getRandomValues(new Uint8Array(32)),
            allowCredentials: ids.map(id => ({ type: 'public-key' as const, id: fromB64u(id) })),
            userVerification: 'required',
            timeout: 60000,
          },
        })) as PublicKeyCredential | null;
      } catch (e: any) {
        fail(e?.name === 'NotAllowedError' ? 'Cancelled or fingerprint not recognised.' : e?.message || 'Fingerprint failed.');
        return;
      }
      if (!assertion) { fail('Cancelled.'); return; }
      const resp = assertion.response as AuthenticatorAssertionResponse;
      const entry = enrolled[b64u(assertion.rawId)];
      if (!entry) { fail('Fingerprint not registered for any staff.'); return; }
      if (!(resp.authenticatorData.byteLength && (new Uint8Array(resp.authenticatorData)[32] & 0x04))) {
        fail('Fingerprint check was skipped.'); return;
      }
      saveFails({ count: 0, lockedUntil: 0 });

      const s = staff.find(x => x.id === entry.staffId);
      if (!s || !s.isActive) throw new Error(`${entry.name} is not an active staff member.`);

      // Location: the master phone must be inside this staff member's branch, no mock GPS.
      const { enforcePunchLocation } = await import('../lib/geofence');
      const geo = await enforcePunchLocation(await branchFence(s.location));
      if (!geo.ok) { setMsg({ ok: false, text: `${s.name}: ${geo.title}. ${geo.subtitle}` }); return; }

      try { await syncServerTime(true); } catch { /* offline: last known server offset */ }
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
      await punchEventService.insert({
        staffId: s.id, staffName: s.name, location: s.location, date: today, eventTime: time,
        kind: d.kind, source: 'master_fingerprint',
        deviceLabel: `Master Phone Fingerprint${geo.distance != null ? ` · ${Math.round(geo.distance)}m` : ''}`,
      });
      last[s.id] = nowD.getTime();
      localStorage.setItem(LAST_KEY, JSON.stringify(last));
      const t12 = nowD.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
      const offline = typeof navigator !== 'undefined' && !navigator.onLine;
      setMsg({ ok: true, text: `${s.name} — ${d.kind === 'in' ? 'IN' : 'OUT'} at ${t12}${offline ? ' (saved offline, will sync)' : ''}` });
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

  const enrolledList = Object.values(enrolled).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 flex items-end sm:items-center justify-center p-3" onClick={() => !busy && setOpen(false)}>
      <div className="glass-card w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl p-4 space-y-4 bg-[var(--bg-card,#0f172a)]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg">Fingerprint Station</h3>
          <button onClick={() => { setOpen(false); setEnrolUnlocked(false); setTab('punch'); }} className="text-sm opacity-70 px-2">Close</button>
        </div>
        {!supported ? (
          <p className="text-sm text-red-500">This phone or browser does not support fingerprint sign-in. Use Chrome on Android over https.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => { setTab('punch'); setMsg(null); setEnrolUnlocked(false); }}
                className={`py-2 rounded-xl text-sm font-semibold ${tab === 'punch' ? 'btn-premium' : 'btn-secondary'}`}>Touch to Punch</button>
              <button onClick={openEnrol}
                className={`py-2 rounded-xl text-sm font-semibold ${tab === 'enrol' ? 'btn-premium' : 'btn-secondary'}`}>{`Save Fingerprint (${enrolledIds.size})`}</button>
            </div>
            {tab === 'punch' ? (
              <button onClick={punch} disabled={busy || lockLeft > 0} className="w-full py-10 rounded-2xl btn-premium text-xl font-bold disabled:opacity-60">
                {lockLeft > 0 ? `Locked · ${lockLeft}s` : busy ? 'Checking…' : '👆 Touch sensor to punch'}
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
                <select value={pick} onChange={e => setPick(e.target.value)} className="input-premium w-full">
                  <option value="">Select staff…</option>
                  {activeStaff.map(s => (
                    <option key={s.id} value={s.id}>{s.name}{enrolledIds.has(s.id) ? ' ✓' : ''}</option>
                  ))}
                </select>
                <button onClick={enrol} disabled={!pick || busy} className="w-full py-3 rounded-xl btn-premium font-semibold">
                  {busy ? 'Waiting for finger…' : 'Save fingerprint'}
                </button>
                <p className="text-xs opacity-70">Each staff member's finger must first be added in this phone's Android settings → Security → Fingerprint.</p>
                {enrolledList.length > 0 && (
                  <ul className="divide-y divide-white/10 text-sm rounded-xl border border-white/10">
                    {enrolledList.map(e => (
                      <li key={e.staffId} className="flex items-center justify-between gap-2 px-3 py-2">
                        <span className="truncate">{e.name}</span>
                        <button onClick={() => window.confirm(`Remove ${e.name}'s fingerprint from this phone?`) && removeEnrolled(e.staffId)}
                          className="text-xs text-red-500 whitespace-nowrap">Remove</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {msg && (
              <p className={`text-sm font-semibold rounded-xl p-3 ${msg.ok ? 'bg-emerald-500/15 text-emerald-500' : 'bg-red-500/15 text-red-500'}`}>{msg.text}</p>
            )}
            <p className="text-[11px] opacity-60">
              Rules: phone must be inside the branch (no fake GPS), {Math.round(FP_COOLDOWN_MS / 60000)}-min gap between punches, OUT only 30 min after IN,
              one IN/OUT per day, {FP_MAX_FAILS} wrong touches lock the station for 1 min, server time only. Works offline and syncs later.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default FingerprintStation;
