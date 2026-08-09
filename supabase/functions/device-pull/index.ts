// Cloud-pull endpoint — fetches attendance from eSSL eTimeTrack Cloud or
// ZKBioTime Cloud via their HTTPS APIs and inserts into punch_events.
//
// This is a server-side proxy because:
//  • The browser hits CORS walls against those vendor APIs.
//  • API keys must not leak to the client.
//
// Auth: requires a Supabase user session (anon JWT). Caller passes the
// provider config in the body — we DO NOT store credentials here; that
// stays in the UI's local state (or app_settings if the customer wants).
//
// Request body:
//   {
//     "provider":   "essl" | "zkbiotime" | "realtime",
//     "serverUrl":  "https://your-essl.etimetrack.in/api",
//     "apiKey":     "<token>",
//     "location":   "Main Branch",          // optional; tags punch_events.location
//     "since":      "2026-06-18T00:00:00Z", // optional; default = today midnight
//     "dryRun":     false                    // optional
//   }
//
// Response: { ok: true, fetched, inserted, skipped, sample: [...] }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface PullBody {
  provider?: string;
  serverUrl?: string;
  apiKey?: string;
  location?: string;
  since?: string;
  dryRun?: boolean;
}

interface NormalizedPunch {
  deviceId: string;
  timestamp: string; // ISO
  kind: "in" | "out" | "break_in" | "break_out" | "unknown";
  deviceName?: string;
}

function normalizeKind(raw: any): NormalizedPunch["kind"] {
  const v = String(raw ?? "").toLowerCase().replace(/[\s-]/g, "");
  if (v === "in" || v === "checkin" || v === "0") return "in";
  if (v === "out" || v === "checkout" || v === "1") return "out";
  if (v === "breakin" || v === "breakstart" || v === "2" || v === "4") return "break_in";
  if (v === "breakout" || v === "breakend" || v === "3" || v === "5") return "break_out";
  return "unknown";
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// --- eSSL eTimeTrack Cloud ----------------------------------------------------
// Endpoint pattern: POST {serverUrl}/attendance/list
//   header Authorization: Bearer {apiKey}
//   body { from: ISO, to: ISO }
//   response: { data: [{ empCode, dateTime, direction }] }
async function pullEssl(cfg: PullBody, since: Date): Promise<NormalizedPunch[]> {
  const url = `${cfg.serverUrl!.replace(/\/$/, "")}/attendance/list`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: since.toISOString(), to: new Date().toISOString() }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!resp.ok) throw new Error(`eSSL ${resp.status} ${await resp.text().catch(() => "")}`);
  const j = await resp.json();
  const arr = Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : [];
  return arr.map((r: any) => ({
    deviceId: String(r.empCode ?? r.emp_code ?? r.employeeId ?? r.userId ?? "").trim(),
    timestamp: r.dateTime ?? r.punchTime ?? r.time ?? r.timestamp,
    kind: normalizeKind(r.direction ?? r.punchType ?? r.io ?? "unknown"),
    deviceName: r.deviceName ?? r.device ?? undefined,
  })).filter((p: NormalizedPunch) => p.deviceId && p.timestamp);
}

