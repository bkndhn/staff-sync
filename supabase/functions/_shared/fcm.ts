// Firebase Cloud Messaging (FCM) sender via the Lovable connector gateway.
// Device tokens live in public.fcm_tokens (server-only table).
// deno-lint-ignore-file no-explicit-any

const GATEWAY_URL = "https://connector-gateway.lovable.dev/firebase_messaging";

export type FcmRecipient = { staffId?: string | null; appUserId?: string | null };
export type FcmPayload = { title: string; body: string; actionUrl?: string };

export function fcmConfigured(): boolean {
  return Boolean(Deno.env.get("LOVABLE_API_KEY") && Deno.env.get("FIREBASE_MESSAGING_API_KEY"));
}

async function sendOne(token: string, p: FcmPayload): Promise<"ok" | "stale" | "error"> {
  const res = await fetch(`${GATEWAY_URL}/v1/projects/_/messages:send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
      "X-Connection-Api-Key": Deno.env.get("FIREBASE_MESSAGING_API_KEY")!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: p.title, body: p.body },
        data: { actionUrl: p.actionUrl || "/" },
        webpush: {
          notification: { icon: "/icon-192.png", badge: "/icon-192.png" },
          fcm_options: { link: p.actionUrl || "/" },
        },
      },
    }),
  });
  if (res.ok) return "ok";
  const text = await res.text();
  if (res.status === 404 || (res.status === 400 && /UNREGISTERED|INVALID_ARGUMENT|registration token/i.test(text))) return "stale";
  console.error(`FCM send failed [${res.status}]: ${text.slice(0, 300)}`);
  return "error";
}

/** Sends to every registered device of the recipients. Returns delivered-to-Firebase count. */
export async function fcmSendTo(admin: any, tenantId: string | null, recipients: FcmRecipient[], payload: FcmPayload): Promise<number> {
  if (!fcmConfigured() || recipients.length === 0) return 0;
  const staffIds = recipients.map((r) => r.staffId).filter(Boolean) as string[];
  const userIds = recipients.map((r) => r.appUserId).filter(Boolean) as string[];
  const rows: any[] = [];
  const base = () => {
    let q = admin.from("fcm_tokens").select("id, token");
    if (tenantId) q = q.eq("tenant_id", tenantId);
    return q;
  };
  if (staffIds.length) rows.push(...((await base().in("staff_id", staffIds)).data || []));
  if (userIds.length) rows.push(...((await base().in("app_user_id", userIds)).data || []));

  let count = 0;
  for (const row of rows) {
    try {
      const r = await sendOne(row.token, payload);
      if (r === "ok") count++;
      else if (r === "stale") await admin.from("fcm_tokens").delete().eq("id", row.id);
    } catch (e) {
      console.error("FCM send error:", (e as Error).message);
    }
  }
  return count;
}
