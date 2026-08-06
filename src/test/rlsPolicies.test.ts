// Verifies that sensitive tables are NOT reachable with the public anon key.
// These tables must only be served through the `data-api` edge function.
import { describe, it, expect } from "vitest";

const URL = process.env.VITE_SUPABASE_URL ?? "https://nsmppwnpdxomjmgrtqka.supabase.co";
const ANON =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zbXBwd25wZHhvbWptZ3J0cWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE1NDM3NjksImV4cCI6MjA2NzExOTc2OX0.gVzJ4uPAmFT5yngvdcFsHXHH1cUL-nIq0e71Gx8ALOk";

const LOCKED_TABLES = ["device_status", "loan_requests", "advance_entries", "advances"];

async function rest(table: string, init?: RequestInit) {
  const res = await fetch(`${URL}/rest/v1/${table}?select=*&limit=1`, {
    ...init,
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  return { status: res.status, body: await res.text() };
}

describe("RLS: anon cannot read locked tables directly", () => {
  for (const table of LOCKED_TABLES) {
    it(`${table} returns no rows to anon`, async () => {
      const { status, body } = await rest(table);
      // Either a hard permission error, or an empty result set (RLS filtered).
      if (status === 200) {
        expect(JSON.parse(body)).toEqual([]);
      } else {
        expect([401, 403, 404]).toContain(status);
      }
    }, 20_000);
  }
});

describe("RLS: anon cannot write locked tables directly", () => {
  for (const table of LOCKED_TABLES) {
    it(`${table} rejects an anon insert`, async () => {
      const res = await fetch(`${URL}/rest/v1/${table}`, {
        method: "POST",
        headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({}),
      });
      await res.text();
      expect(res.status).toBeGreaterThanOrEqual(400);
    }, 20_000);
  }
});
