import { dataApi } from '../lib/dataApi';

export interface WorkflowConfig {
  id: string;
  name: string;
  entity_type: 'leave_request' | 'expense_claim';
  levels: Array<{ level: number; role: string; location?: string }>;
  is_active: boolean;
}

export const workflowService = {
  async getConfigs(): Promise<WorkflowConfig[]> {
    const { data, error } = await dataApi
      .from('workflow_configs')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching workflows:', error);
      return [];
    }

    return (data || []) as WorkflowConfig[];
  },

  async upsertConfig(config: Omit<WorkflowConfig, 'id'> | WorkflowConfig): Promise<boolean> {
    const { error } = await dataApi
      .from('workflow_configs')
      .upsert(config as any);

    if (error) {
      console.error('Error upserting workflow config:', error);
      return false;
    }
    return true;
  },

  async deleteConfig(id: string): Promise<boolean> {
    const { error } = await dataApi
      .from('workflow_configs')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting workflow config:', error);
      return false;
    }
    return true;
  }
};
