// Kiosk punch photos: stored privately on the server; managers see them through 15-minute links.
import { FUNCTIONS_BASE, functionAuthHeaders } from '../lib/dataApi';

const call = async (body: unknown): Promise<any | null> => {
  const headers = await functionAuthHeaders();
  if (!headers) return null;
  try {
    const res = await fetch(`${FUNCTIONS_BASE}/punch-photo`, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
};

const isServerId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

export const punchPhotoService = {
  /** Upload a punch photo for a saved (server) punch. Safe to retry: the server ignores repeats. */
  async upload(eventId: string, photo?: string): Promise<boolean> {
    if (!photo || !isServerId(eventId) || !photo.startsWith('data:image/jpeg;base64,')) return false;
    const r = await call({ action: 'upload', eventId, image: photo });
    return !!r?.ok;
  },
  /** Expiring view links keyed by punch id. Empty for non-managers. */
  async viewLinks(eventIds: string[]): Promise<Record<string, string>> {
    const ids = eventIds.filter(isServerId).slice(0, 100);
    if (!ids.length) return {};
    const r = await call({ action: 'url', eventIds: ids });
    return r?.urls ?? {};
  },
};
