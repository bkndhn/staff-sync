// Private kiosk punch photos: upload (any signed-in tenant user), view links (managers only),
// and retention pruning. Files live in the private "punch-photos" bucket, reachable only via this function.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCaller } from "../_shared/caller.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-token, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BUCKET = "punch-photos";
const RETENTION_DAYS = 30;
const LINK_SECONDS = 15 * 60;
const MAX_BYTES = 200_000;
const MANAGERS = ["super_admin", "admin", "manager", "supervisor", "floor_supervisor"];
const UUID = /^[0-9a-f-]{36}$/i;

async function prune(tenantId?: string | null) {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400_000).toISOString();
  let q = admin.from("punch_events").select("id, photo_path").not("photo_path", "is", null).lt("created_at", cutoff).limit(500);
  if (tenantId) q = q.eq("tenant_id", tenantId);
  const { data } = await q;
  const rows = data || [];
  if (!rows.length) return 0;
  await admin.storage.from(BUCKET).remove(rows.map((r: any) => r.photo_path));
  await admin.from("punch_events").update({ photo_path: null }).in("id", rows.map((r: any) => r.id));
  return rows.length;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const action = body?.action;

  // Scheduled cleanup across all clients (cron secret, never sent by browsers).
  if (action === "prune" && req.headers.get("x-cron-secret")) {
    if (req.headers.get("x-cron-secret") !== Deno.env.get("NOTIFY_CRON_SECRET")) return json({ error: "Forbidden" }, 403);
    return json({ removed: await prune(null) });
  }

  const r = await resolveCaller(admin, req);
  if (!r.ok || !r.caller) return json({ error: r.error }, r.status ?? 401);
  const caller = r.caller;
  if (!caller.tenant_id) return json({ error: "No client on account" }, 403);

  if (action === "upload") {
    const { eventId, image } = body;
    if (typeof eventId !== "string" || !UUID.test(eventId)) return json({ error: "Bad eventId" }, 400);
    if (typeof image !== "string" || !image.startsWith("data:image/jpeg;base64,")) return json({ error: "JPEG data URL required" }, 400);
    const bytes = Uint8Array.from(atob(image.slice(23)), (c) => c.charCodeAt(0));
    if (bytes.length > MAX_BYTES) return json({ error: "Image too large" }, 413);

    const { data: ev } = await admin.from("punch_events").select("id, staff_id, date, tenant_id, photo_path").eq("id", eventId).maybeSingle();
    if (!ev) return json({ error: "Punch not found" }, 404);
    if (ev.tenant_id !== caller.tenant_id) return json({ error: "Punch not found" }, 404);
    if (ev.photo_path) return json({ ok: true, path: ev.photo_path, duplicate: true });

    const path = `${ev.tenant_id}/${ev.staff_id}/${ev.date}/${ev.id}.jpg`;
    const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: "image/jpeg", upsert: true });
    if (error) return json({ error: "Upload failed" }, 500);
    await admin.from("punch_events").update({ photo_path: path }).eq("id", ev.id);
    return json({ ok: true, path });
  }

  if (action === "url") {
    if (!MANAGERS.includes(caller.role)) return json({ error: "Not authorized" }, 403);
    const ids: string[] = Array.isArray(body.eventIds) ? body.eventIds.filter((x: any) => typeof x === "string" && UUID.test(x)).slice(0, 100) : [];
    if (!ids.length) return json({ urls: {} });
    const { data } = await admin.from("punch_events").select("id, photo_path").in("id", ids).eq("tenant_id", caller.tenant_id).not("photo_path", "is", null);
    const urls: Record<string, string> = {};
    for (const row of data || []) {
      const { data: s } = await admin.storage.from(BUCKET).createSignedUrl(row.photo_path, LINK_SECONDS);
      if (s?.signedUrl) urls[row.id] = s.signedUrl;
    }
    return json({ urls, expiresIn: LINK_SECONDS });
  }

  if (action === "prune") {
    if (!["super_admin", "admin"].includes(caller.role)) return json({ error: "Not authorized" }, 403);
    return json({ removed: await prune(caller.tenant_id) });
  }

  return json({ error: "Unknown action" }, 400);
});
