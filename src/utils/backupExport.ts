import { supabase } from '../lib/supabase';

// All tables to back up. Add new tables here as the schema grows.
const TABLES = [
  'staff',
  'attendance',
  'advances',
  'advance_entries',
  'salary_hikes',
  'salary_manual_overrides',
  'salary_categories',
  'leave_requests',
  'old_staff_records',
  'part_time_advance_tracking',
  'part_time_settlements',
  'locations',
  'floors',
  'designations',
  'app_users',
  'app_settings',
  'face_embeddings',
  'face_registration_logs',
  'user_profiles',
] as const;

async function fetchAll(table: string): Promise<any[]> {
  const out: any[] = [];
  const pageSize = 1000;
  let from = 0;
  // Paginate to avoid Supabase's 1000-row default cap.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from(table as any)
      .select('*')
      .range(from, from + pageSize - 1);
    if (error) {
      console.warn(`[backup] ${table} failed:`, error.message);
      return out;
    }
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

export async function exportFullBackup(): Promise<void> {
  const snapshot: Record<string, any[]> = {};
  for (const t of TABLES) {
    // Sequential to be gentle on rate limits
    snapshot[t] = await fetchAll(t);
  }

  const payload = {
    meta: {
      generated_at: new Date().toISOString(),
      app: 'staff-management',
      schema_version: 1,
      table_counts: Object.fromEntries(
        Object.entries(snapshot).map(([k, v]) => [k, v.length])
      ),
      note:
        'auth.users is NOT included (Supabase service role required). To restore auth users use Supabase CLI / pg_dump. See BACKUP_AND_MIGRATION.md.',
    },
    data: snapshot,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  a.href = url;
  a.download = `staff-mgmt-backup-${ts}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
