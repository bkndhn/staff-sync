/**
 * MediaPipe Face Engine — Google AI Edge (2025)
 *
 * Industry-standard face detection used by PagarBook, SalaryBox, etc.
 * 10x faster than face-api.js on mobile devices.
 *
 * Uses @mediapipe/tasks-vision for:
 * - Ultra-fast face detection (~15ms on mobile)
 * - 468-point face landmarks (precise liveness, head pose)
 * - GPU-accelerated via built-in WebGL delegate
 */
import { FaceDetector, FaceLandmarker, FilesetResolver, type Detection, type FaceLandmarkerResult } from '@mediapipe/tasks-vision';

// CDN base for MediaPipe WASM files
const VISION_WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';

let faceDetector: FaceDetector | null = null;
let faceLandmarker: FaceLandmarker | null = null;
let initPromise: Promise<void> | null = null;
let initError: string | null = null;

/**
 * Initialize MediaPipe face detection + landmarks.
 * Singleton — safe to call multiple times.
 */
export async function initMediaPipe(): Promise<void> {
  if (faceDetector && faceLandmarker) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const vision = await FilesetResolver.forVisionTasks(VISION_WASM_CDN);

      // Create face detector (ultra-fast, ~15ms)
      faceDetector = await FaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        minDetectionConfidence: 0.5,
      });

      // Create face landmarker (468 points — head pose, EAR, liveness)
      faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.tflite',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        minFaceDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      });

      initError = null;
    } catch (err: any) {
      initError = err?.message || 'MediaPipe init failed';
      // Nullify so callers know to fall back
      faceDetector = null;
      faceLandmarker = null;
    }
  })();

  return initPromise;
}

export interface MediaPipeDetection {
  /** Bounding box in source video coordinates */
  box: { x: number; y: number; width: number; height: number };
  /** Detection confidence 0-1 */
  score: number;
  /** 468-point face landmarks (normalized 0-1) */
  landmarks: Array<{ x: number; y: number; z: number }> | null;
  /** Number of faces detected */
  faceCount: number;
}

/**
 * Detect faces using MediaPipe (VIDEO mode).
 * Returns null if no face found.
 */
export function detectFaceMediaPipe(
  video: HTMLVideoElement,
  timestampMs?: number,
): MediaPipeDetection | null {
  if (!faceDetector || !faceLandmarker) return null;
  if (video.readyState < 2) return null;

  const ts = timestampMs ?? performance.now();

  try {
    // Step 1: Fast face detection
    const detections = faceDetector.detectForVideo(video, ts);
    if (!detections.detections || detections.detections.length === 0) return null;

    // Pick the largest face (closest to camera)
    const best = detections.detections.reduce((a: Detection, b: Detection) => {
      const areaA = (a.boundingBox?.width ?? 0) * (a.boundingBox?.height ?? 0);
      const areaB = (b.boundingBox?.width ?? 0) * (b.boundingBox?.height ?? 0);
      return areaA > areaB ? a : b;
    });

    const bb = best.boundingBox;
    if (!bb) return null;

    // Step 2: Get 468-point landmarks for liveness
    let landmarks: Array<{ x: number; y: number; z: number }> | null = null;
    try {
      const landmarkResult: FaceLandmarkerResult = faceLandmarker.detectForVideo(video, ts + 1);
      if (landmarkResult.faceLandmarks && landmarkResult.faceLandmarks.length > 0) {
        landmarks = landmarkResult.faceLandmarks[0] as Array<{ x: number; y: number; z: number }>;
      }
    } catch {
      // Landmark detection failed — still return the detection
    }

    return {
      box: {
        x: bb.originX,
        y: bb.originY,
        width: bb.width,
        height: bb.height,
      },
      score: best.categories?.[0]?.score ?? 0,
      landmarks,
      faceCount: detections.detections.length,
    };
  } catch {
    return null;
  }
}

/**
 * Compute Eye Aspect Ratio from MediaPipe 468 landmarks.
 * Used for blink-based liveness detection.
 *
 * EAR landmarks (same indices as in MediaPipe Face Mesh):
 * Left eye:  [33, 160, 158, 133, 153, 144]
 * Right eye: [362, 385, 387, 263, 373, 380]
 */
export function computeEAR(landmarks: Array<{ x: number; y: number; z: number }>): number {
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

  // Left eye
  const lP1 = landmarks[33], lP2 = landmarks[160], lP3 = landmarks[158];
  const lP4 = landmarks[133], lP5 = landmarks[153], lP6 = landmarks[144];
  const leftEAR = (dist(lP2, lP6) + dist(lP3, lP5)) / (2.0 * dist(lP1, lP4));

  // Right eye
  const rP1 = landmarks[362], rP2 = landmarks[385], rP3 = landmarks[387];
  const rP4 = landmarks[263], rP5 = landmarks[373], rP6 = landmarks[380];
  const rightEAR = (dist(rP2, rP6) + dist(rP3, rP5)) / (2.0 * dist(rP1, rP4));

  return (leftEAR + rightEAR) / 2.0;
}

/**
 * Compute head pose (yaw, pitch) from MediaPipe landmarks.
 * Useful for detecting if user is looking at camera vs. showing a photo.
 */
export function computeHeadPose(landmarks: Array<{ x: number; y: number; z: number }>): { yaw: number; pitch: number } {
  // Nose tip: 1, Left ear: 234, Right ear: 454, Forehead: 10, Chin: 152
  const nose = landmarks[1];
  const leftEar = landmarks[234];
  const rightEar = landmarks[454];
  const forehead = landmarks[10];
  const chin = landmarks[152];

  // Yaw: horizontal rotation (positive = looking right)
  const earMidX = (leftEar.x + rightEar.x) / 2;
  const yaw = (nose.x - earMidX) * 180;

  // Pitch: vertical rotation (positive = looking up)
  const faceMidY = (forehead.y + chin.y) / 2;
  const pitch = (faceMidY - nose.y) * 180;

  return { yaw, pitch };
}

export const isMediaPipeReady = () => !!(faceDetector && faceLandmarker);
export const getMediaPipeError = () => initError;
