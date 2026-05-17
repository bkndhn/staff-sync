import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { db } from '../lib/db';
import { offlineSyncService } from '../services/offlineSyncService';
import { punchEventService } from '../services/punchEventService';

export type SyncState = 'online-synced' | 'online-syncing' | 'offline';

export function useOfflineSync() {
  const [syncState, setSyncState] = useState<SyncState>(navigator.onLine ? 'online-synced' : 'offline');
  const [pendingCount, setPendingCount] = useState(0);

  // Re-check pending count periodically and on events
  const updatePendingCount = async () => {
    try {
      const pending = await db.pendingPunches.count();
      setPendingCount(pending);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    const handleOnline = () => {
      setSyncState('online-syncing');
      performSync();
    };
    const handleOffline = () => {
      setSyncState('offline');
      updatePendingCount();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('offline-sync-complete', updatePendingCount);
    
    // Initial sync check
    if (navigator.onLine) {
      performSync();
    } else {
      updatePendingCount();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('offline-sync-complete', updatePendingCount);
    };
  }, []);

  const performSync = async () => {
    if (!navigator.onLine) return;
    setSyncState('online-syncing');

    try {
      // 1. Flush any pending punches UP to Supabase (Uplink)
      await offlineSyncService.flushQueue(async (punch) => {
        // Strip offline-only fields before pushing
        const { id, queuedAt, ...punchData } = punch;
        await punchEventService.insert(punchData as any);
      });
      await updatePendingCount();

      // 2. Pull data DOWN from Supabase (Downlink)
      // Pull Staff
      const { data: staffData } = await supabase.from('staff').select('*');
      if (staffData) {
        await db.staff.clear();
        await db.staff.bulkPut(staffData as any);
      }

      // Pull Face Embeddings
      const { data: faceData } = await supabase.from('face_embeddings').select('*');
      if (faceData) {
        await db.faceEmbeddings.clear();
        await db.faceEmbeddings.bulkPut(faceData as any);
      }

      // Pull Shift Configs
      const { data: shiftConfigData } = await supabase.from('location_shift_config').select('*');
      if (shiftConfigData) {
        await db.locationShiftConfig.clear();
        await db.locationShiftConfig.bulkPut(shiftConfigData as any);
      }

      // We'll skip pulling locations/categories/floors for now unless explicitly requested
      // This is sufficient for the Face Attendance page to work fully offline.

      setSyncState('online-synced');
    } catch (err) {
      console.error('[OfflineSync] Downlink sync failed:', err);
      // Stay in syncing state if it failed so user knows there's an issue, or revert to synced if it's intermittent
      setSyncState('online-synced'); 
    }
  };

  return { syncState, pendingCount, forceSync: performSync };
}
