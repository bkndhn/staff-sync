/**
 * Enhanced Liveness Detection Engine
 *
 * Three-layer spoof detection:
 * 1. EAR (Eye Aspect Ratio) — blink detection, high accuracy
 * 2. HSV skin color distribution — real skin has specific hue distribution
 * 3. Moiré pattern / high-frequency analysis — screen replay detection
 * 4. Micro-movement tracking — rigid = photo/screen
 * 5. HSV temporal variation — live face changes frame-to-frame, photos don't
 */

export interface LivenessState {
  frames: number;
  blinkSeen: boolean;
  earSeries: number[];
  boxes: Array<{ x: number; y: number; w: number; h: number }>;
  textureScores: number[];
  hsvScores: number[];
  temporalVariances: number[];
  lastFramePixels: Uint8ClampedArray | null;
}

export const createLivenessState = (): LivenessState => ({
  frames: 0,
  blinkSeen: false,
  earSeries: [],
  boxes: [],
  textureScores: [],
  hsvScores: [],
  temporalVariances: [],
  lastFramePixels: null,
});

/** Eye Aspect Ratio — value < 0.21 means eye is closed (blink) */
export const eyeAspectRatio = (eye: { x: number; y: number }[]): number => {
  if (!eye || eye.length < 6) return 1;
  const d = (p: { x: number; y: number }, q: { x: number; y: number }) =>
    Math.hypot(p.x - q.x, p.y - q.y);
  const v1 = d(eye[1], eye[5]);
  const v2 = d(eye[2], eye[4]);
  const h = d(eye[0], eye[3]);
  return h === 0 ? 1 : (v1 + v2) / (2 * h);
};

const FACE_CROP_SIZE = 64;

interface FaceCropData {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Extract face crop from video as raw pixel data */
const getFaceCrop = (
  video: HTMLVideoElement,
  box: { x: number; y: number; width: number; height: number },
): FaceCropData | null => {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = FACE_CROP_SIZE;
    canvas.height = FACE_CROP_SIZE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, box.x, box.y, box.width, box.height, 0, 0, FACE_CROP_SIZE, FACE_CROP_SIZE);
    const imageData = ctx.getImageData(0, 0, FACE_CROP_SIZE, FACE_CROP_SIZE);
    return { pixels: imageData.data, width: FACE_CROP_SIZE, height: FACE_CROP_SIZE };
  } catch {
    return null;
  }
};

/**
 * Green-channel local variance texture score.
 * Real skin ~120+ variance; screens/photos ~30-60 variance.
 */
const textureScore = (pixels: Uint8ClampedArray, size: number): number => {
  const blockSize = 8;
  const blocks = size / blockSize;
  let totalVar = 0;
  let count = 0;
  for (let by = 0; by < blocks; by++) {
    for (let bx = 0; bx < blocks; bx++) {
      let sum = 0, sum2 = 0, n = 0;
      for (let py = 0; py < blockSize; py++) {
        for (let px = 0; px < blockSize; px++) {
          const idx = ((by * blockSize + py) * size + (bx * blockSize + px)) * 4;
          const g = pixels[idx + 1];
          sum += g; sum2 += g * g; n++;
        }
      }
      const mean = sum / n;
      totalVar += (sum2 / n) - mean * mean;
      count++;
    }
  }
  return Math.min(1, (totalVar / count) / 120);
};

/**
 * HSV skin color score.
 * Real human skin clusters in specific Hue range (0°–50°) with medium saturation.
 * Phone screens and printed photos have different HSV distributions.
 * Returns 0..1 — higher = more likely real skin.
 */
