import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const esc = (s: string) => String(s).replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // --- caller must be an active admin/manager of the tenant -----------------
    const legacyToken = req.headers.get("x-session-token");
    const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    let caller: any = null;
    if (bearer) {
      const { data: { user } } = await admin.auth.getUser(bearer);
      if (user) {
        let profile = await admin.from("app_users").select("id, role, tenant_id, is_active, full_name").eq("auth_id", user.id).maybeSingle();
        if (!profile.data && user.email) profile = await admin.from("app_users").select("id, role, tenant_id, is_active, full_name").eq("email", user.email).maybeSingle();
        caller = profile.data;
      }
    } else if (legacyToken) {
      const { data: session } = await admin.from("app_sessions").select("user_id, expires_at, is_valid")
        .eq("token", legacyToken).eq("is_valid", true).maybeSingle();
      if (session && new Date(session.expires_at).getTime() > Date.now()) {
        const { data } = await admin.from("app_users").select("id, role, tenant_id, is_active, full_name")
          .eq("id", session.user_id).maybeSingle();
        caller = data;
      }
    }
    if (!caller?.is_active || !["admin", "manager"].includes(caller.role)) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const kind = body?.kind === "compliance" ? "compliance" : "payslip";
    const staffId = typeof body?.staffId === "string" ? body.staffId : "";
    const month = Number(body?.month);
    const year = Number(body?.year);
    const url = typeof body?.url === "string" ? body.url : "";
    const documentName = typeof body?.documentName === "string" ? body.documentName.slice(0, 120) : "";

    if (!staffId || !Number.isInteger(month) || month < 0 || month > 11 || !Number.isInteger(year)) {
      return json({ error: "staffId, month (0-11) and year are required" }, 400);
    }

    const { data: recipient } = await admin
      .from("staff")
      .select("id, name, email, tenant_id")
      .eq("id", staffId)
      .maybeSingle();
    if (!recipient || recipient.tenant_id !== caller.tenant_id) return json({ error: "Recipient not found" }, 404);

    const period = `${MONTHS[month]} ${year}`;
    const title = kind === "compliance"
      ? `Compliance document ready — ${period}`
      : `Payslip available — ${period}`;
    const message = kind === "compliance"
      ? `${documentName || "A statutory document"} for ${period} has been generated for you.`
      : `Your payslip for ${period} is ready. Open the Payroll tab in your staff portal to download it.`;

    // --- in-app notification (best effort) ------------------------------------
    let inApp = false;
    try {
      const { error } = await admin.from("staff_notifications").insert({
        staff_id: recipient.id,
        tenant_id: recipient.tenant_id,
        title,
        message,
        type: kind === "compliance" ? "compliance_ready" : "payslip_ready",
        action_url: url || "payslips",
      });
      inApp = !error;
    } catch { /* table may not exist in every environment */ }

    // --- email ---------------------------------------------------------------
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const FROM = Deno.env.get("PAYSLIP_EMAIL_FROM") || "Payroll <onboarding@resend.dev>";
    let email: "sent" | "no_address" | "not_configured" | "failed" = "not_configured";

    if (!recipient.email) {
      email = "no_address";
    } else if (RESEND_API_KEY) {
      const html = `
        <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:520px">
          <h2 style="color:#1d4ed8;margin:0 0 8px">${esc(title)}</h2>
          <p style="color:#334155;font-size:14px">Hi ${esc(recipient.name || "there")},</p>
          <p style="color:#334155;font-size:14px">${esc(message)}</p>
          ${url ? `<p><a href="${esc(url)}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:14px">View document</a></p>
          <p style="color:#64748b;font-size:12px">This private link expires automatically. Please do not forward it.</p>` : ""}
        </div>`;
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM, to: [recipient.email], subject: title, html }),
      });
      email = res.ok ? "sent" : "failed";
    }

    return json({ ok: true, inApp, email });
  } catch {
    return json({ error: "Unexpected error" }, 500);
  }
});
