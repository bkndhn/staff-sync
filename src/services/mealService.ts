import { dataApi } from '../lib/dataApi';
import type { MealKind, RoomStatus, FoodChoice } from '../utils/mealHeadcount';

export interface MealRow {
  id?: string;
  staff_id: string;
  staff_name?: string;
  location?: string;
  date: string;
  meal: MealKind;
  in_room: RoomStatus;
  food: FoodChoice;
  note?: string | null;
  recorded_by?: string | null;
}

export const mealService = {
  async forDay(date: string, location?: string): Promise<MealRow[]> {
    let q: any = dataApi.from('accommodation_meals').select('*').eq('date', date);
    if (location) q = q.eq('location', location);
    const { data, error } = await q;
    if (error) throw new Error(error.message || 'Could not load meals');
    return (data || []) as MealRow[];
  },
  async save(rows: MealRow[]): Promise<void> {
    if (!rows.length) return;
    const { error } = await dataApi.from('accommodation_meals').upsert(rows, { onConflict: 'tenant_id,staff_id,date,meal' });
    if (error) throw new Error(error.message || 'Could not save');
  },
};
