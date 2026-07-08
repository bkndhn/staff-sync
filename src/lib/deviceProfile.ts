/**
 * deviceProfile — cheap runtime hints to tune model / loop sizes.
 * Cached once per session.
 */

export interface DeviceProfile {
  isMobile: boolean;
  isLowEnd: boolean;      // <= 4 cores or <= 4 GB
  cores: number;
  memoryGB: number | null;
  /** Recommended face-api inputSize (must be multiple of 32). */
  detectorInputSize: number;
  /** Minimum ms between detect() calls in the recognition loop. */
  minDetectIntervalMs: number;
  /** Max video width before we downscale for detection. */
  detectionMaxWidth: number;
}

let cached: DeviceProfile | null = null;

export const getDeviceProfile = (): DeviceProfile => {
  if (cached) return cached;

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
    || (typeof window !== 'undefined' && window.matchMedia?.('(pointer:coarse)').matches);

  const cores = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) : 4;
  const memoryGB = typeof navigator !== 'undefined' ? ((navigator as any).deviceMemory ?? null) : null;
  const isLowEnd = isMobile || cores <= 4 || (memoryGB !== null && memoryGB <= 4);

  cached = {
    isMobile,
    isLowEnd,
    cores,
    memoryGB,
    // Mobile / low-end: 320 is ~4x faster than 608 with acceptable accuracy at kiosk range.
    detectorInputSize: isLowEnd ? 320 : 608,
    // Mobile: throttle to ~5 fps to keep the phone cool and battery alive.
    minDetectIntervalMs: isLowEnd ? 180 : 60,
    // Downscale the video frame passed to face-api for a big speed win.
    detectionMaxWidth: isLowEnd ? 480 : 960,
  };
  return cached;
};
