import { dataApi } from '../lib/dataApi';
import { notificationService } from './notificationService';

// You need to replace this with your actual VAPID public key
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export const pushService = {
  async isSupported(): Promise<boolean> {
    return 'serviceWorker' in navigator && 'PushManager' in window;
  },

  async subscribe(staffId?: string, userId?: string): Promise<boolean> {
    try {
      const registration = await navigator.serviceWorker.ready;
      
      let subscription = await registration.pushManager.getSubscription();
      
      if (!subscription) {
        const publicKey = VAPID_PUBLIC_KEY || await notificationService.getVapidPublicKey();
        if (!publicKey) throw new Error('Push notification key is unavailable');
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey)
        });
      }

      const p256dh = subscription.getKey('p256dh');
      const auth = subscription.getKey('auth');

      if (!p256dh || !auth) {
        throw new Error('Push keys missing');
      }

      // Save to database
      const { error } = await dataApi.from('push_subscriptions').upsert({
        endpoint: subscription.endpoint,
        p256dh: btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(p256dh)))),
        auth: btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(auth)))),
        staff_id: staffId || null,
        app_user_id: userId || null,
        device_name: navigator.userAgent
      }, { onConflict: 'endpoint' });

      if (error) throw error;
      return true;

    } catch (err) {
      console.error('Failed to subscribe to push notifications:', err);
      return false;
    }
  },

  async getSubscriptionStatus(): Promise<NotificationPermission> {
    return Notification.permission;
  }
};
