import React, { useState } from 'react';
import { X, Plus, Trash2, Sliders, Eye, EyeOff } from 'lucide-react';
import { CustomFieldDefinition } from '../types';
import { customFieldsService } from '../services/customFieldsService';

interface CustomFieldsManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  fields: CustomFieldDefinition[];
  onFieldsChange: (fields: CustomFieldDefinition[]) => void;
}

export const CustomFieldsManagerModal: React.FC<CustomFieldsManagerModalProps> = ({
  isOpen,
  onClose,
  fields,
  onFieldsChange
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [label, setLabel] = useState('');
  const [type, setType] = useState<'text' | 'number' | 'date' | 'select'>('text');
  const [optionsStr, setOptionsStr] = useState('');
  const [showInTable, setShowInTable] = useState(true);

  if (!isOpen) return null;

  const handleAddField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;

    const options = type === 'select' ? optionsStr.split(',').map(s => s.trim()).filter(Boolean) : undefined;
    const updated = await customFieldsService.addCustomField({
      label: label.trim(),
      type,
      options,
      showInTable
    });

    onFieldsChange(updated);
    setLabel('');
    setType('text');
    setOptionsStr('');
    setShowInTable(true);
    setShowAddForm(false);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to remove this custom field definition? Existing values on staff will remain saved.')) {
      const updated = await customFieldsService.deleteCustomField(id);
      onFieldsChange(updated);
    }
  };

  const handleToggleTable = async (id: string) => {
    const updated = await customFieldsService.toggleShowInTable(id);
    onFieldsChange(updated);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content !max-w-xl w-full max-h-[85vh] flex flex-col p-0 overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="p-4 sm:p-6 border-b border-[var(--glass-border)] flex items-center justify-between bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center border border-purple-500/30">
              <Sliders size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--text-primary)]">Dynamic Custom Fields</h2>
              <p className="text-xs text-[var(--text-muted)]">Define custom profile attributes for your staff</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-[var(--text-primary)] flex items-center justify-center transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Configured Fields ({fields.length})</h3>
            {!showAddForm && (
              <button
                onClick={() => setShowAddForm(true)}
                className="btn-premium px-3 py-1.5 text-xs flex items-center gap-1.5 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 !text-white rounded-lg font-medium shadow-md transition-all"
              >
                <Plus size={14} /> Add Custom Field
              </button>
            )}
          </div>

          {/* Add Field Form */}
          {showAddForm && (
            <form onSubmit={handleAddField} className="p-4 rounded-xl bg-white/5 border border-purple-500/30 space-y-3">
              <h4 className="text-xs font-bold text-purple-400">New Attribute Definition</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-primary)] mb-1">Field Label *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Blood Group, T-Shirt Size"
                    value={label}
                    onChange={e => setLabel(e.target.value)}
                    className="input-premium text-xs w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-primary)] mb-1">Input Type</label>
                  <select
                    value={type}
                    onChange={e => setType(e.target.value as any)}
                    className="input-premium text-xs w-full"
                  >
                    <option value="text" className="bg-slate-900 text-white">Text Input</option>
                    <option value="number" className="bg-slate-900 text-white">Numeric Input</option>
                    <option value="date" className="bg-slate-900 text-white">Date Picker</option>
                    <option value="select" className="bg-slate-900 text-white">Dropdown Select</option>
                  </select>
                </div>
              </div>

              {type === 'select' && (
                <div>
                  <label className="block text-xs font-medium text-[var(--text-primary)] mb-1">Dropdown Options (Comma Separated)</label>
                  <input
                    type="text"
                    required
                    placeholder="Option 1, Option 2, Option 3"
                    value={optionsStr}
                    onChange={e => setOptionsStr(e.target.value)}
                    className="input-premium text-xs w-full"
                  />
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--text-primary)]">
                  <input
                    type="checkbox"
                    checked={showInTable}
                    onChange={e => setShowInTable(e.target.checked)}
                    className="checkbox-premium"
                  />
                  Show as column in Staff Table
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-3 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1 text-xs bg-purple-500 hover:bg-purple-600 !text-white rounded-md font-medium transition-colors"
                  >
                    Save Field
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Fields List */}
          {fields.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-[var(--glass-border)] rounded-xl">
              <p className="text-xs text-[var(--text-muted)]">No custom fields created yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {fields.map(field => (
                <div key={field.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-[var(--glass-border)] hover:border-purple-500/40 transition-all">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[var(--text-primary)]">{field.label}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-500/20 text-purple-400 border border-purple-500/30">
                        {field.type}
                      </span>
                    </div>
                    {field.options && field.options.length > 0 && (
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                        Options: {field.options.join(', ')}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleTable(field.id)}
                      title={field.showInTable ? 'Visible in Staff Table' : 'Hidden from Staff Table'}
                      className={`px-2.5 py-1 rounded-lg text-xs flex items-center gap-1.5 transition-colors ${
                        field.showInTable
                          ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 font-semibold'
                          : 'bg-white/5 text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {field.showInTable ? <Eye size={13} /> : <EyeOff size={13} />}
                      <span className="hidden sm:inline">{field.showInTable ? 'In Table' : 'Hidden'}</span>
                    </button>
                    <button
                      onClick={() => handleDelete(field.id)}
                      className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/20 transition-colors"
                      title="Delete Custom Field"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--glass-border)] bg-white/5 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 btn-premium text-xs font-semibold rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
