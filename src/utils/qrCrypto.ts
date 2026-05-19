export const QR_SECRET_KEY = 'staff_sync_qr_attendance_secret_2026';
export const QR_EXPIRATION_SECONDS = 7;

/**
 * Fast, synchronous 53-bit hash for QR signatures.
 * Does not require crypto.subtle, meaning it works on local HTTP networks.
 */
function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

/**
 * Generates a payload for the Dynamic QR Code.
 */
export const generateQRPayload = async (location: string): Promise<string> => {
  const timestamp = Math.floor(Date.now() / 1000); // Current time in seconds
  const sig = cyrb53(`${location}:${timestamp}:${QR_SECRET_KEY}`);
  
  return JSON.stringify({
    loc: location,
    ts: timestamp,
    sig: sig.substring(0, 16)
  });
};

/**
 * Validates a scanned QR payload.
 */
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
    // Allow a small buffer for network/scanning delay (e.g., expiration + 3 seconds grace)
    if (Math.abs(now - payload.ts) > QR_EXPIRATION_SECONDS + 3) {
      return { valid: false, reason: 'QR code has expired. Please scan the current one.' };
    }

    // Verify signature
    const expectedSig = cyrb53(`${payload.loc}:${payload.ts}:${QR_SECRET_KEY}`).substring(0, 16);

    if (payload.sig !== expectedSig) {
      return { valid: false, reason: 'Invalid signature. Fake QR code detected.' };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, reason: 'Malformed QR data' };
  }
};
