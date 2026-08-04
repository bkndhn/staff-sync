import { dataApi } from '../lib/dataApi';
import { supabase } from '../lib/supabase';

export interface StaffGrievance {
  id: string;
  staffId: string;
  staffName?: string;
  location?: string;
  type: 'attendance' | 'salary' | 'other';
  targetDate?: string;
  description: string;
  status: 'pending' | 'resolved' | 'rejected' | 'escalated';
  resolutionNotes?: string;
  currentApprovalLevel: number;
  requiredApprovalLevels: number;
  approvalHistory: Array<{ level: number; role: string; user: string; action: string; comment?: string; date: string }>;
  createdAt: string;
  updatedAt: string;
}

export const grievanceService = {
  async getByStaffId(staffId: string): Promise<StaffGrievance[]> {
    const { data, error } = await dataApi
      .from('staff_grievances')
      .select('*, staff:staff_id(name, location)')
      .eq('staff_id', staffId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching grievances:', error);
      return [];
    }

    return (data || []).map(mapRow);
  },

  async getAllActive(location?: string): Promise<StaffGrievance[]> {
    let query = dataApi
      .from('staff_grievances')
      .select('*, staff:staff_id(name, location)')
      .in('status', ['pending', 'escalated'])
      .order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching active grievances:', error);
      return [];
    }

    let results = (data || []).map(mapRow);
    if (location && location !== 'all') {
      results = results.filter((g: any) => g.location === location);
    }
    return results;
  },

  async reportIssue(
    staffId: string, 
    type: 'attendance' | 'salary' | 'other', 
    description: string, 
    targetDate?: string
  ): Promise<boolean> {
    
    // Check for active workflow configs to determine required levels
    const { data: configs } = await supabase.from('workflow_configs' as any).select('*').eq('entity_type', 'grievance').eq('is_active', true);
    
    let requiredLevels = 1;
    if (configs && configs.length > 0) {
      const levels = (configs[0] as any).levels;
      if (Array.isArray(levels) && levels.length > 0) {
        requiredLevels = Math.max(...levels.map((l: any) => l.level));
      }
    }

    const { error } = await dataApi
      .from('staff_grievances')
      .insert({
        staff_id: staffId,
        type,
        target_date: targetDate || null,
        description,
        status: 'pending',
        current_approval_level: 1,
        required_approval_levels: requiredLevels,
        approval_history: []
      });

    if (error) {
      console.error('Error reporting grievance:', error);
      return false;
    }
    return true;
  },

  async updateStatus(
    id: string,
    status: string,
    resolutionNotes: string,
    reviewedBy: string,
    role: string = 'manager',
    currentGrievance?: StaffGrievance
  ): Promise<boolean> {
    
    let nextStatus = status;
    let nextLevel = (currentGrievance?.currentApprovalLevel || 1);
    const requiredLevels = currentGrievance?.requiredApprovalLevels || 1;
    
    if (status === 'resolved' && nextLevel < requiredLevels) {
      nextStatus = 'escalated'; // instead of pending, we mark it escalated for the next level
      nextLevel += 1;
    }

    const historyEntry = {
      level: currentGrievance?.currentApprovalLevel || 1,
      role,
      user: reviewedBy,
      action: status,
      comment: resolutionNotes,
      date: new Date().toISOString()
    };

    const newHistory = [...(currentGrievance?.approvalHistory || []), historyEntry];

    const { error } = await dataApi
      .from('staff_grievances')
      .update({
        status: nextStatus,
        resolution_notes: resolutionNotes,
        current_approval_level: nextLevel,
        approval_history: newHistory,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) {
      console.error('Error updating grievance:', error);
      return false;
    }

    // Trigger push notification if fully resolved/rejected
    if (nextStatus === 'resolved' || nextStatus === 'rejected') {
      try {
        await supabase.functions.invoke('send-notification', {
          body: {
            staffId: currentGrievance?.staffId,
            title: `Issue ${nextStatus === 'resolved' ? 'Resolved' : 'Rejected'}`,
            body: `Your issue regarding ${currentGrievance?.type} has been ${nextStatus}. ${resolutionNotes ? 'Note: ' + resolutionNotes : ''}`
          }
        });
      } catch (e) {
        console.warn('Failed to send push notification', e);
      }
    }

    return true;
  }
};

function mapRow(row: any): StaffGrievance {
  return {
    id: row.id,
    staffId: row.staff_id,
    staffName: row.staff?.name,
    location: row.staff?.location,
    type: row.type,
    targetDate: row.target_date,
    description: row.description,
    status: row.status,
    resolutionNotes: row.resolution_notes,
    currentApprovalLevel: row.current_approval_level,
    requiredApprovalLevels: row.required_approval_levels,
    approvalHistory: row.approval_history || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
