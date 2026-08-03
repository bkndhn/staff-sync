import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webPush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { title, body, staffId, userId, actionUrl, icon } = await req.json();

    if (!staffId && !userId) {
      return json({ error: "Missing recipient (staffId or userId required)" }, 400);
    }

    const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
    const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
    
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return json({ error: "VAPID keys not configured on server" }, 500);
    }

    webPush.setVapidDetails(
      'mailto:admin@staffsync.app',
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    );

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let query = admin.from("push_subscriptions").select("*");
    
    if (staffId) {
      query = query.eq("staff_id", staffId);
    } else if (userId) {
      query = query.eq("app_user_id", userId);
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
