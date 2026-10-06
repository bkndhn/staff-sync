import React, { useState, useEffect } from 'react';
import { Calendar, Printer, FileSpreadsheet, RefreshCw, Plus, Trash2, Building, Building2, ArrowRight, Truck, ChevronDown, ChevronUp, X, Sparkles, Share2, Save, MapPin } from 'lucide-react';
import { localDateKey } from '../lib/localDate';
import { pettyCashService, PettyCashSheet, StaffMeal, CustomExpense, TransportLogistics } from '../services/pettyCashService';
import { attendanceService } from '../services/attendanceService';
import { staffService } from '../services/staffService';
import { locationService } from '../services/locationService';
import { exportPettyCashPdf, exportPettyCashExcel, sharePettyCashWhatsApp, formatPunchRange, type PunchTimes } from '../utils/pettyCashExport';
import { Location } from '../types';

const getYesterdayKey = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

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

  const isZoneHandler = userRole === 'petty_cash_manager';

  const initialLocation = isZoneHandler
    ? (userLocation || '')
    : (userLocation || allLocations[0]?.name || '');

  const [location, setLocation] = useState(initialLocation);
  const [date, setDate] = useState(localDateKey());

  // Enforce zone handler location lock
  useEffect(() => {
    if (isZoneHandler && userLocation && location !== userLocation) {
      setLocation(userLocation);
    }
  }, [isZoneHandler, userLocation, location]);

  useEffect(() => {
    if (!location && allLocations.length > 0 && !isZoneHandler) {
      setLocation(userLocation || allLocations[0]?.name || '');
    }
  }, [allLocations, location, userLocation]);

  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'sheet' | 'history'>('sheet');
  const [historySheets, setHistorySheets] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [sheet, setSheet] = useState<PettyCashSheet | null>(null);
  const [punchTimes, setPunchTimes] = useState<PunchTimes>({});

  // Staff IN/OUT punch times for the selected date (full + part time)
  useEffect(() => {
    let cancelled = false;
    attendanceService.getByDateRange(date, date).then(list => {
      if (cancelled) return;
      const map: PunchTimes = {};
      list.forEach((a: any) => {
        const t = { in: a.arrivalTime, out: a.leavingTime };
        if (a.staffId) map[a.staffId] = t;
        if (a.id) map[a.id] = map[a.id] || t;
      });
      setPunchTimes(map);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [date, location]);
  
  // Configurable Default Meal Rates persisted per location
  const [ftMealRate, setFtMealRate] = useState<number>(130);
  const [ptMealRate, setPtMealRate] = useState<number>(65);

  // Saved Custom Expense presets per location
  const [savedExpenses, setSavedExpenses] = useState<string[]>([]);

  // Saved Transporters Autocomplete per location
  const [savedTransports, setSavedTransports] = useState<string[]>(() => {
    try {
      const locKey = (location || 'default').trim().toLowerCase();
      const raw = localStorage.getItem(`petty_cash_transports_${locKey}`);
      if (raw) return JSON.parse(raw);
    } catch {}
    return ['VRL Logistics', 'KRS Parcel Service', 'Navata Transport', 'Auto / Tempo Fare', 'Hamali / Unloading'];
  });

  const rememberTransporter = (name: string) => {
    if (!name || !name.trim()) return;
    const trimmed = name.trim();
    if (!savedTransports.includes(trimmed)) {
      const updated = [...savedTransports, trimmed];
      setSavedTransports(updated);
      const locKey = (location || 'default').trim().toLowerCase();
      localStorage.setItem(`petty_cash_transports_${locKey}`, JSON.stringify(updated));
    }
  };

  // Collapsible Transport Logistics
  const [showTransport, setShowTransport] = useState<boolean>(true);

  // Template Type
  const isGodownDefault = location.toLowerCase().includes('godown') || location.toLowerCase().includes('warehouse');
  const [templateType, setTemplateType] = useState<'shop' | 'godown'>(isGodownDefault ? 'godown' : 'shop');

  // Mobile Active Section & Staff Sub-Tab
  const [mobileSection, setMobileSection] = useState<'meals' | 'expenses' | 'transport' | 'summary'>('meals');
  const [mobileStaffTab, setMobileStaffTab] = useState<'full-time' | 'part-time'>('full-time');

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

    // Saved transports presets
    try {
      const rawTransports = localStorage.getItem(`petty_cash_transports_${locKey}`);
      if (rawTransports) {
        setSavedTransports(JSON.parse(rawTransports));
      } else {
        const defaultList = ['VRL Logistics', 'KRS Parcel Service', 'Navata Transport', 'Auto / Tempo Fare', 'Hamali / Unloading'];
        setSavedTransports(defaultList);
        localStorage.setItem(`petty_cash_transports_${locKey}`, JSON.stringify(defaultList));
      }
    } catch (e) {
      console.error('Failed to load transports:', e);
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
    setLoadError(null);
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
      setLoadError('Failed to load petty cash sheet.');
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    if (!location) return;
    setLoadingHistory(true);
    try {
      const sheets = await pettyCashService.getSheetHistory(location);
      setHistorySheets(sheets || []);
    } catch (e) {
      console.error('Error loading history:', e);
      setHistorySheets([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'history') loadHistory();
  }, [activeTab, location]);

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

  if (loading) {
    return (
      <div className="p-4 space-y-4 animate-pulse">
        <div className="h-20 bg-slate-200 dark:bg-slate-800 rounded-xl" />
        <div className="h-40 bg-slate-200 dark:bg-slate-800 rounded-xl" />
        <div className="h-32 bg-slate-200 dark:bg-slate-800 rounded-xl" />
      </div>
    );
  }
  if (!sheet && !loading && loadError) {
    return (
      <div className="p-8 text-center">
        <div className="inline-flex flex-col items-center gap-3 p-6 rounded-2xl bg-red-500/10 border border-red-500/20">
          <span className="text-2xl">⚠️</span>
          <p className="text-red-400 font-semibold">{loadError}</p>
          <button onClick={fetchSheet} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors">Retry</button>
        </div>
      </div>
    );
  }

  const fullTimeStaff = sheet?.staff_meals.filter(s => s.staff_type === 'full-time') || [];
  const partTimeStaff = sheet?.staff_meals.filter(s => s.staff_type === 'part-time') || [];
  
  const expensesTotal = sheet?.expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0) || 0;
  const transportTotal = (sheet?.transport_logistics || []).reduce((sum, t) => sum + (Number(t.total) || 0), 0);
    
  const totalExp = expensesTotal + transportTotal;
  const balance = (Number(sheet?.received_amount) || 0) - totalExp;

  const canEdit = userRole === 'super_admin' || userRole === 'admin' || userRole === 'petty_cash_manager';

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-36 sm:pb-16">
      {/* Tab Switcher */}
      <div className="flex gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
        <button
          onClick={() => setActiveTab('sheet')}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'sheet'
              ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Today&apos;s Sheet
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'history'
              ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          History
        </button>
      </div>

      {activeTab === 'sheet' && (<>
      {/* Streamlined Compact Control Bar */}
      <div className="bg-white p-2.5 sm:p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-2.5">
        
        {/* Left: Date picker & Quick jump ("Today", "Yesterday") */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
            <Calendar size={14} className="text-slate-500 shrink-0" />
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="text-xs sm:text-sm font-semibold bg-transparent border-0 p-0 text-slate-800 focus:ring-0 cursor-pointer"
            />
          </div>
          <button
            onClick={() => setDate(localDateKey())}
            className={`text-xs font-bold px-2.5 py-1.5 rounded-lg border transition-colors ${
              date === localDateKey()
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
            title="Today's voucher"
          >
            Today
          </button>
          <button
            onClick={() => setDate(getYesterdayKey())}
            className={`text-xs font-bold px-2.5 py-1.5 rounded-lg border transition-colors ${
              date === getYesterdayKey()
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
            title="Yesterday's voucher"
          >
            Yesterday
          </button>
        </div>

        {/* Center: Location selector & Mode toggle */}
        <div className="flex items-center gap-2 flex-wrap">
          {!isZoneHandler ? (
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
              <MapPin size={14} className="text-indigo-600 shrink-0" />
              <select
                value={location}
                onChange={e => setLocation(e.target.value)}
                className="text-xs sm:text-sm font-semibold bg-transparent border-0 p-0 text-slate-800 focus:ring-0 cursor-pointer"
              >
                {allLocations.map(l => (
                  <option key={l.id} value={l.name}>{l.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg text-xs font-bold">
              <MapPin size={14} />
              {userLocation || location}
            </span>
          )}

          {/* Mode Toggle: Shop vs Godown */}
          <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs font-bold">
            <button
              onClick={() => { setTemplateType('shop'); if (sheet) setSheet({ ...sheet, template_type: 'shop' }); }}
              className={`px-2.5 py-1 rounded-md transition-colors ${templateType === 'shop' ? 'bg-white text-indigo-700 shadow-xs font-bold' : 'text-slate-500'}`}
            >
              Shop
            </button>
            <button
              onClick={() => { setTemplateType('godown'); if (sheet) setSheet({ ...sheet, template_type: 'godown' }); }}
              className={`px-2.5 py-1 rounded-md transition-colors ${templateType === 'godown' ? 'bg-white text-indigo-700 shadow-xs font-bold' : 'text-slate-500'}`}
            >
              Godown
            </button>
          </div>
        </div>

        {/* Right: Action icons row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={saveSheet}
            disabled={!canEdit || saving}
            className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs disabled:opacity-50 transition-all active:scale-95"
            title="Save voucher"
          >
            {saving ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
            <span>Save</span>
          </button>
          <button
            onClick={() => refreshAttendanceData()}
            disabled={!canEdit}
            className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg border border-slate-200 bg-white"
            title="Refresh attendance from punches & regularizations"
          >
            <RefreshCw size={14} />
          </button>
          {sheet && (
            <>
              <button
                onClick={() => exportPettyCashPdf(sheet, punchTimes)}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold transition-all"
                title="Export PDF"
              >
                <Printer size={13} className="text-rose-600" />
                <span>PDF</span>
              </button>
              <button
                onClick={() => exportPettyCashExcel(sheet, punchTimes)}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold transition-all"
                title="Export Excel"
              >
                <FileSpreadsheet size={13} className="text-emerald-600" />
                <span>Excel</span>
              </button>
              <button
                onClick={() => sharePettyCashWhatsApp(sheet, punchTimes)}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition-all active:scale-95"
                title="Share voucher via WhatsApp"
              >
                <Share2 size={13} />
                <span>WhatsApp</span>
              </button>
            </>
          )}
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
              <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
                <label className="text-sm font-bold text-slate-700 shrink-0">Total Received (Cashier):</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-700 font-bold">₹</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={sheet.received_amount || ''}
                    onChange={e => setSheet({ ...sheet, received_amount: Number(e.target.value) })}
                    className="pl-7 pr-3 py-2 w-36 bg-indigo-50/70 border border-indigo-200 rounded-lg font-extrabold text-indigo-900 focus:ring-2 focus:ring-indigo-500 text-base"
                    placeholder="0"
                    disabled={!canEdit}
                  />
                </div>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
              {/* Configurable Rates */}
              <div className="flex items-center gap-2 text-xs bg-slate-50 px-2.5 sm:px-3 py-1.5 rounded-lg border border-slate-200 w-full sm:w-auto justify-between sm:justify-start">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-semibold">FT Meal:</span>
                  <div className="relative">
                    <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">₹</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={ftMealRate}
                      onChange={e => updateMealRates(Number(e.target.value), ptMealRate)}
                      className="w-16 pl-4 pr-1 py-1 border border-slate-200 rounded text-xs font-bold text-slate-800 focus:ring-1 focus:ring-indigo-500"
                      title="Default Full-Time Meal Rate (₹)"
                      disabled={!canEdit}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-semibold ml-1">PT/Flex:</span>
                  <div className="relative">
                    <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">₹</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={ptMealRate}
                      onChange={e => updateMealRates(ftMealRate, Number(e.target.value))}
                      className="w-16 pl-4 pr-1 py-1 border border-slate-200 rounded text-xs font-bold text-slate-800 focus:ring-1 focus:ring-indigo-500"
                      title="Default Part-Time / Flex Meal Rate (₹)"
                      disabled={!canEdit}
                    />
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button 
                  onClick={autoFillMeals} 
                  disabled={!canEdit}
                  className="flex-1 sm:flex-initial px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs sm:text-sm font-bold rounded-lg shadow-sm transition-colors flex items-center justify-center gap-1.5"
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
          </div>

          {/* Mobile Section Tab Switcher (md:hidden) */}
          <div className="md:hidden sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-1 -mx-1 sm:mx-0">
            <div 
              className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 px-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/60"
              style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {[
                { id: 'meals', label: 'Staff Meals', count: sheet?.staff_meals?.length || 0 },
                { id: 'expenses', label: 'Expenses', count: sheet?.expenses?.length || 0 },
                { id: 'transport', label: 'Logistics', count: (sheet?.transport_logistics || []).filter(t => t.transport_name).length },
                { id: 'summary', label: 'Settlement', highlight: true }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setMobileSection(tab.id as any)}
                  className={`shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                    mobileSection === tab.id
                      ? 'bg-indigo-600 text-white shadow-sm font-bold'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700/50'
                  }`}
                >
                  <span>{tab.label}</span>
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                      mobileSection === tab.id ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Staff Meals Section */}
          <div className={`${mobileSection === 'meals' ? 'block' : 'hidden'} sm:block space-y-4`}>
            
            {/* Mobile Staff View: Sub-Tabs & Touch Cards (sm:hidden) */}
            <div className="sm:hidden space-y-3">
              {/* Full-Time vs Part-Time Toggle Pills */}
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner">
                <button
                  onClick={() => setMobileStaffTab('full-time')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    mobileStaffTab === 'full-time'
                      ? 'bg-white text-indigo-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>FULL TIME</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    mobileStaffTab === 'full-time' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {fullTimeStaff.length}
                  </span>
                </button>
                <button
                  onClick={() => setMobileStaffTab('part-time')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    mobileStaffTab === 'part-time'
                      ? 'bg-white text-emerald-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>PART TIME / FLEX</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    mobileStaffTab === 'part-time' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {partTimeStaff.length}
                  </span>
                </button>
              </div>

              {/* Mobile Staff Meal Cards */}
              <div className="space-y-2.5">
                {(mobileStaffTab === 'full-time' ? fullTimeStaff : partTimeStaff).length === 0 ? (
                  <div className="p-8 text-center text-slate-400 bg-white rounded-xl border border-slate-200 italic text-sm">
                    {mobileStaffTab === 'full-time'
                      ? 'No full-time staff present for this date'
                      : 'No part-time / flex staff present for this date'}
                  </div>
                ) : (
                  (mobileStaffTab === 'full-time' ? fullTimeStaff : partTimeStaff).map((s, idx) => (
                    <div key={s.staff_id} className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <h4 className="font-bold text-slate-800 text-sm truncate">{s.staff_name}</h4>
                            <p className="text-xs text-slate-500 truncate">{s.designation || 'Staff'}</p>
                            {formatPunchRange(punchTimes, s.staff_id) && (
                              <p className="text-[11px] font-semibold text-slate-600 whitespace-nowrap mt-0.5">{formatPunchRange(punchTimes, s.staff_id)}</p>
                            )}
                          </div>
                        </div>
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-extrabold shrink-0 ${
                          s.attendance_status === 'F' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {s.attendance_status === 'F' ? 'Full Day' : s.attendance_status}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Meal Amount</span>
                        <div className="relative flex items-center">
                          <span className="absolute left-3 text-slate-400 font-bold text-sm">₹</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            value={s.amount || ''}
                            onChange={e => handleMealChange(s.staff_id, Number(e.target.value))}
                            className="w-32 pl-7 pr-3 py-2 text-right border border-slate-300 rounded-lg text-base font-bold text-slate-900 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="0"
                            disabled={!canEdit}
                          />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Desktop Staff Meals Split View (hidden on mobile, visible on sm and up) */}
            <div className="hidden sm:grid sm:grid-cols-1 lg:grid-cols-2 gap-6">
              
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
                          <td className="px-4 py-2.5 font-bold text-slate-800">{s.staff_name}{formatPunchRange(punchTimes, s.staff_id) && <div className="text-[11px] font-semibold text-slate-500 whitespace-nowrap">{formatPunchRange(punchTimes, s.staff_id)}</div>}</td>
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
                          <td className="px-4 py-2.5 font-bold text-slate-800">{s.staff_name}{formatPunchRange(punchTimes, s.staff_id) && <div className="text-[11px] font-semibold text-slate-500 whitespace-nowrap">{formatPunchRange(punchTimes, s.staff_id)}</div>}</td>
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
          </div>

          {/* Expenses & Universal Transport Logistics Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* DAILY EXPENSES */}
            <div className={`${mobileSection === 'expenses' ? 'block' : 'hidden'} sm:block`}>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                <div className="bg-slate-100 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
                  <h3 className="font-bold text-slate-800 text-sm sm:text-base">DAILY EXPENSES</h3>
                  <button
                    onClick={addCustomExpense}
                    disabled={!canEdit}
                    className="text-indigo-600 hover:text-indigo-700 text-xs sm:text-sm font-bold flex items-center gap-1 bg-white px-2.5 py-1 rounded-md border border-slate-200 shadow-sm"
                  >
                    <Plus size={16} /> Add Custom
                  </button>
                </div>

                {/* Location-Based Quick Add Saved Expense Chips (Horizontal scrolling on mobile) */}
                {savedExpenses.length > 0 && (
                  <div className="flex items-center gap-2 p-2.5 bg-slate-50 border-b border-slate-200 overflow-x-auto no-scrollbar whitespace-nowrap">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide shrink-0">Quick Add:</span>
                    {savedExpenses.map(preset => (
                      <span
                        key={preset}
                        onClick={() => canEdit && addSavedExpenseChip(preset)}
                        className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-50 cursor-pointer shadow-sm transition-all"
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

                {/* Mobile Expenses View: Touch-Friendly Rows (sm:hidden) */}
                <div className="sm:hidden divide-y divide-slate-100 p-3 space-y-3">
                  {sheet.expenses.map((e, idx) => (
                    <div key={e.id} className="pt-3 first:pt-0 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          {e.category === 'fixed' ? (
                            <span className="font-bold text-slate-700 text-sm truncate block">{e.label}</span>
                          ) : (
                            <input
                              type="text"
                              value={e.label}
                              onChange={ev => updateExpense(e.id!, 'label', ev.target.value)}
                              onBlur={ev => handleCustomLabelBlur(ev.target.value)}
                              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg font-medium text-sm focus:ring-2 focus:ring-indigo-500 text-slate-900 bg-white"
                              placeholder="e.g. Shop Cleaning Supplies..."
                              disabled={!canEdit}
                            />
                          )}
                        </div>
                        {e.category !== 'fixed' && canEdit && (
                          <button
                            onClick={() => removeExpense(e.id!)}
                            className="h-9 w-9 flex items-center justify-center text-red-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors shrink-0"
                            title="Delete expense"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                      <div className="flex items-center justify-between pl-7">
                        <span className="text-xs text-slate-400 font-medium">Amount:</span>
                        <div className="relative flex items-center">
                          <span className="absolute left-3 text-slate-400 font-bold text-sm">₹</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            value={e.amount || ''}
                            onChange={ev => updateExpense(e.id!, 'amount', Number(ev.target.value))}
                            className={`w-32 pl-7 pr-3 py-1.5 text-right border rounded-lg font-bold text-base focus:ring-2 focus:ring-indigo-500 ${
                              e.category === 'fixed' && e.label === 'MEAL TOTAL'
                                ? 'bg-slate-100 border-transparent text-slate-600 font-extrabold'
                                : 'border-slate-300 text-slate-900 bg-slate-50 focus:bg-white'
                            }`}
                            placeholder="0"
                            disabled={!canEdit || (e.category === 'fixed' && e.label === 'MEAL TOTAL')}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  <div className="pt-3 flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <span className="font-bold text-slate-700 text-xs uppercase tracking-wide">TOTAL EXPENSES:</span>
                    <span className="text-indigo-900 text-base font-black shrink-0 whitespace-nowrap tabular-nums">
                      ₹ {expensesTotal.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                {/* Desktop Expenses Table (hidden on mobile, visible on sm and up) */}
                <div className="hidden sm:block overflow-x-auto">
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
            </div>

            {/* UNIVERSAL TRANSPORT LOGISTICS & SETTLEMENT */}
            <div className="flex flex-col gap-6">
              
              {/* Universal Transport Logistics (Available for all shops & godowns) */}
              <div className={`${mobileSection === 'transport' ? 'block' : 'hidden'} sm:block`}>
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

                      {/* Transporter suggestions datalists */}
                      <datalist id="transporter-list">
                        {savedTransports.map(t => (
                          <option key={t} value={t} />
                        ))}
                      </datalist>
                      <datalist id="transporter-suggestions">
                        {savedTransports.map(t => (
                          <option key={t} value={t} />
                        ))}
                      </datalist>

                      {/* Mobile Consignment Cards (sm:hidden) */}
                      <div className="sm:hidden p-3 space-y-3">
                        {sheet.transport_logistics
                          .filter((t, i) => i < 2 || t.transport_name || t.count || Number(t.freight) > 0 || Number(t.auto) > 0 || Number(t.hamali) > 0 || Number(t.total) > 0)
                          .map((t, idx) => (
                            <div key={t.id} className="bg-slate-50/80 rounded-xl border border-slate-200 p-3.5 space-y-2.5">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="w-5 h-5 rounded-full bg-violet-100 text-violet-800 text-xs font-bold flex items-center justify-center">
                                    {idx + 1}
                                  </span>
                                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">Consignment</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-black text-violet-900 bg-violet-100/90 px-2 py-0.5 rounded-md tabular-nums">
                                    ₹ {Number(t.total) || 0}
                                  </span>
                                  {canEdit && (
                                    <button
                                      onClick={() => removeTransport(t.id!)}
                                      className="h-9 w-9 flex items-center justify-center text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                                      title="Remove consignment"
                                    >
                                      <X size={16} />
                                    </button>
                                  )}
                                </div>
                              </div>

                              <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Transporter / LR Number</label>
                                <input
                                  type="text"
                                  list="transporter-list"
                                  value={t.transport_name}
                                  onChange={e => updateTransport(t.id!, 'transport_name', e.target.value)}
                                  onBlur={e => rememberTransporter(e.target.value)}
                                  className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 font-medium bg-white focus:ring-2 focus:ring-violet-500"
                                  placeholder="e.g. VRL, KRS, Auto"
                                  disabled={!canEdit}
                                />
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">Count (Bags)</label>
                                  <input
                                    type="text"
                                    value={t.count}
                                    onChange={e => updateTransport(t.id!, 'count', e.target.value)}
                                    className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-900 font-semibold bg-white text-center focus:ring-2 focus:ring-violet-500"
                                    placeholder="0"
                                    disabled={!canEdit}
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">Freight (₹)</label>
                                  <input
                                    type="number"
                                    inputMode="decimal"
                                    value={t.freight || ''}
                                    onChange={e => updateTransport(t.id!, 'freight', Number(e.target.value))}
                                    className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-900 font-bold bg-white text-right focus:ring-2 focus:ring-violet-500"
                                    placeholder="0"
                                    disabled={!canEdit}
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">Auto / Tempo (₹)</label>
                                  <input
                                    type="number"
                                    inputMode="decimal"
                                    value={t.auto || ''}
                                    onChange={e => updateTransport(t.id!, 'auto', Number(e.target.value))}
                                    className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-900 font-bold bg-white text-right focus:ring-2 focus:ring-violet-500"
                                    placeholder="0"
                                    disabled={!canEdit}
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">Hamali (₹)</label>
                                  <input
                                    type="number"
                                    inputMode="decimal"
                                    value={t.hamali || ''}
                                    onChange={e => updateTransport(t.id!, 'hamali', Number(e.target.value))}
                                    className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-900 font-bold bg-white text-right focus:ring-2 focus:ring-violet-500"
                                    placeholder="0"
                                    disabled={!canEdit}
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        
                        {canEdit && (
                          <button
                            onClick={addConsignment}
                            className="w-full py-2.5 border-2 border-dashed border-violet-200 hover:border-violet-400 bg-violet-50/50 hover:bg-violet-50 rounded-xl text-violet-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <Plus size={16} /> Add Consignment Row
                          </button>
                        )}

                        <div className="flex justify-between items-center bg-violet-50 p-3 rounded-xl border border-violet-200">
                          <span className="font-bold text-violet-900 text-xs uppercase tracking-wide">TOTAL LOGISTICS:</span>
                          <span className="text-violet-900 text-base font-black shrink-0 whitespace-nowrap tabular-nums">
                            ₹ {transportTotal.toLocaleString('en-IN')}
                          </span>
                        </div>
                      </div>

                      {/* Desktop Transport Table (hidden on mobile, visible on sm and up) */}
                      <div className="hidden sm:block overflow-x-auto max-h-80">
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
                                    list="transporter-list"
                                    value={t.transport_name}
                                    onChange={e => updateTransport(t.id!, 'transport_name', e.target.value)}
                                    onBlur={e => rememberTransporter(e.target.value)}
                                    className="w-full px-1.5 py-0.5 border border-slate-200 rounded text-xs text-slate-900 font-medium"
                                    placeholder="e.g. VRL, KRS, Auto"
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
                                    inputMode="decimal"
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
                                    inputMode="decimal"
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
                                    inputMode="decimal"
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
                                    <button onClick={() => removeTransport(t.id!)} className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors">
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
              </div>

              {/* SETTLEMENT BOX */}
              <div className={`${mobileSection === 'summary' ? 'block' : 'hidden'} sm:block`}>
                
                {/* Mobile Breakdown Overview */}
                <div className="sm:hidden bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2.5 mb-4">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-2">
                    Expenses Overview
                  </h4>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-600">Full Time Staff Meals</span>
                    <span className="font-semibold text-slate-900 tabular-nums">
                      ₹ {sheet.staff_meals.filter(s => s.staff_type === 'full-time').reduce((sum, s) => sum + (Number(s.amount) || 0), 0).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-600">Part Time / Flex Meals</span>
                    <span className="font-semibold text-slate-900 tabular-nums">
                      ₹ {sheet.staff_meals.filter(s => s.staff_type === 'part-time').reduce((sum, s) => sum + (Number(s.amount) || 0), 0).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-600">Daily Operations & Tea</span>
                    <span className="font-semibold text-slate-900 tabular-nums">
                      ₹ {sheet.expenses.filter(e => e.label !== 'MEAL TOTAL').reduce((sum, e) => sum + (Number(e.amount) || 0), 0).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-600">Goods Inward & Logistics</span>
                    <span className="font-semibold text-slate-900 tabular-nums">
                      ₹ {transportTotal.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm pt-2 border-t border-slate-100 font-bold text-slate-800">
                    <span>Total Combined Expenses</span>
                    <span className="text-rose-600 tabular-nums font-black">₹ {totalExp.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                {/* Settlement Gradient Box */}
                <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 rounded-xl shadow-lg border border-slate-700 text-white overflow-hidden">
                  <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-white/10 flex justify-between items-center">
                    <h3 className="font-bold text-base sm:text-lg text-white">CASH SETTLEMENT SUMMARY</h3>
                    <span className="text-xs uppercase tracking-wider bg-white/10 px-2.5 py-1 rounded text-slate-300 font-semibold">
                      {sheet.template_type}
                    </span>
                  </div>
                  <div className="p-4 sm:p-6 grid gap-3 sm:gap-4">
                    <div className="flex justify-between items-center gap-3">
                      <span className="text-slate-300 font-medium text-xs sm:text-sm flex-1 min-w-0">
                        TOTAL RECEIVED (CASHIER)
                      </span>
                      <span className="text-lg sm:text-xl font-bold text-white shrink-0 whitespace-nowrap tabular-nums text-right">
                        ₹ {(sheet.received_amount || 0).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="flex justify-between items-center gap-3 text-rose-300">
                      <span className="font-medium text-xs sm:text-sm flex-1 min-w-0">
                        TOTAL EXPENSES <span className="opacity-75 font-normal text-[11px] sm:text-xs">(MEALS + EXP + TRANSPORT)</span>
                      </span>
                      <span className="text-lg sm:text-xl font-bold shrink-0 whitespace-nowrap tabular-nums text-right">
                        - ₹ {totalExp.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="h-px bg-white/20 my-0.5"></div>
                    <div className="flex justify-between items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <span className="text-slate-200 font-bold text-sm sm:text-base block leading-snug">
                          {balance >= 0 ? 'BALANCE REFUND TO CASHIER' : 'CASH DEFICIT / REIMBURSEMENT DUE'}
                        </span>
                        <span className="text-[11px] text-slate-400 block mt-0.5">
                          {balance >= 0 ? 'Cash in hand to return' : 'Payable to manager'}
                        </span>
                      </div>
                      <span className={`text-2xl sm:text-3xl font-black shrink-0 whitespace-nowrap tabular-nums text-right ${
                        balance < 0 ? 'text-rose-400' : 'text-emerald-400'
                      }`}>
                        ₹ {balance.toLocaleString('en-IN')}
                      </span>
                    </div>
                    {balance < 0 && (
                      <div className="text-right text-xs text-rose-300 font-semibold bg-rose-500/10 p-2 rounded-lg border border-rose-500/20">
                        ⚠️ Cash deficit! Manager reimbursement due from Cashier.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Action Bar (Sticky with safe clearance for mobile navigation) */}
          <div className="sticky bottom-[calc(84px+env(safe-area-inset-bottom))] sm:bottom-4 z-40 bg-white/95 backdrop-blur px-3 sm:px-6 py-2.5 sm:py-4 rounded-2xl shadow-xl border border-slate-200">
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 justify-between items-center">
              
              {/* Export & Share Group */}
              <div className="grid grid-cols-3 sm:flex gap-1.5 sm:gap-2.5 w-full sm:w-auto">
                {/* WhatsApp Share Button */}
                <button
                  onClick={() => sharePettyCashWhatsApp(sheet, punchTimes)}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs sm:text-sm shadow-sm transition-all active:scale-95"
                  title="Share voucher PDF directly on WhatsApp"
                >
                  <Share2 size={15} />
                  <span>WhatsApp</span>
                </button>

                {/* Print PDF Button */}
                <button
                  onClick={() => exportPettyCashPdf(sheet, punchTimes)}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl font-semibold text-xs sm:text-sm transition-all"
                >
                  <Printer size={15} className="text-rose-600" />
                  <span>PDF</span>
                </button>

                {/* Excel Button */}
                <button
                  onClick={() => exportPettyCashExcel(sheet, punchTimes)}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl font-semibold text-xs sm:text-sm transition-all"
                >
                  <FileSpreadsheet size={15} className="text-emerald-600" />
                  <span>Excel</span>
                </button>
              </div>

              {/* Save Voucher Button */}
              <button
                onClick={saveSheet}
                disabled={!canEdit || saving}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm shadow-md shadow-indigo-200 disabled:opacity-50 transition-all active:scale-98"
              >
                {saving ? <RefreshCw size={17} className="animate-spin" /> : <Save size={17} />}
                <span>Save Voucher</span>
              </button>

            </div>
          </div>

        </div>
      )}
      </>)}

      {activeTab === 'history' && (
        <div className="space-y-3">
          {loadingHistory ? (
            <div className="p-4 space-y-3 animate-pulse">
              {[1,2,3,4,5].map(i => <div key={i} className="h-20 bg-slate-200 dark:bg-slate-800 rounded-xl" />)}
            </div>
          ) : historySheets.length === 0 ? (
            <div className="text-center py-12 text-slate-500">No history found for {location}</div>
          ) : (
            historySheets.map((s: any) => {
              const expTotal = (s.expenses || []).reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0);
              const mealTotal = (s.staff_meals || []).reduce((sum: number, m: any) => sum + (Number(m.amount) || 0), 0);
              const transportTotal = (s.transport_logistics || []).reduce((sum: number, t: any) => sum + (Number(t.total) || 0), 0);
              const netReimbursed = (Number(s.received_amount) || 0) - expTotal - transportTotal;
              const dateLabel = new Date(s.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
              return (
                <div key={s.id || s.date} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-bold text-slate-800 dark:text-slate-100">{dateLabel}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{s.location}</div>
                    </div>
                    <span className={`px-2 py-1 rounded-lg text-xs font-bold ${
                      s.saved_at ? 'bg-emerald-500/15 text-emerald-600' : 'bg-amber-500/15 text-amber-600'
                    }`}>{s.saved_at ? 'Saved' : 'Draft'}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <div className="text-slate-500 font-medium">Total Expense</div>
                      <div className="font-bold text-slate-800 dark:text-slate-100">Rs. {expTotal.toLocaleString('en-IN')}</div>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <div className="text-slate-500 font-medium">Meal Total</div>
                      <div className="font-bold text-slate-800 dark:text-slate-100">Rs. {mealTotal.toLocaleString('en-IN')}</div>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <div className="text-slate-500 font-medium">Transport</div>
                      <div className="font-bold text-slate-800 dark:text-slate-100">Rs. {transportTotal.toLocaleString('en-IN')}</div>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <div className="text-slate-500 font-medium">Net Reimbursed</div>
                      <div className={`font-bold ${netReimbursed >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>Rs. {netReimbursed.toLocaleString('en-IN')}</div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
