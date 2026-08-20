import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { contactNumber, doj, newPassword, tenantSlug, managerPin } = await req.json();

    if (!contactNumber || !doj || !newPassword || !tenantSlug || !managerPin) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const admin = createClient(supabaseUrl, supabaseKey);

    // Get tenant ID
    const { data: tenant } = await admin
      .from("tenants")
      .select("id, staff_device_lock_enabled")
      .eq("slug", tenantSlug)
      .single();

    if (!tenant) {
      return new Response(JSON.stringify({ error: "Invalid organization" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (tenant.staff_device_lock_enabled !== false) {
       return new Response(JSON.stringify({ error: "Self-service password reset is disabled for this organization because strict device binding is enabled." }), {
         status: 403,
         headers: { ...corsHeaders, "Content-Type": "application/json" },
       });
    }

    // Format DOJ to match DB format (assuming YYYY-MM-DD from the user, wait, UI asks for DDMMYYYY)
    // The UI asks for DDMMYYYY: e.g., "15081995"
    if (doj.length !== 8) {
      return new Response(JSON.stringify({ error: "Invalid Date format, expected DDMMYYYY" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const day = doj.substring(0, 2);
    const month = doj.substring(2, 4);
    const year = doj.substring(4, 8);
    const formattedDoj = `${year}-${month}-${day}`;

    // Find staff
    const { data: staffMatch } = await admin
      .from("staff")
      .select("id, is_active, reset_pin, reset_pin_expires_at")
      .eq("tenant_id", tenant.id)
      .eq("contact_number", contactNumber)
      .eq("joined_date", formattedDoj)
      .maybeSingle();

    if (!staffMatch || !staffMatch.is_active) {
      return new Response(JSON.stringify({ error: "No active staff member found matching those details" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate Manager PIN
    if (staffMatch.reset_pin !== managerPin) {
      return new Response(JSON.stringify({ error: "Invalid Manager PIN" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!staffMatch.reset_pin_expires_at || new Date(staffMatch.reset_pin_expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Manager PIN has expired. Please ask your manager for a new one." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(newPassword, salt);

    // Update staff record
    await admin
      .from("staff")
      .update({
        password_hash,
        must_change_password: false,
        password_updated_at: new Date().toISOString(),
        reset_pin: null, // Clear the PIN after use
        reset_pin_expires_at: null,
      })
      .eq("id", staffMatch.id);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
