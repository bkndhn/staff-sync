import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Camera, Download, MapPin, Share, Smartphone, WifiOff, X, Zap, MoreVertical, PlusSquare, Check } from 'lucide-react';
import {
  installPlatform, msUntilNextPrompt, msUntilPermsPrompt, type InstallPlatform, type InstallState,
} from '../utils/installPromptTiming';

/* ------------------------------------------------------------------ */
/* Install prompt capture — must run before React mounts.             */
/* ------------------------------------------------------------------ */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const promptListeners = new Set<() => void>();
const INSTALLED_KEY = 'zenhr:installed';
const INSTALL_KEY = 'zenhr:install:v1';
const PERMS_KEY = 'zenhr:perms:v1';

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep the event so we can show our own branded sheet
    deferredPrompt = e as BeforeInstallPromptEvent;
    try { localStorage.removeItem(INSTALLED_KEY); } catch { /* ignore */ }
    promptListeners.forEach((fn) => fn());
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    try { localStorage.setItem(INSTALLED_KEY, '1'); } catch { /* ignore */ }
    promptListeners.forEach((fn) => fn());
  });
}

const readState = (key: string): InstallState => {
  try {
    const s = JSON.parse(localStorage.getItem(key) || '');
    return { dismissals: Number(s.dismissals) || 0, lastDismissed: Number(s.lastDismissed) || 0 };
  } catch { return { dismissals: 0, lastDismissed: 0 }; }
};
const writeState = (key: string, s: InstallState) => { try { localStorage.setItem(key, JSON.stringify(s)); } catch { /* ignore */ } };

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  window.matchMedia?.('(display-mode: fullscreen)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isEmbedded = () => { try { return window.top !== window.self; } catch { return true; } };
const isNativeApp = () => Boolean((window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
const isIpadOS = () => navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1;

/* ------------------------------------------------------------------ */
/* Permissions                                                         */
/* ------------------------------------------------------------------ */
type PermKey = 'location' | 'notifications' | 'camera';
type PermStatus = 'granted' | 'prompt' | 'denied' | 'unsupported';

const PERMS: Record<PermKey, { title: string; why: string; Icon: typeof MapPin }> = {
  location: { title: 'Location', why: 'Confirms you are at your work site when you punch in or out.', Icon: MapPin },
  notifications: { title: 'Notifications', why: 'Punch confirmations, shift reminders, leave and salary updates.', Icon: Bell },
  camera: { title: 'Camera', why: 'Face punch and photos of receipts or documents.', Icon: Camera },
};

async function queryPerm(key: PermKey): Promise<PermStatus> {
  if (key === 'notifications') {
    if (!('Notification' in window)) return 'unsupported';
    const p = Notification.permission;
    return p === 'default' ? 'prompt' : p;
  }
  if (key === 'location' && !('geolocation' in navigator)) return 'unsupported';
  if (key === 'camera' && !navigator.mediaDevices?.getUserMedia) return 'unsupported';
  try {
    const name = (key === 'location' ? 'geolocation' : 'camera') as PermissionName;
    const r = await navigator.permissions.query({ name });
    return r.state as PermStatus;
  } catch {
    return 'prompt'; // Safari/Firefox can't query camera — let the person try
  }
}

async function requestPerm(key: PermKey): Promise<PermStatus> {
  try {
    if (key === 'notifications') {
      const p = await Notification.requestPermission();
      if (p === 'granted') {
        // Also sign this phone up for ZenHR alerts when someone is logged in (silently skipped otherwise).
        import('../services/fcmPushService').then((m) => m.enableFcmPush()).catch(() => undefined);
      }
      return p === 'default' ? 'prompt' : p;
    }
    if (key === 'location') {
      return await new Promise<PermStatus>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          () => resolve('granted'),
          (err) => { if (err.code === err.PERMISSION_DENIED) resolve('denied'); else queryPerm('location').then(resolve); },
          { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
        );
      });
    }
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    stream.getTracks().forEach((t) => t.stop());
    return 'granted';
  } catch (e) {
    const name = (e as DOMException)?.name;
    return name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'prompt';
  }
}

/* ------------------------------------------------------------------ */
/* UI                                                                  */
/* ------------------------------------------------------------------ */
const Sheet: React.FC<{ onClose: () => void; label: string; children: React.ReactNode }> = ({ onClose, label, children }) => (
  <div className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={label}>
    <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/50 animate-fade-in" />
    <div
      className="relative w-full sm:max-w-md mx-auto rounded-t-3xl sm:rounded-3xl bg-[var(--bg-secondary)] border border-[var(--glass-border)] shadow-[var(--shadow-strong)] animate-slide-up"
      style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
    >
      <div className="mx-auto mt-2.5 mb-1 h-1.5 w-10 rounded-full bg-[var(--glass-border-strong)] sm:hidden" />
      <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 p-2 rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]">
        <X size={18} />
      </button>
      <div className="px-5 pt-3">{children}</div>
    </div>
  </div>
);

