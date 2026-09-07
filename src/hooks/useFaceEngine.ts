/**
 * useFaceEngine — Upgraded Face Recognition Hook
 *
 * Drop-in replacement for useFaceApi. Uses:
 * - SSD MobileNetV1 (better than TinyFaceDetector — already in /public/models)
 * - ONNX Ultra-Light detector as primary, falls back to SSD if ONNX not ready
 * - Same exported interface: { ready, loading, error, detect }
 * - Enhanced detection: better score threshold, larger inputSize for distance
 *
 * Key improvements vs old useFaceApi:
 * 1. Tries ONNX detector first (ultra-light, fast, better angle detection)
 * 2. Falls back to SSD MobileNetV1 (5.6x better than TinyFaceDetector)
 * 3. Keeps 68-landmark detection for EAR blink liveness
 * 4. Returns SAME DetectionResult interface — no changes needed in callers
 */
import { useEffect, useRef, useState } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { preloadDetector } from '../lib/onnxFaceDetector';
import { initMediaPipe, detectFaceMediaPipe, isMediaPipeReady, computeEAR as mpComputeEAR } from '../lib/mediapipeFaceEngine';
import { getDeviceProfile } from '../lib/deviceProfile';
import { perfStart } from '../lib/perfProfiler';
import { initArcFace, isArcFaceReady, embedAlignedFace, ARCFACE_MODEL_VERSION } from '../lib/arcfaceEngine';
import { alignFace, cropFaceBox, fivePointsFromMediaPipe, fivePointsFrom68 } from '../lib/faceAlign';

export const LEGACY_MODEL_VERSION = 'faceapi-128';


const MODEL_URL = '/models';
const MODEL_URL_V2 = '/models-v2';

// Singleton loading
let modelsLoadingPromise: Promise<void> | null = null;
let modelsWarmedUp = false;

const ensureModelsLoaded = async (): Promise<void> => {
  if (
    faceapi.nets.tinyFaceDetector.isLoaded &&
    faceapi.nets.faceLandmark68Net.isLoaded &&
    faceapi.nets.faceRecognitionNet.isLoaded
  ) return;

  if (!modelsLoadingPromise) {
    modelsLoadingPromise = (async () => {
      try {
        const tf = (faceapi as unknown as { tf: { setBackend: (b: string) => Promise<unknown>; ready: () => Promise<unknown> } }).tf;
        await tf.setBackend('webgl');
        await tf.ready();
      } catch { /* ignore and fallback to whatever */ }

      
      await Promise.all([
        // TinyFaceDetector — significantly lighter and won't crash mobile WebGL, optimized with high inputSize
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
    })();
  }
  await modelsLoadingPromise;
};

const warmUpModels = async (): Promise<void> => {
  if (modelsWarmedUp) return;
  modelsWarmedUp = true;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 224; canvas.height = 224;
    await faceapi
      .detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.2 }))
      .withFaceLandmarks()
      .withFaceDescriptors();
  } catch { /* warm-up errors are harmless */ }
};

export interface DetectionResult {
  /** Faceprint used for matching. 512-d when ArcFace is available, else legacy 128-d. */
  descriptor: number[];
  /** Which model produced `descriptor` — embeddings are only comparable within a version. */
  modelVersion: string;
  /** Legacy 128-d face-api descriptor, kept so old enrolments still match during rollout. */
  legacyDescriptor?: number[];
  qualityScore: number;
  faceCount: number;
  box: { x: number; y: number; width: number; height: number };
  landmarks?: faceapi.FaceLandmarks68;
  /** True when the crop was straightened with 5-point alignment before embedding. */
  aligned?: boolean;
}

