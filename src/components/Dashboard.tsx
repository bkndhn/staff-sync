import React from 'react';
import { Staff, Attendance } from '../types';
import { Users, Clock, Calendar, MapPin, TrendingUp, Sun, Moon, ArrowUp, ArrowDown, GripVertical, Share2, Copy, MessageCircle, AlertTriangle } from 'lucide-react';
import { calculateLocationAttendance } from '../utils/salaryCalculations';
interface DashboardProps {
  staff: Staff[];
  attendance: Attendance[];
  selectedDate: string;
  onDateChange: (date: string) => void;
  userRole?: 'admin' | 'manager';
  userLocation?: string;
  isDarkTheme: boolean;
  toggleTheme: () => void;
}

const LOCATION_ORDER_KEY = 'dashboard_location_order';

const Dashboard: React.FC<DashboardProps> = ({
  staff,
  attendance,
  selectedDate,
  onDateChange,
  userRole = 'manager',
  userLocation = '',
  isDarkTheme,
  toggleTheme
}) => {
  const todayAttendance = attendance.filter(record => record.date === selectedDate);
  const filteredStaff = userRole === 'admin' ? staff : staff.filter(member => member.location === userLocation);
  const allActiveStaff = staff.filter(member => member.isActive);
  const activeStaff = filteredStaff.filter(member => member.isActive);
  const fullTimeStaff = activeStaff.filter(member => member.type === 'full-time');
  const filteredTodayAttendance = todayAttendance;
  const fullTimeAttendance = filteredTodayAttendance.filter(record => !record.isPartTime);

  const fullTimeAttendanceForStats = userRole === 'admin'
    ? fullTimeAttendance
    : fullTimeAttendance.filter(record => {
      const staffMember = staff.find(s => s.id === record.staffId);
      return staffMember?.location === userLocation;
    });

  const presentToday = fullTimeAttendanceForStats.filter(record => record.status === 'Present').length;
  const halfDayToday = fullTimeAttendanceForStats.filter(record => record.status === 'Half Day').length;
  const absentToday = fullTimeAttendanceForStats.filter(record => record.status === 'Absent').length;

  const partTimeAttendance = userRole === 'admin'
    ? filteredTodayAttendance.filter(record => record.isPartTime && record.status === 'Present')
    : filteredTodayAttendance.filter(record =>
      record.isPartTime && record.status === 'Present' && record.location === userLocation
    );

  const partTimeBoth = partTimeAttendance.filter(record => record.shift === 'Both').length;
  const partTimeMorning = partTimeAttendance.filter(record => record.shift === 'Morning').length;
  const partTimeEvening = partTimeAttendance.filter(record => record.shift === 'Evening').length;
  const partTimeTotal = partTimeBoth + partTimeMorning + partTimeEvening;

  const [locations, setLocations] = React.useState<{ name: string; color: string; stats: any }[]>([]);
  const [locationOrder, setLocationOrder] = React.useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(LOCATION_ORDER_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  const [showOrderEditor, setShowOrderEditor] = React.useState(false);

  React.useEffect(() => {
    const loadLocations = async () => {
      const { locationService } = await import('../services/locationService');
      const fetchedLocations = await locationService.getLocations();

      const colors = [
        'bg-blue-100 text-blue-800',
        'bg-green-100 text-green-800',
        'bg-purple-100 text-purple-800',
        'bg-orange-100 text-orange-800',
        'bg-teal-100 text-teal-800',
        'bg-indigo-100 text-indigo-800'
      ];

      const locationsToShow = userRole === 'admin'
        ? fetchedLocations
        : fetchedLocations.filter(loc => loc.name === userLocation);

      let formattedLocations = locationsToShow.map((loc, index) => ({
        name: loc.name,
        color: colors[index % colors.length],
        stats: calculateLocationAttendance(activeStaff, todayAttendance, selectedDate, loc.name)
      }));

      // Apply custom order if available
      if (locationOrder.length > 0) {
        formattedLocations.sort((a, b) => {
          const idxA = locationOrder.indexOf(a.name);
          const idxB = locationOrder.indexOf(b.name);
          if (idxA === -1 && idxB === -1) return 0;
          if (idxA === -1) return 1;
          if (idxB === -1) return -1;
          return idxA - idxB;
        });
      }

      setLocations(formattedLocations);
    };
    loadLocations();
  }, [activeStaff, todayAttendance, selectedDate, userRole, userLocation, locationOrder]);

  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = React.useState<number | null>(null);

  const moveLocation = (index: number, direction: 'up' | 'down') => {
    const names = locations.map(l => l.name);
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= names.length) return;
    [names[index], names[newIndex]] = [names[newIndex], names[index]];
    setLocationOrder(names);
    localStorage.setItem(LOCATION_ORDER_KEY, JSON.stringify(names));
  };

  const handleLocDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleLocDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIdx(index);
  };

  const handleLocDrop = (e: React.DragEvent, dropIdx: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === dropIdx) {
      setDragIndex(null);
      setDragOverIdx(null);
      return;
    }
    const names = locations.map(l => l.name);
    const [moved] = names.splice(dragIndex, 1);
    names.splice(dropIdx, 0, moved);
    setLocationOrder(names);
    localStorage.setItem(LOCATION_ORDER_KEY, JSON.stringify(names));
    setDragIndex(null);
    setDragOverIdx(null);
  };

  const sortStaffIdsByOrder = (ids: string[]) => {
    return [...ids].sort((a, b) => {
      const indexA = staff.findIndex(s => s.id === a);
      const indexB = staff.findIndex(s => s.id === b);
      return indexA - indexB;
    });
  };

  const fmt12h = (t?: string) => {
    if (!t) return '—';
    const [hh, mm] = t.split(':');
    let h = parseInt(hh, 10);
    const m = mm || '00';
    if (isNaN(h)) return t;
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    return `${h}:${m} ${ampm}`;
  };

  const renderPunchList = (ids: string[]) => {
    if (ids.length === 0) return null;
    return (
      <div className="mt-2 space-y-1">
        {ids.map(id => {
          const sm = allActiveStaff.find(s => s.id === id);
          const rec = fullTimeAttendance.find(a => a.staffId === id);
          if (!sm) return null;
          return (
            <div key={id} className="flex items-center justify-between gap-2 text-[11px] md:text-xs px-2 py-1 rounded bg-white/5 border border-white/10">
              <span className="font-semibold text-white/85 truncate">{sm.name}</span>
              <span className="font-mono text-white/70 whitespace-nowrap">
                <span className="text-emerald-300">IN {fmt12h(rec?.arrivalTime)}</span>
                <span className="mx-1 text-white/30">·</span>
                <span className="text-blue-300">OUT {fmt12h(rec?.leavingTime)}</span>
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  const formatStaffName = (staffId: string, isPartTime: boolean = false, staffName?: string, shift?: string) => {
    if (isPartTime) return shift ? `${staffName} (${shift})` : staffName;
    const staffMember = allActiveStaff.find(s => s.id === staffId);
    const attendanceRecord = filteredTodayAttendance.find(a => a.staffId === staffId && !a.isPartTime);
    const uninformedTag = attendanceRecord?.isUninformed ? ' ⚠UI' : '';
    if (attendanceRecord?.status === 'Half Day' && attendanceRecord?.shift) {
      return `${staffMember?.name} (${attendanceRecord.shift})${uninformedTag}`;
    }
    return `${staffMember?.name}${uninformedTag}`;
  };

  // Count uninformed leaves for today
  const uninformedCount = filteredTodayAttendance.filter(r => r.isUninformed).length;

  const generateDashboardShareText = () => {
    const date = new Date(selectedDate + 'T00:00:00');
    const dateStr = date.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
    let text = `📊 *Dashboard Report - ${dateStr}*\n\n`;
    text += `👥 Active Staff: ${activeStaff.length}\n`;
    text += `✅ Present: ${presentToday} | 🕒 Half Day: ${halfDayToday} | ❌ Absent: ${absentToday}\n`;
    if (uninformedCount > 0) text += `⚠️ Uninformed Leaves: ${uninformedCount}\n`;
    if (partTimeTotal > 0) text += `👥 Part-Time: ${partTimeTotal} (B:${partTimeBoth} M:${partTimeMorning} E:${partTimeEvening})\n`;
    text += '\n';
    locations.forEach(loc => {
      const locAtt = fullTimeAttendance.filter(r => {
        const s = activeStaff.find(st => st.id === r.staffId);
        return s?.location === loc.name;
      });
      const p = locAtt.filter(r => r.status === 'Present').length;
      const h = locAtt.filter(r => r.status === 'Half Day').length;
      const a = locAtt.filter(r => r.status === 'Absent').length;
      text += `📍 *${loc.name}*: ✅${p} 🕒${h} ❌${a}\n`;
    });
    return text;
  };

  const handleShareWhatsApp = () => {
    const text = generateDashboardShareText();
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleCopyReport = async () => {
    const text = generateDashboardShareText();
    await navigator.clipboard.writeText(text);
    alert('Dashboard report copied!');
  };

  return (
    <div className="p-1 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="stat-icon stat-icon-primary shrink-0">
            <Calendar size={24} />
          </div>
          <div>
            <h1 className="text-xl md:text-3xl font-bold text-white leading-tight">Dashboard</h1>
            <p className="text-white/50 text-xs md:text-sm">Overview & tracking</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          <button
            onClick={handleShareWhatsApp}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-medium transition-all duration-300 shadow-lg active:scale-95 shrink-0"
            title="Share via WhatsApp"
          >
            <MessageCircle size={16} />
            <span className="text-xs md:text-sm">Share</span>
          </button>
          <button
            onClick={handleCopyReport}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-medium transition-all duration-300 shadow-lg active:scale-95 shrink-0"
            title="Copy report to clipboard"
          >
            <Copy size={16} />
            <span className="text-xs md:text-sm">Copy</span>
          </button>
          <button
            onClick={toggleTheme}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white font-medium transition-all duration-300 shadow-lg active:scale-95 shrink-0"
            title={isDarkTheme ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          >
            {isDarkTheme ? <Sun size={16} /> : <Moon size={16} />}
            <span className="text-xs md:text-sm">{isDarkTheme ? 'Light' : 'Dark'}</span>
          </button>

          <div className="w-[160px] md:w-[180px] lg:w-48">
            <label className="block text-[10px] uppercase tracking-wider font-bold text-white/40 mb-1 ml-1">Select Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => onDateChange(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              className="input-premium py-2 px-3 text-sm"
            />
          </div>

          <div className="hidden sm:block text-right px-2 lg:px-3">
            <span className="text-xs font-bold text-white/30 uppercase tracking-tighter block">Day</span>
            <span className="text-sm font-semibold text-white/70">
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' })}
            </span>
          </div>
        </div>
      </div>

      {/* Stats Cards - Admin Only */}
      {userRole === 'admin' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
            <div className="stat-card card-animate">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/60 mb-1">Active Staff</p>
                  <p className="text-3xl font-bold text-white">{activeStaff.length}</p>
                </div>
                <div className="stat-icon stat-icon-primary"><Users size={22} /></div>
              </div>
            </div>
            <div className="stat-card stat-card-success card-animate">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/60 mb-1">Present Today</p>
                  <p className="text-3xl font-bold text-emerald-400">{presentToday + halfDayToday}</p>
                </div>
                <div className="stat-icon stat-icon-success"><Clock size={22} /></div>
              </div>
            </div>
            <div className="stat-card stat-card-warning card-animate">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/60 mb-1">Half Day Today</p>
                  <p className="text-3xl font-bold text-amber-400">{halfDayToday}</p>
                  <p className="text-xs text-white/40">Partial attendance</p>
                </div>
                <div className="stat-icon stat-icon-warning"><TrendingUp size={22} /></div>
              </div>
            </div>
            <div className="stat-card stat-card-danger card-animate">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/60 mb-1">Absent Today</p>
                  <p className="text-3xl font-bold text-red-400">{absentToday}</p>
                  <p className="text-xs text-white/40">Not present</p>
                </div>
                <div className="stat-icon stat-icon-danger"><Calendar size={22} /></div>
              </div>
            </div>
            <div className="stat-card card-animate" style={{ background: 'linear-gradient(135deg, rgba(251,146,60,0.15), rgba(251,146,60,0.05))' }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/60 mb-1">Uninformed Leave</p>
                  <p className="text-3xl font-bold text-orange-400">{uninformedCount}</p>
                  <p className="text-xs text-white/40">Unapproved absences</p>
                </div>
                <div className="stat-icon" style={{ background: 'rgba(251,146,60,0.15)' }}><AlertTriangle size={22} className="text-orange-400" /></div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1">
            <div className="stat-card stat-card-purple card-animate">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/60 mb-1">Part-Time Today</p>
                  <div className="flex items-end gap-3">
                    <p className="text-3xl font-bold text-purple-400">{partTimeTotal}</p>
                    <p className="text-sm text-white/50 mb-1">
                      (Both: {partTimeBoth}, Morning: {partTimeMorning}, Evening: {partTimeEvening})
                    </p>
                  </div>
                </div>
                <div className="stat-icon stat-icon-purple"><Clock size={22} /></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Location-based Attendance */}
      <div className="section-card">
        <div className="section-header">
          <MapPin size={20} />
          <h2 className="text-lg font-semibold flex-1">
            {userRole === 'admin'
              ? "Today's Attendance by Location"
              : `${userLocation} - Today's Attendance`
            }
          </h2>
          {userRole === 'admin' && locations.length > 1 && (
            <button
              onClick={() => setShowOrderEditor(!showOrderEditor)}
              className="text-xs px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors"
            >
              {showOrderEditor ? 'Done' : '⇅ Reorder'}
            </button>
          )}
        </div>
        <div className="section-body space-y-6">
          {/* Location Order Editor */}
          {showOrderEditor && (
            <div className="glass-card-static p-4 rounded-xl mb-4">
              <p className="text-sm text-white/60 mb-3">Drag or use arrows to reorder locations:</p>
              <div className="space-y-2">
                {locations.map((loc, index) => (
                  <div
                    key={loc.name}
                    draggable
                    onDragStart={() => handleLocDragStart(index)}
                    onDragOver={(e) => handleLocDragOver(e, index)}
                    onDrop={(e) => handleLocDrop(e, index)}
                    onDragEnd={() => { setDragIndex(null); setDragOverIdx(null); }}
                    className={`flex items-center gap-3 p-3 glass-card-static rounded-lg cursor-grab active:cursor-grabbing transition-all ${dragOverIdx === index ? 'ring-2 ring-indigo-400 scale-[1.02]' : ''} ${dragIndex === index ? 'opacity-50' : ''}`}
                  >
                    <GripVertical size={16} className="text-white/40 flex-shrink-0" />
                    <span className="text-sm font-medium flex-1">{loc.name}</span>
                    <button
                      onClick={() => moveLocation(index, 'up')}
                      disabled={index === 0}
                      className="p-1 text-white/60 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      onClick={() => moveLocation(index, 'down')}
                      disabled={index === locations.length - 1}
                      className="p-1 text-white/60 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ArrowDown size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {locations.map((location) => {
            const locationPartTimeData = partTimeAttendance.filter(record => record.location === location.name);
            const locationBoth = locationPartTimeData.filter(record => record.shift === 'Both');
            const locationMorning = locationPartTimeData.filter(record => record.shift === 'Morning');
            const locationEvening = locationPartTimeData.filter(record => record.shift === 'Evening');
            const partTimeNames = [
              ...locationBoth.map(record => `${record.staffName} (Both)`),
              ...locationMorning.map(record => `${record.staffName} (Morning)`),
              ...locationEvening.map(record => `${record.staffName} (Evening)`)
            ];

            const assignedStaff = fullTimeStaff.filter(s => s.location === location.name);
            const locationTotalFullTimeStaff = assignedStaff.length;

            const assignedPresentIds = fullTimeAttendance.filter(record => {
              const staffMember = activeStaff.find(s => s.id === record.staffId);
              if (!staffMember || staffMember.location !== location.name) return false;
              const attendanceLocation = record.location || staffMember.location;
              return record.status === 'Present' && attendanceLocation === location.name;
            }).map(record => record.staffId);
            const assignedPresent = sortStaffIdsByOrder(assignedPresentIds).map(id => formatStaffName(id, false));

            const assignedHalfDayIds = fullTimeAttendance.filter(record => {
              const staffMember = activeStaff.find(s => s.id === record.staffId);
              if (!staffMember || staffMember.location !== location.name) return false;
              const attendanceLocation = record.location || staffMember.location;
              return record.status === 'Half Day' && attendanceLocation === location.name;
            }).map(record => record.staffId);
            const assignedHalfDay = sortStaffIdsByOrder(assignedHalfDayIds).map(id => formatStaffName(id, false));

            const assignedAbsentIds = fullTimeAttendance.filter(record => {
              const staffMember = activeStaff.find(s => s.id === record.staffId);
              if (!staffMember || staffMember.location !== location.name) return false;
              return record.status === 'Absent';
            }).map(record => record.staffId);
            const assignedAbsent = sortStaffIdsByOrder(assignedAbsentIds).map(id => formatStaffName(id, false));

            const tempGuestRecords = fullTimeAttendance.filter(record => {
              const staffMember = allActiveStaff.find(s => s.id === record.staffId);
              if (!staffMember) return false;
              if (staffMember.location === location.name) return false;
              const attendanceLocation = record.location || staffMember.location;
              return attendanceLocation === location.name && record.status !== 'Absent';
            });
            const tempGuests = sortStaffIdsByOrder(tempGuestRecords.map(r => r.staffId))
              .map(id => {
                const staffMember = allActiveStaff.find(s => s.id === id);
                return `${staffMember?.name} (from ${staffMember?.location})`;
              });

            const workingElsewhereRecords = fullTimeAttendance.filter(record => {
              const staffMember = allActiveStaff.find(s => s.id === record.staffId);
              if (!staffMember) return false;
              if (staffMember.location !== location.name) return false;
              const attendanceLocation = record.location || staffMember.location;
              return attendanceLocation !== location.name && record.status !== 'Absent';
            });
            const workingElsewhere = sortStaffIdsByOrder(workingElsewhereRecords.map(r => r.staffId))
              .map(record => {
                const attendanceRecord = workingElsewhereRecords.find(r => r.staffId === record);
                const staffMember = allActiveStaff.find(s => s.id === record);
                return `${staffMember?.name} (at ${attendanceRecord?.location})`;
              });

            const locationTotalPresent = assignedPresent.length + assignedHalfDay.length;

            return (
              <div key={location.name} className="border-b border-white/10 pb-6 last:border-b-0 last:pb-0">
                <h3 className="text-base md:text-lg font-semibold text-gradient mb-4 text-center">
                  {location.name} - Staff Present: {locationTotalPresent}/{locationTotalFullTimeStaff}
                  {tempGuests.length > 0 && (
                    <span className="text-sm text-cyan-400 ml-2">+{tempGuests.length} Temp</span>
                  )}
                  {locationPartTimeData.length > 0 && (
                    <span className="text-sm text-white/60">{' + Part-Time: '}{locationPartTimeData.length}</span>
                  )}
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="glass-card-static p-4 border-l-4 border-emerald-500">
                    <p className="text-base font-bold text-emerald-400 mb-2">✅ Present: {assignedPresent.length}/{locationTotalFullTimeStaff}</p>
                    <p className="text-sm text-white/60">{assignedPresent.length > 0 ? assignedPresent.join(', ') : 'None'}</p>
                    {renderPunchList(assignedPresentIds)}
                  </div>
                  <div className="glass-card-static p-4 border-l-4 border-amber-500">
                    <p className="text-base font-bold text-amber-400 mb-2">🕒 Half-day: {assignedHalfDay.length}</p>
                    <p className="text-sm text-white/60">{assignedHalfDay.length > 0 ? assignedHalfDay.join(', ') : 'None'}</p>
                    {renderPunchList(assignedHalfDayIds)}
                  </div>
                  <div className="glass-card-static p-4 border-l-4 border-red-500">
                    <p className="text-base font-bold text-red-400 mb-2">❌ Absent: {assignedAbsent.length}</p>
                    <p className="text-sm text-white/60">{assignedAbsent.length > 0 ? assignedAbsent.join(', ') : 'None'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="glass-card-static p-4 border-l-4 border-cyan-500">
                    <p className="text-base font-bold text-cyan-400 mb-2">🔄 Temp/Guest: {tempGuests.length}</p>
                    <p className="text-sm text-white/60">{tempGuests.length > 0 ? tempGuests.join(', ') : 'None'}</p>
                  </div>
                  <div className="glass-card-static p-4 border-l-4 border-orange-500">
                    <p className="text-base font-bold text-orange-400 mb-2">📤 Working Elsewhere: {workingElsewhere.length}</p>
                    <p className="text-sm text-white/60">{workingElsewhere.length > 0 ? workingElsewhere.join(', ') : 'None'}</p>
                  </div>
                  <div className="glass-card-static p-4 border-l-4 border-purple-500">
                    <p className="text-base font-bold text-purple-400 mb-2">👥 Part-Time: {locationPartTimeData.length}</p>
                    <p className="text-sm text-white/60">{partTimeNames.length > 0 ? partTimeNames.join(', ') : 'None'}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Overall Organization Attendance - Admin Only */}
      {userRole === 'admin' && (
        <div className="section-card">
          <div className="section-header" style={{ background: 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)' }}>
            <TrendingUp size={20} />
            <h2 className="text-lg font-semibold">Overall Organization Attendance</h2>
          </div>
          <div className="section-body">
            {(() => {
              const overallPartTimeBoth = partTimeAttendance.filter(record => record.shift === 'Both');
              const overallPartTimeMorning = partTimeAttendance.filter(record => record.shift === 'Morning');
              const overallPartTimeEvening = partTimeAttendance.filter(record => record.shift === 'Evening');
              const overallPartTimeTotal = [...overallPartTimeBoth, ...overallPartTimeMorning, ...overallPartTimeEvening];
              const overallPartTimeNames = [...overallPartTimeTotal]
                .sort((a, b) => {
                  const indexA = staff.findIndex(s => s.id === a.staffId || s.name === a.staffName);
                  const indexB = staff.findIndex(s => s.id === b.staffId || s.name === b.staffName);
                  return indexA - indexB;
                })
                .map(record => `${record.staffName} (${record.shift})`);

              const overallFullTimePresentIds = fullTimeAttendance.filter(record => record.status === 'Present').map(record => record.staffId);
              const overallFullTimePresent = sortStaffIdsByOrder(overallFullTimePresentIds).map(id => formatStaffName(id, false));
              const overallFullTimeHalfDayIds = fullTimeAttendance.filter(record => record.status === 'Half Day').map(record => record.staffId);
              const overallFullTimeHalfDay = sortStaffIdsByOrder(overallFullTimeHalfDayIds).map(id => formatStaffName(id, false));
              const overallFullTimeAbsentIds = fullTimeAttendance.filter(record => record.status === 'Absent').map(record => record.staffId);
              const overallFullTimeAbsent = sortStaffIdsByOrder(overallFullTimeAbsentIds).map(id => formatStaffName(id, false));

              return (
                <div>
                  <h3 className="text-base md:text-lg font-semibold text-gradient mb-4 text-center">
                    All Locations - Total Present: {overallFullTimePresent.length + overallFullTimeHalfDay.length}
                    {partTimeAttendance.length > 0 && (
                      <span className="text-sm text-white/60">
                        {' + Part-Time: '}{partTimeAttendance.length}
                        {' ('}Both: {overallPartTimeBoth.length}, Morning: {overallPartTimeMorning.length}, Evening: {overallPartTimeEvening.length}{')'}
                      </span>
                    )}
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="glass-card-static p-4 border-l-4 border-emerald-500">
                      <p className="text-base font-bold text-emerald-400 mb-2">✅ Present: {overallFullTimePresent.length}/{fullTimeStaff.length}</p>
                      <p className="text-sm text-white/60">{overallFullTimePresent.length > 0 ? overallFullTimePresent.join(', ') : 'None'}</p>
                    </div>
                    <div className="glass-card-static p-4 border-l-4 border-amber-500">
                      <p className="text-base font-bold text-amber-400 mb-2">🕒 Half-day: {overallFullTimeHalfDay.length}</p>
                      <p className="text-sm text-white/60">{overallFullTimeHalfDay.length > 0 ? overallFullTimeHalfDay.join(', ') : 'None'}</p>
                    </div>
                    <div className="glass-card-static p-4 border-l-4 border-red-500">
                      <p className="text-base font-bold text-red-400 mb-2">❌ Absent: {overallFullTimeAbsent.length}</p>
                      <p className="text-sm text-white/60">{overallFullTimeAbsent.length > 0 ? overallFullTimeAbsent.join(', ') : 'None'}</p>
                    </div>
                    <div className="glass-card-static p-4 border-l-4 border-purple-500">
                      <p className="text-base font-bold text-purple-400 mb-2">👥 Part-Time: {partTimeAttendance.length}</p>
                      <p className="text-xs text-white/40 mb-1">(B: {overallPartTimeBoth.length}, M: {overallPartTimeMorning.length}, E: {overallPartTimeEvening.length})</p>
                      <p className="text-sm text-white/60">{overallPartTimeNames.length > 0 ? overallPartTimeNames.join(', ') : 'None'}</p>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
