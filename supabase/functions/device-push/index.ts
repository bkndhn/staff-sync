// Cloud-push endpoint for biometric devices (eSSL / ZKTeco cloud-enabled,
// Suprema, generic webhook). Accepts punches in a small, well-defined JSON
// shape and inserts them into the punch_events table.
//
// Auth: shared bearer token in `Authorization: Bearer <DEVICE_PUSH_TOKEN>`
//       OR `?token=<DEVICE_PUSH_TOKEN>` query param (some devices cannot send
//       custom headers). Configure the secret DEVICE_PUSH_TOKEN in Supabase.
//
// Request body (JSON) — either a single punch or `{ punches: [...] }`:
//   {
//     "device_id":   "101",          // REQUIRED — enroll number on device
//     "timestamp":   "2026-06-07T09:14:32+05:30",  // REQUIRED ISO datetime
//     "kind":        "in" | "out" | "unknown",     // optional, default "unknown"
//     "device_name": "eSSL-MainGate", // optional, stored as device_label
//     "location":    "Big Shop"       // optional override
//   }
//
// Response: { ok: true, inserted, skipped, errors: [...] }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PUSH_TOKEN = Deno.env.get("DEVICE_PUSH_TOKEN") ?? "";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface IncomingPunch {
  device_id?: string | number;
  deviceId?: string | number;
  employee_code?: string | number;
  enrollNumber?: string | number;
  timestamp?: string;
  time?: string;
  recordTime?: string;
  kind?: string;
  direction?: string;
  device_name?: string;
  deviceName?: string;
  location?: string;
}

function pickDeviceId(p: IncomingPunch): string | null {
  const v = p.device_id ?? p.deviceId ?? p.employee_code ?? p.enrollNumber;
  if (v === undefined || v === null || v === "") return null;
  return String(v).trim();
}

function pickTime(p: IncomingPunch): Date | null {
  const v = p.timestamp ?? p.time ?? p.recordTime;
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function normalizeKind(raw?: string): "in" | "out" | "break_in" | "break_out" | "unknown" {
  const v = (raw || "").toLowerCase().replace(/[\s-]/g, "");
  if (v === "in" || v === "checkin" || v === "0") return "in";
  if (v === "out" || v === "checkout" || v === "1") return "out";
  if (v === "breakin" || v === "breakstart" || v === "2" || v === "4") return "break_in";
  if (v === "breakout" || v === "breakend" || v === "3" || v === "5") return "break_out";
  return "unknown";
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // --- Auth ---
    if (!PUSH_TOKEN) {
      return json({ error: "DEVICE_PUSH_TOKEN not configured on server" }, 500);
    }
    const url = new URL(req.url);
    const headerToken = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
      ?? req.headers.get("x-device-token") ?? "";
    const queryToken = url.searchParams.get("token") ?? "";
    if (headerToken !== PUSH_TOKEN && queryToken !== PUSH_TOKEN) {
      return json({ error: "Unauthorized" }, 401);
    }

    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const list: IncomingPunch[] = Array.isArray(body)
      ? body
      : Array.isArray(body?.punches)
        ? body.punches
        : [body];

    if (list.length === 0) {
      return json({ ok: true, inserted: 0, skipped: 0, errors: [] });
    }

    // --- Map device_id -> staff ---
    const deviceIds = Array.from(new Set(
      list.map(pickDeviceId).filter((v): v is string => !!v),
    ));

    if (deviceIds.length === 0) {
      return json({ error: "No valid device_id in payload" }, 400);
    }

    const { data: staffRows, error: staffErr } = await admin
      .from("staff")
      .select("id, name, location, device_id")
      .in("device_id", deviceIds);

    if (staffErr) {
      return json({ error: "Staff lookup failed", details: staffErr.message }, 500);
    }

    const staffMap = new Map<string, { id: string; name: string; location: string }>();
    for (const s of staffRows ?? []) {
      if (s.device_id) staffMap.set(String(s.device_id).trim(), {
        id: s.id, name: s.name, location: s.location,
      });
    }

    // --- Build inserts ---
    const rows: any[] = [];
    const breakOps: Array<{ kind: "break_in" | "break_out"; staff: any; date: string; time: string; deviceLabel: string | null }> = [];
    const errors: any[] = [];
    let skipped = 0;

    for (const p of list) {
      const dev = pickDeviceId(p);
      const t = pickTime(p);
      if (!dev || !t) {
        skipped++;
        errors.push({ punch: p, reason: !dev ? "missing device_id" : "missing/invalid timestamp" });
        continue;
      }
      const s = staffMap.get(dev);
      if (!s) {
        skipped++;
        errors.push({ device_id: dev, reason: "unknown device_id (no matching staff)" });
        continue;
      }
      const kind = normalizeKind(p.kind ?? p.direction);
      const date = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
      const time = `${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`;
      const deviceLabel = p.device_name ?? p.deviceName ?? null;

      rows.push({
        staff_id: s.id,
        staff_name: s.name,
        location: p.location || s.location,
        date,
        event_time: time,
        kind,
        source: "device-push",
        device_label: deviceLabel,
      });

      if (kind === "break_in" || kind === "break_out") {
        breakOps.push({ kind, staff: s, date, time, deviceLabel });
      }
    }

    let inserted = 0;
    if (rows.length > 0) {
      const { error: insErr } = await admin.from("punch_events").insert(rows);
      if (insErr) {
        return json({ error: "Insert failed", details: insErr.message, skipped, errors }, 500);
      }
      inserted = rows.length;
    }

    // Apply break events
    let breaksOpened = 0, breaksClosed = 0;
    for (const op of breakOps) {
      try {
        if (op.kind === "break_in") {
          await admin.from("break_events").insert({
            staff_id: op.staff.id,
            staff_name: op.staff.name,
            location: op.staff.location,
            date: op.date,
            start_time: op.time,
            source: "biometric",
            device_label: op.deviceLabel,
          });
          breaksOpened++;
        } else {
          const { data: open } = await admin.from("break_events").select("*")
            .eq("staff_id", op.staff.id).is("end_time", null)
            .order("start_time", { ascending: false }).limit(1).maybeSingle();
          if (open) {
            const [sh, sm, ss] = open.start_time.split(":").map(Number);
            const [eh, em, es] = op.time.split(":").map(Number);
            const dur = Math.max(0, Math.round(((eh * 3600 + em * 60 + (es || 0)) - (sh * 3600 + sm * 60 + (ss || 0))) / 60));
            await admin.from("break_events").update({
              end_time: op.time,
              duration_minutes: dur,
            }).eq("id", open.id);
            breaksClosed++;
          }
        }
      } catch (be) {
        console.error("break op failed:", be);
      }
    }

    return json({ ok: true, inserted, skipped, errors });
  } catch (e: any) {
    console.error("device-push error:", e);
    return json({ error: e?.message ?? "Internal error" }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