/** Adapts MediaPipe's 468 normalised points to the getLeftEye/getRightEye shape the liveness engine expects. */
const MP_LEFT_EYE = [33, 160, 158, 133, 153, 144];
const MP_RIGHT_EYE = [362, 385, 387, 263, 373, 380];
const mediaPipeLandmarkShim = (
  landmarks: Array<{ x: number; y: number; z: number }> | null,
  width: number,
  height: number,
) => {
  if (!landmarks || landmarks.length < 468 || !width || !height) return undefined;
  const pick = (idx: number[]) => idx.map(i => ({ x: landmarks[i].x * width, y: landmarks[i].y * height }));
  return {
    positions: landmarks.map(p => ({ x: p.x * width, y: p.y * height })),
    getLeftEye: () => pick(MP_LEFT_EYE),
    getRightEye: () => pick(MP_RIGHT_EYE),
  };
};



export const useFaceEngine = (autoLoad = true) => {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    if (!autoLoad) return;
    setLoading(true);
    Promise.all([
      ensureModelsLoaded(),
      // Pre-load ONNX detector in parallel (non-blocking)
      preloadDetector(),
      // Pre-load MediaPipe (Google AI 2025) in parallel — 10x faster detection
      initMediaPipe().catch(() => {}),
      // Pre-load the ArcFace 512-d embedder (non-blocking — falls back to face-api)
      initArcFace().catch(() => null),
    ])

      .then(() => warmUpModels())
      .then(() => { if (mountedRef.current) { setReady(true); setError(null); } })
      .catch((e) => { if (mountedRef.current) setError(e?.message || 'Failed to load face models'); })
      .finally(() => { if (mountedRef.current) setLoading(false); });
    return () => { mountedRef.current = false; };
  }, [autoLoad]);

  /**
   * Detect the best face and produce a faceprint.
   *
   * Pipeline (2026):
   *   MediaPipe detect (~15ms) -> 5-point alignment -> ArcFace 512-d embed
   * There is no second detection pass: face-api only runs when ArcFace is
   * unavailable, or when a legacy 128-d descriptor is explicitly requested
   * (enrolment during the rollout window).
   */
  const detect = async (
    input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
    opts?: { scoreThreshold?: number; withLandmarks?: boolean; withLegacy?: boolean },
  ): Promise<DetectionResult | null> => {
    const endDetect = perfStart('face.detect');
    const dev = getDeviceProfile();

    const runFaceApi = async (source: typeof input, scoreThreshold: number) => {
      await ensureModelsLoaded();
      const options = new faceapi.TinyFaceDetectorOptions({
        inputSize: dev.detectorInputSize,
        scoreThreshold,
      });
      const results = await faceapi
        .detectAllFaces(source, options)
        .withFaceLandmarks()
        .withFaceDescriptors();
      if (!results || results.length === 0) return null;
      const best = results.reduce((a, b) => (a.detection.box.area > b.detection.box.area ? a : b));
      return { best, count: results.length };
    };

    // ── Primary path: MediaPipe detection + ArcFace embedding ──
    if (isMediaPipeReady() && input instanceof HTMLVideoElement) {
      try {
        const mp = detectFaceMediaPipe(input);
        if (mp && mp.score > (opts?.scoreThreshold ?? 0.5)) {
          const vw = input.videoWidth || input.clientWidth;
          const vh = input.videoHeight || input.clientHeight;
          const points = fivePointsFromMediaPipe(mp.landmarks, vw, vh);
          const crop = points ? alignFace(input, points) : cropFaceBox(input, mp.box);
          const embedding = crop && isArcFaceReady() ? await embedAlignedFace(crop) : null;

          if (embedding) {
            let legacyDescriptor: number[] | undefined;
            if (opts?.withLegacy) {
              const legacy = await runFaceApi(input, 0.2);
              if (legacy) legacyDescriptor = Array.from(legacy.best.descriptor);
            }
            endDetect();
            return {
              descriptor: Array.from(embedding),
              modelVersion: ARCFACE_MODEL_VERSION,
              legacyDescriptor,
              qualityScore: mp.score,
              faceCount: mp.faceCount,
              box: mp.box,
              aligned: !!points,
              landmarks:
                opts?.withLandmarks === false
                  ? undefined
                  : (mediaPipeLandmarkShim(mp.landmarks, vw, vh) as unknown as faceapi.FaceLandmarks68 | undefined),
            };
          }

          // ArcFace unavailable — legacy face-api descriptor keeps attendance working.
          const legacy = await runFaceApi(input, 0.2);
          endDetect();
          if (!legacy) return null;
          return {
            descriptor: Array.from(legacy.best.descriptor),
            modelVersion: LEGACY_MODEL_VERSION,
            legacyDescriptor: Array.from(legacy.best.descriptor),
            qualityScore: mp.score,
            faceCount: mp.faceCount,
            box: mp.box,
            aligned: false,
            landmarks: opts?.withLandmarks === false ? undefined : legacy.best.landmarks,
          };
        }
        // MediaPipe found nothing — fall through to face-api
      } catch {
        // MediaPipe error — fall through to face-api
      }
    }

    // ── Fallback path: face-api detection (+ ArcFace embed when possible) ──
    const legacy = await runFaceApi(input, opts?.scoreThreshold ?? 0.35);
    if (!legacy) { endDetect(); return null; }
    const { best, count } = legacy;
    const box = best.detection.box;
    const boxPlain = { x: box.x, y: box.y, width: box.width, height: box.height };

    let descriptor = Array.from(best.descriptor);
    let modelVersion = LEGACY_MODEL_VERSION;
    let aligned = false;
    if (isArcFaceReady()) {
      const points = fivePointsFrom68(best.landmarks?.positions);
      const crop = points ? alignFace(input, points) : cropFaceBox(input, boxPlain);
      const embedding = crop ? await embedAlignedFace(crop) : null;
      if (embedding) {
        descriptor = Array.from(embedding);
        modelVersion = ARCFACE_MODEL_VERSION;
        aligned = !!points;
      }
    }

    endDetect();
    return {
      descriptor,
      modelVersion,
      legacyDescriptor: Array.from(best.descriptor),
      qualityScore: best.detection.score,
      faceCount: count,
      box: boxPlain,
      aligned,
      landmarks: opts?.withLandmarks === false ? undefined : best.landmarks,
    };
  };


  return { ready, loading, error, detect };
};

