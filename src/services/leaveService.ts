import { supabase } from '../lib/supabase';

export interface LeaveRequest {
  id: string;
  staffId: string;
  staffName: string;
  location: string;
  leaveDate: string;
  leaveEndDate?: string;
  leaveType: 'casual' | 'sick' | 'personal' | 'emergency' | 'other';
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'postponed';
  managerComment?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLeaveInput {
  staffId: string;
  staffName: string;
  location: string;
  leaveDate: string;
  leaveEndDate?: string;
  leaveType: 'casual' | 'sick' | 'personal' | 'emergency' | 'other';
  reason: string;
}

const mapRow = (row: any): LeaveRequest => ({
  id: row.id,
  staffId: row.staff_id,
  staffName: row.staff_name,
  location: row.location,
  leaveDate: row.leave_date,
  leaveEndDate: row.leave_end_date,
  leaveType: row.leave_type,
  reason: row.reason,
  status: row.status,
  managerComment: row.manager_comment,
  reviewedBy: row.reviewed_by,
  reviewedAt: row.reviewed_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const leaveService = {
  async getByStaffId(staffId: string): Promise<LeaveRequest[]> {
    const { data, error } = await supabase
      .from('leave_requests' as any)
      .select('*')
      .eq('staff_id', staffId)
      .order('leave_date', { ascending: false });

    if (error) { console.error('Error fetching leaves:', error); return []; }
    return (data || []).map(mapRow);
  },

  async getByLocation(location: string): Promise<LeaveRequest[]> {
    const { data, error } = await supabase
      .from('leave_requests' as any)
      .select('*')
      .eq('location', location)
      .order('created_at', { ascending: false });

    if (error) { console.error('Error fetching leaves:', error); return []; }
    return (data || []).map(mapRow);
  },

  async getAll(): Promise<LeaveRequest[]> {
    const { data, error } = await supabase
      .from('leave_requests' as any)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) { console.error('Error fetching leaves:', error); return []; }
    return (data || []).map(mapRow);
  },

  async create(input: CreateLeaveInput): Promise<LeaveRequest | null> {
    const { data, error } = await supabase
      .from('leave_requests' as any)
      .insert({
        staff_id: input.staffId,
        staff_name: input.staffName,
        location: input.location,
        leave_date: input.leaveDate,
        leave_end_date: input.leaveEndDate || null,
        leave_type: input.leaveType,
        reason: input.reason,
        status: 'pending',
      })
      .select()
      .single();

    if (error) { console.error('Error creating leave:', error); return null; }
    return data ? mapRow(data) : null;
  },

  async updateStatus(id: string, status: string, comment: string, reviewedBy: string): Promise<boolean> {
    const { error } = await supabase
      .from('leave_requests' as any)
      .update({
        status,
        manager_comment: comment,
        reviewed_by: reviewedBy,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) { console.error('Error updating leave:', error); return false; }
    return true;
  },
};
