const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const ALL_LOCATIONS_QR = '__ALL_LOCATIONS__';

export const isUuidLike = (value?: string | null): boolean => UUID_RE.test(String(value || '').trim());

export const normalizeLocationName = (value?: string | null): string =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

export const locationsMatch = (a?: string | null, b?: string | null): boolean => {
  const left = normalizeLocationName(a);
  const right = normalizeLocationName(b);
  return !!left && !!right && left === right;
};

export const isAllLocationsQR = (value?: string | null): boolean =>
  String(value || '').trim() === ALL_LOCATIONS_QR;

export const displayLocationName = (value?: string | null): string => {
  if (isAllLocationsQR(value)) return 'All Locations';
  const text = String(value || '').trim();
  return text || 'Unknown Location';
};