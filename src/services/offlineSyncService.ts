// Offline Synchronization Service using Native IndexedDB
// Robust queuing for attendance punches and overrides when internet drops.

const DB_NAME = 'StaffSyncOfflineDB';
const DB_VERSION = 1;
const STORE_NAME = 'pending_punches';

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
  /** Initialize and return the IndexedDB database instance */
  getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('[OfflineSync] Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          console.log('[OfflineSync] Object store created.');
        }
      };
    });
  },

  /** Enqueue an unsynced punch into the local store */
  async enqueuePunch(punchData: Omit<QueuedPunch, 'id' | 'queuedAt'>): Promise<QueuedPunch> {
    const db = await this.getDB();
    const queuedPunch: QueuedPunch = {
      ...punchData,
      id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      queuedAt: Date.now()
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(queuedPunch);

      request.onsuccess = () => {
        console.log(`[OfflineSync] Enqueued punch locally for staff: ${queuedPunch.staffId}`);
        resolve(queuedPunch);
      };

      request.onerror = () => {
        console.error('[OfflineSync] Failed to enqueue punch:', request.error);
        reject(request.error);
      };
    });
  },

  /** Retrieve all pending unsynced punches ordered by queuedAt */
  async getPendingPunches(): Promise<QueuedPunch[]> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
          // Sort chronologically by queued timestamp
          const results = (request.result as QueuedPunch[]).sort((a, b) => a.queuedAt - b.queuedAt);
          resolve(results);
        };

        request.onerror = () => {
          reject(request.error);
        };
      });
    } catch (err) {
      console.warn('[OfflineSync] Could not fetch pending punches (IDB blocked/unsupported):', err);
      return [];
    }
  },

  /** Remove a specific punch from the queue once successfully synced */
  async removePunch(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  /** Clear the entire offline queue */
  async clearQueue(): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
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
