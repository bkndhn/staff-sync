/**
 * useOfflineSync — React hook
 * Listens for network status changes using @capacitor/network
 * and automatically triggers sync when connection is restored.
 */
import { useEffect, useState, useCallback } from 'react';
import { Network } from '@capacitor/network';
import { syncPendingPunches, offlineDbService } from '../services/offlineDb';

export interface SyncStatus {
  isOnline: boolean;
  pendingCount: number;
  lastSyncTime: string | null;
  isSyncing: boolean;
  lastSyncResult: { synced: number; failed: number } | null;
}

export function useOfflineSync() {
  const [status, setStatus] = useState<SyncStatus>({
    isOnline: true,
    pendingCount: 0,
    lastSyncTime: null,
    isSyncing: false,
    lastSyncResult: null,
  });

  const refreshPendingCount = useCallback(async () => {
    const count = await offlineDbService.getPendingCount();
    setStatus(prev => ({ ...prev, pendingCount: count }));
  }, []);

  const runSync = useCallback(async () => {
    setStatus(prev => ({ ...prev, isSyncing: true }));
    try {
      const result = await syncPendingPunches();
      const count = await offlineDbService.getPendingCount();
      setStatus(prev => ({
        ...prev,
        isSyncing: false,
        pendingCount: count,
        lastSyncTime: new Date().toLocaleTimeString('en-GB'),
        lastSyncResult: result,
      }));
    } catch (e) {
      setStatus(prev => ({ ...prev, isSyncing: false }));
    }
  }, []);

  useEffect(() => {
    let removeListener: (() => void) | null = null;

    const setup = async () => {
      // Get initial network status
      const netStatus = await Network.getStatus();
      setStatus(prev => ({ ...prev, isOnline: netStatus.connected }));

      // If online at startup, sync any queued punches
      if (netStatus.connected) {
        refreshPendingCount();
        runSync();
      }

      // Listen for network changes
      const handle = await Network.addListener('networkStatusChange', async (networkStatus) => {
        const online = networkStatus.connected;
        setStatus(prev => ({ ...prev, isOnline: online }));

        if (online) {
          console.log('[Network] Connection restored — syncing offline punches...');
          await runSync();
        } else {
          console.log('[Network] Connection lost — punches will be saved locally.');
          refreshPendingCount();
        }
      });

      removeListener = () => handle.remove();
    };

    setup();

    // Poll pending count every 30s as a fallback
    const interval = setInterval(refreshPendingCount, 30000);

    return () => {
      removeListener?.();
      clearInterval(interval);
    };
  }, [refreshPendingCount, runSync]);

  return { status, runSync };
}
