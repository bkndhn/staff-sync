// AI Insights edge function - uses Lovable AI Gateway (Gemini) to summarize workforce data
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function validateSession(supabase: ReturnType<typeof createClient>, token: string | null) {
  if (!token) return { ok: false, error: "Missing session token" };
  const { data, error } = await supabase
    .from("app_sessions")
    .select("user_id, role, expires_at, is_valid")
    .eq("token", token)
    .eq("is_valid", true)
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Invalid session" };
  if (new Date(data.expires_at as string).getTime() < Date.now()) return { ok: false, error: "Session expired" };
  if (!["admin", "manager"].includes(data.role as string)) return { ok: false, error: "Not authorized" };
  return { ok: true, role: data.role as string };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const sessionCheck = await validateSession(admin, req.headers.get("x-session-token"));
    if (!sessionCheck.ok) {
      return new Response(JSON.stringify({ error: sessionCheck.error }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const { snapshot, question } = body as { snapshot?: unknown; question?: string };

    const systemPrompt = `You are an HR & workforce analytics assistant for a staff management platform.
Given a JSON snapshot of the organization (staff counts, attendance rates, salary totals, locations),
produce concise, actionable insights. Use short bullet points. Highlight anomalies (low attendance,
high absenteeism, salary outliers, location imbalances). If a specific question is provided, answer it directly.
Keep response under 350 words. Use plain markdown.`;

    const userPrompt = question
      ? `Question: ${question}\n\nData snapshot:\n${JSON.stringify(snapshot ?? {}, null, 2)}`
      : `Analyze this workforce snapshot and give me the top 5 insights + 3 recommended actions:\n${JSON.stringify(snapshot ?? {}, null, 2)}`;

    const gwRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: "google/gemini-3.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!gwRes.ok) {
      const errTxt = await gwRes.text();
      const status = gwRes.status;
      let msg = "AI request failed";
      if (status === 429) msg = "AI is rate limited — try again in a moment.";
      else if (status === 402) msg = "AI credits exhausted — add credits in workspace settings.";
      console.error("gateway error", status, errTxt);
      return new Response(JSON.stringify({ error: msg }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const gw = await gwRes.json();
    const text = gw?.choices?.[0]?.message?.content ?? "";

    return new Response(JSON.stringify({ insights: text }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("ai-insights error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message ?? "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
