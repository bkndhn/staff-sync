import { CustomFieldDefinition } from '../types';
import { appSettingsService } from './appSettingsService';

const STORAGE_KEY_PREFIX = 'staff_sync_custom_fields_definitions';

const DEFAULT_FIELDS: CustomFieldDefinition[] = [
  { id: 'cf_1', key: 'emergency_contact', label: 'Emergency Contact Person', type: 'text', required: false, showInTable: true },
  { id: 'cf_2', key: 'blood_group', label: 'Blood Group', type: 'select', options: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'], required: false, showInTable: true },
  { id: 'cf_3', key: 'driving_license', label: 'Driving License No.', type: 'text', required: false, showInTable: false }
];

function getTenantStorageKey(): string {
  try {
    const saved = localStorage.getItem('staffManagementLogin');
    if (saved) {
      const parsed = JSON.parse(saved);
      const tenantId = parsed?.user?.tenant_id || parsed?.user?.email || parsed?.user?.id;
      if (tenantId) return `${STORAGE_KEY_PREFIX}_${tenantId}`;
    }
  } catch {}
  return STORAGE_KEY_PREFIX;
}

export const customFieldsService = {
  /** Synchronous read from tenant-scoped localStorage */
  getCustomFieldsSync(): CustomFieldDefinition[] {
    try {
      const stored = localStorage.getItem(getTenantStorageKey());
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error('Error loading custom fields definitions:', e);
    }
    return DEFAULT_FIELDS;
  },

  /** Asynchronous read from tenant-scoped app_settings (with local cache fallback) */
  async getCustomFields(): Promise<CustomFieldDefinition[]> {
    try {
      const remoteJson = await appSettingsService.getSetting('custom_fields_definitions');
      if (remoteJson) {
        const parsed = JSON.parse(remoteJson);
        this.saveCustomFieldsLocal(parsed);
        return parsed;
      }
    } catch (e) {
      console.error('Error fetching remote custom fields definitions:', e);
    }
    return this.getCustomFieldsSync();
  },

  saveCustomFieldsLocal(fields: CustomFieldDefinition[]): void {
    try {
      localStorage.setItem(getTenantStorageKey(), JSON.stringify(fields));
    } catch (e) {
      console.error('Error saving local custom fields definitions:', e);
    }
  },

  async saveCustomFields(fields: CustomFieldDefinition[]): Promise<void> {
    this.saveCustomFieldsLocal(fields);
    try {
      await appSettingsService.setSetting('custom_fields_definitions', JSON.stringify(fields));
    } catch (e) {
      console.error('Error saving remote custom fields definitions:', e);
    }
  },

  async addCustomField(field: Omit<CustomFieldDefinition, 'id' | 'key'>): Promise<CustomFieldDefinition[]> {
    const fields = await this.getCustomFields();
    const key = field.label.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const newField: CustomFieldDefinition = {
      ...field,
      id: `cf_${Date.now()}`,
      key
    };
    const updated = [...fields, newField];
    await this.saveCustomFields(updated);
    return updated;
  },

  async deleteCustomField(id: string): Promise<CustomFieldDefinition[]> {
    const fields = await this.getCustomFields();
    const updated = fields.filter(f => f.id !== id);
    await this.saveCustomFields(updated);
    return updated;
  },

  async toggleShowInTable(id: string): Promise<CustomFieldDefinition[]> {
    const fields = await this.getCustomFields();
    const updated = fields.map(f => f.id === id ? { ...f, showInTable: !f.showInTable } : f);
    await this.saveCustomFields(updated);
    return updated;
  }
};
