/**
 * Server-authoritative clock.
 *
 * A tampered device clock must not be able to fake punch times. We ask the
 * `data-api` edge function for its own time, store the offset against the
 * device clock, and use that offset for every punch timestamp.
 */

import { supabase } from './supabase';

const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  'https://nsmppwnpdxomjmgrtqka.supabase.co';
const SUPABASE_PUBLISHABLE_KEY =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) || '';
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/data-api`;

/** serverNow = deviceNow + offsetMs */
let offsetMs = 0;
let lastSyncAt = 0;
const SYNC_TTL_MS = 5 * 60 * 1000;

/** Sync the offset with the server. Silently keeps the last offset on failure. */
export async function syncServerTime(force = false): Promise<number> {
  if (!force && Date.now() - lastSyncAt < SYNC_TTL_MS) return offsetMs;
  if (!navigator.onLine) return offsetMs;

  try {
    let token: string | null = null;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      token = session?.access_token ?? null;
    } catch { /* anonymous is fine — op needs no auth */ }

    const started = Date.now();
    const res = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_PUBLISHABLE_KEY,
        ...(token ? { Authorization: `Bearer ${token}`, 'x-session-token': token } : {}),
      },
      body: JSON.stringify({ op: 'server_time' }),
    });
    if (!res.ok) return offsetMs;
    const json = await res.json();
    const serverMs = new Date(json?.data?.now).getTime();
    if (!Number.isFinite(serverMs)) return offsetMs;

    // Compensate for half the round-trip latency.
    const finished = Date.now();
    const latencyHalf = (finished - started) / 2;
    offsetMs = serverMs + latencyHalf - finished;
    lastSyncAt = finished;
  } catch { /* keep previous offset */ }

  return offsetMs;
}

/** Best-known current time (device clock corrected by the server offset). */
export function serverNow(): Date {
  return new Date(Date.now() + offsetMs);
}

/** Absolute drift between the device clock and the server, in seconds. */
export function clockDriftSeconds(): number {
  return Math.abs(Math.round(offsetMs / 1000));
}
