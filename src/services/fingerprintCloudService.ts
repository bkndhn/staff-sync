import { dataApi, FUNCTIONS_BASE, functionAuthHeaders } from '../lib/dataApi';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

const call = async (body: unknown): Promise<any> => {
  const headers = await functionAuthHeaders();
  if (!headers) throw new Error('Please sign in again.');
  const res = await fetch(`${FUNCTIONS_BASE}/fingerprint-auth`, { method: 'POST', headers, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(j?.error || 'Fingerprint server error'), { lockedFor: j?.lockedFor, status: res.status });
  return j;
};

/**
 * Server-verified fingerprint keys per staff member.
 * The fingerprint itself never leaves the reader/security key; the server stores
 * only the key's public key and checks every touch's signature. Shared stations
 * accept only external fingerprint readers/security keys, never the phone's own lock.
 */
export interface CloudFingerprint {
  id: string;
  staffId: string;
  staffName?: string;
  credentialId: string;
  deviceLabel?: string;
  enrolledAt: string;
  lastUsedAt?: string;
  /** Enrolled through the server check with a reader. Older phone-only entries are false and cannot punch. */
  verified: boolean;
}

const CACHE_KEY = 'fp:cloud:v1';

const fromDb = (d: any): CloudFingerprint => ({
  id: d.id, staffId: d.staff_id, staffName: d.staff_name ?? undefined,
  credentialId: d.credential_id, deviceLabel: d.device_label ?? undefined,
  enrolledAt: d.enrolled_at, lastUsedAt: d.last_used_at ?? undefined,
  verified: !!d.verified_at,
});

export const deviceLabel = () => {
  const ua = navigator.userAgent;
  const m = ua.match(/Android [\d.]+; ([^;)]+)/) || ua.match(/(iPhone|iPad)/);
  return (m?.[1] || 'Browser').trim().slice(0, 60);
};

export const fingerprintCloudService = {
  cached(): CloudFingerprint[] {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '[]'); } catch { return []; }
  },

  /** Load all fingerprints from the cloud; falls back to this phone's copy when offline. */
  async list(): Promise<CloudFingerprint[]> {
    try {
      const { data, error } = await dataApi.from('staff_fingerprints').select('*');
      if (error) throw error;
      const rows = (data || []).map(fromDb);
      localStorage.setItem(CACHE_KEY, JSON.stringify(rows));
      return rows;
    } catch {
      return this.cached();
    }
  },

  /** Enrol a staff member's finger on a fingerprint reader / security key (server verifies it). */
  async enrol(staffId: string) {
    const { options, challengeId } = await call({ action: 'register_options', staffId });
    const response = await startRegistration({ optionsJSON: options });
    await call({ action: 'register_verify', challengeId, response, deviceLabel: 'Fingerprint key' });
    return this.list();
  },

  /**
   * One touch: the server checks the signature, works out who it is, decides IN/OUT and
   * saves the punch itself. The app never writes fingerprint attendance directly.
   */
  async punch(pos?: { lat: number; lng: number; accuracy?: number }): Promise<{ staffId: string; staffName?: string; kind: 'in' | 'out'; time: string; date: string }> {
    const { options, challengeId } = await call({ action: 'auth_options' });
    const response = await startAuthentication({ optionsJSON: options });
    return call({ action: 'auth_verify', challengeId, response, ...(pos || {}) });
  },

  async remove(id: string) {
    const { error } = await dataApi.from('staff_fingerprints').delete().eq('id', id);
    if (error) throw error;
    return this.list();
  },
};
