/**
 * Ultra-fast QR/Barcode scanner utility.
 * 
 * Strategy:
 *  1. Try native BarcodeDetector API (Chrome/Edge, ~1ms hardware-accelerated)
 *  2. Fallback to ZXing-wasm for Firefox/Safari
 */

let nativeDetector: any = null;
let zxingReader: any = null;

// Initialize native detector once
const initNativeDetector = async (): Promise<boolean> => {
  if (!('BarcodeDetector' in window)) return false;
  try {
    const formats = await (window as any).BarcodeDetector.getSupportedFormats();
    if (!formats.includes('qr_code')) return false;
    nativeDetector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
    return true;
  } catch {
    return false;
  }
};

// Lazy-load ZXing fallback
const getZXingReader = async () => {
  if (zxingReader) return zxingReader;
  try {
    // Dynamic import of zxing-wasm (bundled)
    const { BrowserQRCodeReader } = await import('@zxing/browser');
    zxingReader = new BrowserQRCodeReader();
    return zxingReader;
  } catch {
    return null;
  }
};

let nativeAvailable: boolean | null = null;

export const scanFrameForQR = async (
  source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap
): Promise<string | null> => {
  // Check native support once
  if (nativeAvailable === null) {
    nativeAvailable = await initNativeDetector();
  }

  if (nativeAvailable && nativeDetector) {
    try {
      const results = await nativeDetector.detect(source);
      if (results && results.length > 0) {
        return results[0].rawValue;
      }
      return null;
    } catch {
      return null;
    }
  }

  // ZXing fallback (for Firefox/Safari)
  if (source instanceof HTMLVideoElement) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = source.videoWidth;
      canvas.height = source.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(source, 0, 0);

      const reader = await getZXingReader();
      if (!reader) return null;

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      // ZXing browser decode from ImageData
      const { default: { qrcode } } = await import('jsqr');
      const code = qrcode(imageData.data, canvas.width, canvas.height);
      return code ? code.data : null;
    } catch {
      return null;
    }
  }

  return null;
};
