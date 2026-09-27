import React, { useState, useEffect } from 'react';
import { Calendar, Printer, FileSpreadsheet, RefreshCw, Plus, Trash2, Building, ArrowRight, Truck, ChevronDown, ChevronUp, X, Sparkles } from 'lucide-react';
import { localDateKey } from '../lib/localDate';
import { pettyCashService, PettyCashSheet, StaffMeal, CustomExpense, TransportLogistics } from '../services/pettyCashService';
import { attendanceService } from '../services/attendanceService';
import { staffService } from '../services/staffService';
import { locationService } from '../services/locationService';
import { exportPettyCashPdf, exportPettyCashExcel } from '../utils/pettyCashExport';
import { Location } from '../types';

interface Props {
  userRole?: string;
  userLocation?: string;
  locations?: Location[];
}

export const PettyCashManagement: React.FC<Props> = ({ userRole, userLocation, locations = [] }) => {
  const [allLocations, setAllLocations] = useState<Location[]>(locations);

  useEffect(() => {
    if (allLocations.length === 0) {
      locationService.getLocations().then(locs => {
        if (locs.length > 0) setAllLocations(locs);
      }).catch(console.error);
    }
  }, []);

  const initialLocation = (userRole === 'petty_cash_manager' || userRole === 'manager') 
    ? userLocation || (allLocations[0]?.name || '')
    : (userLocation || allLocations[0]?.name || '');

  const [location, setLocation] = useState(initialLocation);
  const [date, setDate] = useState(localDateKey());

  useEffect(() => {
    if (!location && allLocations.length > 0) {
      setLocation(userLocation || allLocations[0]?.name || '');
    }
  }, [allLocations, location, userLocation]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [sheet, setSheet] = useState<PettyCashSheet | null>(null);
  
  // Configurable Default Meal Rates persisted per location
  const [ftMealRate, setFtMealRate] = useState<number>(130);
  const [ptMealRate, setPtMealRate] = useState<number>(65);

  // Saved Custom Expense presets per location
  const [savedExpenses, setSavedExpenses] = useState<string[]>([]);

  // Collapsible Transport Logistics
  const [showTransport, setShowTransport] = useState<boolean>(true);

  // Template Type
  const isGodownDefault = location.toLowerCase().includes('godown') || location.toLowerCase().includes('warehouse');
  const [templateType, setTemplateType] = useState<'shop' | 'godown'>(isGodownDefault ? 'godown' : 'shop');

  // Load location-based persisted meal rates & custom expense presets
  useEffect(() => {
    if (!location) return;
    const locKey = location.trim().toLowerCase();

    // Rates
    try {
      const rawRates = localStorage.getItem(`petty_cash_rates_${locKey}`);
      if (rawRates) {
        const parsed = JSON.parse(rawRates);
        if (parsed.ftMealRate !== undefined) setFtMealRate(Number(parsed.ftMealRate));
        if (parsed.ptMealRate !== undefined) setPtMealRate(Number(parsed.ptMealRate));
      } else {
        setFtMealRate(130);
        setPtMealRate(65);
      }
    } catch (e) {
      console.error('Failed to load rates from localStorage:', e);
    }

    // Saved custom expenses presets
    try {
      const rawPresets = localStorage.getItem(`petty_cash_custom_expenses_${locKey}`);
      if (rawPresets) {
        setSavedExpenses(JSON.parse(rawPresets));
      } else {
        const defaultPresets = ['Two-Wheeler Petrol', 'Shop Cleaning Supplies', 'Staff Tea & Coffee', 'Packaging Materials', 'Generator Diesel'];
        setSavedExpenses(defaultPresets);
        localStorage.setItem(`petty_cash_custom_expenses_${locKey}`, JSON.stringify(defaultPresets));
      }
    } catch (e) {
      console.error('Failed to load expense presets:', e);
    }

    setTemplateType(locKey.includes('godown') || locKey.includes('warehouse') ? 'godown' : 'shop');
  }, [location]);

  const updateMealRates = (newFt: number, newPt: number) => {
    setFtMealRate(newFt);
    setPtMealRate(newPt);
    if (location) {
      localStorage.setItem(
        `petty_cash_rates_${location.trim().toLowerCase()}`,
        JSON.stringify({ ftMealRate: newFt, ptMealRate: newPt })
      );
    }
  };

  useEffect(() => {
    fetchSheet();
  }, [location, date]);

  const fetchSheet = async () => {
    if (!location || !date) return;
    setLoading(true);
    try {
      const existing = await pettyCashService.getSheet(location, date);
      if (existing) {
        // Ensure transport_logistics array exists
        const withTransport = {
          ...existing,
          transport_logistics: (existing.transport_logistics && existing.transport_logistics.length > 0)
            ? existing.transport_logistics
            : Array(10).fill(null).map(() => ({
                id: crypto.randomUUID(),
                transport_name: '', count: '', freight: 0, auto: 0, hamali: 0, total: 0
              }))
        };
        setSheet(withTransport);
        setTemplateType(existing.template_type);
      } else {
        await createNewSheet();
      }
    } catch (e) {
      console.error('Error fetching sheet:', e);
    } finally {
      setLoading(false);
    }
  };

  const createNewSheet = async () => {
    const defaultExpenses: CustomExpense[] = templateType === 'shop' 
      ? [
          { id: crypto.randomUUID(), category: 'fixed', label: 'MEAL TOTAL', amount: 0 },
          { id: crypto.randomUUID(), category: 'fixed', label: 'SHOP TEA & SNACKS', amount: 0 },
          { id: crypto.randomUUID(), category: 'fixed', label: 'PETROL', amount: 0 },
          { id: crypto.randomUUID(), category: 'fixed', label: 'STAFF OVERTIME', amount: 0 },
        ]
      : [
          { id: crypto.randomUUID(), category: 'fixed', label: 'MEAL TOTAL', amount: 0 },
          { id: crypto.randomUUID(), category: 'fixed', label: 'PANT GODOWN TEA & SNACKS', amount: 0 },
          { id: crypto.randomUUID(), category: 'fixed', label: 'SHIRT GODOWN TEA & SNACKS', amount: 0 },
          { id: crypto.randomUUID(), category: 'fixed', label: 'PETROL', amount: 0 },
          { id: crypto.randomUUID(), category: 'fixed', label: 'PART TIME SALARY', amount: 0 },
        ];
        
    // Universal 10 Consignment slots for both Shop & Godown
    const defaultLogistics: TransportLogistics[] = Array(10).fill(null).map(() => ({
      id: crypto.randomUUID(),
      transport_name: '', count: '', freight: 0, auto: 0, hamali: 0, total: 0
    }));

    const newSheet: PettyCashSheet = {
      location,
      date,
      template_type: templateType,
      received_amount: 0,
      staff_meals: [],
      expenses: defaultExpenses,
      transport_logistics: defaultLogistics
    };
    
    // Auto-fetch attendance including flex/part-time
    await refreshAttendanceData(newSheet);
  };

  const refreshAttendanceData = async (targetSheet: PettyCashSheet | null = sheet) => {
    if (!targetSheet) return;
    setLoading(true);
    try {
      const [attendances, staffs] = await Promise.all([
        attendanceService.getByDateRange(date, date),
        staffService.getAll()
      ]);
      
      const locKey = (location || '').trim().toLowerCase();
      const locAttendances = attendances.filter(a => {
        const locMatch = !locKey || (a.location && a.location.trim().toLowerCase() === locKey);
        const statusStr = (a.status || '').trim().toLowerCase();
        const isPresent = statusStr === 'present' || statusStr === 'half day';
        return locMatch && isPresent;
      });
      
      const newStaffMeals: StaffMeal[] = [];
      const seenStaff = new Set<string>();
      
      locAttendances.forEach(a => {
        const staff = staffs.find(s => s.id === a.staffId);
        const staffId = a.staffId || a.id || `pt_${a.staffName || Math.random()}`;
        
        // Deduplicate
        const dedupeKey = `${staffId}_${(a.staffName || '').toLowerCase()}`;
        if (seenStaff.has(dedupeKey)) return;
        seenStaff.add(dedupeKey);

        const isPartTime = (a as any).isPartTime === true ||
          staff?.type === 'part-time' ||
          (typeof a.staffId === 'string' && a.staffId.startsWith('pt_'));

        const isHalfDay = (a.status || '').trim().toLowerCase() === 'half day';
        let attStatus = 'F';
        if (isHalfDay) {
          attStatus = a.shift === 'Morning' ? 'H1' : a.shift === 'Evening' ? 'H2' : 'H';
        }

        // Preserve existing entered amount if available
        const existingMeal = targetSheet.staff_meals.find(
          m => m.staff_id === staffId || (a.staffName && m.staff_name.toLowerCase() === a.staffName.toLowerCase())
        );

        if (isPartTime) {
          newStaffMeals.push({
            staff_id: staffId,
            staff_name: a.staffName || staff?.name || 'Flex Staff',
            designation: staff?.designation || 'Flex Staff',
            staff_type: 'part-time',
            attendance_status: attStatus,
            amount: existingMeal ? existingMeal.amount : 0
          });
        } else {
          newStaffMeals.push({
            staff_id: staffId,
            staff_name: staff?.name || a.staffName || 'Staff',
            designation: staff?.designation || 'Staff',
            staff_type: 'full-time',
            attendance_status: attStatus,
            amount: existingMeal ? existingMeal.amount : 0
          });
        }
      });
      
      setSheet({ ...targetSheet, staff_meals: newStaffMeals });
    } catch (e) {
      console.error('Error refreshing attendance data:', e);
    } finally {
      setLoading(false);
    }
  };

  const saveSheet = async () => {
    if (!sheet) return;
    setSaving(true);
    try {
      const fullTimeStaff = sheet.staff_meals.filter(s => s.staff_type === 'full-time');
      const partTimeStaff = sheet.staff_meals.filter(s => s.staff_type === 'part-time');
      
      const ftMealTotal = fullTimeStaff.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
      const ptMealTotal = partTimeStaff.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
      const mealTotal = ftMealTotal + ptMealTotal;
      
      const expensesTotal = sheet.expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
      const transportTotal = (sheet.transport_logistics || []).reduce((sum, t) => sum + (Number(t.total) || 0), 0);
        
      const totalExp = expensesTotal + transportTotal;
      const balance = (Number(sheet.received_amount) || 0) - totalExp;
      
      const toSave = {
        ...sheet,
        full_time_meal_total: ftMealTotal,
        part_time_meal_total: ptMealTotal,
        meal_total: mealTotal,
        expenses_total: expensesTotal,
        transport_total: transportTotal,
        total_expense: totalExp,
        balance: balance
      };
      
      const saved = await pettyCashService.saveSheet(toSave);
      setSheet(saved);
      alert('Petty cash voucher saved successfully!');
    } catch (e) {
      console.error('Error saving sheet:', e);
      alert('Error saving petty cash sheet. Please check console.');
    } finally {
      setSaving(false);
    }
  };

  const autoFillMeals = () => {
    if (!sheet) return;
    const newMeals = sheet.staff_meals.map(m => {
      let amt = 0;
      const isHalf = m.attendance_status === 'H' || m.attendance_status === 'H1' || m.attendance_status === 'H2';
      if (m.staff_type === 'full-time') {
        amt = isHalf ? Math.round(ftMealRate / 2) : ftMealRate;
      } else {
        amt = isHalf ? Math.round(ptMealRate / 2) : ptMealRate;
      }
      return { ...m, amount: amt };
    });
    
    updateMealTotal(newMeals);
  };
  
  const updateMealTotal = (meals: StaffMeal[]) => {
    if (!sheet) return;
    const total = meals.reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
    const newExps = sheet.expenses.map(e => 
      e.label === 'MEAL TOTAL' ? { ...e, amount: total } : e
    );
    setSheet({ ...sheet, staff_meals: meals, expenses: newExps });
  };

  const handleMealChange = (staffId: string, amount: number) => {
    if (!sheet) return;
    const newMeals = sheet.staff_meals.map(m => 
      m.staff_id === staffId ? { ...m, amount: amount || 0 } : m
    );
    updateMealTotal(newMeals);
  };

  const addCustomExpense = () => {
    if (!sheet) return;
    setSheet({
      ...sheet,
      expenses: [...sheet.expenses, { id: crypto.randomUUID(), category: 'custom', label: '', amount: 0 }]
    });
  };

  const addSavedExpenseChip = (label: string) => {
    if (!sheet) return;
    setSheet({
      ...sheet,
      expenses: [...sheet.expenses, { id: crypto.randomUUID(), category: 'custom', label, amount: 0 }]
    });
  };

  const handleCustomLabelBlur = (label: string) => {
    if (!label || !label.trim()) return;
    const trimmed = label.trim();
    if (!savedExpenses.includes(trimmed)) {
      const next = [...savedExpenses, trimmed];
      setSavedExpenses(next);
      if (location) {
        localStorage.setItem(`petty_cash_custom_expenses_${location.trim().toLowerCase()}`, JSON.stringify(next));
      }
    }
  };

  const deleteSavedExpensePreset = (labelToDelete: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = savedExpenses.filter(s => s !== labelToDelete);
    setSavedExpenses(next);
    if (location) {
      localStorage.setItem(`petty_cash_custom_expenses_${location.trim().toLowerCase()}`, JSON.stringify(next));
    }
  };

  const updateExpense = (id: string, field: keyof CustomExpense, value: any) => {
    if (!sheet) return;
    const exps = sheet.expenses.map(e => e.id === id ? { ...e, [field]: value } : e);
    setSheet({ ...sheet, expenses: exps });
  };

  const removeExpense = (id: string) => {
    if (!sheet) return;
    setSheet({ ...sheet, expenses: sheet.expenses.filter(e => e.id !== id) });
  };

  const addConsignment = () => {
    if (!sheet) return;
    setSheet({
      ...sheet,
      transport_logistics: [
        ...(sheet.transport_logistics || []),
        { id: crypto.randomUUID(), transport_name: '', count: '', freight: 0, auto: 0, hamali: 0, total: 0 }
      ]
    });
  };

  const removeTransport = (id: string) => {
    if (!sheet) return;
    setSheet({
      ...sheet,
      transport_logistics: (sheet.transport_logistics || []).filter(t => t.id !== id)
    });
  };

  const updateTransport = (id: string, field: keyof TransportLogistics, value: any) => {
    if (!sheet) return;
    const tr = sheet.transport_logistics.map(t => {
      if (t.id !== id) return t;
      const updated = { ...t, [field]: value };
      if (['freight', 'auto', 'hamali'].includes(field)) {
        updated.total = (Number(updated.freight) || 0) + (Number(updated.auto) || 0) + (Number(updated.hamali) || 0);
      }
      return updated;
    });
    setSheet({ ...sheet, transport_logistics: tr });
  };

  if (!sheet && !loading) {
    return <div className="p-8 text-center text-slate-500 font-medium">Failed to load petty cash sheet.</div>;
  }

  const fullTimeStaff = sheet?.staff_meals.filter(s => s.staff_type === 'full-time') || [];
  const partTimeStaff = sheet?.staff_meals.filter(s => s.staff_type === 'part-time') || [];
  
  const expensesTotal = sheet?.expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0) || 0;
  const transportTotal = (sheet?.transport_logistics || []).reduce((sum, t) => sum + (Number(t.total) || 0), 0);
    
  const totalExp = expensesTotal + transportTotal;
  const balance = (Number(sheet?.received_amount) || 0) - totalExp;

  const canEdit = userRole === 'super_admin' || userRole === 'admin' || userRole === 'petty_cash_manager';

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Building className="text-indigo-600" />
            Petty Cash Management
          </h1>
          <p className="text-slate-500 text-sm mt-1">Multi-shop & Godown daily cash voucher with automatic attendance & transport logistics</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {(userRole === 'super_admin' || userRole === 'admin') && (
            <select
              value={location}
              onChange={e => setLocation(e.target.value)}
              className="pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-indigo-500"
            >
              {allLocations.map(l => (
                <option key={l.id} value={l.name}>{l.name}</option>
              ))}
            </select>
          )}
          
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => {
                if (sheet) {
                  setTemplateType('shop');
                  setSheet({ ...sheet, template_type: 'shop' });
                }
              }}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${templateType === 'shop' ? 'bg-white text-indigo-700 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Shop
            </button>
            <button
              onClick={() => {
                if (sheet) {
                  setTemplateType('godown');
                  setSheet({ ...sheet, template_type: 'godown' });
                }
              }}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${templateType === 'godown' ? 'bg-white text-indigo-700 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Godown
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="h-64 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          <span className="text-slate-500 text-sm">Syncing real attendance and petty cash voucher...</span>
        </div>
      ) : sheet && (
        <div className="grid grid-cols-1 gap-6">
          
          {/* Top Controls: Cashier Handover & Configurable Meal Rates */}
          <div className="flex flex-col lg:flex-row gap-4 justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm font-bold text-slate-700">Total Received (Cashier):</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-700 font-bold">₹</span>
                  <input
                    type="number"
                    value={sheet.received_amount || ''}
                    onChange={e => setSheet({ ...sheet, received_amount: Number(e.target.value) })}
                    className="pl-7 pr-3 py-2 w-36 bg-indigo-50/70 border border-indigo-200 rounded-lg font-extrabold text-indigo-900 focus:ring-2 focus:ring-indigo-500 text-base"
                    placeholder="0"
                    disabled={!canEdit}
                  />
                </div>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              {/* Configurable Rates */}
              <div className="flex items-center gap-2 text-xs bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 font-semibold">FT Meal:</span>
                <div className="relative">
                  <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">₹</span>
                  <input
                    type="number"
                    value={ftMealRate}
                    onChange={e => updateMealRates(Number(e.target.value), ptMealRate)}
                    className="w-16 pl-4 pr-1 py-1 border border-slate-200 rounded text-xs font-bold text-slate-800 focus:ring-1 focus:ring-indigo-500"
                    title="Default Full-Time Meal Rate (₹)"
                    disabled={!canEdit}
                  />
                </div>
                <span className="text-slate-500 font-semibold ml-1">PT/Flex:</span>
                <div className="relative">
                  <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">₹</span>
                  <input
                    type="number"
                    value={ptMealRate}
                    onChange={e => updateMealRates(ftMealRate, Number(e.target.value))}
                    className="w-16 pl-4 pr-1 py-1 border border-slate-200 rounded text-xs font-bold text-slate-800 focus:ring-1 focus:ring-indigo-500"
                    title="Default Part-Time / Flex Meal Rate (₹)"
                    disabled={!canEdit}
                  />
                </div>
              </div>
              
              <button 
                onClick={autoFillMeals} 
                disabled={!canEdit}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
                title="Populate standard meal rates for all present staff"
              >
                <Sparkles size={16} /> Auto-Fill Meals
              </button>
              
              <button 
                onClick={() => refreshAttendanceData()} 
                disabled={!canEdit}
                className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-slate-200 bg-white"
                title="Refresh attendance from punches & regularizations"
              >
                <RefreshCw size={18} />
              </button>
            </div>
          </div>

          {/* Staff Meals Split View with High-Contrast Explicit Headers */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* FULL TIME STAFF */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="petty-cash-fulltime-header">
                <h3 className="text-sm font-extrabold tracking-wide text-primary-foreground">
                  FULL TIME STAFF
                </h3>
                <span className="petty-cash-header-count text-primary-foreground">
                  {fullTimeStaff.length} Present
                </span>
              </div>
              <div className="overflow-x-auto flex-1">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-500 bg-slate-50 uppercase border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 w-12">S.NO</th>
                      <th className="px-4 py-3">NAME</th>
                      <th className="px-4 py-3">DESIG</th>
                      <th className="px-4 py-3 text-center w-16">F/H</th>
                      <th className="px-4 py-3 text-right w-24">AMT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {fullTimeStaff.length === 0 ? (
                      <tr><td colSpan={5} className="p-6 text-center text-slate-400 italic">No full-time staff present for this date</td></tr>
                    ) : fullTimeStaff.map((s, idx) => (
                      <tr key={s.staff_id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-2.5 text-slate-500">{idx + 1}</td>
                        <td className="px-4 py-2.5 font-bold text-slate-800">{s.staff_name}</td>
                        <td className="px-4 py-2.5 text-slate-500 text-xs">{s.designation}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${s.attendance_status === 'F' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                            {s.attendance_status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <input
                            type="number"
                            value={s.amount || ''}
                            onChange={e => handleMealChange(s.staff_id, Number(e.target.value))}
                            className="w-20 text-right px-2 py-1 border border-slate-200 rounded font-semibold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-900"
                            placeholder="0"
                            disabled={!canEdit}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* PART TIME / FLEX STAFF */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="petty-cash-parttime-header">
                <h3 className="text-sm font-extrabold tracking-wide text-primary-foreground">
                  PART TIME / FLEX STAFF
                </h3>
                <span className="petty-cash-header-count text-primary-foreground">
                  {partTimeStaff.length} Present
                </span>
              </div>
              <div className="overflow-x-auto flex-1">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-500 bg-slate-50 uppercase border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 w-12">S.NO</th>
                      <th className="px-4 py-3">NAME</th>
                      <th className="px-4 py-3">DESIG</th>
                      <th className="px-4 py-3 text-center w-16">F/H</th>
                      <th className="px-4 py-3 text-right w-24">AMT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {partTimeStaff.length === 0 ? (
                      <tr><td colSpan={5} className="p-6 text-center text-slate-400 italic">No part-time / flex staff present for this date</td></tr>
                    ) : partTimeStaff.map((s, idx) => (
                      <tr key={s.staff_id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-2.5 text-slate-500">{idx + 1}</td>
                        <td className="px-4 py-2.5 font-bold text-slate-800">{s.staff_name}</td>
                        <td className="px-4 py-2.5 text-slate-500 text-xs">{s.designation}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${s.attendance_status === 'F' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                            {s.attendance_status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <input
                            type="number"
                            value={s.amount || ''}
                            onChange={e => handleMealChange(s.staff_id, Number(e.target.value))}
                            className="w-20 text-right px-2 py-1 border border-slate-200 rounded font-semibold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-900"
                            placeholder="0"
                            disabled={!canEdit}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Expenses & Universal Transport Logistics Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* DAILY EXPENSES */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="bg-slate-100 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
                <h3 className="font-bold text-slate-800">DAILY EXPENSES</h3>
                <button
                  onClick={addCustomExpense}
                  disabled={!canEdit}
                  className="text-indigo-600 hover:text-indigo-700 text-sm font-bold flex items-center gap-1 bg-white px-2.5 py-1 rounded-md border border-slate-200 shadow-sm"
                >
                  <Plus size={16} /> Add Custom
                </button>
              </div>

              {/* Location-Based Quick Add Saved Expense Chips */}
              {savedExpenses.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 p-2 bg-slate-50 border-b border-slate-200">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mr-1">Quick Add:</span>
                  {savedExpenses.map(preset => (
                    <span
                      key={preset}
                      onClick={() => canEdit && addSavedExpenseChip(preset)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-50 cursor-pointer shadow-sm transition-all"
                      title="Click to insert this expense"
                    >
                      + {preset}
                      {canEdit && (
                        <button
                          onClick={e => deleteSavedExpensePreset(preset, e)}
                          className="text-slate-400 hover:text-red-500 ml-0.5 rounded-full"
                          title="Remove preset"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-500 bg-slate-50 uppercase border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 w-12">S.NO</th>
                      <th className="px-4 py-3">PARTICULARS</th>
                      <th className="px-4 py-3 text-right w-32">AMOUNT</th>
                      <th className="px-4 py-3 w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sheet.expenses.map((e, idx) => (
                      <tr key={e.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 text-slate-500">{idx + 1}</td>
                        <td className="px-4 py-2.5">
                          {e.category === 'fixed' ? (
                            <span className="font-bold text-slate-700">{e.label}</span>
                          ) : (
                            <input
                              type="text"
                              value={e.label}
                              onChange={ev => updateExpense(e.id!, 'label', ev.target.value)}
                              onBlur={ev => handleCustomLabelBlur(ev.target.value)}
                              className="w-full px-2 py-1 border border-slate-200 rounded font-medium focus:ring-2 focus:ring-indigo-500 text-slate-900"
                              placeholder="e.g. Shop Cleaning Supplies..."
                              disabled={!canEdit}
                            />
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <input
                            type="number"
                            value={e.amount || ''}
                            onChange={ev => updateExpense(e.id!, 'amount', Number(ev.target.value))}
                            className={`w-full text-right px-2 py-1 border rounded font-semibold focus:ring-2 focus:ring-indigo-500 ${e.category === 'fixed' && e.label === 'MEAL TOTAL' ? 'bg-slate-100 border-transparent text-slate-600 font-extrabold' : 'border-slate-200 text-slate-900'}`}
                            placeholder="0"
                            disabled={!canEdit || (e.category === 'fixed' && e.label === 'MEAL TOTAL')}
                          />
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {e.category !== 'fixed' && canEdit && (
                            <button onClick={() => removeExpense(e.id!)} className="text-red-400 hover:text-red-600 p-1">
                              <Trash2 size={16} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50 font-bold border-t-2 border-slate-200">
                      <td colSpan={2} className="px-4 py-3 text-right text-slate-700">TOTAL EXPENSES:</td>
                      <td className="px-4 py-3 text-right text-indigo-900 text-lg font-black">₹ {expensesTotal.toLocaleString('en-IN')}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* UNIVERSAL TRANSPORT LOGISTICS & SETTLEMENT */}
            <div className="flex flex-col gap-6">
              
              {/* Universal Transport Logistics (Available for all shops & godowns) */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                <div
                  className="bg-slate-100 px-4 py-3 border-b border-slate-200 flex justify-between items-center cursor-pointer select-none"
                  onClick={() => setShowTransport(!showTransport)}
                >
                  <div className="flex items-center gap-2">
                    <Truck className="text-violet-600" size={18} />
                    <h3 className="font-bold text-slate-800 text-sm">Goods Inward & Transport Logistics</h3>
                    {transportTotal > 0 && (
                      <span className="bg-violet-100 text-violet-800 font-extrabold text-xs px-2 py-0.5 rounded-full">
                        ₹ {transportTotal.toLocaleString('en-IN')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={addConsignment}
                      disabled={!canEdit}
                      className="text-violet-700 hover:text-violet-900 text-xs font-bold flex items-center gap-1 bg-white border border-violet-200 hover:bg-violet-50 px-2 py-1 rounded shadow-sm"
                    >
                      <Plus size={14} /> Add Row
                    </button>
                    <button
                      onClick={() => setShowTransport(!showTransport)}
                      className="text-slate-400 hover:text-slate-600 p-1"
                    >
                      {showTransport ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                </div>

                {showTransport && (
                  <>
                    <div className="bg-violet-50 border-b border-violet-100 px-4 py-2 text-xs text-violet-800 font-medium">
                      📦 <strong>Log goods received today:</strong> Freight = Lorry charges, Auto = Local tempo fare, Hamali = Coolie / unloading labor.
                    </div>
                    <div className="overflow-x-auto max-h-80">
                      <table className="w-full text-xs text-left">
                        <thead className="text-[10px] text-slate-500 bg-slate-50 uppercase border-b border-slate-200 sticky top-0">
                          <tr>
                            <th className="px-2 py-2">TRANSPORT</th>
                            <th className="px-2 py-2 w-12">COUNT</th>
                            <th className="px-2 py-2 text-right w-16">FREIGHT</th>
                            <th className="px-2 py-2 text-right w-16">AUTO</th>
                            <th className="px-2 py-2 text-right w-16">HAMALI</th>
                            <th className="px-2 py-2 text-right w-20">TOTAL</th>
                            <th className="px-1 py-2 w-8"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {sheet.transport_logistics.map(t => (
                            <tr key={t.id} className="hover:bg-slate-50">
                              <td className="px-2 py-1.5">
                                <input
                                  type="text"
                                  value={t.transport_name}
                                  onChange={e => updateTransport(t.id!, 'transport_name', e.target.value)}
                                  className="w-full px-1.5 py-0.5 border border-slate-200 rounded text-xs text-slate-900 font-medium"
                                  placeholder="Transporter / LR#"
                                  disabled={!canEdit}
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="text"
                                  value={t.count}
                                  onChange={e => updateTransport(t.id!, 'count', e.target.value)}
                                  className="w-full px-1.5 py-0.5 border border-slate-200 rounded text-xs text-slate-900 font-medium text-center"
                                  placeholder="0"
                                  disabled={!canEdit}
                                />
                              </td>
                              <td className="px-2 py-1.5 text-right">
                                <input
                                  type="number"
                                  value={t.freight || ''}
                                  onChange={e => updateTransport(t.id!, 'freight', Number(e.target.value))}
                                  className="w-full text-right px-1.5 py-0.5 border border-slate-200 rounded text-xs text-slate-900 font-semibold"
                                  placeholder="0"
                                  disabled={!canEdit}
                                />
                              </td>
                              <td className="px-2 py-1.5 text-right">
                                <input
                                  type="number"
                                  value={t.auto || ''}
                                  onChange={e => updateTransport(t.id!, 'auto', Number(e.target.value))}
                                  className="w-full text-right px-1.5 py-0.5 border border-slate-200 rounded text-xs text-slate-900 font-semibold"
                                  placeholder="0"
                                  disabled={!canEdit}
                                />
                              </td>
                              <td className="px-2 py-1.5 text-right">
                                <input
                                  type="number"
                                  value={t.hamali || ''}
                                  onChange={e => updateTransport(t.id!, 'hamali', Number(e.target.value))}
                                  className="w-full text-right px-1.5 py-0.5 border border-slate-200 rounded text-xs text-slate-900 font-semibold"
                                  placeholder="0"
                                  disabled={!canEdit}
                                />
                              </td>
                              <td className="px-2 py-1.5 text-right font-bold text-violet-900">
                                ₹ {Number(t.total) || 0}
                              </td>
                              <td className="px-1 py-1.5 text-center">
                                {canEdit && (
                                  <button onClick={() => removeTransport(t.id!)} className="text-slate-300 hover:text-red-500">
                                    <X size={14} />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                          <tr className="bg-slate-50 font-bold border-t-2 border-slate-200 sticky bottom-0">
                            <td colSpan={5} className="px-2 py-2 text-right text-slate-700 text-xs">TOTAL LOGISTICS:</td>
                            <td className="px-2 py-2 text-right text-violet-900 text-sm font-black">₹ {transportTotal.toLocaleString('en-IN')}</td>
                            <td></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>

              {/* SETTLEMENT BOX */}
              <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 rounded-xl shadow-lg border border-slate-700 text-white overflow-hidden">
                <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center">
                  <h3 className="font-bold text-lg text-white">CASH SETTLEMENT SUMMARY</h3>
                  <span className="text-xs uppercase tracking-wider bg-white/10 px-2.5 py-1 rounded text-slate-300 font-semibold">
                    {sheet.template_type}
                  </span>
                </div>
                <div className="p-6 grid gap-4">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-300 font-medium">TOTAL RECEIVED (CASHIER)</span>
                    <span className="text-xl font-bold text-white">₹ {(sheet.received_amount || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between items-center text-rose-300">
                    <span className="font-medium">TOTAL EXPENSES (MEAL + EXP + LOGISTICS)</span>
                    <span className="text-xl font-bold">- ₹ {totalExp.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="h-px bg-white/20 my-1"></div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-200 font-bold text-lg">
                      {balance >= 0 ? 'BALANCE REFUND TO CASHIER' : 'CASH DEFICIT / REIMBURSEMENT DUE'}
                    </span>
                    <span className={`text-3xl font-black ${balance < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                      ₹ {balance.toLocaleString('en-IN')}
                    </span>
                  </div>
                  {balance < 0 && (
                    <div className="text-right text-xs text-rose-300 font-semibold">
                      ⚠️ Cash deficit! Manager reimbursement due from Cashier.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex flex-col sm:flex-row gap-3 justify-end items-center sticky bottom-4 z-40 bg-white/95 backdrop-blur px-6 py-4 rounded-2xl shadow-xl border border-slate-200">
            <button
              onClick={() => exportPettyCashExcel(sheet)}
              className="flex items-center gap-2 px-5 py-2.5 text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 font-semibold w-full sm:w-auto justify-center transition-all shadow-sm"
            >
              <FileSpreadsheet size={18} className="text-emerald-600" />
              Excel Export
            </button>
            <button
              onClick={() => exportPettyCashPdf(sheet)}
              className="flex items-center gap-2 px-5 py-2.5 text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 font-semibold w-full sm:w-auto justify-center transition-all shadow-sm"
            >
              <Printer size={18} className="text-rose-600" />
              Print Colorful PDF
            </button>
            <div className="h-8 w-px bg-slate-300 hidden sm:block mx-2"></div>
            <button
              onClick={saveSheet}
              disabled={!canEdit || saving}
              className="flex items-center gap-2 px-8 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-bold shadow-md shadow-indigo-200 disabled:opacity-50 w-full sm:w-auto justify-center transition-all"
            >
              {saving ? <RefreshCw size={18} className="animate-spin" /> : <ArrowRight size={18} />}
              Save Voucher
            </button>
          </div>

        </div>
      )}
    </div>
  );
};
