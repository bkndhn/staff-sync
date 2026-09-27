import React, { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { Calendar, Download, Printer, Search, FileText, FileSpreadsheet, RefreshCw, Plus, Trash2, Building, ArrowRight, User } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { pettyCashService, PettyCashSheet, StaffMeal, CustomExpense, TransportLogistics } from '../services/pettyCashService';
import { attendanceService } from '../services/attendanceService';
import { staffService } from '../services/staffService';
import { exportPettyCashPdf, exportPettyCashExcel } from '../utils/pettyCashExport';
import { Staff, Attendance, Location } from '../types';

interface Props {
  locations: Location[];
}

export const PettyCashManagement: React.FC<Props> = ({ locations }) => {
  const { user } = useAuth();
  
  // Default to user's assigned location if petty_cash_manager
  const initialLocation = (user?.role === 'petty_cash_manager' || user?.role === 'manager') 
    ? user.location || (locations[0]?.name || '')
    : (locations[0]?.name || '');

  const [location, setLocation] = useState(initialLocation);
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [sheet, setSheet] = useState<PettyCashSheet | null>(null);
  
  const [ftMealRate, setFtMealRate] = useState(50);
  const [ptMealRate, setPtMealRate] = useState(40);
  
  const isGodownDefault = location.toLowerCase().includes('godown') || location.toLowerCase().includes('warehouse');
  const [templateType, setTemplateType] = useState<'shop'|'godown'>(isGodownDefault ? 'godown' : 'shop');

  useEffect(() => {
    setTemplateType(
      location.toLowerCase().includes('godown') || location.toLowerCase().includes('warehouse') 
      ? 'godown' : 'shop'
    );
  }, [location]);

  useEffect(() => {
    fetchSheet();
  }, [location, date]);

  const fetchSheet = async () => {
    setLoading(true);
    try {
      const existing = await pettyCashService.getSheet(location, date);
      if (existing) {
        setSheet(existing);
        setTemplateType(existing.template_type);
      } else {
        await createNewSheet();
      }
    } catch (e) {
      console.error(e);
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
        
    const defaultLogistics: TransportLogistics[] = Array(10).fill(null).map((_, i) => ({
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
      transport_logistics: templateType === 'godown' ? defaultLogistics : []
    };
    
    // Auto-fetch attendance
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
      
      const locAttendances = attendances.filter(a => a.location === location && (a.status === 'Present' || a.status === 'Half Day'));
      
      const newStaffMeals: StaffMeal[] = [];
      
      locAttendances.forEach(a => {
        const staff = staffs.find(s => s.id === a.staffId);
        if (!staff) return;
        
        let attStatus = 'F';
        if (a.status === 'Half Day') attStatus = 'H';
        
        // preserve existing if there is one
        const existingMeal = targetSheet.staff_meals.find(m => m.staff_id === a.staffId);
        
        newStaffMeals.push({
          staff_id: a.staffId,
          staff_name: staff.name,
          designation: staff.designation,
          staff_type: staff.type === 'part-time' ? 'part-time' : 'full-time',
          attendance_status: attStatus,
          amount: existingMeal ? existingMeal.amount : 0
        });
      });
      
      setSheet({ ...targetSheet, staff_meals: newStaffMeals });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const saveSheet = async () => {
    if (!sheet) return;
    setSaving(true);
    try {
      
      // Compute totals before saving
      const fullTimeStaff = sheet.staff_meals.filter(s => s.staff_type === 'full-time');
      const partTimeStaff = sheet.staff_meals.filter(s => s.staff_type === 'part-time');
      
      const ftMealTotal = fullTimeStaff.reduce((sum, s) => sum + (s.amount || 0), 0);
      const ptMealTotal = partTimeStaff.reduce((sum, s) => sum + (s.amount || 0), 0);
      const mealTotal = ftMealTotal + ptMealTotal;
      
      const expensesTotal = sheet.expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
      const transportTotal = sheet.template_type === 'godown' 
        ? sheet.transport_logistics.reduce((sum, t) => sum + (Number(t.total) || 0), 0) 
        : 0;
        
      const totalExp = expensesTotal + transportTotal;
      const balance = sheet.received_amount - totalExp;
      
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
      alert('Saved successfully!');
    } catch (e) {
      console.error(e);
      alert('Error saving sheet');
    } finally {
      setSaving(false);
    }
  };

  const autoFillMeals = () => {
    if (!sheet) return;
    const newMeals = sheet.staff_meals.map(m => {
      let amt = 0;
      if (m.staff_type === 'full-time') {
        amt = m.attendance_status === 'H' ? (ftMealRate / 2) : ftMealRate;
      } else {
        amt = m.attendance_status === 'H' ? (ptMealRate / 2) : ptMealRate;
      }
      return { ...m, amount: amt };
    });
    
    updateMealTotal(newMeals);
  };
  
  const updateMealTotal = (meals: StaffMeal[]) => {
    if (!sheet) return;
    const total = meals.reduce((sum, m) => sum + (m.amount || 0), 0);
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

  const updateExpense = (id: string, field: keyof CustomExpense, value: any) => {
    if (!sheet) return;
    const exps = sheet.expenses.map(e => e.id === id ? { ...e, [field]: value } : e);
    setSheet({ ...sheet, expenses: exps });
  };

  const removeExpense = (id: string) => {
    if (!sheet) return;
    setSheet({ ...sheet, expenses: sheet.expenses.filter(e => e.id !== id) });
  };

  const updateTransport = (id: string, field: keyof TransportLogistics, value: any) => {
    if (!sheet) return;
    const tr = sheet.transport_logistics.map(t => {
      if (t.id !== id) return t;
      const updated = { ...t, [field]: value };
      // auto calc total
      if (['freight', 'auto', 'hamali'].includes(field)) {
        updated.total = (Number(updated.freight) || 0) + (Number(updated.auto) || 0) + (Number(updated.hamali) || 0);
      }
      return updated;
    });
    setSheet({ ...sheet, transport_logistics: tr });
  };

  if (!sheet && !loading) {
    return <div className="p-8 text-center">Failed to load sheet</div>;
  }

  const fullTimeStaff = sheet?.staff_meals.filter(s => s.staff_type === 'full-time') || [];
  const partTimeStaff = sheet?.staff_meals.filter(s => s.staff_type === 'part-time') || [];
  
  const expensesTotal = sheet?.expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0) || 0;
  const transportTotal = sheet?.template_type === 'godown' 
    ? sheet.transport_logistics.reduce((sum, t) => sum + (Number(t.total) || 0), 0) 
    : 0;
    
  const totalExp = expensesTotal + transportTotal;
  const balance = (sheet?.received_amount || 0) - totalExp;

  const canEdit = user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'petty_cash_manager';

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Building className="text-indigo-600" />
            Petty Cash Management
          </h1>
          <p className="text-slate-500 text-sm mt-1">Manage daily shop and godown expenses</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {(user?.role === 'super_admin' || user?.role === 'admin') && (
            <select
              value={location}
              onChange={e => setLocation(e.target.value)}
              className="pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
            >
              {locations.map(l => (
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
              className="pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => {
                if(sheet) {
                  setTemplateType('shop');
                  setSheet({...sheet, template_type: 'shop'});
                }
              }}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${templateType === 'shop' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Shop
            </button>
            <button
              onClick={() => {
                if(sheet) {
                  setTemplateType('godown');
                  setSheet({...sheet, template_type: 'godown'});
                }
              }}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${templateType === 'godown' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Godown
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : sheet && (
        <div className="grid grid-cols-1 gap-6">
          
          {/* Top Controls: Cashier Handover & Auto-Fill */}
          <div className="flex flex-col md:flex-row gap-4 justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm font-semibold text-slate-700">Total Received:</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-medium">₹</span>
                  <input
                    type="number"
                    value={sheet.received_amount}
                    onChange={e => setSheet({...sheet, received_amount: Number(e.target.value)})}
                    className="pl-7 pr-3 py-2 w-32 bg-indigo-50 border border-indigo-200 rounded-lg font-bold text-indigo-900 focus:ring-2 focus:ring-indigo-500"
                    disabled={!canEdit}
                  />
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm bg-slate-50 p-2 rounded-lg border border-slate-200">
                <span className="text-slate-600 font-medium">FT Rate:</span>
                <input type="number" value={ftMealRate} onChange={e => setFtMealRate(Number(e.target.value))} className="w-16 px-2 py-1 border rounded" disabled={!canEdit} />
                <span className="text-slate-600 font-medium ml-2">PT Rate:</span>
                <input type="number" value={ptMealRate} onChange={e => setPtMealRate(Number(e.target.value))} className="w-16 px-2 py-1 border rounded" disabled={!canEdit} />
              </div>
              
              <button 
                onClick={autoFillMeals} 
                disabled={!canEdit}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors flex items-center gap-2"
              >
                Auto-Fill Meals
              </button>
              
              <button 
                onClick={() => refreshAttendanceData()} 
                disabled={!canEdit}
                className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-slate-200 bg-white"
                title="Refresh Attendance"
              >
                <RefreshCw size={18} />
              </button>
            </div>
          </div>

          {/* Staff Meals Split View */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* FULL TIME */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="bg-slate-800 text-white px-4 py-3 flex justify-between items-center">
                <h3 className="font-bold">FULL TIME STAFF</h3>
                <span className="bg-slate-700 px-2 py-0.5 rounded text-xs">{fullTimeStaff.length} Present</span>
              </div>
              <div className="overflow-x-auto flex-1">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-500 bg-slate-50 uppercase border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">S.NO</th>
                      <th className="px-4 py-3">NAME</th>
                      <th className="px-4 py-3">DESIG</th>
                      <th className="px-4 py-3 text-center">F/H</th>
                      <th className="px-4 py-3 text-right">AMT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {fullTimeStaff.length === 0 ? (
                      <tr><td colSpan={5} className="p-4 text-center text-slate-400 italic">No full-time staff present</td></tr>
                    ) : fullTimeStaff.map((s, idx) => (
                      <tr key={s.staff_id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 text-slate-500">{idx + 1}</td>
                        <td className="px-4 py-2.5 font-medium text-slate-800">{s.staff_name}</td>
                        <td className="px-4 py-2.5 text-slate-500 text-xs">{s.designation}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${s.attendance_status === 'F' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                            {s.attendance_status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <input
                            type="number"
                            value={s.amount || ''}
                            onChange={e => handleMealChange(s.staff_id, Number(e.target.value))}
                            className="w-16 text-right px-2 py-1 border border-slate-200 rounded focus:ring-indigo-500 focus:border-indigo-500"
                            disabled={!canEdit}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* PART TIME */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="bg-slate-600 text-white px-4 py-3 flex justify-between items-center">
                <h3 className="font-bold">PART TIME STAFF</h3>
                <span className="bg-slate-500 px-2 py-0.5 rounded text-xs">{partTimeStaff.length} Present</span>
              </div>
              <div className="overflow-x-auto flex-1">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-500 bg-slate-50 uppercase border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">S.NO</th>
                      <th className="px-4 py-3">NAME</th>
                      <th className="px-4 py-3">DESIG</th>
                      <th className="px-4 py-3 text-center">F/H</th>
                      <th className="px-4 py-3 text-right">AMT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {partTimeStaff.length === 0 ? (
                      <tr><td colSpan={5} className="p-4 text-center text-slate-400 italic">No part-time staff present</td></tr>
                    ) : partTimeStaff.map((s, idx) => (
                      <tr key={s.staff_id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 text-slate-500">{idx + 1}</td>
                        <td className="px-4 py-2.5 font-medium text-slate-800">{s.staff_name}</td>
                        <td className="px-4 py-2.5 text-slate-500 text-xs">{s.designation}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${s.attendance_status === 'F' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                            {s.attendance_status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <input
                            type="number"
                            value={s.amount || ''}
                            onChange={e => handleMealChange(s.staff_id, Number(e.target.value))}
                            className="w-16 text-right px-2 py-1 border border-slate-200 rounded focus:ring-indigo-500 focus:border-indigo-500"
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* EXPENSES */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="bg-slate-100 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
                <h3 className="font-bold text-slate-800">EXPENSES</h3>
                <button onClick={addCustomExpense} disabled={!canEdit} className="text-indigo-600 hover:text-indigo-700 text-sm font-medium flex items-center gap-1">
                  <Plus size={16} /> Add Custom
                </button>
              </div>
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
                            <span className="font-medium text-slate-700">{e.label}</span>
                          ) : (
                            <input
                              type="text"
                              value={e.label}
                              onChange={ev => updateExpense(e.id!, 'label', ev.target.value)}
                              className="w-full px-2 py-1 border border-slate-200 rounded focus:ring-indigo-500 focus:border-indigo-500"
                              placeholder="Enter detail..."
                              disabled={!canEdit}
                            />
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <input
                            type="number"
                            value={e.amount || ''}
                            onChange={ev => updateExpense(e.id!, 'amount', Number(ev.target.value))}
                            className={`w-full text-right px-2 py-1 border rounded focus:ring-indigo-500 ${e.category === 'fixed' && e.label === 'MEAL TOTAL' ? 'bg-slate-100 border-transparent text-slate-500 font-bold' : 'border-slate-200'}`}
                            disabled={!canEdit || (e.category === 'fixed' && e.label === 'MEAL TOTAL')}
                          />
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {e.category !== 'fixed' && canEdit && (
                            <button onClick={() => removeExpense(e.id!)} className="text-red-400 hover:text-red-600">
                              <Trash2 size={16} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50 font-bold border-t-2 border-slate-200">
                      <td colSpan={2} className="px-4 py-3 text-right text-slate-700">TOTAL EXPENSES:</td>
                      <td className="px-4 py-3 text-right text-slate-800 text-lg">₹ {expensesTotal.toLocaleString('en-IN')}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* GODOWN TRANSPORT OR SETTLEMENT */}
            <div className="flex flex-col gap-6">
              {templateType === 'godown' && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                  <div className="bg-slate-100 px-4 py-3 border-b border-slate-200">
                    <h3 className="font-bold text-slate-800">TRANSPORT LOGISTICS</h3>
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
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sheet.transport_logistics.map((t, idx) => (
                          <tr key={t.id} className="hover:bg-slate-50">
                            <td className="px-2 py-1.5">
                              <input type="text" value={t.transport_name} onChange={e => updateTransport(t.id!, 'transport_name', e.target.value)} className="w-full px-1 border border-transparent hover:border-slate-200 rounded text-xs" disabled={!canEdit}/>
                            </td>
                            <td className="px-2 py-1.5">
                              <input type="text" value={t.count} onChange={e => updateTransport(t.id!, 'count', e.target.value)} className="w-full px-1 border border-transparent hover:border-slate-200 rounded text-xs" disabled={!canEdit}/>
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              <input type="number" value={t.freight || ''} onChange={e => updateTransport(t.id!, 'freight', Number(e.target.value))} className="w-full text-right px-1 border border-transparent hover:border-slate-200 rounded text-xs" disabled={!canEdit}/>
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              <input type="number" value={t.auto || ''} onChange={e => updateTransport(t.id!, 'auto', Number(e.target.value))} className="w-full text-right px-1 border border-transparent hover:border-slate-200 rounded text-xs" disabled={!canEdit}/>
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              <input type="number" value={t.hamali || ''} onChange={e => updateTransport(t.id!, 'hamali', Number(e.target.value))} className="w-full text-right px-1 border border-transparent hover:border-slate-200 rounded text-xs" disabled={!canEdit}/>
                            </td>
                            <td className="px-2 py-1.5 text-right font-medium text-slate-700">₹ {t.total || 0}</td>
                          </tr>
                        ))}
                        <tr className="bg-slate-50 font-bold border-t-2 border-slate-200 sticky bottom-0">
                          <td colSpan={5} className="px-2 py-2 text-right text-slate-700 text-xs">TOTAL LOGISTICS:</td>
                          <td className="px-2 py-2 text-right text-slate-800 text-sm">₹ {transportTotal.toLocaleString('en-IN')}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* SETTLEMENT BOX */}
              <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl shadow-lg border border-slate-700 text-white overflow-hidden">
                <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center">
                  <h3 className="font-bold text-lg">CASH SETTLEMENT</h3>
                </div>
                <div className="p-6 grid gap-4">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-300 font-medium">TOTAL RECEIVED</span>
                    <span className="text-xl font-bold">₹ {(sheet.received_amount || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between items-center text-red-400">
                    <span className="font-medium">TOTAL EXPENSES</span>
                    <span className="text-xl font-bold">- ₹ {totalExp.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="h-px bg-white/20 my-2"></div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-200 font-bold text-lg">BALANCE</span>
                    <span className={`text-3xl font-extrabold ${balance < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                      ₹ {balance.toLocaleString('en-IN')}
                    </span>
                  </div>
                  {balance < 0 && (
                    <div className="text-right text-xs text-red-300 mt-1">Cash deficit! Reimbursement due.</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex flex-col sm:flex-row gap-3 justify-end items-center sticky bottom-4 z-40 bg-white/90 backdrop-blur px-6 py-4 rounded-2xl shadow-xl border border-slate-200">
            <button
              onClick={() => exportPettyCashExcel(sheet)}
              className="flex items-center gap-2 px-5 py-2.5 text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 font-medium w-full sm:w-auto justify-center"
            >
              <FileSpreadsheet size={18} className="text-emerald-600" />
              Excel Export
            </button>
            <button
              onClick={() => exportPettyCashPdf(sheet)}
              className="flex items-center gap-2 px-5 py-2.5 text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 font-medium w-full sm:w-auto justify-center"
            >
              <Printer size={18} className="text-rose-600" />
              Print PDF
            </button>
            <div className="h-8 w-px bg-slate-300 hidden sm:block mx-2"></div>
            <button
              onClick={saveSheet}
              disabled={!canEdit || saving}
              className="flex items-center gap-2 px-8 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-bold shadow-md shadow-indigo-200 disabled:opacity-50 w-full sm:w-auto justify-center"
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