const hsvSkinScore = (pixels: Uint8ClampedArray, size: number): number => {
  let skinPixels = 0;
  const total = size * size;
  for (let i = 0; i < total; i++) {
    const r = pixels[i * 4] / 255;
    const g = pixels[i * 4 + 1] / 255;
    const b = pixels[i * 4 + 2] / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;

    if (max < 0.1 || delta < 0.05) continue; // skip dark/gray pixels

    // Hue calculation
    let h = 0;
    if (delta > 0) {
      if (max === r) h = ((g - b) / delta) % 6;
      else if (max === g) h = (b - r) / delta + 2;
      else h = (r - g) / delta + 4;
      h = (h * 60 + 360) % 360;
    }
    const s = max === 0 ? 0 : delta / max;
    const v = max;

    // Skin tone: Hue 0-50 (red-orange-yellow), Saturation 0.15-0.9, Value 0.2-0.95
    if (h >= 0 && h <= 50 && s >= 0.15 && s <= 0.9 && v >= 0.2 && v <= 0.95) {
      skinPixels++;
    }
  }
  // A real face crop should have 20-70% skin-tone pixels
  const ratio = skinPixels / total;
  if (ratio < 0.1 || ratio > 0.85) return 0.3; // too little or too much skin = suspicious
  return Math.min(1, ratio * 2); // reward 50% skin
};

/**
 * Temporal variation score.
 * Measures how much the face region changed since the last frame.
 * Live face: natural micro-changes (breathing, muscle movement) → variance > 5
 * Static photo on screen: near-zero change between frames → variance ~0
 * Returns 0..1.
 */
const temporalVarianceScore = (
  current: Uint8ClampedArray,
  previous: Uint8ClampedArray | null,
  size: number,
): number => {
  if (!previous || current.length !== previous.length) return 0.5; // unknown
  let diffSum = 0;
  const step = 4; // sample every 4th pixel for speed
  let count = 0;
  for (let i = 0; i < size * size * 4; i += step * 4) {
    const dr = Math.abs(current[i] - previous[i]);
    const dg = Math.abs(current[i + 1] - previous[i + 1]);
    const db = Math.abs(current[i + 2] - previous[i + 2]);
    diffSum += (dr + dg + db) / 3;
    count++;
  }
  const avgDiff = diffSum / count;
  // Live: ~5-30 avg diff; Screen replay: ~0-2; Photo: ~0
  return Math.min(1, avgDiff / 20);
};

/**
 * Moiré pattern / frequency domain score.
 * Screen displays have periodic pixel grid (moiré interference when captured by camera).
 * Detect by checking regular periodic patterns in the horizontal direction.
 * Returns 0..1 — LOW score means moiré detected (screen), HIGH = no moiré (real).
 */
const moireScore = (pixels: Uint8ClampedArray, size: number): number => {
  // Sample middle horizontal row
  const row = Math.floor(size / 2);
  const rowPixels: number[] = [];
  for (let x = 0; x < size; x++) {
    const idx = (row * size + x) * 4;
    rowPixels.push((pixels[idx] + pixels[idx + 1] + pixels[idx + 2]) / 3);
  }

  // Look for regular periodic patterns (screen = periodic, skin = random)
  let periodicPower = 0;
  const freqs = [4, 5, 6, 7, 8]; // Typical screen pixel patterns every N pixels
  for (const freq of freqs) {
    let autocorr = 0;
    let n = 0;
    for (let i = 0; i < size - freq; i++) {
      autocorr += Math.abs(rowPixels[i] - rowPixels[i + freq]);
      n++;
    }
    const avgDiff = autocorr / n;
    // Regular pattern has low avgDiff at specific lags
    periodicPower += Math.max(0, 30 - avgDiff) / 30;
  }
  const periodicScore = periodicPower / freqs.length;

  // High periodicScore means screen pattern detected → low liveness
  return 1 - periodicScore * 0.6; // cap penalty at 60%
};