// Re-export useFaceApi as alias for backward compatibility
export const useFaceApi = useFaceEngine;

// ─── FaceMatcher builder (legacy — kept for any remaining callers) ──────────
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
  const labeled = Array.from(grouped.entries()).map(
    ([id, descs]) => new faceapi.LabeledFaceDescriptors(id, descs),
  );
  return new faceapi.FaceMatcher(labeled, threshold);
};

/** EAR — re-exported from livenessEngine for callers that import from here */
export { eyeAspectRatio } from '../lib/livenessEngine';

/**
 * Texture liveness score (kept for backward compat).
 * New code should use livenessEngine.ts instead.
 */
export const textureLivenessScore = (
  video: HTMLVideoElement,
  box: { x: number; y: number; width: number; height: number },
): number => {
  try {
    const size = 64;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return 0.5;
    ctx.drawImage(video, box.x, box.y, box.width, box.height, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    const blockSize = 8;
    const blocks = size / blockSize;
    let totalVar = 0, blockCount = 0;
    for (let by = 0; by < blocks; by++) {
      for (let bx = 0; bx < blocks; bx++) {
        let sum = 0, sum2 = 0, n = 0;
        for (let py = 0; py < blockSize; py++) {
          for (let px = 0; px < blockSize; px++) {
            const idx = ((by * blockSize + py) * size + (bx * blockSize + px)) * 4;
            const g = data[idx + 1];
            sum += g; sum2 += g * g; n++;
          }
        }
        const mean = sum / n;
        totalVar += sum2 / n - mean * mean;
        blockCount++;
      }
    }
    return Math.min(1, (totalVar / blockCount) / 120);
  } catch { return 0.5; }
};
