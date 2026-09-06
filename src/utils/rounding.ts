// Round to nearest 10 with NaN / null / undefined safety.
// Kept in its own module so salary and statutory calculations can share it
// without creating a circular import between them.
export const roundToNearest10 = (value: number): number => {
  if (value === null || value === undefined || isNaN(value) || !isFinite(value)) return 0;
  return Math.round(value / 10) * 10;
};