/** Main liveness check — call every detected frame */
export const updateLiveness = (
  state: LivenessState,
  video: HTMLVideoElement,
  box: { x: number; y: number; width: number; height: number },
  landmarks?: { getLeftEye: () => { x: number; y: number }[]; getRightEye: () => { x: number; y: number }[] },
): LivenessState => {
  const next = { ...state };
  next.frames++;

  // Box tracking (micro-movement)
  next.boxes = [...state.boxes, { x: box.x, y: box.y, w: box.width, h: box.height }];
  if (next.boxes.length > 8) next.boxes = next.boxes.slice(-8);

  // EAR blink detection
  if (landmarks) {
    try {
      const ear = (eyeAspectRatio(landmarks.getLeftEye()) + eyeAspectRatio(landmarks.getRightEye())) / 2;
      next.earSeries = [...state.earSeries, ear];
      if (next.earSeries.length > 15) next.earSeries = next.earSeries.slice(-15);
      if (ear < 0.21) next.blinkSeen = true;
    } catch {}
  }

  // Pixel-level analysis
  const crop = getFaceCrop(video, box);
  if (crop) {
    // Texture score
    const texScore = textureScore(crop.pixels, FACE_CROP_SIZE);
    next.textureScores = [...state.textureScores, texScore];
    if (next.textureScores.length > 6) next.textureScores = next.textureScores.slice(-6);

    // HSV skin score
    const skinScore = hsvSkinScore(crop.pixels, FACE_CROP_SIZE);
    next.hsvScores = [...state.hsvScores, skinScore];
    if (next.hsvScores.length > 6) next.hsvScores = next.hsvScores.slice(-6);

    // Temporal variance
    const tempScore = temporalVarianceScore(crop.pixels, state.lastFramePixels, FACE_CROP_SIZE);
    next.temporalVariances = [...state.temporalVariances, tempScore];
    if (next.temporalVariances.length > 8) next.temporalVariances = next.temporalVariances.slice(-8);

    next.lastFramePixels = new Uint8ClampedArray(crop.pixels);
  }

  return next;
};

export interface LivenessResult {
  isLive: boolean;
  score: number; // 0..1
  reason: 'live' | 'no-blink' | 'spoof' | 'checking' | 'unknown';
  detail: {
    blinkSeen: boolean;
    textureAvg: number;
    hsvAvg: number;
    temporalAvg: number;
    moireAvg: number;
    movement: number;
    earVariance: number;
  };
}

/** Evaluate liveness state and return pass/fail decision */
export const evaluateLiveness = (state: LivenessState, video: HTMLVideoElement, box: { x: number; y: number; width: number; height: number }): LivenessResult => {
  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const textureAvg = avg(state.textureScores);
  const hsvAvg = avg(state.hsvScores);
  const temporalAvg = avg(state.temporalVariances);

  // Compute moiré from current frame
  const crop = getFaceCrop(video, box);
  const moireAvg = crop ? moireScore(crop.pixels, FACE_CROP_SIZE) : 0.5;

  // Box movement
  let movement = 0;
  for (let i = 1; i < state.boxes.length; i++) {
    movement += Math.abs(state.boxes[i].x - state.boxes[i - 1].x) +
                Math.abs(state.boxes[i].y - state.boxes[i - 1].y);
  }
  movement /= Math.max(1, state.boxes.length);

  // EAR variance (natural face movement)
  const earMean = avg(state.earSeries);
  const earVariance = state.earSeries.length > 3
    ? state.earSeries.reduce((a, b) => a + (b - earMean) ** 2, 0) / state.earSeries.length
    : 0;

  const detail = { blinkSeen: state.blinkSeen, textureAvg, hsvAvg, temporalAvg, moireAvg, movement, earVariance };

  if (state.frames < 3) return { isLive: false, score: 0, reason: 'checking', detail };

  // Weighted liveness score
  const score = Math.min(1,
    textureAvg * 0.25 +
    hsvAvg * 0.20 +
    temporalAvg * 0.25 +
    moireAvg * 0.15 +
    Math.min(1, movement / 3) * 0.10 +
    (state.blinkSeen ? 0.05 : 0) +
    Math.min(1, earVariance * 300) * 0.10,
  );

  // Hard rejections
  if (textureAvg < 0.25 && temporalAvg < 0.15) {
    return { isLive: false, score, reason: 'spoof', detail };
  }
  if (moireAvg < 0.35) {
    return { isLive: false, score, reason: 'spoof', detail };
  }

  // Need blink after 8 frames if other signals are weak
  if (state.frames >= 8 && !state.blinkSeen && score < 0.45) {
    return { isLive: false, score, reason: 'no-blink', detail };
  }

  if (score >= 0.40 || (state.blinkSeen && score >= 0.30)) {
    return { isLive: true, score, reason: 'live', detail };
  }

  return { isLive: false, score, reason: 'checking', detail };
};
