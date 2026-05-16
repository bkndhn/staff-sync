import { db } from '../lib/db';

export interface QueuedPunch {
  id: string; // unique local uuid/timestamp-based id
  staffId: string;
  date: string;
  status: 'Present' | 'Half Day' | 'Absent';
  attendanceValue: number;
  isSunday?: boolean;
  isPartTime?: boolean;
  staffName?: string;
  shift?: 'Morning' | 'Evening' | 'Both';
  location?: string;
  salary?: number;
  salaryOverride?: boolean;
  arrivalTime?: string;
  leavingTime?: string;
  queuedAt: number; // timestamp
}

export const offlineSyncService = {
  /** Enqueue an unsynced punch into the local store */
  async enqueuePunch(punchData: Omit<QueuedPunch, 'id' | 'queuedAt'>): Promise<QueuedPunch> {
    const queuedPunch: QueuedPunch = {
      ...punchData,
      id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      queuedAt: Date.now()
    };

    await db.pendingPunches.put(queuedPunch);
    console.log(`[OfflineSync] Enqueued punch locally for staff: ${queuedPunch.staffId}`);
    return queuedPunch;
  },

  /** Retrieve all pending unsynced punches ordered by queuedAt */
  async getPendingPunches(): Promise<QueuedPunch[]> {
    try {
      const results = await db.pendingPunches.orderBy('queuedAt').toArray();
      return results;
    } catch (err) {
      console.warn('[OfflineSync] Could not fetch pending punches (IDB blocked/unsupported):', err);
      return [];
    }
  },

  /** Remove a specific punch from the queue once successfully synced */
  async removePunch(id: string): Promise<void> {
    await db.pendingPunches.delete(id);
  },

  /** Clear the entire offline queue */
  async clearQueue(): Promise<void> {
    await db.pendingPunches.clear();
  },

  /** Attempt to flush all queued punches using the provided network sync function */
  async flushQueue(syncFn: (punch: QueuedPunch) => Promise<any>): Promise<{ synced: number; failed: number }> {
    if (!navigator.onLine) {
      return { synced: 0, failed: 0 };
    }

    const pending = await this.getPendingPunches();
    if (pending.length === 0) {
      return { synced: 0, failed: 0 };
    }

    console.log(`[OfflineSync] Attempting to flush ${pending.length} queued punches...`);
    let synced = 0;
    let failed = 0;

    for (const punch of pending) {
      try {
        await syncFn(punch);
        await this.removePunch(punch.id);
        synced++;
      } catch (err: any) {
        console.error(`[OfflineSync] Failed to sync punch ${punch.id}:`, err);
        failed++;
        // If it's a fatal/permanent network failure, we break early to avoid spamming
        break;
      }
    }

    if (synced > 0) {
      console.log(`[OfflineSync] Successfully flushed ${synced} punches to cloud.`);
      // Dispatch custom event to let UI know sync completed
      window.dispatchEvent(new CustomEvent('offline-sync-complete', { detail: { synced } }));
    }

    return { synced, failed };
  }
};
