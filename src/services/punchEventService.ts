import { supabase } from '../lib/supabase';
import { db } from '../lib/db';

export interface PunchEvent {
  id: string;
  staffId: string;
  staffName?: string;
  location?: string;
  date: string;
  eventTime: string; // HH:MM:SS
  kind: 'in' | 'out';
  source: string;
  matchDistance?: number;
  livenessScore?: number;
  deviceLabel?: string;
  createdAt: string;
}

const fromDb = (d: any): PunchEvent => ({
  id: d.id,
  staffId: d.staff_id,
  staffName: d.staff_name ?? undefined,
  location: d.location ?? undefined,
  date: d.date,
  eventTime: d.event_time,
  kind: d.kind,
  source: d.source,
  matchDistance: d.match_distance ?? undefined,
  livenessScore: d.liveness_score ?? undefined,
  deviceLabel: d.device_label ?? undefined,
  createdAt: d.created_at,
});

export const punchEventService = {
  async insert(input: Omit<PunchEvent, 'id' | 'createdAt'>): Promise<PunchEvent | null> {
    const offlineId = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const offlineEvent: PunchEvent = {
      ...input,
      id: offlineId,
      createdAt: new Date().toISOString()
    };

    // Always store locally first for instant read-back
    try {
      await db.punchEvents.put(offlineEvent);
    } catch { /* ignore local insert error */ }

    if (!navigator.onLine) {
      console.warn('[PunchEventService] Offline. Event stored locally.');
      return offlineEvent;
    }

    try {
      const { data, error } = await supabase
        .from('punch_events' as any)
        .insert([{
          staff_id: input.staffId,
          staff_name: input.staffName,
          location: input.location,
          date: input.date,
          event_time: input.eventTime,
          kind: input.kind,
          source: input.source,
          match_distance: input.matchDistance,
          liveness_score: input.livenessScore,
          device_label: input.deviceLabel,
        }])
        .select()
        .single();
      
      if (error) {
        console.error('punch_events insert', error);
        return offlineEvent; // return offline as fallback
      }
      
      const realEvent = fromDb(data);
      // Replace offline placeholder with real one
      try {
        await db.punchEvents.delete(offlineId);
        await db.punchEvents.put(realEvent);
      } catch {}
      
      return realEvent;
    } catch {
      return offlineEvent;
    }
  },

  async listByDate(date: string, staffId?: string): Promise<PunchEvent[]> {
    // Attempt local fetch first for zero-latency UI
    let localEvents: PunchEvent[] = [];
    try {
      if (staffId) {
        localEvents = await db.punchEvents.where({ date, staffId }).toArray();
      } else {
        localEvents = await db.punchEvents.where({ date }).toArray();
      }
    } catch {}

    if (!navigator.onLine) {
      return localEvents.sort((a, b) => a.eventTime.localeCompare(b.eventTime));
    }

    let q = supabase.from('punch_events' as any).select('*').eq('date', date).order('event_time', { ascending: true });
    if (staffId) q = q.eq('staff_id', staffId);
    const { data, error } = await q;
    
    if (error) { 
      console.error(error); 
      return localEvents.sort((a, b) => a.eventTime.localeCompare(b.eventTime)); 
    }
    
    const remoteEvents = (data || []).map(fromDb);
    
    // Merge remote and local (in case there are pending local punches not yet synced)
    const remoteIds = new Set(remoteEvents.map(e => e.id));
    const merged = [...remoteEvents, ...localEvents.filter(e => !remoteIds.has(e.id))];
    
    return merged.sort((a, b) => a.eventTime.localeCompare(b.eventTime));
  },

  /** First IN, last OUT, total minutes worked for a staff on a date. */
  summarize(events: PunchEvent[]): { firstIn?: string; lastOut?: string; minutes: number; count: number } {
    if (events.length === 0) return { minutes: 0, count: 0 };
    const sorted = [...events].sort((a, b) => a.eventTime.localeCompare(b.eventTime));
    const firstIn = sorted.find(e => e.kind === 'in')?.eventTime;
    const lastOut = [...sorted].reverse().find(e => e.kind === 'out')?.eventTime;
    let minutes = 0;
    let openIn: string | null = null;
    for (const e of sorted) {
      if (e.kind === 'in') openIn = e.eventTime;
      else if (e.kind === 'out' && openIn) {
        minutes += toMin(e.eventTime) - toMin(openIn);
        openIn = null;
      }
    }
    return { firstIn, lastOut, minutes: Math.max(0, minutes), count: sorted.length };
  },
};

const toMin = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
