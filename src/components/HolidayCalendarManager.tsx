import React, { useState, useEffect } from 'react';
import { customAlert, customConfirm } from './CustomDialog';
import { dataApi } from '../lib/dataApi';
import { Calendar, Plus, Edit, Trash2, Upload, X } from 'lucide-react';

interface Holiday {
  id: string;
  name: string;
  date: string;
  type: string;
  is_optional: boolean;
  applicable_locations: string | string[];
}

export default function HolidayCalendarManager() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    date: '',
    type: 'national',
    is_optional: false,
    applicable_locations: ''
  });

  const fetchHolidays = async () => {
    setLoading(true);
    const { data } = await dataApi.from('holidays').select('*').order('date', { ascending: true });
    setHolidays(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchHolidays();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: formData.name,
      date: formData.date,
      type: formData.type,
      is_optional: formData.is_optional,
      applicable_locations: formData.applicable_locations
    };

    if (editingId) {
      const { error } = await dataApi.from('holidays').update(payload).eq('id', editingId);
      if (error) customAlert('Error updating holiday');
      else {
        customAlert('Holiday updated');
        setShowForm(false);
        fetchHolidays();
      }
    } else {
      const { error } = await dataApi.from('holidays').insert(payload);
      if (error) customAlert('Error adding holiday');
      else {
        customAlert('Holiday added');
        setShowForm(false);
        fetchHolidays();
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (await customConfirm('Are you sure you want to delete this holiday?')) {
      const { error } = await dataApi.from('holidays').delete().eq('id', id);
      if (error) customAlert('Error deleting holiday');
      else {
        fetchHolidays();
      }
    }
  };

  const handleEdit = (h: Holiday) => {
    setFormData({
      name: h.name,
      date: h.date,
      type: h.type,
      is_optional: h.is_optional,
      applicable_locations: Array.isArray(h.applicable_locations) ? h.applicable_locations.join(',') : h.applicable_locations || ''
    });
    setEditingId(h.id);
    setShowForm(true);
  };

  const handleBulkImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target?.result as string;
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      
      const toInsert: any[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim());
        if (cols.length >= 3) {
          toInsert.push({
            name: cols[0],
            date: cols[1],
            type: cols[2],
            is_optional: false,
            applicable_locations: 'all'
          });
        }
      }
      
      if (toInsert.length > 0) {
        let errors = 0;
        for (const item of toInsert) {
           const { error } = await dataApi.from('holidays').insert(item);
           if (error) errors++;
        }
        if (errors > 0) customAlert(`Import finished with ${errors} errors`);
        else customAlert(`Successfully imported ${toInsert.length} holidays`);
        fetchHolidays();
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const grouped = holidays.reduce((acc, curr) => {
    const year = new Date(curr.date).getFullYear() || 'Unknown';
    if (!acc[year]) acc[year] = [];
    acc[year].push(curr);
    return acc;
  }, {} as Record<string, Holiday[]>);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto pb-24 h-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Calendar className="text-blue-500" size={32} />
            Holiday Calendar
          </h1>
          <p className="text-gray-500 mt-1">Manage public and company holidays</p>
        </div>
        <div className="flex gap-3">
          <label className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-50 flex items-center gap-2 cursor-pointer shadow-sm transition-colors">
            <Upload size={18} /> Bulk Import CSV
            <input type="file" accept=".csv" className="hidden" onChange={handleBulkImport} />
          </label>
          <button
            onClick={() => {
              setEditingId(null);
              setFormData({ name: '', date: '', type: 'national', is_optional: false, applicable_locations: '' });
              setShowForm(true);
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors flex items-center gap-2"
          >
            <Plus size={18} /> Add Holiday
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-xl border border-white/20 p-6 mb-8 animate-in fade-in slide-in-from-top-4">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-800">{editingId ? 'Edit Holiday' : 'New Holiday'}</h2>
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
              <X size={24} />
            </button>
          </div>
          
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Holiday Name *</label>
                <input required type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full p-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. Christmas" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                <input required type="date" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} className="w-full p-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })} className="w-full p-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="national">National</option>
                  <option value="regional">Regional</option>
                  <option value="restricted">Restricted</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Applicable Locations (comma separated)</label>
                <input type="text" value={formData.applicable_locations} onChange={e => setFormData({ ...formData, applicable_locations: e.target.value })} className="w-full p-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" placeholder="all, or loc1, loc2" />
              </div>
            </div>
            
            <div className="flex items-center gap-2 mt-4">
              <input type="checkbox" id="optional" checked={formData.is_optional} onChange={e => setFormData({ ...formData, is_optional: e.target.checked })} className="w-4 h-4 text-blue-600 rounded border-gray-300" />
              <label htmlFor="optional" className="text-sm text-gray-700 font-medium">Is Optional Holiday?</label>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button type="button" onClick={() => setShowForm(false)} className="px-5 py-2.5 rounded-lg font-medium text-gray-600 bg-gray-100 hover:bg-gray-200">Cancel</button>
              <button type="submit" className="px-5 py-2.5 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-700 shadow-sm">{editingId ? 'Update' : 'Save'} Holiday</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading holidays...</div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="bg-white/80 backdrop-blur rounded-2xl border border-gray-200 shadow-sm p-12 text-center">
          <Calendar size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">No Holidays Found</h3>
          <p className="text-gray-500">Add some holidays or import a CSV to get started.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).sort(([a], [b]) => Number(b) - Number(a)).map(([year, hols]) => (
            <div key={year} className="bg-white/80 backdrop-blur rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="bg-gray-50/80 px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-bold text-gray-800">{year}</h3>
              </div>
              <div className="divide-y divide-gray-100">
                {hols.map(h => (
                  <div key={h.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-6 hover:bg-gray-50/50 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 mb-4 sm:mb-0">
                      <div className="flex flex-col items-start sm:items-center justify-center bg-blue-50 text-blue-700 rounded-lg p-2 min-w-[70px]">
                        <span className="text-xs font-bold uppercase">{new Date(h.date).toLocaleString('default', { month: 'short' })}</span>
                        <span className="text-xl font-bold leading-none">{new Date(h.date).getDate()}</span>
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                          {h.name}
                          {h.is_optional && <span className="bg-purple-100 text-purple-700 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase">Optional</span>}
                        </h4>
                        <div className="text-sm text-gray-500 flex items-center gap-3 mt-1">
                          <span className="capitalize text-gray-600 bg-gray-100 px-2 rounded-sm text-xs">{h.type}</span>
                          {h.applicable_locations && h.applicable_locations !== 'all' && (
                            <span className="text-xs">Loc: {h.applicable_locations}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleEdit(h)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                        <Edit size={18} />
                      </button>
                      <button onClick={() => handleDelete(h.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
