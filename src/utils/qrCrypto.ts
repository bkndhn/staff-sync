export const QR_SECRET_KEY = 'staff_sync_qr_attendance_secret_2026';
export const QR_EXPIRATION_SECONDS = 7;

/**
 * Generates a payload for the Dynamic QR Code.
 */
export const generateQRPayload = async (location: string): Promise<string> => {
  const timestamp = Math.floor(Date.now() / 1000); // Current time in seconds
  // Create a simple hash using Web Crypto API
  const encoder = new TextEncoder();
  const data = encoder.encode(`${location}:${timestamp}:${QR_SECRET_KEY}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return JSON.stringify({
    loc: location,
    ts: timestamp,
    sig: hashHex.substring(0, 16) // Short signature is enough for this use case
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
    const encoder = new TextEncoder();
    const data = encoder.encode(`${payload.loc}:${payload.ts}:${QR_SECRET_KEY}`);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const expectedSig = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);

    if (payload.sig !== expectedSig) {
      return { valid: false, reason: 'Invalid signature. Fake QR code detected.' };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, reason: 'Malformed QR data' };
  }
};
