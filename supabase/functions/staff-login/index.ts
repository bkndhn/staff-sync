// Staff pre-auth lookup + device-bind.
// The staff table is locked down to service_role only, so client cannot query it
// directly. This function validates the mobile + joined_date credential pair,
// performs the device-binding check, and returns a limited staff record.
//
// POST /functions/v1/staff-login
// Body: { contactNumber: string, joinedDate: 'DDMMYYYY', deviceFingerprint: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { contactNumber, joinedDate, deviceFingerprint } = await req.json();

    if (!contactNumber || !joinedDate || !deviceFingerprint) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: rows, error } = await admin
      .from("staff")
      .select("id, name, location, floor, designation, type, joined_date, device_id, is_active, contact_number")
      .eq("contact_number", String(contactNumber).trim());

    if (error || !rows || rows.length === 0) {
      return new Response(JSON.stringify({ error: "invalid_credentials" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const day = joinedDate.substring(0, 2);
    const month = joinedDate.substring(2, 4);
    const year = joinedDate.substring(4, 8);

    const match = rows.find((s: any) => {
      if (!s.joined_date) return false;
      const d = new Date(s.joined_date);
      if (isNaN(d.getTime())) return false;
      return (
        String(d.getDate()).padStart(2, "0") === day &&
        String(d.getMonth() + 1).padStart(2, "0") === month &&
        String(d.getFullYear()) === year
      );
    });

    if (!match || !match.is_active) {
      return new Response(JSON.stringify({ error: "invalid_credentials" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!match.device_id) {
      await admin.from("staff").update({ device_id: deviceFingerprint }).eq("id", match.id);
    } else if (match.device_id !== deviceFingerprint) {
      return new Response(JSON.stringify({ error: "device_locked" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      staff: {
        id: match.id,
        name: match.name,
        location: match.location,
        floor: match.floor,
        designation: match.designation,
        type: match.type,
      },
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("staff-login error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message ?? "internal_error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
