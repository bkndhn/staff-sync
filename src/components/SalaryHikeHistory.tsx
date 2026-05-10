import React from 'react';
import { TrendingUp, Calendar, DollarSign } from 'lucide-react';
import { SalaryHike, Staff } from '../types';
import { settingsService } from '../services/settingsService';

interface SalaryHikeHistoryProps {
  salaryHikes: SalaryHike[];
  staffName: string;
  currentSalary: number;
  staff?: Staff;
  onRefresh?: () => Promise<void>;
}

const SalaryHikeHistory: React.FC<SalaryHikeHistoryProps> = ({
  salaryHikes,
  staffName,
  currentSalary,
  staff,
  onRefresh
}) => {
  const latestHike = salaryHikes[0];

  const getMonthsSinceHike = (hikeDate: string): number => {
    const hike = new Date(hikeDate);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - hike.getTime());
    const diffMonths = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30));
    return diffMonths;
  };

  const [previousSalaryData, setPreviousSalaryData] = React.useState<{ previousSalary: number | null, changeDate: string | null }>({ previousSalary: null, changeDate: null });
  const [showAddPastHike, setShowAddPastHike] = React.useState(false);
  const [editingHike, setEditingHike] = React.useState<SalaryHike | null>(null);

  const [pastHikeForm, setPastHikeForm] = React.useState<{
    date: string;
    oldSalary: number;
    newSalary: number;
    reason: string;
    breakdown: Record<string, number>;
  }>({
    date: '',
    oldSalary: 0,
    newSalary: 0,
    reason: '',
    breakdown: {}
  });

  React.useEffect(() => {
    if (staff) {
      import('../services/salaryHikeService').then(({ salaryHikeService }) => {
        salaryHikeService.getPreviousSalary(staff.id).then(data => {
          setPreviousSalaryData(data);
        });
      });
    }
  }, [staff]);

  const handleEditHike = (hike: SalaryHike) => {
    setEditingHike(hike);
    setPastHikeForm({
      date: hike.hikeDate,
      oldSalary: hike.oldSalary,
      newSalary: hike.newSalary,
      reason: hike.reason || '',
      breakdown: hike.breakdown || {}
    });
    setShowAddPastHike(true);
  };

  const handleDeleteHike = async (hikeId: string) => {
    if (!confirm('Are you sure you want to delete this salary record?')) return;
    try {
      const { salaryHikeService } = await import('../services/salaryHikeService');
      await salaryHikeService.delete(hikeId);
      if (onRefresh) {
        await onRefresh();
      } else {
        window.location.reload();
      }
    } catch (error) {
      console.error('Error deleting hike:', error);
      alert('Failed to delete record');
    }
  };

  const handleBreakdownChange = (categoryId: string, value: number) => {
    const newBreakdown = { ...pastHikeForm.breakdown, [categoryId]: value };
    const newTotal = Object.values(newBreakdown).reduce((sum, val) => sum + val, 0);
    setPastHikeForm({
      ...pastHikeForm,
      breakdown: newBreakdown,
      newSalary: newTotal
    });
  };

  const initializeForm = () => {
    if (!staff) return;

    const initialBreakdown: Record<string, number> = {
      basic: staff.basicSalary,
      incentive: staff.incentive,
      hra: staff.hra,
      meal_allowance: staff.mealAllowance || 0,
      ...(staff.salarySupplements || {})
    };

    setEditingHike(null);
    setPastHikeForm({
      date: new Date().toISOString().split('T')[0],
      oldSalary: staff.totalSalary,
      newSalary: staff.totalSalary,
      reason: '',
      breakdown: initialBreakdown
    });
    setShowAddPastHike(true);
  };

  const handleAddPastHike = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staff) return;

    try {
      const { salaryHikeService } = await import('../services/salaryHikeService');

      const hikeData = {
        staffId: staff.id,
        oldSalary: pastHikeForm.oldSalary,
        newSalary: pastHikeForm.newSalary,
        hikeDate: pastHikeForm.date,
        reason: pastHikeForm.reason,
        breakdown: pastHikeForm.breakdown
      };

      if (editingHike) {
        await salaryHikeService.update(editingHike.id, hikeData);
      } else {
        await salaryHikeService.create(hikeData);
      }

      setShowAddPastHike(false);
      setEditingHike(null);
      setPastHikeForm({ date: '', oldSalary: 0, newSalary: 0, reason: '', breakdown: {} });

      if (onRefresh) {
        await onRefresh();
      } else {
        window.location.reload();
      }
    } catch (error) {
      console.error('Error saving hike:', error);
      alert('Failed to save record');
    }
  };

  return (
    <div className="space-y-4">
      {/* Current Salary Summary */}
      <div className="bg-[#f0fdf4] p-4 rounded-lg border border-green-200">
        <h4 className="font-semibold mb-3 flex items-center gap-2 text-force-dark">
          <DollarSign className="text-green-600" size={16} />
          Current Salary Status - {staffName}
        </h4>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          {latestHike && (
            <>
              <div>
                <span className="font-medium text-force-medium">Salary Hiked Month:</span>
                <div className="font-semibold text-force-dark">
                  {new Date(latestHike.hikeDate).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short'
                  })}
                </div>
              </div>
              <div>
                <span className="font-medium text-force-medium">Last Salary:</span>
                <div className="font-semibold text-force-dark">₹{latestHike.oldSalary.toLocaleString()}</div>
              </div>
            </>
          )}
          <div>
            <span className="font-medium text-force-medium">Current Salary:</span>
            <div className="font-semibold text-green-600">₹{currentSalary.toLocaleString()}</div>
          </div>
          {latestHike && (
            <div>
              <span className="font-medium text-force-medium">Months Since Hike:</span>
              <div className="font-semibold text-blue-600">{getMonthsSinceHike(latestHike.hikeDate)}</div>
            </div>
          )}
          <div>
            <span className="font-medium block mb-1 text-force-medium" title="Salary before 01-10-2024">Previous (pre-Oct '24):</span>
            <div className="font-semibold text-force-medium">
              {previousSalaryData.previousSalary ? (
                <span title={`Changed on ${new Date(previousSalaryData.changeDate!).toLocaleDateString()}`} className="text-force-medium">
                  ₹{previousSalaryData.previousSalary.toLocaleString()}
                  <span className="text-xs ml-1 text-gray-500">
                    ({new Date(previousSalaryData.changeDate!).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })})
                  </span>
                </span>
              ) : (
                <span className="text-gray-400">—</span>
              )}
            </div>
          </div>
        </div>

        {latestHike && (
          <div className="mt-3 pt-3 border-t border-green-200">
            <span className="font-medium text-force-medium">Difference:</span>
            <span className="ml-2 font-semibold text-green-600">
              +₹{(currentSalary - latestHike.oldSalary).toLocaleString()}
            </span>
          </div>
        )}
      </div>

      {/* Hike History */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
          <div className="flex items-center justify-between w-full">
            <h4 className="font-semibold text-gray-800 flex items-center gap-2">
              <TrendingUp className="text-blue-600" size={16} />
              Salary Hike History
            </h4>
            <button
              onClick={initializeForm}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50"
            >
              + Add Past Hike
            </button>
          </div>
        </div>

        {showAddPastHike && (
          <div className="p-4 bg-blue-50 border-b border-blue-100">
            <h5 className="text-sm font-semibold text-gray-800 mb-3">{editingHike ? 'Edit Salary Hike Record' : 'Record Previous Salary Hike'}</h5>
            <form onSubmit={handleAddPastHike} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Date of Hike</label>
                  <input
                    type="date"
                    required
                    max={new Date().toISOString().split('T')[0]}
                    value={pastHikeForm.date}
                    onChange={e => setPastHikeForm({ ...pastHikeForm, date: e.target.value })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Reason / Notes</label>
                  <input
                    type="text"
                    value={pastHikeForm.reason}
                    onChange={e => setPastHikeForm({ ...pastHikeForm, reason: e.target.value })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                    placeholder="e.g. Annual Increment 2024"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Previous TOTAL Salary (Before Hike)</label>
                  <input
                    type="number"
                    required
                    value={pastHikeForm.oldSalary}
                    onChange={e => setPastHikeForm({ ...pastHikeForm, oldSalary: Number(e.target.value) })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                    placeholder="e.g. 10000"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-blue-800 mb-1 uppercase tracking-tighter">New TOTAL Salary (Calculated)</label>
                  <div className="w-full px-3 py-2 text-lg border-2 border-blue-200 bg-blue-50 rounded-lg font-bold text-blue-900 shadow-inner flex items-center justify-between">
                    <span className="text-blue-400">₹</span>
                    <span>{pastHikeForm.newSalary.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Component Editing */}
              <div className="bg-white p-3 rounded-lg border border-blue-200 shadow-sm">
                <h6 className="text-xs font-bold text-blue-900 mb-3 uppercase tracking-wider">New Component Breakdown (After Hike):</h6>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {settingsService.getSalaryCategories().map(category => (
                    <div key={category.id} className="space-y-1">
                      <label className="block text-[10px] uppercase font-bold text-gray-500">{category.name}</label>
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₹</span>
                        <input
                          type="number"
                          value={pastHikeForm.breakdown[category.id] || 0}
                          onChange={e => handleBreakdownChange(category.id, Number(e.target.value))}
                          className="w-full pl-5 pr-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  ))}
                  {/* Meal Allowance is a special field not in categories sometimes, but handled by settingsService now? 
                      Wait, line 351 in original had it hardcoded. Let's ensure it's here. */}
                  {!settingsService.getSalaryCategories().find(c => c.id === 'meal_allowance') && (
                    <div className="space-y-1">
                      <label className="block text-[10px] uppercase font-bold text-gray-500">Meal Allowance</label>
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₹</span>
                        <input
                          type="number"
                          value={pastHikeForm.breakdown['meal_allowance'] || 0}
                          onChange={e => handleBreakdownChange('meal_allowance', Number(e.target.value))}
                          className="w-full pl-5 pr-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Hike Summary */}
              {pastHikeForm.newSalary > pastHikeForm.oldSalary && pastHikeForm.oldSalary > 0 && (
                <div className="bg-green-50 p-2 rounded border border-green-100 text-xs text-green-800 flex items-center gap-2">
                  <TrendingUp size={14} />
                  <span>
                    Hike Amount: <strong>₹{(pastHikeForm.newSalary - pastHikeForm.oldSalary).toLocaleString()}</strong>
                    {' '}({Math.round(((pastHikeForm.newSalary - pastHikeForm.oldSalary) / pastHikeForm.oldSalary) * 100)}% increase)
                  </span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowAddPastHike(false); setEditingHike(null); }}
                  className="px-3 py-1 text-xs text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium rounded hover:bg-blue-700"
                  style={{ backgroundColor: '#2563eb', color: '#ffffff' }}
                >
                  {editingHike ? 'Update Record' : 'Save Record'}
                </button>
              </div>
            </form>
          </div>
        )}

        {salaryHikes.length === 0 ? (
          <div className="p-8 text-center text-gray-500 bg-gray-50">
            <p>No salary hikes recorded yet.</p>
            <p className="text-xs mt-1">Use the "+ Add Past Hike" button to add historical data.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {salaryHikes.map((hike, index) => (
              <div key={hike.id} className="p-4 hover:bg-gray-50 group border-l-4 border-transparent hover:border-blue-500 transition-all">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Calendar className="text-gray-400" size={14} />
                    <span className="text-sm font-medium text-gray-800">
                      {new Date(hike.hikeDate).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </span>
                    {index === 0 && (
                      <span className="px-2 py-1 bg-green-100 text-green-800 text-[10px] rounded-full font-bold">
                        LATEST
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 w-full sm:w-auto">
                    <div className="text-right">
                      <div className="text-[10px] text-gray-500 mb-0.5">
                        ₹{hike.oldSalary.toLocaleString()} → ₹{hike.newSalary.toLocaleString()}
                      </div>
                      <div className="text-sm sm:text-base font-bold text-green-600 flex items-center justify-end gap-1">
                        <TrendingUp size={14} className="sm:w-4 sm:h-4" />
                        ₹{(hike.newSalary - hike.oldSalary).toLocaleString()}
                      </div>
                    </div>
                    {/* Edit/Delete Actions */}
                    <div className="flex items-center gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity bg-white/50 backdrop-blur-sm rounded-lg p-0.5 border border-gray-100">
                      <button
                        onClick={() => handleEditHike(hike)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                        title="Edit Record"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
                      </button>
                      <button
                        onClick={() => handleDeleteHike(hike.id)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                        title="Delete Record"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" /></svg>
                      </button>
                    </div>
                  </div>
                </div>

                {staff && (
                  <div className="mt-3 bg-gray-50/50 p-4 rounded-xl border border-gray-100">
                    <h5 className="text-[10px] font-black text-gray-400 mb-3 uppercase tracking-widest">Component Breakdown After Hike:</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {/* Standard and Dynamic Categories combined */}
                      {(() => {
                        const categories = settingsService.getSalaryCategories();
                        const displayedIds = new Set(categories.map(c => c.id));

                        // Ensure meal_allowance is always considered
                        if (!displayedIds.has('meal_allowance')) {
                          categories.push({ id: 'meal_allowance', name: 'Meal Allowance', key: 'meal_allowance' });
                        }

                        return categories.map(category => {
                          const getFromBreakdown = (data: Record<string, number> | undefined, ...keys: string[]): number | undefined => {
                            if (!data) return undefined;
                            for (const key of keys) {
                              const value = data[key];
                              if (typeof value === 'number') return value;
                            }
                            return undefined;
                          };

                          let newValue = getFromBreakdown(hike.breakdown, category.id, category.key) ?? 0;
                          let oldValue = getFromBreakdown(hike.breakdown, `old_${category.id}`, `old_${category.key}`) ?? 0;

                          // If latest hike has missing new breakdown, derive from current staff values
                          if (index === 0 && newValue === 0 && staff) {
                            if (category.id === 'basic') newValue = staff.basicSalary;
                            else if (category.id === 'incentive') newValue = staff.incentive;
                            else if (category.id === 'hra') newValue = staff.hra;
                            else if (category.id === 'meal_allowance') newValue = staff.mealAllowance || 0;
                            else newValue = staff.salarySupplements?.[category.id] || staff.salarySupplements?.[category.key] || 0;
                          }

                          // If old breakdown missing, use previous hike's new breakdown as source of truth
                          if (oldValue === 0 && salaryHikes[index + 1]) {
                            const previousHike = salaryHikes[index + 1];
                            oldValue = getFromBreakdown(previousHike.breakdown, category.id, category.key) ?? oldValue;
                          }

                          const hasData = newValue > 0 || oldValue > 0;

                          if (!hasData) return null;

                          const diff = newValue - oldValue;

                          return (
                            <div key={category.id} className="bg-white p-2 rounded border border-gray-200 flex flex-col gap-1 shadow-sm">
                              <div className="flex justify-between items-center border-b border-gray-50 pb-1">
                                <span className="text-gray-500 font-bold uppercase text-[9px] tracking-wider">{category.name}</span>
                                {diff !== 0 && (
                                  <span className={`font-bold px-1 rounded text-[10px] ${diff > 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
                                    {diff > 0 ? '+' : ''}₹{diff.toLocaleString()}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center justify-between mt-0.5">
                                <span className="text-gray-400 text-[10px]">₹{oldValue.toLocaleString()}</span>
                                <span className="text-gray-400 text-[10px]">→</span>
                                <span className="font-bold text-gray-900 text-sm">₹{newValue.toLocaleString()}</span>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                )}

                {hike.reason && (
                  <div className="mt-2 text-xs text-gray-500 bg-white/50 p-2 rounded border border-dashed border-gray-200">
                    <strong className="text-gray-400 uppercase text-[10px]">Notes:</strong> {hike.reason}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SalaryHikeHistory;