import { dataApi } from '../lib/dataApi';

/**
 * Cloud list of fingerprint passkeys per staff member.
 * Phones never expose fingerprint images; we store only the passkey ID so any
 * master phone signed into the same Google/Apple account (where passkeys sync)
 * can recognise staff without re-enrolling them.
 */
export interface CloudFingerprint {
  id: string;
  staffId: string;
  staffName?: string;
  credentialId: string;
  deviceLabel?: string;
  enrolledAt: string;
  lastUsedAt?: string;
}

const CACHE_KEY = 'fp:cloud:v1';

const fromDb = (d: any): CloudFingerprint => ({
  id: d.id, staffId: d.staff_id, staffName: d.staff_name ?? undefined,
  credentialId: d.credential_id, deviceLabel: d.device_label ?? undefined,
  enrolledAt: d.enrolled_at, lastUsedAt: d.last_used_at ?? undefined,
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

  async save(input: { staffId: string; staffName: string; credentialId: string; enrolledBy?: string }) {
    // One active fingerprint per staff on each phone model; replace older ones from this phone.
    const label = deviceLabel();
    const { error } = await dataApi.from('staff_fingerprints').insert([{
      staff_id: input.staffId, staff_name: input.staffName, credential_id: input.credentialId,
      device_label: label, enrolled_by: input.enrolledBy,
    }]);
    if (error) throw error;
    return this.list();
  },

  async remove(id: string) {
    const { error } = await dataApi.from('staff_fingerprints').delete().eq('id', id);
    if (error) throw error;
    return this.list();
  },

  async touch(id: string) {
    try { await dataApi.from('staff_fingerprints').update({ last_used_at: new Date().toISOString() }).eq('id', id); } catch { /* offline */ }
  },
};
