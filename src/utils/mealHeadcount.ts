// Who will eat at the staff room for one meal.
// Rules: an explicit answer wins (eating / parcel = coming, skip = not coming,
// away from room = not coming). With no answer, present at work = coming;
// marked absent = must ask; nothing marked yet = unknown.
export type MealKind = 'breakfast' | 'lunch' | 'dinner';
export type RoomStatus = 'unknown' | 'in_room' | 'at_work' | 'away';
export type FoodChoice = 'unknown' | 'eating' | 'skip' | 'parcel';
export type MealVerdict = 'coming' | 'not_coming' | 'ask' | 'unknown';

export interface MealEntry { in_room: RoomStatus; food: FoodChoice }

export const MEALS: { id: MealKind; label: string; time: string }[] = [
  { id: 'breakfast', label: 'Breakfast', time: '07:00–09:30' },
  { id: 'lunch', label: 'Lunch', time: '12:00–14:30' },
  { id: 'dinner', label: 'Dinner', time: '19:30–22:00' },
];

export function mealVerdict(workStatus: string | undefined, entry?: MealEntry | null): MealVerdict {
  if (entry) {
    if (entry.food === 'eating' || entry.food === 'parcel') return 'coming';
    if (entry.food === 'skip' || entry.in_room === 'away') return 'not_coming';
    if (entry.in_room === 'in_room') return 'coming';
  }
  if (workStatus === 'Present' || workStatus === 'Half Day') return 'coming';
  if (workStatus === 'Absent') return 'ask';
  return 'unknown';
}

export function mealCounts(verdicts: MealVerdict[]) {
  const c = { coming: 0, not_coming: 0, ask: 0, unknown: 0 };
  for (const v of verdicts) c[v]++;
  return c;
}
