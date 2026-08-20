import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("OK", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const sn = url.searchParams.get("SN");
    if (!sn) {
      return new Response("Missing SN", { status: 400 });
    }

    // Basic routing
    const pathname = url.pathname;
    
    // GET /iclock/cdata -> initialization / config pull
    if (req.method === "GET" && pathname.endsWith("/iclock/cdata")) {
      // ZKTeco devices expect config string
      // "GET OPTION FROM: " tells the device what settings to use
      const config = [
        "GET OPTION FROM: " + sn,
        "Stamp=9999",
        "OpStamp=9999",
        "ErrorDelay=60",
        "Delay=30",
        "TransTimes=00:00;14:00",
        "TransInterval=1",
        "TransFlag=1111000000",
        "Realtime=1",
        "Encrypt=0"
      ].join("\n");
      
      // Update device heartbeat
      await admin.from("device_status").upsert({
        device_id: sn,
        last_seen_at: new Date().toISOString(),
        status: "online"
      }, { onConflict: "device_id,tenant_id" });

      return new Response(config, {
        headers: { ...corsHeaders, "Content-Type": "text/plain" }
      });
    }
    
    // GET /iclock/getrequest -> command polling
    if (req.method === "GET" && pathname.endsWith("/iclock/getrequest")) {
      // Acknowledge polling but we have no commands right now
      await admin.from("device_status").upsert({
        device_id: sn,
        last_seen_at: new Date().toISOString(),
        status: "online"
      }, { onConflict: "device_id,tenant_id" });

      return new Response("OK", {
        headers: { ...corsHeaders, "Content-Type": "text/plain" }
      });
    }

    // POST /iclock/cdata -> receiving punches
    if (req.method === "POST" && pathname.endsWith("/iclock/cdata")) {
      const body = await req.text();
      // Body format: PIN\tTime\tState\tVerifyMethod\tWorkCode\tReserved
      const lines = body.split("\n").map(l => l.trim()).filter(l => l.length > 0);
      
      let inserted = 0;
      const affectedStaffDates = new Map<string, { staffName: string; location: string; floor: string | null; tenantId: string | null }>();
      
      for (const line of lines) {
        const parts = line.split("\t");
        if (parts.length >= 2) {
          const pin = parts[0];
          const timeStr = parts[1]; // format: YYYY-MM-DD HH:MM:SS
          
          if (!timeStr) continue;
          
          const t = new Date(timeStr);
          if (isNaN(t.getTime())) continue;

          // Find the staff member by pin (device_id)
          const { data: staff } = await admin.from("staff").select("id, name, location, floor, tenant_id").eq("device_id", pin).maybeSingle();
          if (!staff) continue; // Unknown staff
          
          const date = timeStr.split(" ")[0]; // YYYY-MM-DD
          const time = timeStr.split(" ")[1]; // HH:MM:SS

          // Basic deduplication
          const { data: existing } = await admin.from("punch_events")
            .select("event_time")
            .eq("staff_id", staff.id)
            .eq("date", date)
            .eq("event_time", time)
            .maybeSingle();
            
          if (existing) continue;

          await admin.from("punch_events").insert({
            staff_id: staff.id,
            staff_name: staff.name,
            location: staff.location,
            date,
            event_time: time,
            kind: "in",
            source: "device-push",
            device_label: sn,
            tenant_id: staff.tenant_id,
          });
          
          inserted++;

          // Track for auto-aggregation
          const key = `${staff.id}|${date}`;
          if (!affectedStaffDates.has(key)) {
            affectedStaffDates.set(key, {
              staffName: staff.name,
              location: staff.location,
              floor: staff.floor || null,
              tenantId: staff.tenant_id || null,
            });
          }
        }
      }

      // --- Auto-Attendance Aggregation ---
      let attendanceUpdated = 0;
      for (const [key, info] of affectedStaffDates) {
        const [staffId, date] = key.split("|");
        try {
          const { data: allPunches } = await admin.from("punch_events")
            .select("event_time")
            .eq("staff_id", staffId)
            .eq("date", date)
            .order("event_time", { ascending: true });

          if (allPunches && allPunches.length > 0) {
            const arrTime = allPunches[0].event_time.slice(0, 5);
            const hasTwoPunches = allPunches.length > 1;
            const leavTime = hasTwoPunches ? allPunches[allPunches.length - 1].event_time.slice(0, 5) : null;
            const status = hasTwoPunches ? "Present" : "Pending Full Day";

            await admin.from("attendance").upsert({
              staff_id: staffId,
              staff_name: info.staffName,
              date,
              status,
              attendance_value: 1.0,
              location: info.location,
              floor: info.floor,
              arrival_time: arrTime,
              leaving_time: leavTime,
              is_part_time: false,
              ...(info.tenantId ? { tenant_id: info.tenantId } : {}),
            }, { onConflict: "staff_id,date,is_part_time" });
            attendanceUpdated++;
          }
        } catch (ae) {
          console.error("iClock auto-attendance aggregation failed:", ae);
        }
      }

      await admin.from("device_status").upsert({
        device_id: sn,
        last_seen_at: new Date().toISOString(),
        status: "online",
      }, { onConflict: "device_id,tenant_id" });

      return new Response(`OK\n${inserted}`, {
        headers: { ...corsHeaders, "Content-Type": "text/plain" }
      });
    }
    
    // Fallback
    return new Response("OK", { headers: corsHeaders });
  } catch (e: any) {
    console.error("iclock error:", e);
    return new Response(e?.message ?? "Internal error", { status: 500 });
  }
});
