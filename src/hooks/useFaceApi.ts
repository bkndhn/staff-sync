import { useEffect, useRef, useState } from 'react';
import * as faceapi from '@vladmandic/face-api';

// ─── Local model path & Deployment Versioning ─────────────────────────────────
// Models are bundled in /public/models to avoid CDN round-trips.
// Explicit versioning parameters ensure browser/SW caches do not serve stale
// weights across enterprise software upgrades.
const DEPLOYMENT_VERSION = 'v1.0.1';
const MODEL_URL = `/models?v=${DEPLOYMENT_VERSION}`;

// Singleton promise — models are loaded once for the whole app lifetime.
let modelsLoadingPromise: Promise<void> | null = null;
let modelsWarmedUp = false;

const ensureModelsLoaded = async (): Promise<void> => {
  if (
    faceapi.nets.tinyFaceDetector.isLoaded &&
    faceapi.nets.faceLandmark68Net.isLoaded &&
    faceapi.nets.faceRecognitionNet.isLoaded
  ) {
    return;
  }
  if (!modelsLoadingPromise) {
    modelsLoadingPromise = (async () => {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
    })();
  }
  await modelsLoadingPromise;
};

/**
 * After models load, run one silent inference to JIT-compile WebGL shaders.
 * The first real inference goes from ~600 ms → ~80 ms after this.
 */
const warmUpModels = async (): Promise<void> => {
  if (modelsWarmedUp) return;
  modelsWarmedUp = true;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 224;
    canvas.height = 224;
    // blank canvas is fine — we just want WebGL kernels compiled
    await faceapi
      .detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.1 }))
      .withFaceLandmarks()
      .withFaceDescriptors();
  } catch {
    /* ignore — warm-up errors are harmless */
  }
};

export interface DetectionResult {
  descriptor: number[];
  qualityScore: number; // 0..1
  faceCount: number;
  box: { x: number; y: number; width: number; height: number };
  landmarks?: faceapi.FaceLandmarks68;
}

export const useFaceApi = (autoLoad = true) => {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    if (!autoLoad) return;
    setLoading(true);
    ensureModelsLoaded()
      .then(() => warmUpModels())
      .then(() => { if (mountedRef.current) { setReady(true); setError(null); } })
      .catch((e) => { if (mountedRef.current) setError(e?.message || 'Failed to load face models'); })
      .finally(() => { if (mountedRef.current) setLoading(false); });
    return () => { mountedRef.current = false; };
  }, [autoLoad]);

  /**
   * Detect the largest face in a video/image/canvas element.
   * Uses inputSize 224 (fast) — adequate for close-up kiosk cameras.
   */
  const detect = async (
    input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
    opts?: { inputSize?: number; scoreThreshold?: number; withLandmarks?: boolean },
  ): Promise<DetectionResult | null> => {
    await ensureModelsLoaded();
    const options = new faceapi.TinyFaceDetectorOptions({
      inputSize: opts?.inputSize ?? 224,       // was 416 — 3-5× faster
      scoreThreshold: opts?.scoreThreshold ?? 0.4,
    });
    const results = await faceapi
      .detectAllFaces(input, options)
      .withFaceLandmarks()
      .withFaceDescriptors();
    if (!results || results.length === 0) return null;
    const best = results.reduce((a, b) => (a.detection.box.area > b.detection.box.area ? a : b));
    const box = best.detection.box;
    return {
      descriptor: Array.from(best.descriptor),
      qualityScore: best.detection.score,
      faceCount: results.length,
      box: { x: box.x, y: box.y, width: box.width, height: box.height },
      landmarks: opts?.withLandmarks === false ? undefined : best.landmarks,
    };
  };

  return { ready, loading, error, detect };
};

// ─── FaceMatcher builder ──────────────────────────────────────────────────────
/**
 * Build a faceapi.FaceMatcher from the flat embedding list.
 * Groups by staffId and uses Float32Array descriptors.
 * Call this once when embeddings load/change — O(1) lookup afterward.
 */
export const buildFaceMatcher = (
  embeddings: { staffId: string; staffName?: string; descriptor: number[] }[],
  threshold: number,
): faceapi.FaceMatcher | null => {
  if (embeddings.length === 0) return null;
  const grouped = new Map<string, Float32Array[]>();
  for (const e of embeddings) {
    if (!grouped.has(e.staffId)) grouped.set(e.staffId, []);
    grouped.get(e.staffId)!.push(new Float32Array(e.descriptor));
  }
  const labeledDescriptors = Array.from(grouped.entries()).map(
    ([id, descs]) => new faceapi.LabeledFaceDescriptors(id, descs),
  );
  return new faceapi.FaceMatcher(labeledDescriptors, threshold);
};

/** Eye Aspect Ratio — smaller value = closed eye. Used for blink-based liveness. */
export const eyeAspectRatio = (eye: { x: number; y: number }[]): number => {
  if (!eye || eye.length < 6) return 1;
  const dist = (p: { x: number; y: number }, q: { x: number; y: number }) =>
    Math.hypot(p.x - q.x, p.y - q.y);
  const v1 = dist(eye[1], eye[5]);
  const v2 = dist(eye[2], eye[4]);
  const h = dist(eye[0], eye[3]);
  if (h === 0) return 1;
  return (v1 + v2) / (2 * h);
};

/**
 * Texture liveness score from a face-region ImageData.
 * Real skin has higher green-channel local variance than a printed photo or
 * phone screen (which have lower spatial frequency variation).
 * Returns 0..1 — higher = more likely real.
 */
export const textureLivenessScore = (
  video: HTMLVideoElement,
  box: { x: number; y: number; width: number; height: number },
): number => {
  try {
    const size = 64; // crop size — tiny for speed
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return 0.5;
    // Draw face crop
    ctx.drawImage(video, box.x, box.y, box.width, box.height, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    // Compute local green-channel variance over 8×8 non-overlapping blocks
    const blockSize = 8;
    const blocks = size / blockSize; // 8 blocks per axis
    let totalVar = 0;
    let blockCount = 0;
    for (let by = 0; by < blocks; by++) {
      for (let bx = 0; bx < blocks; bx++) {
        let sum = 0;
        let sum2 = 0;
        let n = 0;
        for (let py = 0; py < blockSize; py++) {
          for (let px = 0; px < blockSize; px++) {
            const idx = ((by * blockSize + py) * size + (bx * blockSize + px)) * 4;
            const g = data[idx + 1]; // green channel
            sum += g;
            sum2 += g * g;
            n++;
          }
        }
        const mean = sum / n;
        totalVar += sum2 / n - mean * mean;
        blockCount++;
      }
    }
    const avgVar = totalVar / blockCount;
    // Empirically: real face ≥ ~120 variance, printed photo/screen ≤ ~60
    return Math.min(1, avgVar / 120);
  } catch {
    return 0.5; // unknown → neutral
  }
};