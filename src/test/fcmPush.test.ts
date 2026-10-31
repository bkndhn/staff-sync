import { describe, it, expect } from 'vitest';
import { fcmConfigured } from '../services/fcmPushService';
import { FIREBASE_WEB } from '../config/firebaseWeb';

describe('Firebase phone alerts sign-up', () => {
  it('has the Firebase browser keys, so phones can sign up without reconnecting', () => {
    expect(fcmConfigured()).toBe(true);
  });

  it('uses the zenhr-18c3e Firebase project and a sender id taken from the app id', () => {
    expect(FIREBASE_WEB.projectId).toBe('zenhr-18c3e');
    expect(FIREBASE_WEB.appId.split(':')[1]).toBe('369089036726');
  });
});
