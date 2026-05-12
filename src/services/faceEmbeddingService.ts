import { supabase } from '../lib/supabase';

export interface FaceEmbedding {
  id: string;
  staffId: string;
  staffName?: string;
  angleLabel: string;
  descriptor: number[];
  descriptorDim: number;
  imagePath?: string;
  qualityScore?: number;
  isApproved: boolean;
  capturedBy?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

const fromDb = (d: any): FaceEmbedding => ({
  id: d.id,
  staffId: d.staff_id,
  staffName: d.staff_name ?? undefined,
  angleLabel: d.angle_label,
  descriptor: Array.isArray(d.descriptor) ? d.descriptor : [],
  descriptorDim: d.descriptor_dim ?? 0,
  imagePath: d.image_path ?? undefined,
  qualityScore: d.quality_score ?? undefined,
  isApproved: !!d.is_approved,
  capturedBy: d.captured_by ?? undefined,
  notes: d.notes ?? undefined,
  createdAt: d.created_at,
  updatedAt: d.updated_at,
});

export const faceEmbeddingService = {
  async getByStaff(staffId: string): Promise<FaceEmbedding[]> {
    const { data, error } = await supabase
      .from('face_embeddings')
      .select('*')
      .eq('staff_id', staffId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map(fromDb);
  },

  async getAllApproved(): Promise<FaceEmbedding[]> {
    const { data, error } = await supabase
      .from('face_embeddings')
      .select('*')
      .eq('is_approved', true);
    if (error) throw error;
    return (data || []).map(fromDb);
  },

  /** Return descriptors as Float32Array grouped by staffId for FaceMatcher. */
  toFloat32Groups(embeddings: FaceEmbedding[]): Map<string, Float32Array[]> {
    const map = new Map<string, Float32Array[]>();
    for (const e of embeddings) {
      if (!e.descriptor || e.descriptor.length === 0) continue;
      if (!map.has(e.staffId)) map.set(e.staffId, []);
      map.get(e.staffId)!.push(new Float32Array(e.descriptor));
    }
    return map;
  },

  async create(input: {
    staffId: string;
    staffName?: string;
    angleLabel: string;
    descriptor: number[];
    qualityScore?: number;
    imageBlob?: Blob;
    capturedBy?: string;
    notes?: string;
  }): Promise<FaceEmbedding> {
    let imagePath: string | undefined;
    if (input.imageBlob) {
      const path = `${input.staffId}/${Date.now()}-${input.angleLabel}.jpg`;
      const { error: upErr } = await supabase.storage
        .from('face-samples')
        .upload(path, input.imageBlob, { contentType: 'image/jpeg', upsert: false });
      if (!upErr) imagePath = path;
    }

    const { data, error } = await supabase
      .from('face_embeddings')
      .insert([{
        staff_id: input.staffId,
        staff_name: input.staffName,
        angle_label: input.angleLabel,
        descriptor: input.descriptor,
        descriptor_dim: input.descriptor.length,
        image_path: imagePath,
        quality_score: input.qualityScore,
        captured_by: input.capturedBy,
        notes: input.notes,
        is_approved: true,
      }])
      .select()
      .single();
    if (error) throw error;

    await supabase.from('face_registration_logs').insert([{
      staff_id: input.staffId,
      embedding_id: data.id,
      action: 'created',
      actor: input.capturedBy,
    }]);

    return fromDb(data);
  },

  async delete(id: string, actor?: string, reason?: string): Promise<void> {
    const { data: row } = await supabase
      .from('face_embeddings')
      .select('staff_id, image_path')
      .eq('id', id)
      .maybeSingle();

    const { error } = await supabase.from('face_embeddings').delete().eq('id', id);
    if (error) throw error;

    if (row?.image_path) {
      await supabase.storage.from('face-samples').remove([row.image_path]);
    }
    if (row?.staff_id) {
      await supabase.from('face_registration_logs').insert([{
        staff_id: row.staff_id,
        embedding_id: id,
        action: 'deleted',
        actor,
        reason,
      }]);
    }
  },

  async setApproval(id: string, approved: boolean, actor?: string): Promise<void> {
    const { data: row, error } = await supabase
      .from('face_embeddings')
      .update({ is_approved: approved })
      .eq('id', id)
      .select('staff_id')
      .single();
    if (error) throw error;
    await supabase.from('face_registration_logs').insert([{
      staff_id: row.staff_id,
      embedding_id: id,
      action: approved ? 'approved' : 'rejected',
      actor,
    }]);
  },

  async getSignedImageUrl(imagePath: string): Promise<string | null> {
    const { data, error } = await supabase.storage
      .from('face-samples')
      .createSignedUrl(imagePath, 60 * 60);
    if (error) return null;
    return data?.signedUrl ?? null;
  },
};

// Cosine distance helper (1 - cosine similarity). Lower = more similar.
export const cosineDistance = (a: number[], b: number[]): number => {
  if (a.length !== b.length || a.length === 0) return 1;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 1;
  return 1 - dot / (Math.sqrt(na) * Math.sqrt(nb));
};

// Euclidean distance — face-api standard threshold ~0.6
export const euclideanDistance = (a: number[], b: number[]): number => {
  if (a.length !== b.length || a.length === 0) return 1;
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
};