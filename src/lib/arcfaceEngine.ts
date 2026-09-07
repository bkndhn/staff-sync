/**
 * arcfaceEngine — modern 512-d face embeddings (ArcFace / MobileFaceNet).
 *
 * Replaces the 2018 face-api 128-d ResNet faceprint. The model is
 * w600k_mbf (InsightFace "buffalo_s" recognition head): trained on WebFace600K,
 * ~99.8% LFW, far stronger on non-Western faces, side angles and poor light,
 * while staying small enough (13 MB) to run in the browser and inside the
 * Capacitor app.
 *
 * Input : 112x112 aligned RGB crop, normalised to [-1, 1], NCHW
 * Output: 512-d embedding (L2-normalised here)
 */
import * as ort from 'onnxruntime-web';
import modelAsset from '../assets/arcface_mbf.onnx.asset.json';

export const ARCFACE_MODEL_VERSION = 'arcface-mbf-512';
export const ARCFACE_DIM = 512;

let session: ort.InferenceSession | null = null;
let loadPromise: Promise<ort.InferenceSession | null> | null = null;
let loadError: string | null = null;

const configureRuntime = () => {
  try {
    ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';
    ort.env.wasm.numThreads = Math.min(4, Math.max(1, navigator.hardwareConcurrency || 2));
    ort.env.wasm.simd = true;
    ort.env.logLevel = 'error';
  } catch {
    /* non-fatal */
  }
};

/** Load the ArcFace session once. Resolves to null when unavailable. */
export async function initArcFace(): Promise<ort.InferenceSession | null> {
  if (session) return session;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    configureRuntime();
    const providers: string[][] = [['webgpu', 'wasm'], ['wasm']];
    for (const executionProviders of providers) {
      try {
        session = await ort.InferenceSession.create(modelAsset.url, {
          executionProviders: executionProviders as ort.InferenceSession.ExecutionProviderConfig[],
          graphOptimizationLevel: 'all',
        });
        loadError = null;
        return session;
      } catch (e: unknown) {
        loadError = e instanceof Error ? e.message : 'ArcFace load failed';
      }
    }
    return null;
  })();

  return loadPromise;
}

export const isArcFaceReady = () => !!session;
export const getArcFaceError = () => loadError;

/** Convert a 112x112 canvas to the model's NCHW float tensor. */
const canvasToTensor = (canvas: HTMLCanvasElement): ort.Tensor | null => {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const { width, height } = canvas;
  const { data } = ctx.getImageData(0, 0, width, height);
  const plane = width * height;
  const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    const o = i * 4;
    out[i] = (data[o] - 127.5) / 127.5; // R
    out[plane + i] = (data[o + 1] - 127.5) / 127.5; // G
    out[2 * plane + i] = (data[o + 2] - 127.5) / 127.5; // B
  }
  return new ort.Tensor('float32', out, [1, 3, height, width]);
};

const l2normalize = (v: Float32Array): Float32Array => {
  let norm = 0;
  for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < v.length; i++) v[i] /= norm;
  return v;
};

/**
 * Embed an aligned 112x112 face crop.
 * Returns an L2-normalised 512-d vector, or null when the model is unavailable.
 */
export async function embedAlignedFace(canvas: HTMLCanvasElement): Promise<Float32Array | null> {
  const sess = await initArcFace();
  if (!sess) return null;
  const tensor = canvasToTensor(canvas);
  if (!tensor) return null;
  try {
    const inputName = sess.inputNames[0];
    const outputs = await sess.run({ [inputName]: tensor });
    const first = outputs[sess.outputNames[0]];
    const raw = first?.data as Float32Array | undefined;
    if (!raw || raw.length === 0) return null;
    return l2normalize(new Float32Array(raw));
  } catch (e: unknown) {
    loadError = e instanceof Error ? e.message : 'ArcFace inference failed';
    return null;
  }
}
