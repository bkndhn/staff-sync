import { dataApi } from '../lib/dataApi';

export interface Announcement {
  id: string;
  tenant_id: string;
  title: string;
  content: string;
  priority: 'low' | 'normal' | 'high';
  created_by: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

export const announcementService = {
  async getAnnouncements(): Promise<Announcement[]> {
    const { data, error } = await dataApi.from('announcements').select('*');
    if (error) throw error;
    // sort by created_at descending
    return (data || []).sort((a: Announcement, b: Announcement) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },

  async createAnnouncement(data: Partial<Announcement>): Promise<Announcement | null> {
    const { data: res, error } = await dataApi.from('announcements').insert(data).select();
    if (error) throw error;
    return Array.isArray(res) ? res[0] : res;
  },

  async updateAnnouncement(id: string, data: Partial<Announcement>): Promise<Announcement | null> {
    const { data: res, error } = await dataApi.from('announcements').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id).select();
    if (error) throw error;
    return Array.isArray(res) ? res[0] : res;
  },

  async deleteAnnouncement(id: string): Promise<boolean> {
    const { error } = await dataApi.from('announcements').delete().eq('id', id);
    if (error) throw error;
    return true;
  }
};
