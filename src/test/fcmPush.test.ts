import { describe, it, expect } from 'vitest';
import { enableFcmPush, fcmConfigured, PUSH_MESSAGES } from '../services/fcmPushService';

describe('Firebase phone alerts sign-up', () => {
  it('reports "not set up" instead of failing when the Firebase browser keys are missing', async () => {
    if (fcmConfigured()) return; // keys present in this environment: nothing to check here
    const r = await enableFcmPush();
    expect(r.status).toBe('not-configured');
    expect(PUSH_MESSAGES[r.status]).toMatch(/not set up/i);
  });
});
