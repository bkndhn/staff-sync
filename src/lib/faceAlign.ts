/**
 * faceAlign — 5-point similarity alignment to the ArcFace 112x112 template.
 *
 * Why: face embeddings are only comparable when every face is rotated,
 * scaled and cropped the same way. Without alignment the same person at a
 * slight tilt produces a noticeably different faceprint.
 *
 * The 5 reference points (left eye, right eye, nose tip, left mouth corner,
 * right mouth corner) come from the standard ArcFace / InsightFace template.
 */

export interface Point {
  x: number;
  y: number;
}

/** ArcFace canonical 5-point template for a 112x112 crop. */
export const ARCFACE_TEMPLATE: Point[] = [
  { x: 38.2946, y: 51.6963 }, // left eye
  { x: 73.5318, y: 51.5014 }, // right eye
  { x: 56.0252, y: 71.7366 }, // nose tip
  { x: 41.5493, y: 92.3655 }, // left mouth corner
  { x: 70.7299, y: 92.2041 }, // right mouth corner
];

/** MediaPipe FaceMesh indices used to build the 5 reference points. */
const MP = {
  leftEye: [33, 133],
  rightEye: [362, 263],
  nose: [1],
  mouthLeft: [61],
  mouthRight: [291],
};

const meanOf = (
  landmarks: Array<{ x: number; y: number }>,
  idx: number[],
  w: number,
  h: number,
): Point => {
  let sx = 0;
  let sy = 0;
  for (const i of idx) {
    const p = landmarks[i];
    if (!p) return { x: NaN, y: NaN };
    sx += p.x;
    sy += p.y;
  }
  return { x: (sx / idx.length) * w, y: (sy / idx.length) * h };
};

/**
 * Build the 5 alignment points (in pixels) from MediaPipe's normalised
 * 468-point landmark array. Returns null if landmarks are unusable.
 */
export function fivePointsFromMediaPipe(
  landmarks: Array<{ x: number; y: number }> | null | undefined,
  sourceWidth: number,
  sourceHeight: number,
): Point[] | null {
  if (!landmarks || landmarks.length < 468) return null;
  const pts = [
    meanOf(landmarks, MP.leftEye, sourceWidth, sourceHeight),
    meanOf(landmarks, MP.rightEye, sourceWidth, sourceHeight),
    meanOf(landmarks, MP.nose, sourceWidth, sourceHeight),
    meanOf(landmarks, MP.mouthLeft, sourceWidth, sourceHeight),
    meanOf(landmarks, MP.mouthRight, sourceWidth, sourceHeight),
  ];
  if (pts.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
  return pts;
}

/**
 * Build the 5 alignment points from face-api's 68-point landmarks.
 * Used when MediaPipe is unavailable.
 */
export function fivePointsFrom68(
  positions: Array<{ x: number; y: number }> | null | undefined,
): Point[] | null {
  if (!positions || positions.length < 68) return null;
  const avg = (from: number, to: number): Point => {
    let sx = 0;
    let sy = 0;
    for (let i = from; i <= to; i++) {
      sx += positions[i].x;
      sy += positions[i].y;
    }
    const n = to - from + 1;
    return { x: sx / n, y: sy / n };
  };
  return [
    avg(36, 41), // left eye
    avg(42, 47), // right eye
    positions[30], // nose tip
    positions[48], // left mouth corner
    positions[54], // right mouth corner
  ];
}

export interface SimilarityTransform {
  /** scale * cos(theta) */
  a: number;
  /** scale * sin(theta) */
  b: number;
  tx: number;
  ty: number;
}

/**
 * Least-squares similarity transform (rotation + uniform scale + translation)
 * mapping `src` points onto `dst` points. Closed-form Umeyama solution for
 * the 2D similarity case.
 */
export function estimateSimilarity(src: Point[], dst: Point[]): SimilarityTransform | null {
  const n = Math.min(src.length, dst.length);
  if (n < 2) return null;

  let srcMeanX = 0;
  let srcMeanY = 0;
  let dstMeanX = 0;
  let dstMeanY = 0;
  for (let i = 0; i < n; i++) {
    srcMeanX += src[i].x;
    srcMeanY += src[i].y;
    dstMeanX += dst[i].x;
    dstMeanY += dst[i].y;
  }
  srcMeanX /= n;
  srcMeanY /= n;
  dstMeanX /= n;
  dstMeanY /= n;

  let sxx = 0; // sum of src variance
  let num1 = 0; // sum(src . dst)
  let num2 = 0; // sum(src x dst)
  for (let i = 0; i < n; i++) {
    const sx = src[i].x - srcMeanX;
    const sy = src[i].y - srcMeanY;
    const dx = dst[i].x - dstMeanX;
    const dy = dst[i].y - dstMeanY;
    sxx += sx * sx + sy * sy;
    num1 += sx * dx + sy * dy;
    num2 += sx * dy - sy * dx;
  }
  if (sxx === 0) return null;

  const a = num1 / sxx;
  const b = num2 / sxx;
  const tx = dstMeanX - (a * srcMeanX - b * srcMeanY);
  const ty = dstMeanY - (b * srcMeanX + a * srcMeanY);
  return { a, b, tx, ty };
}

/**
 * Produce a 112x112 aligned face crop ready for the ArcFace model.
 * Returns null when the transform cannot be computed.
 */
export function alignFace(
  source: CanvasImageSource,
  sourcePoints: Point[],
  size = 112,
): HTMLCanvasElement | null {
  const scale = size / 112;
  const dst = ARCFACE_TEMPLATE.map((p) => ({ x: p.x * scale, y: p.y * scale }));
  const t = estimateSimilarity(sourcePoints, dst);
  if (!t) return null;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // Canvas transform matrix is [a c e; b d f] — a similarity has c = -b, d = a.
  ctx.setTransform(t.a, t.b, -t.b, t.a, t.tx, t.ty);
  ctx.drawImage(source, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return canvas;
}

/**
 * Fallback crop when no landmarks are available: square centre crop of the
 * detection box, expanded slightly to include forehead and chin.
 */
export function cropFaceBox(
  source: CanvasImageSource,
  box: { x: number; y: number; width: number; height: number },
  size = 112,
  margin = 0.25,
): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const side = Math.max(box.width, box.height) * (1 + margin);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  ctx.drawImage(source, cx - side / 2, cy - side / 2, side, side, 0, 0, size, size);
  return canvas;
}