// --- ZKBioTime Cloud ----------------------------------------------------------
// Endpoint pattern: GET {serverUrl}/personnel/api/transactions/?start_time=...
//   header Authorization: Token {apiKey}
//   response: { data: [{ emp_code, punch_time, punch_state, terminal_alias }] }
async function pullZkBiotime(cfg: PullBody, since: Date): Promise<NormalizedPunch[]> {
  const base = cfg.serverUrl!.replace(/\/$/, "");
  const start = since.toISOString().slice(0, 19).replace("T", " ");
  const url = `${base}/personnel/api/transactions/?start_time=${encodeURIComponent(start)}&page_size=1000`;
  const resp = await fetch(url, {
    headers: { "Authorization": `Token ${cfg.apiKey}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!resp.ok) throw new Error(`ZKBioTime ${resp.status} ${await resp.text().catch(() => "")}`);
  const j = await resp.json();
  const arr = Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : [];
  return arr.map((r: any) => ({
    deviceId: String(r.emp_code ?? r.empCode ?? r.user_id ?? "").trim(),
    timestamp: r.punch_time ?? r.punchTime ?? r.time,
    kind: normalizeKind(r.punch_state_display ?? r.punch_state ?? r.io ?? "unknown"),
    deviceName: r.terminal_alias ?? r.terminal ?? undefined,
  })).filter((p: NormalizedPunch) => p.deviceId && p.timestamp);
}

// --- Realtime Cloud (T301/T302 generic) ---------------------------------------
async function pullRealtime(cfg: PullBody, since: Date): Promise<NormalizedPunch[]> {
  const base = cfg.serverUrl!.replace(/\/$/, "");
  const url = `${base}/punches?since=${encodeURIComponent(since.toISOString())}`;
  const resp = await fetch(url, {
    headers: { "Authorization": `Bearer ${cfg.apiKey}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!resp.ok) throw new Error(`Realtime ${resp.status}`);
  const j = await resp.json();
  const arr = Array.isArray(j) ? j : Array.isArray(j?.punches) ? j.punches : [];
  return arr.map((r: any) => ({
    deviceId: String(r.empId ?? r.empCode ?? r.userId ?? "").trim(),
    timestamp: r.time ?? r.punchTime ?? r.timestamp,
    kind: normalizeKind(r.direction ?? "unknown"),
    deviceName: r.device ?? r.deviceName,
  })).filter((p: NormalizedPunch) => p.deviceId && p.timestamp);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Lightweight auth: any valid Supabase user JWT (anon role is fine —
    // signed-in admins call this from the UI).
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as PullBody;
    const provider = (body.provider || "").toLowerCase();
    if (!body.serverUrl || !body.apiKey) return json({ error: "serverUrl and apiKey are required" }, 400);
    if (!["essl", "zkbiotime", "realtime"].includes(provider)) {
      return json({ error: `Unsupported provider: ${body.provider}` }, 400);
    }

    const since = body.since ? new Date(body.since) : (() => {
      const d = new Date(); d.setHours(0, 0, 0, 0); return d;
    })();
    if (isNaN(since.getTime())) return json({ error: "Invalid since timestamp" }, 400);

    let punches: NormalizedPunch[] = [];
    try {
      if (provider === "essl") punches = await pullEssl(body, since);
      else if (provider === "zkbiotime") punches = await pullZkBiotime(body, since);
      else punches = await pullRealtime(body, since);
    } catch (err: any) {
      return json({ error: `Provider fetch failed: ${err?.message || err}` }, 502);
    }

    if (body.dryRun) {
      return json({ ok: true, fetched: punches.length, inserted: 0, skipped: 0, sample: punches.slice(0, 10) });
    }

    // Insert into punch_events. Dedup on (device_id, punched_at).
    let inserted = 0, skipped = 0;
    const errors: string[] = [];
    for (const p of punches) {
      const d = new Date(p.timestamp);
      if (isNaN(d.getTime())) { skipped++; continue; }
      const iso = d.toISOString();

      // Skip duplicates within ±60s
      const winStart = new Date(d.getTime() - 60_000).toISOString();
      const winEnd = new Date(d.getTime() + 60_000).toISOString();
      const { data: existing } = await admin
        .from("punch_events")
        .select("id")
        .eq("device_id", p.deviceId)
        .gte("punched_at", winStart)
        .lte("punched_at", winEnd)
        .limit(1);
      if (existing && existing.length > 0) { skipped++; continue; }

      const { error: insErr } = await admin.from("punch_events").insert({
        device_id: p.deviceId,
        punched_at: iso,
        kind: p.kind,
        source: "cloud_api",
        device_label: p.deviceName || provider,
        location: body.location || null,
      });
      if (insErr) {
        errors.push(insErr.message);
        skipped++;
      } else {
        inserted++;
      }
    }

    return json({
      ok: true,
      provider,
      fetched: punches.length,
      inserted,
      skipped,
      errors: errors.slice(0, 5),
      sample: punches.slice(0, 5),
    });
  } catch (err: any) {
    return json({ error: err?.message || String(err) }, 500);
  }
});
