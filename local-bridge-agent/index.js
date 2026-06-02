require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const ZKLib = require('node-zklib');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SYNC_INTERVAL_MS = process.env.SYNC_INTERVAL_MS || 30000;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function syncDevice(location) {
  if (!location.device_ip) return;
  
  console.log(`\n🔄 [${location.display_name}] Attempting connection to eSSL Device at ${location.device_ip}:${location.device_port || 4370}...`);

  let zkInstance = new ZKLib({
    ip: location.device_ip,
    port: location.device_port || 4370,
    inport: 5200,
    timeout: 10000
  });

  try {
    await zkInstance.createSocket();
    
    console.log(`✅ [${location.display_name}] Connected successfully!`);
    
    // Fetch users (to map device ID to staff ID if needed, though we rely on Supabase staff.device_id)
    // Fetch attendances
    const logs = await zkInstance.getAttendances();
    console.log(`📊 [${location.display_name}] Found ${logs.data.length} total attendance records on device.`);

    const lastSyncTime = location.last_sync_time ? new Date(location.last_sync_time).getTime() : 0;
    
    let newLogs = [];
    for (const log of logs.data) {
      const logTime = new Date(log.recordTime).getTime();
      if (logTime > lastSyncTime) {
        newLogs.push(log);
      }
    }

    if (newLogs.length === 0) {
      console.log(`ℹ️ [${location.display_name}] No new records since last sync.`);
    } else {
      console.log(`📥 [${location.display_name}] Processing ${newLogs.length} NEW records...`);
      
      // 1. Fetch all staff for this location to create a fast memory map
      const { data: staffList, error: staffError } = await supabase
        .from('staff')
        .select('id, device_id')
        .eq('location', location.display_name)
        .not('device_id', 'is', null);

      if (staffError || !staffList) {
        console.error(`❌ [${location.display_name}] Failed to fetch staff mappings:`, staffError);
        return;
      }

      // device_id (eSSL ID) -> supabase UUID
      const staffMap = new Map(staffList.map(s => [s.device_id.toString(), s.id]));
      
      // 2. Prepare bulk insert array
      const punchEvents = [];
      let unknownCount = 0;

      for (const log of newLogs) {
        const staffId = staffMap.get(log.deviceUserId.toString());
        
        if (!staffId) {
          unknownCount++;
          continue;
        }

        punchEvents.push({
          staff_id: staffId,
          punch_time: new Date(log.recordTime).toISOString(),
          direction: 'unknown', // eSSL cloud app resolves IN/OUT automatically
          device_name: `eSSL (${location.device_ip})`,
          is_manual: false
        });
      }

      if (unknownCount > 0) {
        console.warn(`⚠️ [${location.display_name}] Skipped ${unknownCount} records (Unknown device user ID). Ensure all staff have their device IDs registered in the app.`);
      }

      // 3. Bulk insert to Supabase for high performance
      if (punchEvents.length > 0) {
        const { error: insertError } = await supabase.from('punch_events').insert(punchEvents);
        
        if (insertError) {
          console.error(`❌ [${location.display_name}] Bulk insert failed:`, insertError.message);
          return; // Abort so last_sync_time is not updated
        } else {
          console.log(`✅ [${location.display_name}] Successfully synced ${punchEvents.length} punches to cloud.`);
        }
      } else {
        console.log(`ℹ️ [${location.display_name}] All new records were for unknown users. Nothing inserted.`);
      }
    }

    // Update last sync time
    const { error: updateError } = await supabase
      .from('locations')
      .update({ last_sync_time: new Date().toISOString() })
      .eq('id', location.id);
      
    if (updateError) {
      console.error(`❌ [${location.display_name}] Failed to update last_sync_time:`, updateError.message);
    } else {
      console.log(`✅ [${location.display_name}] Sync complete and timestamp updated.`);
    }

  } catch (e) {
    console.error(`❌ [${location.display_name}] Connection/Sync Error:`, e.message || e);
  } finally {
    try {
      await zkInstance.disconnect();
    } catch (err) {}
  }
}

async function startSyncCycle() {
  console.log("=== 🚀 Staff Sync: Local eSSL Bridge Agent Started ===");
  console.log(`Polling interval: ${SYNC_INTERVAL_MS / 1000} seconds\n`);

  while (true) {
    try {
      let query = supabase
        .from('locations')
        .select('*')
        .eq('is_active', true)
        .not('device_ip', 'is', null);

      if (process.env.LOCATION_NAME) {
        query = query.eq('display_name', process.env.LOCATION_NAME);
      }

      const { data: locations, error } = await query;

      if (error) {
        console.error("Database fetch error:", error);
      } else {
        if (locations.length === 0) {
          console.log("ℹ️ No locations with a configured 'device_ip' found. Waiting...");
        } else {
          for (const location of locations) {
            await syncDevice(location);
          }
        }
      }
    } catch (err) {
      console.error("Critical loop error:", err);
    }
    
    // Wait for the next polling cycle
    await new Promise(resolve => setTimeout(resolve, SYNC_INTERVAL_MS));
  }
}

startSyncCycle();
