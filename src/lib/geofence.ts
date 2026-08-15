/**
 * Shared geofence engine.
 *
 * Single source of truth for distance maths, GPS acquisition and anti-spoofing
 * heuristics so that every punch surface (staff portal QR, face attendance
 * kiosk, future native app) enforces exactly the same rules.
 */

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface GeofenceTarget extends GeoPoint {
  radius_meters?: number | null;
  name?: string;
}

export interface GeofenceResult {
  ok: boolean;
  title: string;
  subtitle: string;
  distance?: number;
  accuracy?: number;
}

export const DEFAULT_RADIUS_METERS = 100;
/** Anything above this is unusable for a 50–100m fence. */
export const MAX_ACCEPTABLE_ACCURACY = 150;

/** Haversine distance in metres. */
export function distanceInMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Ensures the browser/device has granted location permission BEFORE a punch.
 * Returns null when permission is usable, or a failure result to show the user.
 */
export async function ensureLocationPermission(): Promise<GeofenceResult | null> {
  if (!('geolocation' in navigator)) {
    return {
      ok: false,
      title: 'Location Not Supported',
      subtitle: 'This device cannot provide GPS location, so attendance punching is blocked.',
    };
  }
  try {
    const perms = (navigator as any).permissions;
    if (perms?.query) {
      const status = await perms.query({ name: 'geolocation' as PermissionName });
      if (status.state === 'denied') {
        return {
          ok: false,
          title: 'Location Permission Denied',
          subtitle: 'Enable location access for this app in your browser/device settings, then retry the punch.',
        };
      }
    }
  } catch { /* permissions API unavailable — the GPS read below still gates us */ }
  return null;
}

/** Acquire a fresh, non-cached GPS fix. Never reuses a cached position. */
export function acquirePosition(timeout = 10000): Promise<{ pos: GeolocationPosition; timeToFix: number }> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Location services are not available on this device.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ pos, timeToFix: Date.now() - started }),
      (err) => reject(new Error(err.message || 'Unable to read GPS location.')),
      { enableHighAccuracy: true, timeout, maximumAge: 0 }
    );
  });
}

const LAST_FIX_KEY = 'geofence_last_fix';
/** Max believable travel speed between two fixes (m/s) — ~430 km/h. */
const MAX_PLAUSIBLE_SPEED = 120;

/** Mock-location heuristics. Returns a failure result, or null when the fix looks genuine. */
export function detectSpoofing(pos: GeolocationPosition, timeToFix: number): GeofenceResult | null {
  const { accuracy, latitude, longitude } = pos.coords;

  // Android/Capacitor exposes a mocked flag on injected fixes.
  if ((pos as any).mocked === true || (pos.coords as any).mocked === true) {
    return { ok: false, title: 'Fake GPS Detected', subtitle: 'A mock location provider is active. Disable it and retry.' };
  }

  // Real hardware needs time to lock. Instant, pin-sharp fixes are injected.
  if (timeToFix < 150 && accuracy < 20) {
    return { ok: false, title: 'Fake GPS Detected', subtitle: 'Location acquired too quickly. Disable mock location apps and retry.' };
  }
  // Exact 0m accuracy is the signature of most mock-location tools.
  if (accuracy === 0) {
    return { ok: false, title: 'Fake GPS Detected', subtitle: 'Reported accuracy is 0m, which real GPS never returns.' };
  }
  // Perfectly round coordinates are typed by hand, not measured.
  if (Number.isInteger(latitude) && Number.isInteger(longitude)) {
    return { ok: false, title: 'Fake GPS Detected', subtitle: 'Coordinates look manually entered. Disable mock location apps.' };
  }
  // A GPS timestamp far from wall-clock time means the fix was replayed.
  if (pos.timestamp && Math.abs(Date.now() - pos.timestamp) > 120000) {
    return { ok: false, title: 'Stale GPS Fix', subtitle: 'The location reading is not live. Close mock location tools and retry.' };
  }

  // Teleport check: compare against the previous fix stored on this device.
  try {
    const raw = localStorage.getItem(LAST_FIX_KEY);
    if (raw) {
      const last = JSON.parse(raw) as { lat: number; lon: number; t: number };
      const seconds = Math.max(1, (Date.now() - last.t) / 1000);
      if (seconds < 3600) {
        const moved = distanceInMeters(last.lat, last.lon, latitude, longitude);
        if (moved / seconds > MAX_PLAUSIBLE_SPEED && moved > 1000) {
          return {
            ok: false,
            title: 'Impossible Location Jump',
            subtitle: 'Your device reported an impossible travel distance since the last reading. Disable fake GPS apps.',
          };
        }
      }
    }
    localStorage.setItem(LAST_FIX_KEY, JSON.stringify({ lat: latitude, lon: longitude, t: Date.now() }));
  } catch { /* storage unavailable — skip the teleport heuristic */ }

  if (accuracy > MAX_ACCEPTABLE_ACCURACY) {
    return {
      ok: false,
      title: 'Low GPS Accuracy',
      subtitle: `Your GPS is accurate to only ${Math.round(accuracy)}m. Step outside for a clear sky view and retry.`,
      accuracy,
    };
  }
  return null;
}


