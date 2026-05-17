import Dexie, { type Table } from 'dexie';
import type { Staff } from '../types';
import type { ShiftWindows } from '../services/shiftService';
import type { LocationShiftConfig } from '../services/locationShiftService';
import type { FaceEmbedding } from '../services/faceEmbeddingService';
import { type QueuedPunch } from '../services/offlineSyncService';
import { type SalaryCategory } from '../services/salaryCategoryService';
import { type Floor } from '../services/floorService';
import { type Designation } from '../services/designationService';
import { type PunchEvent } from '../services/punchEventService';

export class StaffSyncDB extends Dexie {
  staff!: Table<Staff, string>;
  faceEmbeddings!: Table<FaceEmbedding, string>;
  locationShiftConfig!: Table<LocationShiftConfig, string>;
  pendingPunches!: Table<QueuedPunch, string>;
  settings!: Table<{ key: string; value: any }, string>;
  locations!: Table<{ id: string; name: string }, string>;
  salaryCategories!: Table<SalaryCategory, string>;
  floors!: Table<Floor, string>;
  designations!: Table<Designation, string>;
  punchEvents!: Table<PunchEvent, string>;

  constructor() {
    super('StaffSyncDB');

    this.version(1).stores({
      staff: 'id, location, isActive',
      faceEmbeddings: 'id, staffId, location',
      locationShiftConfig: 'locationName',
      pendingPunches: 'id, queuedAt, staffId',
      settings: 'key',
      locations: 'id, name',
      salaryCategories: 'id, type',
      floors: 'id, locationId',
      designations: 'id',
      punchEvents: 'id, staffId, date'
    });
  }
}

export const db = new StaffSyncDB();
