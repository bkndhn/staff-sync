import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Save, Users, Building, ShieldCheck, ArrowRight } from 'lucide-react';
import { workflowService, WorkflowConfig } from '../services/workflowService';
import { customAlert } from './CustomDialog';

export const WorkflowBuilder: React.FC = () => {
  const [configs, setConfigs] = useState<WorkflowConfig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    const data = await workflowService.getConfigs();
    setConfigs(data);
    setLoading(false);
  };

  const addConfig = () => {
    setConfigs([...configs, {
      id: `temp-${Date.now()}`,
      name: 'New Approval Workflow',
      entity_type: 'leave_request',
      levels: [{ level: 1, role: 'manager' }],
      is_active: true
    }]);
  };

  const updateConfig = (id: string, updates: Partial<WorkflowConfig>) => {
    setConfigs(configs.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const saveConfig = async (config: WorkflowConfig) => {
    const cleanConfig = { ...config };
    if (cleanConfig.id.startsWith('temp-')) {
      delete (cleanConfig as any).id;
    }
    const success = await workflowService.upsertConfig(cleanConfig);
    if (success) {
      customAlert('Workflow saved successfully!');
      loadConfigs();
    }
  };

  const deleteConfig = async (id: string) => {
    if (id.startsWith('temp-')) {
      setConfigs(configs.filter(c => c.id !== id));
      return;
    }
    const success = await workflowService.deleteConfig(id);
    if (success) loadConfigs();
  };

  const addLevel = (configId: string) => {
    const config = configs.find(c => c.id === configId);
    if (!config) return;
    const newLevel = config.levels.length + 1;
    updateConfig(configId, {
      levels: [...config.levels, { level: newLevel, role: 'admin' }]
    });
  };

  const removeLevel = (configId: string, levelIndex: number) => {
    const config = configs.find(c => c.id === configId);
    if (!config) return;
    const newLevels = [...config.levels];
    newLevels.splice(levelIndex, 1);
    // re-index
    newLevels.forEach((l, i) => l.level = i + 1);
    updateConfig(configId, { levels: newLevels });
  };

  if (loading) return <div className="text-white/50 p-4">Loading workflows...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-white">Multi-Level Approvals</h3>
        <button onClick={addConfig} className="btn-primary py-1.5 px-3 text-sm flex items-center gap-2">
          <Plus size={16} /> New Workflow
        </button>
      </div>

      {configs.length === 0 && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-6 text-center text-white/50">
          No approval workflows configured. Leaves and expenses will require instant Admin/Manager approval by default.
        </div>
      )}

      {configs.map(config => (
        <div key={config.id} className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
          <div className="flex justify-between items-start gap-4">
            <div className="flex-1 space-y-3">
              <input
                type="text"
                value={config.name}
                onChange={e => updateConfig(config.id, { name: e.target.value })}
                className="input-premium w-full text-lg font-semibold"
                placeholder="Workflow Name"
              />
              <div className="flex gap-4">
                <select 
                  value={config.entity_type} 
                  onChange={e => updateConfig(config.id, { entity_type: e.target.value as any })}
                  className="input-premium text-sm w-48"
                >
                  <option value="leave_request">Leave Requests</option>
                  <option value="expense_claim">Expense Claims</option>
                </select>
                <label className="flex items-center gap-2 text-sm text-white/70">
                  <input 
                    type="checkbox" 
                    checked={config.is_active} 
                    onChange={e => updateConfig(config.id, { is_active: e.target.checked })} 
                    className="rounded border-white/20 bg-white/5 text-indigo-500"
                  />
                  Active
                </label>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => saveConfig(config)} className="p-2 bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 rounded-lg transition-colors" title="Save Workflow">
                <Save size={18} />
              </button>
              <button onClick={() => deleteConfig(config.id)} className="p-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg transition-colors" title="Delete Workflow">
                <Trash2 size={18} />
              </button>
            </div>
          </div>

          <div className="mt-4 border-t border-white/10 pt-4">
            <h4 className="text-sm font-semibold text-white/70 mb-3">Approval Chain</h4>
            <div className="flex flex-wrap items-center gap-3">
              {config.levels.map((lvl, index) => (
                <React.Fragment key={index}>
                  {index > 0 && <ArrowRight size={16} className="text-white/30" />}
                  <div className="bg-[var(--bg-primary)] border border-white/10 rounded-lg p-3 flex-1 min-w-[200px] relative">
                    <div className="text-xs font-bold text-indigo-400 mb-2">Level {lvl.level}</div>
                    <select
                      value={lvl.role}
                      onChange={e => {
                        const newLevels = [...config.levels];
                        newLevels[index].role = e.target.value;
                        updateConfig(config.id, { levels: newLevels });
                      }}
                      className="input-premium w-full text-sm mb-2"
                    >
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                      
                    </select>
                    {config.levels.length > 1 && (
                      <button 
                        onClick={() => removeLevel(config.id, index)} 
                        className="absolute top-2 right-2 text-red-400 hover:text-red-300"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </React.Fragment>
              ))}
              <button onClick={() => addLevel(config.id)} className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white transition-colors">
                <Plus size={16} />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
