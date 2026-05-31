/**
 * Offline Database Service
 * Uses Dexie.js (IndexedDB wrapper, already installed) to persist
 * attendance punches locally on the device. Syncs to Supabase when online.
 */
import Dexie, { Table } from 'dexie';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OfflinePunch {
  id?: number;                 // local auto-increment key
  staffId: string;
  staffName?: string;
  punchTime: string;           // ISO timestamp
  direction: 'in' | 'out' | 'unknown';
  location?: string;
  deviceName?: string;
  synced: boolean;             // false = pending upload to Supabase
  createdAt: string;
}

export interface OfflineStaff {
  id: string;                  // Supabase UUID
  name: string;
  location?: string;
  designation?: string;
  isActive: boolean;
  faceDescriptor?: string;     // JSON stringified Float32Array
  updatedAt: string;
}

// ─── Dexie Database ───────────────────────────────────────────────────────────

class StaffSyncOfflineDb extends Dexie {
  punches!: Table<OfflinePunch, number>;
  staff!: Table<OfflineStaff, string>;

  constructor() {
    super('StaffSyncOfflineDB');
    this.version(1).stores({
      punches: '++id, staffId, synced, punchTime',
      staff: 'id, name, location, isActive',
    });
  }
}

export const offlineDb = new StaffSyncOfflineDb();

// ─── Service ──────────────────────────────────────────────────────────────────

export const offlineDbService = {

  /**
   * Save a punch locally immediately (works offline).
   * Returns the local ID.
   */
  async savePunch(punch: Omit<OfflinePunch, 'id' | 'synced' | 'createdAt'>): Promise<number> {
    const id = await offlineDb.punches.add({
      ...punch,
      synced: false,
      createdAt: new Date().toISOString(),
    });
    console.log(`[OfflineDB] Punch saved locally. id=${id} staffId=${punch.staffId}`);

    // Fire-and-forget: try to sync immediately if online
    syncPendingPunches().catch(() => {});
    return id as number;
  },

  /**
   * Cache all staff + face descriptors from Supabase for offline recognition.
   */
  async pullStaffFromCloud(): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('staff')
        .select('id, name, location, designation, is_active, face_descriptors, updated_at')
        .eq('is_active', true);

      if (error) throw error;

      const records: OfflineStaff[] = (data || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        location: s.location,
        designation: s.designation,
        isActive: s.is_active,
        faceDescriptor: s.face_descriptors ? JSON.stringify(s.face_descriptors) : undefined,
        updatedAt: s.updated_at,
      }));

      await offlineDb.staff.bulkPut(records);
      console.log(`[OfflineDB] Cached ${records.length} staff members for offline use.`);
    } catch (e) {
      console.warn('[OfflineDB] Could not pull staff from cloud (offline?):', e);
    }
  },

  /**
   * Get cached staff for offline face recognition.
   */
  async getCachedStaff(): Promise<OfflineStaff[]> {
    return offlineDb.staff.where('isActive').equals(1).toArray();
  },

  /**
   * Count how many punches are waiting to be synced.
   */
  async getPendingCount(): Promise<number> {
    return offlineDb.punches.where('synced').equals(0).count();
  },
};

/**
 * Push all unsynced local punches to Supabase.
 * Called automatically when network becomes available.
 */
export async function syncPendingPunches(): Promise<{ synced: number; failed: number }> {
  const pending = await offlineDb.punches.where('synced').equals(0).toArray();
  if (pending.length === 0) return { synced: 0, failed: 0 };

  console.log(`[Sync] Uploading ${pending.length} pending punches to Supabase...`);

  let synced = 0;
  let failed = 0;

  for (const punch of pending) {
    try {
      const { error } = await supabase.from('punch_events').insert([{
        staff_id: punch.staffId,
        punch_time: punch.punchTime,
        direction: punch.direction,
        device_name: punch.deviceName || 'Mobile App',
        is_manual: false,
      }]);

      if (error) throw error;

      // Mark as synced locally
      await offlineDb.punches.update(punch.id!, { synced: true });
      synced++;
    } catch (e) {
      console.error(`[Sync] Failed to sync punch id=${punch.id}:`, e);
      failed++;
    }
  }

  console.log(`[Sync] Done. Synced: ${synced}, Failed: ${failed}`);
  return { synced, failed };
}
