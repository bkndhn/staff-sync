// Firebase Cloud Messaging (FCM) sender via the Lovable connector gateway.
// Device tokens live in public.fcm_tokens (server-only table).
// deno-lint-ignore-file no-explicit-any

const GATEWAY_URL = "https://connector-gateway.lovable.dev/firebase_messaging";

export type FcmRecipient = { staffId?: string | null; appUserId?: string | null };
export type FcmPayload = { title: string; body: string; actionUrl?: string };
/** Alert groups a person can mute on their phones (stored in fcm_tokens.muted). */
export type MuteKind = "punch" | "reminder" | "report";

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

const chunk = <T>(list: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

/**
 * Sends to every registered device of the recipients (skipping phones that muted `kind`).
 * Returns how many devices Firebase accepted the alert for.
 */
export async function fcmSendTo(
  admin: any,
  tenantId: string | null,
  recipients: FcmRecipient[],
  payload: FcmPayload,
  kind?: MuteKind,
): Promise<number> {
  if (!fcmConfigured() || recipients.length === 0) return 0;
  const staffIds = [...new Set(recipients.map((r) => r.staffId).filter(Boolean) as string[])];
  const userIds = [...new Set(recipients.map((r) => r.appUserId).filter(Boolean) as string[])];
  const rows: any[] = [];
  const base = () => {
    let q = admin.from("fcm_tokens").select("id, token, muted");
    if (tenantId) q = q.eq("tenant_id", tenantId);
    return q;
  };
  for (const ids of chunk(staffIds, 200)) rows.push(...((await base().in("staff_id", ids)).data || []));
  for (const ids of chunk(userIds, 200)) rows.push(...((await base().in("app_user_id", ids)).data || []));
  const targets = rows.filter((r) => !(kind && Array.isArray(r.muted) && r.muted.includes(kind)));

  let count = 0;
  for (const batch of chunk(targets, 20)) {
    await Promise.all(batch.map(async (row) => {
      try {
        const r = await sendOne(row.token, payload);
        if (r === "ok") count++;
        else if (r === "stale") await admin.from("fcm_tokens").delete().eq("id", row.id);
      } catch (e) {
        console.error("FCM send error:", (e as Error).message);
      }
    }));
  }
  return count;
}
