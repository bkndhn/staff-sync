import { dataApi } from '../lib/dataApi';

export interface ShiftRoster {
  id: string;
  staffId: string;
  date: string;
  shiftKey: string;
  location: string;
  isPublished: boolean;
}

export const shiftRosterService = {
  async getByDateRange(startDate: string, endDate: string, location?: string): Promise<ShiftRoster[]> {
    let query = dataApi
      .from('shift_rosters')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate);
      
    if (location && location !== 'all') {
      query = query.eq('location', location);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching shift rosters:', error);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      staffId: row.staff_id,
      date: row.date,
      shiftKey: row.shift_key,
      location: row.location,
      isPublished: row.is_published,
    }));
  },

  async upsert(records: Omit<ShiftRoster, 'id' | 'isPublished'>[]): Promise<boolean> {
    const payloads = records.map(r => ({
      staff_id: r.staffId,
      date: r.date,
      shift_key: r.shiftKey,
      location: r.location,
      is_published: false
    }));

    const { error } = await dataApi
      .from('shift_rosters')
      .upsert(payloads, { onConflict: 'staff_id,date' });

    if (error) {
      console.error('Error upserting shift roster:', error);
      return false;
    }
    return true;
  },

  async publish(startDate: string, endDate: string, location: string): Promise<boolean> {
    const { error } = await dataApi
      .from('shift_rosters')
      .update({ is_published: true })
      .gte('date', startDate)
      .lte('date', endDate)
      .eq('location', location);

    if (error) {
      console.error('Error publishing shift roster:', error);
      return false;
    }
    return true;
  }
};