/**
 * Full check: acquire a fix, run anti-spoofing, then compare against the branch fence.
 * Returns ok:true when the target has no coordinates configured (fence not set up).
 */
export async function verifyWithinGeofence(target: GeofenceTarget | null | undefined): Promise<GeofenceResult> {
  if (!target || target.latitude == null || target.longitude == null) {
    return { ok: true, title: 'Geofence not configured', subtitle: 'No GPS fence set for this branch.' };
  }

  const radius = target.radius_meters || DEFAULT_RADIUS_METERS;

  let pos: GeolocationPosition;
  let timeToFix: number;
  try {
    ({ pos, timeToFix } = await acquirePosition());
  } catch (err) {
    return {
      ok: false,
      title: 'Location Required',
      subtitle: `Could not verify your GPS location: ${(err as Error).message}`,
    };
  }

  const spoof = detectSpoofing(pos, timeToFix);
  if (spoof) return spoof;

  const dist = distanceInMeters(pos.coords.latitude, pos.coords.longitude, target.latitude, target.longitude);
  if (dist > radius) {
    return {
      ok: false,
      title: 'Outside Work Location',
      subtitle: `You are ${Math.round(dist)}m away from ${target.name || 'your branch'} (allowed: ${radius}m).`,
      distance: dist,
      accuracy: pos.coords.accuracy,
    };
  }

  return {
    ok: true,
    title: 'Location Verified',
    subtitle: `${Math.round(dist)}m from ${target.name || 'branch'} (±${Math.round(pos.coords.accuracy)}m).`,
    distance: dist,
    accuracy: pos.coords.accuracy,
  };
}

/**
 * Punch gate used by every clock IN/OUT and break punch.
 *
 * Order of enforcement (all mandatory, no bypass):
 *   1. Location permission must be granted — a denied/blocked prompt fails the punch.
 *   2. A live, non-cached GPS fix must be obtained.
 *   3. Anti-spoofing heuristics must pass (mock providers, teleports, stale fixes).
 *   4. When the branch has a fence configured, the fix must be inside its radius.
 *
 * A branch without coordinates still requires steps 1–3, so a punch can never be
 * made with location services switched off.
 */
export async function enforcePunchLocation(target: GeofenceTarget | null | undefined): Promise<GeofenceResult> {
  const permission = await ensureLocationPermission();
  if (permission) return permission;

  let pos: GeolocationPosition;
  let timeToFix: number;
  try {
    ({ pos, timeToFix } = await acquirePosition());
  } catch (err) {
    return {
      ok: false,
      title: 'Location Permission Required',
      subtitle: `Allow location access to punch in or out. (${(err as Error).message})`,
    };
  }

  const spoof = detectSpoofing(pos, timeToFix);
  if (spoof) return spoof;

  if (!target || target.latitude == null || target.longitude == null) {
    return {
      ok: true,
      title: 'Location Verified',
      subtitle: `GPS confirmed (±${Math.round(pos.coords.accuracy)}m). No branch fence configured.`,
      accuracy: pos.coords.accuracy,
    };
  }

  const radius = target.radius_meters || DEFAULT_RADIUS_METERS;
  const dist = distanceInMeters(pos.coords.latitude, pos.coords.longitude, target.latitude, target.longitude);
  if (dist > radius) {
    return {
      ok: false,
      title: 'Outside Work Location',
      subtitle: `You are ${Math.round(dist)}m away from ${target.name || 'your branch'} (allowed: ${radius}m).`,
      distance: dist,
      accuracy: pos.coords.accuracy,
    };
  }

  return {
    ok: true,
    title: 'Location Verified',
    subtitle: `${Math.round(dist)}m from ${target.name || 'branch'} (±${Math.round(pos.coords.accuracy)}m).`,
    distance: dist,
    accuracy: pos.coords.accuracy,
  };
}

