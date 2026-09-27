import { dataApi } from '../lib/dataApi';

/** Default refresh window if the admin hasn't customised it. */
export const QR_REFRESH_DEFAULT = 7;
const QR_REFRESH_MIN = 3;
const QR_REFRESH_MAX = 60;
const QR_REFRESH_KEY = 'qr_refresh_seconds';

/** Read the admin-configured refresh interval (seconds). Reads each call so updates apply live. */
export const getQRRefreshSeconds = (): number => {
  try {
    const raw = localStorage.getItem(QR_REFRESH_KEY);
    if (!raw) return QR_REFRESH_DEFAULT;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return QR_REFRESH_DEFAULT;
    return Math.max(QR_REFRESH_MIN, Math.min(QR_REFRESH_MAX, n));
  } catch {
    return QR_REFRESH_DEFAULT;
  }
};

export const setQRRefreshSeconds = (seconds: number): number => {
  const n = Math.max(QR_REFRESH_MIN, Math.min(QR_REFRESH_MAX, Math.round(seconds)));
  try { localStorage.setItem(QR_REFRESH_KEY, String(n)); } catch { /* ignore */ }
  return n;
};

/** Back-compat export so callers that imported the old constant keep working. */
export const QR_EXPIRATION_SECONDS = QR_REFRESH_DEFAULT;

/**
 * QR codes are signed and verified by the server. The signing key never
 * reaches the browser, so codes cannot be forged on the client.
 */
export const generateQRPayload = async (location: string): Promise<string> => {
  const { data, error } = await dataApi.action<{ payload: string }>('qr_sign', { location });
  if (error || !data?.payload) throw new Error(error?.message || 'Could not generate QR code');
  return data.payload;
};

export const validateQRPayload = async (payloadStr: string, staffLocation: string): Promise<{ valid: boolean; reason?: string }> => {
  try {
    const payload = JSON.parse(payloadStr);
    if (!payload?.loc || !payload?.ts || !payload?.sig) return { valid: false, reason: 'Invalid QR format' };
    if (payload.loc !== staffLocation) return { valid: false, reason: 'QR code is for a different branch/location' };
  } catch {
    return { valid: false, reason: 'Malformed QR data' };
  }
  const { data, error } = await dataApi.action<{ valid: boolean; reason?: string }>('qr_verify', {
    payload: payloadStr,
    window: getQRRefreshSeconds(),
  });
  if (error || !data) return { valid: false, reason: 'Could not verify QR code. Please try again.' };
  return data;
};
