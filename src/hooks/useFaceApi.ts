import { useEffect, useRef, useState } from 'react';
import * as faceapi from '@vladmandic/face-api';

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';

let modelsLoadingPromise: Promise<void> | null = null;

const ensureModelsLoaded = async (): Promise<void> => {
  if (faceapi.nets.tinyFaceDetector.isLoaded && faceapi.nets.faceLandmark68Net.isLoaded && faceapi.nets.faceRecognitionNet.isLoaded) {
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

export interface DetectionResult {
  descriptor: number[];
  qualityScore: number; // 0..1 — higher is better
  faceCount: number;
  box: { x: number; y: number; width: number; height: number };
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
      .then(() => { if (mountedRef.current) { setReady(true); setError(null); } })
      .catch((e) => { if (mountedRef.current) setError(e?.message || 'Failed to load face models'); })
      .finally(() => { if (mountedRef.current) setLoading(false); });
    return () => { mountedRef.current = false; };
  }, [autoLoad]);

  const detect = async (
    input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
    opts?: { inputSize?: number; scoreThreshold?: number; withLandmarks?: boolean },
  ): Promise<(DetectionResult & { landmarks?: any }) | null> => {
    await ensureModelsLoaded();
    const options = new faceapi.TinyFaceDetectorOptions({
      inputSize: opts?.inputSize ?? 416,
      scoreThreshold: opts?.scoreThreshold ?? 0.5,
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