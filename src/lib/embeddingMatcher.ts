/**
 * Embedding Matcher — Cosine Similarity + Centroid Averaging
 *
 * Why cosine over Euclidean:
 * - Euclidean distance is sensitive to magnitude (lighting, angle change magnitude)
 * - Cosine distance only measures angle between vectors — invariant to scale
 * - ArcFace and ResNet-34 both train with cosine similarity objectives
 * - Lower false rejection rate at threshold 0.35 vs Euclidean 0.60
 *
 * Why centroid averaging:
 * - Each staff has 5-10 enrolled embeddings (different angles, lighting)
 * - Averaging all embeddings → centroid vector in embedding space
 * - Centroid is more robust than any single embedding
 * - Matching against centroid is O(n) not O(n*k)
 */

export interface StaffEmbedding {
  staffId: string;
  centroid: Float32Array;     // averaged of all enrollments
  numSamples: number;
  lastUpdated: number;
}

/** Cosine distance: 0 = identical, 1 = orthogonal, 2 = opposite */
export const cosineDistance = (a: Float32Array | number[], b: Float32Array | number[]): number => {
  let dot = 0, na = 0, nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 1;
  return 1 - dot / (Math.sqrt(na) * Math.sqrt(nb));
};

/** Euclidean distance (kept for backward compat with old embeddings) */
export const euclideanDistance = (a: Float32Array | number[], b: Float32Array | number[]): number => {
  let s = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
};

/** Compute centroid (mean) of multiple embedding vectors */
export const computeCentroid = (embeddings: (Float32Array | number[])[]): Float32Array => {
  if (embeddings.length === 0) return new Float32Array(0);
  const dim = embeddings[0].length;
  const sum = new Float32Array(dim);
  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) {
      sum[i] += emb[i];
    }
  }
  for (let i = 0; i < dim; i++) {
    sum[i] /= embeddings.length;
  }
  // L2-normalize the centroid (important for cosine distance)
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += sum[i] * sum[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < dim; i++) sum[i] /= norm;
  return sum;
};

export interface MatchResult {
  staffId: string | null;
  distance: number;   // cosine distance
  confidence: number; // 1 - distance, 0..1
}

/**
 * Build centroid index from flat embedding array.
 * Groups by staffId, averages all descriptors per staff.
 */
export const buildCentroidIndex = (
  embeddings: { staffId: string; descriptor: number[] }[],
): Map<string, StaffEmbedding> => {
  const groups = new Map<string, number[][]>();
  for (const e of embeddings) {
    if (!e.descriptor || e.descriptor.length === 0) continue;
    if (!groups.has(e.staffId)) groups.set(e.staffId, []);
    groups.get(e.staffId)!.push(e.descriptor);
  }

  const index = new Map<string, StaffEmbedding>();
  for (const [staffId, descs] of groups) {
    index.set(staffId, {
      staffId,
      centroid: computeCentroid(descs),
      numSamples: descs.length,
      lastUpdated: Date.now(),
    });
  }
  return index;
};

/**
 * Find best matching staff for a live embedding.
 * Uses cosine distance against centroids.
 * COSINE_THRESHOLD: 0.30 = strict, 0.40 = relaxed
 */
export const findBestMatch = (
  liveDescriptor: Float32Array | number[],
  index: Map<string, StaffEmbedding>,
  threshold: number = 0.38,
): MatchResult => {
  let bestId: string | null = null;
  let bestDist = Infinity;

  for (const [staffId, entry] of index) {
    if (entry.centroid.length === 0) continue;
    const dist = cosineDistance(liveDescriptor, entry.centroid);
    if (dist < bestDist) {
      bestDist = dist;
      bestId = staffId;
    }
  }

  if (bestDist >= threshold) {
    return { staffId: null, distance: bestDist, confidence: 1 - bestDist };
  }

  return { staffId: bestId, distance: bestDist, confidence: 1 - bestDist };
};
