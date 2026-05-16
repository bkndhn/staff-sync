/**
 * ONNX-based Ultra-Light Face Detector
 * Model: version-RFB-320 (~1.27 MB)
 * Preprocessing: resize to 320x240, normalize to [-1, 1]
 * Output: bounding boxes + scores
 *
 * This replaces TinyFaceDetector for much better accuracy at angles and distance.
 */
import * as ort from 'onnxruntime-web';

// Singleton session
let session: ort.InferenceSession | null = null;
let loading = false;
let loadError: string | null = null;

const MODEL_URL = '/models-v2/face_detector.onnx';
const INPUT_W = 320;
const INPUT_H = 240;
const IOU_THRESHOLD = 0.45;
const SCORE_THRESHOLD = 0.6;

export interface OnnxDetection {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
}

const loadSession = async (): Promise<ort.InferenceSession | null> => {
  if (session) return session;
  if (loading) {
    // Wait for it
    while (loading) await new Promise(r => setTimeout(r, 50));
    return session;
  }
  loading = true;
  try {
    // Use WASM backend — works everywhere without WebGL
    ort.env.wasm.wasmPaths = '/';
    session = await ort.InferenceSession.create(MODEL_URL, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });
    loadError = null;
  } catch (e: any) {
    loadError = e?.message || 'ONNX load failed';
    session = null;
  } finally {
    loading = false;
  }
  return session;
};

/** Preload model eagerly (call on app mount) */
export const preloadDetector = () => loadSession().catch(() => {});

/**
 * Preprocess a video frame into a Float32 tensor [1, 3, H, W] (BGR normalized)
 */
const preprocess = (
  video: HTMLVideoElement,
): { tensor: ort.Tensor; scaleX: number; scaleY: number } => {
  const canvas = document.createElement('canvas');
  canvas.width = INPUT_W;
  canvas.height = INPUT_H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(video, 0, 0, INPUT_W, INPUT_H);
  const imageData = ctx.getImageData(0, 0, INPUT_W, INPUT_H);
  const { data } = imageData;

  // [1, 3, H, W] layout, normalized to [-1, 1] (mean=127, std=128)
  const float32 = new Float32Array(3 * INPUT_H * INPUT_W);
  const stride = INPUT_H * INPUT_W;
  for (let i = 0; i < INPUT_H * INPUT_W; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    // Store as BGR channels
    float32[0 * stride + i] = (b - 127) / 128;
    float32[1 * stride + i] = (g - 127) / 128;
    float32[2 * stride + i] = (r - 127) / 128;
  }

  const tensor = new ort.Tensor('float32', float32, [1, 3, INPUT_H, INPUT_W]);
  const scaleX = video.videoWidth / INPUT_W;
  const scaleY = video.videoHeight / INPUT_H;
  return { tensor, scaleX, scaleY };
};

/** IoU for NMS */
const iou = (a: number[], b: number[]): number => {
  const x1 = Math.max(a[0], b[0]);
  const y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[2], b[2]);
  const y2 = Math.min(a[3], b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const aA = (a[2] - a[0]) * (a[3] - a[1]);
  const bA = (b[2] - b[0]) * (b[3] - b[1]);
  return inter / (aA + bA - inter + 1e-5);
};

/** Non-maximum suppression */
const nms = (boxes: number[][], scores: number[], threshold: number): number[] => {
  const sorted = scores.map((s, i) => i).sort((a, b) => scores[b] - scores[a]);
  const keep: number[] = [];
  const suppressed = new Set<number>();
  for (const i of sorted) {
    if (suppressed.has(i)) continue;
    keep.push(i);
    for (const j of sorted) {
      if (j !== i && !suppressed.has(j) && iou(boxes[i], boxes[j]) > threshold) {
        suppressed.add(j);
      }
    }
  }
  return keep;
};

/**
 * Run ONNX face detection on a video frame.
 * Falls back to null if model not loaded.
 */
export const detectFaces = async (
  video: HTMLVideoElement,
  maxFaces = 4,
): Promise<OnnxDetection[]> => {
  const sess = await loadSession();
  if (!sess || video.readyState < 2) return [];

  try {
    const { tensor, scaleX, scaleY } = preprocess(video);
    const feeds: Record<string, ort.Tensor> = { input: tensor };
    const output = await sess.run(feeds);

    // Model outputs: scores [1, N, 2], boxes [1, N, 4]
    const scoresData = output['scores'].data as Float32Array;
    const boxesData = output['boxes'].data as Float32Array;
    const numBoxes = scoresData.length / 2;

    const candidateBoxes: number[][] = [];
    const candidateScores: number[] = [];

    for (let i = 0; i < numBoxes; i++) {
      const score = scoresData[i * 2 + 1]; // class 1 = face
      if (score < SCORE_THRESHOLD) continue;

      // Boxes are in [x1, y1, x2, y2] format, normalized to INPUT dimensions
      const x1 = boxesData[i * 4] * INPUT_W * scaleX;
      const y1 = boxesData[i * 4 + 1] * INPUT_H * scaleY;
      const x2 = boxesData[i * 4 + 2] * INPUT_W * scaleX;
      const y2 = boxesData[i * 4 + 3] * INPUT_H * scaleY;

      candidateBoxes.push([x1, y1, x2, y2]);
      candidateScores.push(score);
    }

    if (candidateBoxes.length === 0) return [];

    const kept = nms(candidateBoxes, candidateScores, IOU_THRESHOLD).slice(0, maxFaces);
    return kept.map(i => ({
      x: candidateBoxes[i][0],
      y: candidateBoxes[i][1],
      width: candidateBoxes[i][2] - candidateBoxes[i][0],
      height: candidateBoxes[i][3] - candidateBoxes[i][1],
      score: candidateScores[i],
    }));
  } catch {
    return [];
  }
};

export const isDetectorReady = () => !!session;
export const getDetectorError = () => loadError;
