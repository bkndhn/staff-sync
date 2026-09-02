// Shared webhook delivery helper: signs, sends and logs every event.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export const WEBHOOK_EVENTS = [
  "payroll.run.generated",
  "payroll.run.approved",
  "compliance.export.generated",
  "payslip.issued",
  "test.ping",
] as const;

export type WebhookEvent = typeof WEBHOOK_EVENTS[number];

const hmacSha256Hex = async (secret: string, message: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
};

export interface DeliveryResult {
  endpointId: string;
  url: string;
  ok: boolean;
  statusCode: number | null;
  error: string | null;
  durationMs: number;
}

/** Deliver one event to every active endpoint of a tenant subscribed to it. */
export const dispatchWebhook = async (
  admin: Admin,
  tenantId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<DeliveryResult[]> => {
  const { data: endpoints } = await admin
    .from("webhook_endpoints")
    .select("id, url, secret, events, is_active")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  const targets = (endpoints || []).filter((e: any) => (e.events || []).includes(event));
  const results: DeliveryResult[] = [];

  for (const endpoint of targets) {
    const body = JSON.stringify({
      id: crypto.randomUUID(),
      event,
      created_at: new Date().toISOString(),
      tenant_id: tenantId,
      data: payload,
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = await hmacSha256Hex(endpoint.secret, `${timestamp}.${body}`);
    const started = Date.now();

    let statusCode: number | null = null;
    let ok = false;
    let error: string | null = null;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Event": event,
          "X-Webhook-Timestamp": timestamp,
          "X-Webhook-Signature": `sha256=${signature}`,
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);
      statusCode = res.status;
      ok = res.ok;
      if (!ok) error = `Endpoint responded ${res.status}`;
    } catch (e) {
      error = e instanceof Error ? e.message : "Delivery failed";
    }

    const durationMs = Date.now() - started;
    results.push({ endpointId: endpoint.id, url: endpoint.url, ok, statusCode, error, durationMs });

    await admin.from("webhook_deliveries").insert({
      tenant_id: tenantId,
      endpoint_id: endpoint.id,
      event,
      payload,
      status_code: statusCode,
      ok,
      error,
      duration_ms: durationMs,
    });

    await admin.from("webhook_endpoints").update({
      last_delivery_at: new Date().toISOString(),
      failure_count: ok ? 0 : (endpoint.failure_count || 0) + 1,
    }).eq("id", endpoint.id);
  }

  return results;
};
