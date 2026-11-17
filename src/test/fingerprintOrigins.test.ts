import { describe, expect, it } from 'vitest';
import { fingerprintOrigin } from '../../supabase/functions/_shared/fingerprintOrigins';

describe('fingerprint origin boundary', () => {
  it('accepts the exact live editor address from the failed request', () => {
    const origin = 'https://9244e6fb-8168-4790-a4fe-a440a7ad817c.lovableproject.com';
    expect(fingerprintOrigin(origin)).toBe(origin);
    expect(new URL(fingerprintOrigin(origin) || '').hostname).toBe('9244e6fb-8168-4790-a4fe-a440a7ad817c.lovableproject.com');
  });
  it('preserves published, static preview and local addresses', () => {
    for (const origin of ['https://zenhrapp.lovable.app', 'https://staff-shine-sync.lovable.app', 'https://id-preview--9244e6fb-8168-4790-a4fe-a440a7ad817c.lovable.app', 'http://localhost:8080']) {
      expect(fingerprintOrigin(origin)).toBe(origin);
    }
  });
  it('rejects other projects and lookalike hosts', () => {
    for (const origin of ['https://another.lovableproject.com', 'https://another.lovable.app', 'https://9244e6fb-8168-4790-a4fe-a440a7ad817c.lovableproject.com.evil.example', 'http://zenhrapp.lovable.app']) {
      expect(fingerprintOrigin(origin)).toBeNull();
    }
  });
  it('rejects missing, opaque or malformed origins', () => {
    for (const origin of [null, '', 'null', 'https://zenhrapp.lovable.app/path', 'https://zenhrapp.lovable.app?x=1']) {
      expect(fingerprintOrigin(origin)).toBeNull();
    }
  });
  it('allows exact additional HTTPS origins but not arbitrary URL configuration', () => {
    expect(fingerprintOrigin('https://hr.example.com', ' https://hr.example.com/ ')).toBe('https://hr.example.com');
    expect(fingerprintOrigin('https://other.example.com', 'https://hr.example.com')).toBeNull();
    expect(fingerprintOrigin('https://hr.example.com/path', 'https://hr.example.com/path')).toBeNull();
    expect(fingerprintOrigin('http://hr.example.com', 'http://hr.example.com')).toBeNull();
  });
});