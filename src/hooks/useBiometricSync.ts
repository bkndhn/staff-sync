import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { punchEventService } from '../services/punchEventService';
import { attendanceService } from '../services/attendanceService';
import { useUserPreference } from './useUserPreference';
import { resolveActiveRule, calculateAttendanceStatus } from '../utils/attendanceRules';
import { Staff, LocationDesignationShiftConfig, Designation, LocationShiftConfig, KioskSettings } from '../types';
import { formatTime12h, ShiftWindows } from '../services/shiftService';

import { db } from '../lib/db';

export function useBiometricSync(
  staffList: Staff[],
  patchAttendance: (updated: any) => void
) {
  const [apiConfig] = useUserPreference<any>('biometricConfig', null);
  const [autoSyncEnabled] = useUserPreference<boolean>('biometricAutoSync', false);
  const isSyncing = useRef(false);

  useEffect(() => {
    if (!autoSyncEnabled || !apiConfig?.serverUrl || !apiConfig?.apiKey) return;

    const pullAndAggregate = async () => {
      if (isSyncing.current) return;
      isSyncing.current = true;

      try {
        console.log('[BiometricSync] Starting background pull...');
        
        // Fetch rules configs from local DB
        const locConfigs = await db.locationShiftConfig.toArray().catch(() => []);
        const designations = await db.designations.toArray().catch(() => []);
        const locDesigConfigs = await db.locationDesignationShiftConfig.toArray().catch(() => []);
        
        // We can fetch global settings from appSettingsService
        // But since this is a background sync, we can just use defaults if it fails
        const { appSettingsService } = await import('../services/appSettingsService');
        const kioskSettings = await appSettingsService.getKioskGlobalSettings().catch(() => null);
        
        // 1. Trigger Cloud Pull
        const { data, error } = await supabase.functions.invoke('device-pull', {
          body: {
            provider: apiConfig.provider,
            serverUrl: apiConfig.serverUrl,
            apiKey: apiConfig.apiKey,
            location: apiConfig.locationCode || undefined,
          },
        });

        if (error) {
          console.error('[BiometricSync] Cloud pull failed', error);
          return;
        }

        // If no new punches inserted, we don't need to recalculate
        if (!data || data.inserted === 0) {
          console.log('[BiometricSync] No new punches found.');
          return;
        }

        console.log(`[BiometricSync] Inserted ${data.inserted} new punches. Aggregating attendance...`);

        // 2. Fetch today's punches
        const today = new Date().toISOString().split('T')[0];
        // We only aggregate today's punches to save API calls. Cloud pull usually gets today's data unless 'since' is passed.
        const { data: allTodayPunches } = await supabase
          .from('punch_events')
          .select('*')
          .eq('date', today)
          .order('event_time', { ascending: true });

        if (!allTodayPunches || allTodayPunches.length === 0) return;

        // Group by staffId
        const punchesByStaff = new Map<string, typeof allTodayPunches>();
        for (const p of allTodayPunches) {
          if (!punchesByStaff.has(p.staff_id)) punchesByStaff.set(p.staff_id, []);
          punchesByStaff.get(p.staff_id)!.push(p);
        }

        // 3. Recalculate attendance for each staff member
        for (const [staffId, punches] of punchesByStaff.entries()) {
          const s = staffList.find(x => x.id === staffId);
          if (!s) continue; // Staff not found or deleted

          const firstPunch = punches[0];
          const lastPunch = punches[punches.length - 1];

          // Determine arrival/leaving
          // In real biometric devices, sometimes kind is unknown, so we assume first punch is IN and last is OUT if > 1
          const arrivalTime = firstPunch.event_time.substring(0, 5); // HH:mm
          const leavingTime = punches.length > 1 ? lastPunch.event_time.substring(0, 5) : undefined;

          const currentLocConfig = locConfigs.find(lc => lc.locationName === s.location);
          const resolved = resolveActiveRule(s, currentLocConfig, designations, locDesigConfigs, kioskSettings);
          
          const { status, attendanceValue } = calculateAttendanceStatus(
            arrivalTime || undefined,
            leavingTime || undefined,
            resolved.rules
          );

          // Update attendance record
          const isSunday = new Date(today).getDay() === 0;

          const upsertPayload = {
            staffId: s.id,
            date: today,
            status,
            attendanceValue,
            isSunday,
            isPartTime: false,
            staffName: s.name,
            shift: s.shift,
            location: s.location,
            arrivalTime: arrivalTime,
            leavingTime: leavingTime,
            appliedRuleType: resolved.appliedRuleType,
            appliedRuleDetails: resolved.rules,
            isUninformed: false,
            source: 'cloud_api'
          };

          const saved = await attendanceService.upsert(upsertPayload);
          if (saved) {
             patchAttendance(saved); // Update UI instantly
          }
        }
        
        console.log('[BiometricSync] Aggregation complete.');
      } catch (err) {
        console.error('[BiometricSync] Critical error during background sync:', err);
      } finally {
        isSyncing.current = false;
      }
    };

    // Run immediately
    pullAndAggregate();

    // Poll every 15 minutes
    const interval = setInterval(pullAndAggregate, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [autoSyncEnabled, apiConfig, staffList, patchAttendance]);
}
