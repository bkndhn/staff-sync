import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource, CameraPermissionType } from '@capacitor/camera';

export interface CapacitorCameraOptions {
  onFrame?: (imageDataUrl: string) => void;
}

/**
 * Detects whether we are running inside the native Android APK.
 * Falls back gracefully to browser getUserMedia on web.
 */
export const isNative = () => Capacitor.isNativePlatform();

/**
 * Request camera permission on Android.
 * Returns true if granted.
 */
export async function requestCameraPermission(): Promise<boolean> {
  if (!isNative()) return true; // browser handles its own permissions

  try {
    const permissions = await Camera.requestPermissions({ permissions: ['camera'] });
    return permissions.camera === 'granted';
  } catch (e) {
    console.error('Camera permission error:', e);
    return false;
  }
}

/**
 * Take a single photo using the native Android camera.
 * Returns a base64 data URL string.
 */
export async function takeNativePhoto(): Promise<string | null> {
  try {
    const photo = await Camera.getPhoto({
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera,
      quality: 90,
      allowEditing: false,
      correctOrientation: true,
    });
    return photo.dataUrl ?? null;
  } catch (e: any) {
    if (e?.message?.includes('cancelled') || e?.message?.includes('canceled')) {
      return null; // user cancelled — not an error
    }
    console.error('Native camera error:', e);
    return null;
  }
}

/**
 * Gets a video stream from the device camera.
 * On Android native: uses getUserMedia via the WebView (works with HTTPS scheme).
 * On web: standard browser getUserMedia.
 */
export async function getCameraStream(facingMode: 'user' | 'environment' = 'user'): Promise<MediaStream | null> {
  try {
    if (isNative()) {
      // On Capacitor, getUserMedia works inside https:// WebView
      // Request permission first
      await requestCameraPermission();
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode,
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
      },
      audio: false,
    });
    return stream;
  } catch (e) {
    console.error('Camera stream error:', e);
    return null;
  }
}

export default { isNative, requestCameraPermission, takeNativePhoto, getCameraStream };
