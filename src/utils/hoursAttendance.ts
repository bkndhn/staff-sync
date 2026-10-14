// Hours-based attendance: worked >= X hrs = full day, >= 3/4 X = 3/4 day,
// >= 1/2 X = half day, otherwise absent. Never produces overtime.
export function hoursToStatus(workedMin: number, fullDayHours: number): { status: 'Present' | '3/4 Day' | 'Half Day' | 'Absent'; value: number } {
  const full = fullDayHours * 60;
  if (workedMin >= full) return { status: 'Present', value: 1 };
  if (workedMin >= full * 0.75) return { status: '3/4 Day', value: 0.75 };
  if (workedMin >= full * 0.5) return { status: 'Half Day', value: 0.5 };
  return { status: 'Absent', value: 0 };
}
