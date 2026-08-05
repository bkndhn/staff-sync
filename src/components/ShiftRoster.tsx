import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Wand2, Save, Send } from 'lucide-react';
import { shiftRosterService, ShiftRoster as ShiftRosterModel } from '../services/shiftRosterService';
import { Staff } from '../types';
import { customAlert, customConfirm } from './CustomDialog';

interface ShiftRosterProps {
  staff: Staff[];
  userLocation: string;
  userRole: string;
}

const SHIFT_OPTIONS = [
  { id: 'Morning', label: 'Morning', color: 'bg-amber-500/20 text-amber-500 border-amber-500/30' },
  { id: 'Evening', label: 'Evening', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' },
  { id: 'Night', label: 'Night', color: 'bg-slate-700/50 text-slate-300 border-slate-600/50' },
  { id: 'Both', label: 'Full Day', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  { id: 'Off', label: 'Week Off', color: 'bg-red-500/10 text-red-400 border-red-500/20' }
];

export const ShiftRoster: React.FC<ShiftRosterProps> = ({ staff, userLocation, userRole }) => {
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    const d = new Date();
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1); // Monday
    return d;
  });

  const [roster, setRoster] = useState<ShiftRosterModel[]>([]);
  const [localChanges, setLocalChanges] = useState<Record<string, string>>({}); // "staffId_date" -> "shiftKey"
  const [saving, setSaving] = useState(false);

  // Filter staff by location
  const activeStaff = useMemo(() => {
    return staff.filter(s => 
      s.isActive && 
      (userRole === 'admin' || s.location === userLocation)
    ).sort((a, b) => a.name.localeCompare(b.name));
  }, [staff, userLocation, userRole]);

  const weekDates = useMemo(() => {
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(currentWeekStart);
      d.setDate(d.getDate() + i);
      dates.push(d);
    }
    return dates;
  }, [currentWeekStart]);

  const startDateStr = weekDates[0].toISOString().split('T')[0];
  const endDateStr = weekDates[6].toISOString().split('T')[0];

  useEffect(() => {
    loadRoster();
  }, [startDateStr, endDateStr, userLocation]);

  const loadRoster = async () => {
    const data = await shiftRosterService.getByDateRange(startDateStr, endDateStr, userRole === 'admin' ? 'all' : userLocation);
    setRoster(data);
    setLocalChanges({});
  };

  const handlePrevWeek = () => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() - 7);
    setCurrentWeekStart(d);
  };

  const handleNextWeek = () => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + 7);
    setCurrentWeekStart(d);
  };

  const getShiftForCell = (staffId: string, dateStr: string) => {
    const key = `${staffId}_${dateStr}`;
    if (localChanges[key]) return localChanges[key];
    const existing = roster.find(r => r.staffId === staffId && r.date === dateStr);
    if (existing) return existing.shiftKey;
    
    // Default to the staff's base shift or Morning
    const member = staff.find(s => s.id === staffId);
    return member?.shift || 'Morning';
  };

  const handleCellChange = (staffId: string, dateStr: string, shiftKey: string) => {
    // Conflict detection: If they worked Night yesterday, warn about Morning today
    if (shiftKey === 'Morning') {
      const yesterday = new Date(dateStr);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      const yesterdayShift = getShiftForCell(staffId, yesterdayStr);
      
      if (yesterdayShift === 'Night') {
        alert('Conflict Detected: Staff is scheduled for Night shift the day before. 12 hours rest is recommended before a Morning shift.');
      }
    }

    setLocalChanges(prev => ({
      ...prev,
      [`${staffId}_${dateStr}`]: shiftKey
    }));
  };

  const handleAIFill = async () => {
    if (!await customConfirm('Auto-fill remaining shifts based on standard patterns?')) return;
    
    const newChanges = { ...localChanges };
    activeStaff.forEach(s => {
      weekDates.forEach(d => {
        const dStr = d.toISOString().split('T')[0];
        const key = `${s.id}_${dStr}`;
        if (!newChanges[key] && !roster.find(r => r.staffId === s.id && r.date === dStr)) {
          // Sunday is Off by default if they have sundayPenalty
          if (d.getDay() === 0 && !s.sundayPenalty) {
            newChanges[key] = 'Off';
          } else {
            newChanges[key] = s.shift || 'Morning';
          }
        }
      });
    });
    setLocalChanges(newChanges);
  };

  const handleSave = async () => {
    setSaving(true);
    const updates: Omit<ShiftRosterModel, 'id' | 'isPublished'>[] = [];
    
    for (const [key, shiftKey] of Object.entries(localChanges)) {
      const [staffId, date] = key.split('_');
      const s = staff.find(x => x.id === staffId);
      if (s) {
        updates.push({
          staffId,
          date,
          shiftKey,
          location: s.location
        });
      }
    }

    if (updates.length > 0) {
      const ok = await shiftRosterService.upsert(updates);
      if (ok) {
        customAlert('Roster saved successfully');
        await loadRoster();
      } else {
        customAlert('Failed to save roster');
      }
    }
    setSaving(false);
  };

  const handlePublish = async () => {
    if (!await customConfirm('Publish this roster? Staff will receive a push notification with their schedule.')) return;
    
    await handleSave(); // save first
    
    setSaving(true);
    const ok = await shiftRosterService.publish(startDateStr, endDateStr, userLocation);
    if (ok) {
      customAlert('Roster Published!');
      // A push notification could be fired from an Edge Function trigger here
      await loadRoster();
    }
    setSaving(false);
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Calendar className="text-indigo-400" />
            Shift Roster
          </h1>
          <p className="text-white/60">Plan weekly schedules and resolve conflicts automatically.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-white/5 rounded-lg border border-white/10 p-1">
            <button onClick={handlePrevWeek} className="p-1 text-white/70 hover:text-white"><ChevronLeft size={20}/></button>
            <span className="px-3 text-sm font-medium text-white">
              {weekDates[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - 
              {weekDates[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
            <button onClick={handleNextWeek} className="p-1 text-white/70 hover:text-white"><ChevronRight size={20}/></button>
          </div>
          
          <button onClick={handleAIFill} className="btn-secondary py-1.5 px-3 flex items-center gap-2 text-sm">
            <Wand2 size={16} className="text-amber-400" /> AI Auto-Fill
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-primary py-1.5 px-3 flex items-center gap-2 text-sm">
            <Save size={16} /> Save Draft
          </button>
          <button onClick={handlePublish} disabled={saving} className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg py-1.5 px-3 flex items-center gap-2 text-sm font-medium transition-colors">
            <Send size={16} /> Publish
          </button>
        </div>
      </div>

      <div className="bg-[var(--bg-card)] border border-[var(--glass-border)] rounded-2xl overflow-hidden shadow-[var(--shadow-soft)] overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[800px]">
          <thead>
            <tr className="bg-white/5 border-b border-white/10">
              <th className="p-4 font-semibold text-white/70 w-48 sticky left-0 bg-[var(--bg-card)] z-10">Staff</th>
              {weekDates.map(d => (
                <th key={d.toISOString()} className="p-3 font-semibold text-white/70 text-center min-w-[120px]">
                  <div className="text-xs opacity-70 uppercase tracking-wider">{d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                  <div className="text-sm">{d.getDate()} {d.toLocaleDateString('en-US', { month: 'short' })}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeStaff.map(member => (
              <tr key={member.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                <td className="p-3 sticky left-0 bg-[var(--bg-card)] z-10 border-r border-white/5">
                  <div className="font-semibold text-white text-sm">{member.name}</div>
                  <div className="text-xs text-white/50">{member.designation || 'Staff'}</div>
                </td>
                {weekDates.map(d => {
                  const dStr = d.toISOString().split('T')[0];
                  const currentVal = getShiftForCell(member.id, dStr);
                  const opt = SHIFT_OPTIONS.find(o => o.id === currentVal) || SHIFT_OPTIONS[0];
                  const isPublished = roster.find(r => r.staffId === member.id && r.date === dStr)?.isPublished;
                  
                  return (
                    <td key={dStr} className="p-2 border-r border-white/5 last:border-0 relative">
                      <select
                        value={currentVal}
                        onChange={(e) => handleCellChange(member.id, dStr, e.target.value)}
                        disabled={isPublished}
                        className={`w-full text-xs font-semibold appearance-none border rounded-lg p-2 outline-none cursor-pointer text-center ${opt.color} ${isPublished ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {SHIFT_OPTIONS.map(o => (
                          <option key={o.id} value={o.id} className="bg-slate-800 text-white">{o.label}</option>
                        ))}
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
