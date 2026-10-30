// Firebase phone alerts: registers this browser with Firebase and saves its alert address
// on the server (notifications edge function, action "register_fcm"). The address table is
// server-only, so the browser never reads or writes it directly.
import { FUNCTIONS_BASE, functionAuthHeaders } from '../lib/dataApi';

const appId = import.meta.env.VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_APP_ID as string | undefined;
const vapidKey = import.meta.env.VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_VAPID_KEY as string | undefined;
const firebaseConfig = {
  apiKey: (import.meta.env.VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_WEB_API_KEY as string | undefined) || '',
  projectId: (import.meta.env.VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_PROJECT_ID as string | undefined) || '',
  appId: appId || '',
  messagingSenderId: appId?.split(':')[1] ?? '',
};

/** Separate scope so it never clashes with the app's main offline worker. */
const SW_SCOPE = '/firebase-cloud-messaging-push-scope';

export type PushResult =
  | { status: 'registered' }
  | { status: 'not-configured' | 'unsupported' | 'open-in-new-tab' | 'denied' | 'not-signed-in' | 'failed'; detail?: string };

export const fcmConfigured = () =>
  Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId && vapidKey && firebaseConfig.messagingSenderId);

export const PUSH_MESSAGES: Record<PushResult['status'], string> = {
  registered: 'Phone alerts are on for this device.',
  'not-configured': 'Phone alerts are not set up yet. Ask your admin to finish the Firebase setup.',
  unsupported: 'This browser cannot receive phone alerts. Try Chrome on Android, or add the app to your iPhone home screen.',
  'open-in-new-tab': 'Open the app in its own tab (or the installed app) to turn on alerts.',
  denied: 'Alerts are blocked. Allow notifications for this site in your browser settings, then try again.',
  'not-signed-in': 'Please sign in again, then turn on alerts.',
  failed: 'Could not turn on alerts. Please try again.',
};

// Call from a click handler: browsers ignore permission requests without a user gesture.
export async function enableFcmPush(): Promise<PushResult> {
  if (!fcmConfigured()) return { status: 'not-configured' };
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
    return { status: 'unsupported' };
  }
  const { isSupported, getMessaging, getToken } = await import('firebase/messaging');
  if (!(await isSupported().catch(() => false))) return { status: 'unsupported' };
  if (window.top !== window.self) return { status: 'open-in-new-tab' };

  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') return { status: 'denied' };

  const headers = await functionAuthHeaders();
  if (!headers) return { status: 'not-signed-in' };

  try {
    const { initializeApp, getApps } = await import('firebase/app');
    const app = getApps()[0] || initializeApp(firebaseConfig);
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: SW_SCOPE });
    const token = await getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration: registration });
    if (!token) return { status: 'denied' };

    const res = await fetch(`${FUNCTIONS_BASE}/notifications`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'register_fcm',
        token,
        platform: 'web',
        deviceName: navigator.userAgent.slice(0, 200),
      }),
    });
    if (res.status === 401) return { status: 'not-signed-in' };
    if (!res.ok) return { status: 'failed', detail: await res.text().catch(() => '') };
    try { localStorage.setItem('fcm:registered', '1'); } catch { /* ignore */ }
    return { status: 'registered' };
  } catch (e) {
    console.error('Phone alert setup failed:', e);
    return { status: 'failed', detail: (e as Error).message };
  }
}

export const isFcmRegisteredHere = () => {
  try { return localStorage.getItem('fcm:registered') === '1' && Notification.permission === 'granted'; } catch { return false; }
};

/** Ask the server to send a "punch recorded" alert. The server builds it from the saved punch only. */
export async function requestPunchConfirmation(staffId: string): Promise<void> {
  try {
    const headers = await functionAuthHeaders();
    if (!headers) return;
    await fetch(`${FUNCTIONS_BASE}/notifications`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'punch_confirm', staffId }),
    });
  } catch { /* alerts never block a punch */ }
}
