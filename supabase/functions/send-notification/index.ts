import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { findAppUserForAuth } from "../_shared/caller.ts";
import webPush from "npm:web-push@3.6.7";
import { fcmSendTo } from "../_shared/fcm.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ── Fixed notification templates ─────────────────────────────────────────────
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_YEAR_RE = /^[A-Za-z]{3,9}[ -]?\d{4}$|^\d{4}-\d{2}$/;
const ATTENDANCE_STATUSES = new Set(["Present", "Half Day", "Absent", "Pending Full Day", "Manual Override"]);
const SHIFTS = new Set(["Morning", "Evening", "Both"]);
const PAY_MODES = new Set(["cash", "bank", "upi", "cheque", "neft", "imps", "rtgs", "online"]);

export function buildTemplate(template: unknown, params: any): { title: string; body: string; actionUrl: string } | null {
  const p = params && typeof params === "object" ? params : {};
  switch (template) {
    case "salary_credited": {
      const amount = Number(p.amount);
      const monthYear = typeof p.monthYear === "string" && MONTH_YEAR_RE.test(p.monthYear) ? p.monthYear : null;
      const mode = typeof p.paymentMode === "string" && PAY_MODES.has(p.paymentMode.toLowerCase()) ? p.paymentMode.toUpperCase() : null;
      if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000 || !monthYear) return null;
      return {
        title: "Payroll Credited",
        body: `Your salary of Rs. ${Math.round(amount).toLocaleString("en-IN")} for ${monthYear} has been credited${mode ? ` via ${mode}` : ""}.`,
        actionUrl: "/?tab=salary",
      };
    }
    case "leave_decision": {
      const status = p.status === "approved" || p.status === "rejected" ? p.status : null;
      const date = typeof p.date === "string" && DATE_RE.test(p.date) ? p.date : null;
      if (!status || !date) return null;
      return {
        title: `Leave ${status === "approved" ? "Approved" : "Rejected"}`,
        body: `Your leave on ${date} has been ${status}. Open the app for details.`,
        actionUrl: "/?tab=My%20Portal",
      };
    }
    case "grievance_update": {
      const status = p.status === "resolved" || p.status === "rejected" ? p.status : null;
      if (!status) return null;
      return {
        title: `Issue ${status === "resolved" ? "Resolved" : "Rejected"}`,
        body: `Your issue has been ${status}. Open the app for details.`,
        actionUrl: "/?tab=My%20Portal",
      };
    }
    case "attendance_updated": {
      const date = typeof p.date === "string" && DATE_RE.test(p.date) ? p.date : null;
      const status = typeof p.status === "string" && ATTENDANCE_STATUSES.has(p.status) ? p.status : null;
      const shift = typeof p.shift === "string" && SHIFTS.has(p.shift) ? p.shift : null;
      if (!date || !status) return null;
      return {
        title: "Attendance updated",
        body: `${date}: ${status}${shift ? ` (${shift})` : ""}`,
        actionUrl: "/?tab=My%20Portal",
      };
    }
    default:
      return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
    const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
    if (req.method === "GET") {
      return VAPID_PUBLIC_KEY ? json({ publicKey: VAPID_PUBLIC_KEY }) : json({ error: "Push is not configured" }, 503);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const legacyToken = req.headers.get("x-session-token");
    const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    let caller: any = null;
    if (bearer) {
      const { data: { user } } = await admin.auth.getUser(bearer);
      if (user) {
        caller = await findAppUserForAuth(admin, user, "id, role, tenant_id, is_active");
      }
    } else if (legacyToken) {
      const { data: session } = await admin.from("app_sessions").select("user_id, expires_at, is_valid")
        .eq("token", legacyToken).eq("is_valid", true).maybeSingle();
      if (session && new Date(session.expires_at).getTime() > Date.now()) {
        const { data } = await admin.from("app_users").select("id, role, tenant_id, is_active")
          .eq("id", session.user_id).maybeSingle();
        caller = data;
      }
    }
    if (!caller?.is_active || !["admin", "manager", "supervisor", "floor_supervisor"].includes(caller.role)) {
      return json({ error: "Unauthorized" }, 401);
    }

    const raw = await req.json();
    const { staffId, userId } = raw ?? {};
    // Message text is never taken from the caller: only fixed templates with
    // strictly validated parameters can be sent.
    const built = buildTemplate(raw?.template, raw?.params);
    if (!built) return json({ error: "Unknown or invalid notification template" }, 400);
    const { title, body, actionUrl } = built;
    const icon = "/image.png";

    if (!staffId && !userId) {
      return json({ error: "Missing recipient (staffId or userId required)" }, 400);
    }

    if (staffId) {
      const { data: recipient } = await admin.from("staff").select("id, tenant_id").eq("id", staffId).maybeSingle();
      if (!recipient || recipient.tenant_id !== caller.tenant_id) return json({ error: "Recipient not found" }, 404);
    } else if (userId) {
      const { data: recipient } = await admin.from("app_users").select("id, tenant_id").eq("id", userId).maybeSingle();
      if (!recipient || recipient.tenant_id !== caller.tenant_id) return json({ error: "Recipient not found" }, 404);
    }

    const fcmCount = await fcmSendTo(admin, caller.tenant_id, [{ staffId: staffId || null, appUserId: staffId ? null : userId }], {
      title, body, actionUrl,
    }).catch(() => 0);
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return json({ success: true, count: fcmCount, fcm: fcmCount });
    }
    webPush.setVapidDetails('mailto:admin@staffsync.app', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    let query = admin.from("push_subscriptions").select("*");
    
    if (staffId) {
      query = query.eq("staff_id", staffId).eq("tenant_id", caller.tenant_id);
    } else if (userId) {
      query = query.eq("app_user_id", userId).eq("tenant_id", caller.tenant_id);
    }

    const { data: subs, error } = await query;

    if (error) {
      throw error;
    }

    if (!subs || subs.length === 0) {
      return json({ success: true, message: "No web-push subscriptions for recipient", count: fcmCount, fcm: fcmCount });
    }

    const notificationPayload = JSON.stringify({
      title,
      body,
      icon,
      actionUrl,
    });

    let successCount = 0;
    const errors = [];

    for (const sub of subs) {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      };

      try {
        await webPush.sendNotification(pushSubscription, notificationPayload);
        successCount++;
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          // Subscription expired or invalid, delete it
          await admin.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          errors.push(err.message);
        }
      }
    }

    return json({ 
      success: true, 
      count: successCount + fcmCount,
      fcm: fcmCount,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (err) {
    console.error("send-notification error:", err);
    return json({ error: (err as Error).message ?? "internal_error" }, 500);
  }
});
