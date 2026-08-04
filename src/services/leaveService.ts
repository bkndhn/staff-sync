import { dataApi } from '../lib/dataApi';
import { notificationService } from './notificationService';

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
  currentApprovalLevel?: number;
  requiredApprovalLevels?: number;
  approvalHistory?: Array<{ level: number; role: string; user: string; action: string; comment?: string; date: string }>;
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
  currentApprovalLevel: row.current_approval_level,
  requiredApprovalLevels: row.required_approval_levels,
  approvalHistory: row.approval_history || [],
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const leaveService = {
  async getByStaffId(staffId: string): Promise<LeaveRequest[]> {
    const { data, error } = await dataApi
      .from('leave_requests' as any)
      .select('*')
      .eq('staff_id', staffId)
      .order('leave_date', { ascending: false });

    if (error) { console.error('Error fetching leaves:', error); return []; }
    return (data || []).map(mapRow);
  },

  async getByLocation(location: string): Promise<LeaveRequest[]> {
    const { data, error } = await dataApi
      .from('leave_requests' as any)
      .select('*')
      .eq('location', location)
      .order('created_at', { ascending: false });

    if (error) { console.error('Error fetching leaves:', error); return []; }
    return (data || []).map(mapRow);
  },

  async getAll(): Promise<LeaveRequest[]> {
    const { data, error } = await dataApi
      .from('leave_requests' as any)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) { console.error('Error fetching leaves:', error); return []; }
    return (data || []).map(mapRow);
  },

  async create(input: CreateLeaveInput): Promise<LeaveRequest | null> {
    // Check for active workflow configs to determine required levels
    const { data: configs } = await dataApi.from('workflow_configs').select('*').eq('entity_type', 'leave_request').eq('is_active', true);
    
    let requiredLevels = 1;
    if (configs && configs.length > 0) {
      // For simplicity, just use the first active workflow
      const levels = (configs[0] as any).levels;
      if (Array.isArray(levels) && levels.length > 0) {
        requiredLevels = Math.max(...levels.map((l: any) => l.level));
      }
    }

    const { data, error } = await dataApi
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
        current_approval_level: 1,
        required_approval_levels: requiredLevels,
        approval_history: []
      })
      .select()
      .single();

    if (error) { console.error('Error creating leave:', error); return null; }
    return data ? mapRow(data) : null;
  },

  async updateStatus(
    id: string, 
    status: string, 
    comment: string, 
    reviewedBy: string, 
    role: string = 'manager',
    currentRequest?: LeaveRequest
  ): Promise<boolean> {
    
    let nextStatus = status;
    let nextLevel = (currentRequest?.currentApprovalLevel || 1);
    const requiredLevels = currentRequest?.requiredApprovalLevels || 1;
    
    // If it's an approval and there are more levels required, it remains pending and moves to next level
    if (status === 'approved' && nextLevel < requiredLevels) {
      nextStatus = 'pending';
      nextLevel += 1;
    }

    const historyEntry = {
      level: currentRequest?.currentApprovalLevel || 1,
      role,
      user: reviewedBy,
      action: status, // the user's action (approved/rejected)
      comment,
      date: new Date().toISOString()
    };

    const newHistory = [...(currentRequest?.approvalHistory || []), historyEntry];

    const { error } = await dataApi
      .from('leave_requests' as any)
      .update({
        status: nextStatus,
        manager_comment: comment, // keep latest comment for backward compatibility
        reviewed_by: reviewedBy,  // keep latest reviewer
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        current_approval_level: nextLevel,
        approval_history: newHistory
      })
      .eq('id', id);

    if (error) { console.error('Error updating leave:', error); return false; }
    
    // Trigger push notification if fully approved/rejected
    if (nextStatus === 'approved' || nextStatus === 'rejected') {
      try {
        if (currentRequest?.staffId) await notificationService.sendToStaff({
          staffId: currentRequest.staffId,
          title: `Leave ${nextStatus === 'approved' ? 'Approved' : 'Rejected'}`,
          body: `Your leave on ${currentRequest.leaveDate} has been ${nextStatus}. ${comment ? 'Comment: ' + comment : ''}`,
          actionUrl: '/?tab=My%20Portal',
        });
      } catch (e) {
        console.error('Failed to send push notification', e);
      }
    }

    return true;
  },
};
