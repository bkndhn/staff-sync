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
    const json = await dataApi({
      table: 'announcements',
      op: 'select',
      columns: '*',
    });
    // sort by created_at descending
    return (json?.data || []).sort((a: Announcement, b: Announcement) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },

  async createAnnouncement(data: Partial<Announcement>): Promise<Announcement | null> {
    const json = await dataApi({
      table: 'announcements',
      op: 'insert',
      values: data,
    });
    return Array.isArray(json?.data) ? json.data[0] : json?.data;
  },

  async updateAnnouncement(id: string, data: Partial<Announcement>): Promise<Announcement | null> {
    const json = await dataApi({
      table: 'announcements',
      op: 'update',
      filters: [{ col: 'id', op: 'eq', val: id }],
      values: { ...data, updated_at: new Date().toISOString() },
    });
    return Array.isArray(json?.data) ? json.data[0] : json?.data;
  },

  async deleteAnnouncement(id: string): Promise<boolean> {
    const json = await dataApi({
      table: 'announcements',
      op: 'delete',
      filters: [{ col: 'id', op: 'eq', val: id }],
    });
    return !json?.error;
  }
};
