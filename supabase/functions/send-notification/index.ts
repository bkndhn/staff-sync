import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webPush from "npm:web-push@3.6.7";

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
        let profile = await admin.from("app_users").select("id, role, tenant_id, is_active").eq("auth_id", user.id).maybeSingle();
        if (!profile.data && user.email) profile = await admin.from("app_users").select("id, role, tenant_id, is_active").eq("email", user.email).maybeSingle();
        caller = profile.data;
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

    const { title, body, staffId, userId, actionUrl, icon } = await req.json();

    if (!staffId && !userId) {
      return json({ error: "Missing recipient (staffId or userId required)" }, 400);
    }

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return json({ error: "VAPID keys not configured on server" }, 500);
    }

    webPush.setVapidDetails(
      'mailto:admin@staffsync.app',
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    );

    if (staffId) {
      const { data: recipient } = await admin.from("staff").select("id, tenant_id").eq("id", staffId).maybeSingle();
      if (!recipient || recipient.tenant_id !== caller.tenant_id) return json({ error: "Recipient not found" }, 404);
    } else if (userId) {
      const { data: recipient } = await admin.from("app_users").select("id, tenant_id").eq("id", userId).maybeSingle();
      if (!recipient || recipient.tenant_id !== caller.tenant_id) return json({ error: "Recipient not found" }, 404);
    }

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
      return json({ success: true, message: "No active subscriptions for recipient", count: 0 });
    }

    const notificationPayload = JSON.stringify({
      title: title || "New Notification",
      body: body || "",
      icon: icon || "/image.png",
      actionUrl: actionUrl || "/"
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
      count: successCount,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (err) {
    console.error("send-notification error:", err);
    return json({ error: (err as Error).message ?? "internal_error" }, 500);
  }
});
