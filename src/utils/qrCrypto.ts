export const QR_SECRET_KEY = 'staff_sync_qr_attendance_secret_2026';

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
 * Secure HMAC-SHA256 cryptographic signature using Web Crypto API.
 */
const getCryptoKey = async (): Promise<CryptoKey> => {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(QR_SECRET_KEY);
  return await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
};

const signPayload = async (data: string): Promise<string> => {
  const key = await getCryptoKey();
  const encoder = new TextEncoder();
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(signatureBuffer));
  // Convert to hex string and truncate to 16 chars for QR code size efficiency
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
};

export const generateQRPayload = async (location: string): Promise<string> => {
  const timestamp = Math.floor(Date.now() / 1000);
  const dataString = `${location}:${timestamp}`;
  const sig = await signPayload(dataString);
  return JSON.stringify({ loc: location, ts: timestamp, sig });
};

export const validateQRPayload = async (payloadStr: string, staffLocation: string): Promise<{ valid: boolean; reason?: string }> => {
  try {
    const payload = JSON.parse(payloadStr);
    if (!payload.loc || !payload.ts || !payload.sig) {
      return { valid: false, reason: 'Invalid QR format' };
    }

    if (payload.loc !== staffLocation) {
      return { valid: false, reason: 'QR code is for a different branch/location' };
    }

    const now = Math.floor(Date.now() / 1000);
    // Expand the window to handle up to 45 seconds of clock drift between devices.
    // This dramatically improves reliability without sacrificing realistic security against remote replay.
    const window = getQRRefreshSeconds() + 45; 
    if (Math.abs(now - payload.ts) > window) {
      return { valid: false, reason: 'QR code has expired. Please scan the current one.' };
    }

    const expectedSig = await signPayload(`${payload.loc}:${payload.ts}`);
    if (payload.sig !== expectedSig) {
      return { valid: false, reason: 'Invalid cryptographic signature. Fake QR code detected.' };
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: 'Malformed QR data' };
  }
};
