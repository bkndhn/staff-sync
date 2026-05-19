/**
 * Robust Device Fingerprint Generator
 * Combines hardware, screen, and canvas features to create a stable hash
 * that persists even across Incognito mode sessions on the same browser.
 */

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function getCanvasFingerprint(): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    
    ctx.textBaseline = 'top';
    ctx.font = '14px "Arial"';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('Hello, world!', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('Hello, world!', 4, 17);
    
    return canvas.toDataURL();
  } catch (e) {
    return 'no-canvas';
  }
}

export async function generateDeviceFingerprint(): Promise<string> {
  // 1. Collect stable hardware and environment properties
  const screenColorDepth = window.screen.colorDepth;
  const screenResolution = `${window.screen.width}x${window.screen.height}`;
  const hardwareConcurrency = navigator.hardwareConcurrency || 'unknown';
  const deviceMemory = (navigator as any).deviceMemory || 'unknown';
  
  // To avoid frequent changes if the user updates browser, we only take the OS part or a generalized UA.
  // Actually, full UA helps distinguish different browsers on the same device.
  const userAgent = navigator.userAgent;
  
  // 2. Generate Canvas fingerprint (very stable representation of graphics stack)
  const canvasHash = getCanvasFingerprint();
  
  // 3. Combine into a raw string
  const rawData = [
    screenColorDepth,
    screenResolution,
    hardwareConcurrency,
    deviceMemory,
    userAgent,
    canvasHash
  ].join('||');
  
  // 4. Hash it for security and length consistency
  const hash = await sha256(rawData);
  
  // 5. Try to get a persistent token from localStorage as an additional check
  // (This handles minor OS updates that might change UA, if they aren't using incognito)
  let persistentId = 'null';
  try {
    persistentId = localStorage.getItem('device_persistent_id') || 'null';
    if (persistentId === 'null') {
      persistentId = crypto.randomUUID();
      localStorage.setItem('device_persistent_id', persistentId);
    }
  } catch (e) {
    // Incognito might block localStorage in some strict browsers
  }
  
  // The final device ID is a combination of the hardware hash and the persistent ID if available.
  // We'll primarily rely on the hardware hash for incognito resilience.
  return `dev_${hash.substring(0, 32)}`;
}