const Benefit: React.FC<{ Icon: typeof Zap; text: string }> = ({ Icon, text }) => (
  <li className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
    <span className="grid place-items-center w-8 h-8 rounded-xl bg-blue-500/15 text-blue-400 shrink-0"><Icon size={16} /></span>
    {text}
  </li>
);

const Step: React.FC<{ n: number; children: React.ReactNode }> = ({ n, children }) => (
  <li className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
    <span className="grid place-items-center w-6 h-6 rounded-full bg-blue-500 text-white text-xs font-bold shrink-0">{n}</span>
    <span className="flex items-center gap-1.5 flex-wrap">{children}</span>
  </li>
);

export const InstallAndPermissions: React.FC = () => {
  const [platform, setPlatform] = useState<InstallPlatform>('none');
  const [showInstall, setShowInstall] = useState(false);
  const [installDone, setInstallDone] = useState(false); // install sheet is out of the way for this visit
  const [perms, setPerms] = useState<Partial<Record<PermKey, PermStatus>>>({});
  const [showPerms, setShowPerms] = useState(false);
  const [busy, setBusy] = useState<PermKey | null>(null);
  const installTimer = useRef<number>();
  const permsTimer = useRef<number>();

  const computePlatform = useCallback((): InstallPlatform => {
    if (isNativeApp()) return 'none';
    let installed = false;
    try { installed = localStorage.getItem(INSTALLED_KEY) === '1'; } catch { /* ignore */ }
    const p = installPlatform({
      ua: isIpadOS() ? 'iPad' : navigator.userAgent,
      hasDeferredPrompt: Boolean(deferredPrompt),
      supportsPromptEvent: 'onbeforeinstallprompt' in window,
      standalone: isStandalone(),
      embedded: isEmbedded(),
    });
    return installed && p !== 'native-prompt' ? 'none' : p;
  }, []);

  /* Schedule the install sheet (and re-schedule whenever the browser offers / withdraws the prompt). */
  useEffect(() => {
    const schedule = () => {
      window.clearTimeout(installTimer.current);
      const p = computePlatform();
      setPlatform(p);
      if (p === 'none') { setShowInstall(false); setInstallDone(true); return; }
      const wait = msUntilNextPrompt(readState(INSTALL_KEY), Date.now(), false);
      if (wait === null) { setInstallDone(true); return; }
      setInstallDone(false);
      installTimer.current = window.setTimeout(() => setShowInstall(true), wait);
    };
    schedule();
    promptListeners.add(schedule);
    return () => { promptListeners.delete(schedule); window.clearTimeout(installTimer.current); };
  }, [computePlatform]);

  /* Check permissions once the install sheet isn't competing for attention. */
  const refreshPerms = useCallback(async () => {
    const keys = Object.keys(PERMS) as PermKey[];
    const values = await Promise.all(keys.map(queryPerm));
    const next = Object.fromEntries(keys.map((k, i) => [k, values[i]])) as Record<PermKey, PermStatus>;
    setPerms(next);
    return next;
  }, []);

  useEffect(() => {
    if (!installDone || showInstall || isEmbedded()) return;
    let cancelled = false;
    refreshPerms().then((p) => {
      if (cancelled) return;
      const missing = Object.values(p).filter((s) => s === 'prompt' || s === 'denied').length;
      const wait = msUntilPermsPrompt(readState(PERMS_KEY), Date.now(), missing);
      if (wait === null) return;
      window.clearTimeout(permsTimer.current);
      permsTimer.current = window.setTimeout(() => setShowPerms(true), wait);
    });
    return () => { cancelled = true; window.clearTimeout(permsTimer.current); };
  }, [installDone, showInstall, refreshPerms]);

  /* When someone fixes a blocked permission in settings and comes back, update the list. */
  useEffect(() => {
    if (!showPerms) return;
    const onVisible = () => { if (document.visibilityState === 'visible') refreshPerms(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [showPerms, refreshPerms]);

  const snoozeInstall = () => {
    const s = readState(INSTALL_KEY);
    writeState(INSTALL_KEY, { dismissals: s.dismissals + 1, lastDismissed: Date.now() });
    setShowInstall(false);
    setInstallDone(true);
    // Ask again later in this same visit if they keep the app open.
    const wait = msUntilNextPrompt(readState(INSTALL_KEY), Date.now(), false) ?? 0;
    window.clearTimeout(installTimer.current);
    installTimer.current = window.setTimeout(() => { if (computePlatform() !== 'none') setShowInstall(true); }, wait);
  };

  const install = async () => {
    if (!deferredPrompt) return;
    const ev = deferredPrompt;
    await ev.prompt();
    const { outcome } = await ev.userChoice.catch(() => ({ outcome: 'dismissed' as const }));
    deferredPrompt = null;
    if (outcome === 'accepted') {
      try { localStorage.setItem(INSTALLED_KEY, '1'); } catch { /* ignore */ }
      setShowInstall(false);
      setInstallDone(true);
      setPlatform('none');
    } else {
      snoozeInstall();
    }
  };

  const snoozePerms = () => {
    const s = readState(PERMS_KEY);
    writeState(PERMS_KEY, { dismissals: s.dismissals + 1, lastDismissed: Date.now() });
    setShowPerms(false);
  };

  const allow = async (k: PermKey) => {
    setBusy(k);
    const status = await requestPerm(k);
    setBusy(null);
    const next = { ...perms, [k]: status };
    setPerms(next);
    if (!Object.values(next).some((s) => s === 'prompt' || s === 'denied')) {
      writeState(PERMS_KEY, { dismissals: 0, lastDismissed: 0 });
      window.setTimeout(() => setShowPerms(false), 900);
    }
  };

  if (showInstall && platform !== 'none') {
    return (
      <Sheet onClose={snoozeInstall} label="Install ZenHR">
        <div className="flex items-center gap-4 pr-8">
          <img src="/icon-192.png" alt="" className="w-16 h-16 rounded-2xl shadow-[var(--shadow-glow-primary)]" />
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">Install ZenHR</h2>
            <p className="text-sm text-[var(--text-muted)]">Free · adds an app icon to your phone</p>
          </div>
        </div>

        {platform === 'native-prompt' && (
          <>
            <ul className="mt-5 space-y-3">
              <Benefit Icon={Zap} text="Opens instantly in one tap — punch in seconds" />
              <Benefit Icon={WifiOff} text="Keeps working when the internet drops" />
              <Benefit Icon={Bell} text="Punch, leave and salary alerts on your phone" />
            </ul>
            <button type="button" onClick={install} className="mt-6 w-full flex items-center justify-center gap-2 h-12 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-[var(--shadow-glow-primary)] transition-colors">
              <Download size={18} /> Install app
            </button>
          </>
        )}

        {platform === 'ios' && (
          <ol className="mt-5 space-y-3">
            <Step n={1}>Tap <Share size={16} className="text-blue-400" aria-label="Share" /> <b className="text-[var(--text-primary)]">Share</b> at the bottom of Safari</Step>
            <Step n={2}>Choose <PlusSquare size={16} className="text-blue-400" aria-hidden /> <b className="text-[var(--text-primary)]">Add to Home Screen</b></Step>
            <Step n={3}>Tap <b className="text-[var(--text-primary)]">Add</b>, then open ZenHR from your home screen</Step>
          </ol>
        )}

        {platform === 'android-menu' && (
          <ol className="mt-5 space-y-3">
            <Step n={1}>Tap <MoreVertical size={16} className="text-blue-400" aria-label="menu" /> the browser menu</Step>
            <Step n={2}>Choose <b className="text-[var(--text-primary)]">Install app</b> or <b className="text-[var(--text-primary)]">Add to Home screen</b></Step>
            <Step n={3}>Open ZenHR from your home screen</Step>
          </ol>
        )}

        <button type="button" onClick={snoozeInstall} className="mt-3 w-full h-11 rounded-2xl text-sm font-medium text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]">
          {platform === 'native-prompt' ? 'Maybe later' : 'Got it'}
        </button>
      </Sheet>
    );
  }

  if (showPerms) {
    const rows = (Object.keys(PERMS) as PermKey[]).filter((k) => perms[k] && perms[k] !== 'unsupported');
    const standalone = isStandalone();
    return (
      <Sheet onClose={snoozePerms} label="Turn on permissions">
        <div className="flex items-center gap-3 pr-8">
          <span className="grid place-items-center w-12 h-12 rounded-2xl bg-blue-500/15 text-blue-400"><Smartphone size={22} /></span>
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">Set up this phone</h2>
            <p className="text-sm text-[var(--text-muted)]">ZenHR needs these to punch and alert you</p>
          </div>
        </div>
        <ul className="mt-5 space-y-2.5">
          {rows.map((k) => {
            const { title, why, Icon } = PERMS[k];
            const s = perms[k];
            return (
              <li key={k} className="p-3 rounded-2xl bg-[var(--bg-card)] border border-[var(--glass-border)]">
                <div className="flex items-center gap-3">
                  <span className={`grid place-items-center w-9 h-9 rounded-xl shrink-0 ${s === 'granted' ? 'bg-green-500/15 text-green-400' : s === 'denied' ? 'bg-red-500/15 text-red-400' : 'bg-blue-500/15 text-blue-400'}`}>
                    <Icon size={18} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
                    <p className="text-xs text-[var(--text-muted)] leading-snug">{why}</p>
                  </div>
                  {s === 'granted' ? (
                    <span className="flex items-center gap-1 text-xs font-semibold text-green-400"><Check size={14} /> On</span>
                  ) : s === 'denied' ? (
                    <button type="button" onClick={() => allow(k)} className="px-3 h-8 rounded-full text-xs font-semibold bg-red-500/15 text-red-400">Blocked</button>
                  ) : (
                    <button type="button" disabled={busy === k} onClick={() => allow(k)} className="px-4 h-8 rounded-full text-xs font-semibold bg-blue-600 text-white disabled:opacity-60">
                      {busy === k ? '…' : 'Allow'}
                    </button>
                  )}
                </div>
                {s === 'denied' && (
                  <p className="mt-2 text-xs text-[var(--text-secondary)] leading-snug">
                    {standalone
                      ? `Open your phone Settings → Apps → ZenHR → Permissions → turn on ${title}, then come back.`
                      : `Tap the lock icon next to the web address → Permissions → allow ${title}, then come back.`}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        <button type="button" onClick={snoozePerms} className="mt-3 w-full h-11 rounded-2xl text-sm font-medium text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]">
          Not now
        </button>
      </Sheet>
    );
  }

  return null;
};

export default InstallAndPermissions;
