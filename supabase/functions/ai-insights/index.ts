import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
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
  if (!["admin", "manager", "super_admin"].includes(data.role as string)) return { ok: false, error: "Not authorized" };
  return { ok: true, role: data.role as string };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const sessionCheck = await validateSession(supabase, req.headers.get("x-session-token"));
    if (!sessionCheck.ok) {
      return new Response(JSON.stringify({ error: sessionCheck.error }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Parse request
    const body = await req.json().catch(() => ({}));
    const tenantId = body.tenantId;

    if (!tenantId) {
      return new Response(JSON.stringify({ error: 'tenantId is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 1. Fetch data for analysis
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateStr = thirtyDaysAgo.toISOString();

    const [staffRes, attendanceRes, advancesRes] = await Promise.all([
      supabase.from('app_users').select('id, full_name, is_active').eq('tenant_id', tenantId).eq('is_active', true),
      supabase.from('attendance').select('staff_id, is_late, is_uninformed_absence, is_half_day').eq('tenant_id', tenantId).gte('date', dateStr),
      supabase.from('advances').select('staff_id, amount, status').eq('tenant_id', tenantId).eq('status', 'active')
    ]);

    const staffList = staffRes.data || [];
    const attendance = attendanceRes.data || [];
    const advances = advancesRes.data || [];

    const insights = [];

    // Analyze Attendance
    for (const staff of staffList) {
      const staffAtt = attendance.filter(a => a.staff_id === staff.id);
      
      const lateCount = staffAtt.filter(a => a.is_late).length;
      if (lateCount >= 4) {
        insights.push({
          tenant_id: tenantId,
          type: 'attendance',
          insight_text: `${staff.full_name} has been late ${lateCount} times in the last 30 days.`,
          severity: lateCount >= 6 ? 'critical' : 'warning',
          staff_id: staff.id
        });
      }

      const uninformedCount = staffAtt.filter(a => a.is_uninformed_absence).length;
      if (uninformedCount >= 2) {
        insights.push({
          tenant_id: tenantId,
          type: 'attendance',
          insight_text: `${staff.full_name} has had ${uninformedCount} uninformed absences in the last 30 days.`,
          severity: 'warning',
          staff_id: staff.id
        });
      }
    }

    // Analyze Payroll / Advances
    let activeAdvancesCount = advances.length;
    
    if (activeAdvancesCount > staffList.length * 0.3) {
      insights.push({
        tenant_id: tenantId,
        type: 'payroll',
        insight_text: `High volume of active advance requests (${activeAdvancesCount} active across ${staffList.length} staff).`,
        severity: 'info'
      });
    }

    if (insights.length === 0) {
       insights.push({
          tenant_id: tenantId,
          type: 'general',
          insight_text: `All attendance metrics are looking good for the past 30 days. No anomalies detected.`,
          severity: 'info'
       });
    }

    // Delete old insights
    await supabase.from('ai_insights').delete().eq('tenant_id', tenantId);

    // Insert new insights
    if (insights.length > 0) {
      await supabase.from('ai_insights').insert(insights);
    }

    return new Response(JSON.stringify({ success: true, count: insights.length }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
