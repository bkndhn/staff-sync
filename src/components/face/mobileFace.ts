/**
 * Mobile-native primitives for the Face page.
 *
 * These are intentionally tiny (no library dependencies) — they layer
 * mobile-camera-app affordances on top of the existing FaceAttendance UI:
 *   - haptics on match / spoof / error
 *   - double-tap-to-switch-camera
 *   - viewport detection so the mobile shell only mounts on phones
 *
 * Desktop code paths remain untouched.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/** True on mobile-sized viewports (matches Tailwind's `md` breakpoint). */
export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window === 'undefined' ? false : window.innerWidth < breakpoint
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = () => setIsMobile(mq.matches);
    handler();
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, [breakpoint]);
  return isMobile;
}

/** navigator.vibrate wrapper with capability gating and silent-mode respect. */
export function useHaptics() {
  const canVibrate =
    typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  const fire = useCallback(
    (pattern: number | number[]) => {
      if (!canVibrate) return;
      try {
        navigator.vibrate(pattern);
      } catch {
        /* ignore */
      }
    },
    [canVibrate]
  );
  return {
    tap: () => fire(10),
    success: () => fire([15, 40, 15]),
    warn: () => fire([25]),
    error: () => fire([30, 60, 30]),
  };
}

/**
 * Detect double-tap gestures on a target element. Returns an onTouchEnd
 * handler to attach to any tap surface (typically the video element).
 */
export function useDoubleTap(onDoubleTap: () => void, delayMs = 280) {
  const lastTap = useRef<number>(0);
  return useCallback(() => {
    const now = Date.now();
    if (now - lastTap.current < delayMs) {
      lastTap.current = 0;
      onDoubleTap();
    } else {
      lastTap.current = now;
    }
  }, [onDoubleTap, delayMs]);
}
