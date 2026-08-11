import React, { useState } from 'react';
import { X, Edit2, Calendar, Phone, CreditCard, Shield, TrendingUp, Layers, DollarSign } from 'lucide-react';
import { Staff, PayrollHike, CustomFieldDefinition } from '../types';
import { calculateExperience } from '../utils/salaryCalculations';

interface StaffProfileDrawerProps {
  staff: Staff | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (staff: Staff) => void;
  salaryHikes: PayrollHike[];
  customFields: CustomFieldDefinition[];
  getLocationColor: (loc: string) => string;
  calculateMemberTotalPayroll: (staff: Staff) => number;
}

export const StaffProfileDrawer: React.FC<StaffProfileDrawerProps> = ({
  staff,
  isOpen,
  onClose,
  onEdit,
  salaryHikes,
  customFields,
  getLocationColor,
  calculateMemberTotalPayroll
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'payroll' | 'history' | 'custom'>('overview');

  if (!isOpen || !staff) return null;

  const totalPayroll = calculateMemberTotalPayroll(staff);
  const hikes = salaryHikes
    .filter(h => h.staffId === staff.id)
    .sort((a, b) => new Date(b.hikeDate).getTime() - new Date(a.hikeDate).getTime());

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm flex justify-end" onClick={onClose}>
      <div
        className="w-full max-w-2xl bg-[var(--bg-card)] border-l border-[var(--glass-border)] shadow-2xl flex flex-col h-full transform transition-transform duration-300 ease-out"
        onClick={e => e.stopPropagation()}
      >
        {/* Top Banner & Header */}
        <div className="p-6 bg-gradient-to-r from-indigo-950/60 via-slate-900 to-indigo-950/60 border-b border-[var(--glass-border)] relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 !text-white flex items-center justify-center transition-colors"
          >
            <X size={18} />
          </button>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="relative">
              {staff.photo ? (
                <img
                  src={staff.photo}
                  alt={staff.name}
                  className="w-20 h-20 rounded-2xl object-cover border-2 border-white/20 shadow-xl"
                />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-2xl font-bold !text-white shadow-xl">
                  {staff.name.charAt(0)}
                </div>
              )}
              <span className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-900 ${staff.isActive ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            </div>

            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold !text-white">{staff.name}</h2>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${getLocationColor(staff.location)}`}>
                  {staff.location}
                </span>
                {staff.employeeCode && (
                  <span className="px-2 py-0.5 rounded text-xs font-mono bg-white/10 text-indigo-300 border border-white/10">
                    {staff.employeeCode}
                  </span>
                )}
              </div>
              <p className="text-xs text-white/70 flex items-center gap-2">
                <span>{staff.designation || 'Staff Member'}</span>
                <span>•</span>
                <span className="capitalize">{staff.type}</span>
                {staff.floor && (
                  <>
                    <span>•</span>
                    <span>Zone: {staff.floor}</span>
                  </>
                )}
              </p>
            </div>

            <button
              onClick={() => { onClose(); onEdit(staff); }}
              className="btn-premium px-3.5 py-2 text-xs flex items-center gap-1.5 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 !text-white rounded-xl font-medium shadow-md transition-all self-start sm:self-auto"
            >
              <Edit2 size={14} /> Edit Profile
            </button>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-3 gap-2 mt-6 pt-4 border-t border-white/10">
            <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 text-center">
              <span className="text-[10px] text-white/70 block uppercase font-semibold">Monthly Package</span>
              <span className="text-sm font-bold text-emerald-400">₹{totalPayroll.toLocaleString()}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 text-center">
              <span className="text-[10px] text-white/70 block uppercase font-semibold">Experience</span>
              <span className="text-sm font-bold text-indigo-300">{calculateExperience(staff.joinedDate)}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 text-center">
              <span className="text-[10px] text-white/70 block uppercase font-semibold">Salary Reviews</span>
              <span className="text-sm font-bold text-purple-300">{hikes.length} Hikes</span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-[var(--glass-border)] bg-white/5 px-6">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 px-4 text-xs font-semibold transition-colors border-b-2 ${
              activeTab === 'overview'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            Overview & Details
          </button>
          <button
            onClick={() => setActiveTab('payroll')}
            className={`py-3 px-4 text-xs font-semibold transition-colors border-b-2 ${
              activeTab === 'payroll'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            Payroll & Banking
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`py-3 px-4 text-xs font-semibold transition-colors border-b-2 ${
              activeTab === 'history'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            Salary Timeline ({hikes.length})
          </button>
          <button
            onClick={() => setActiveTab('custom')}
            className={`py-3 px-4 text-xs font-semibold transition-colors border-b-2 ${
              activeTab === 'custom'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            Custom Attributes
          </button>
        </div>

        {/* Tab Content Area */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Contact Information */}
              <div className="p-4 rounded-2xl bg-white/5 border border-[var(--glass-border)] space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-2">
                  <Phone size={14} /> Contact & Personal Details
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-[var(--text-muted)] block">Mobile Number</span>
                    <span className="text-[var(--text-primary)] font-medium">{staff.contactNumber || 'Not Provided'}</span>
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)] block">Joined Date</span>
                    <span className="text-[var(--text-primary)] font-medium">{staff.joinedDate ? new Date(staff.joinedDate).toLocaleDateString() : 'N/A'}</span>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-[var(--text-muted)] block">Address</span>
                    <span className="text-[var(--text-primary)] font-medium">{staff.address || 'Not Provided'}</span>
                  </div>
                </div>
              </div>

              {/* Work & Device Configuration */}
              <div className="p-4 rounded-2xl bg-white/5 border border-[var(--glass-border)] space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-2">
                  <Shield size={14} /> Work & Security Config
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-[var(--text-muted)] block">Biometric Device ID</span>
                    <span className="text-[var(--text-primary)] font-mono">{staff.deviceId || 'Not Paired'}</span>
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)] block">Payment Mode</span>
                    <span className="text-[var(--text-primary)] font-medium capitalize">{staff.paymentMode || 'Cash'}</span>
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)] block">Accommodation Status</span>
                    <span className="text-[var(--text-primary)] font-medium capitalize">{staff.staffAccommodation || 'Day Scholar'}</span>
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)] block">Late Penalty Exemption</span>
                    <span className={`font-semibold ${staff.exemptFromLateDeduction ? 'text-emerald-400' : 'text-[var(--text-primary)]'}`}>
                      {staff.exemptFromLateDeduction ? 'Exempted' : 'Standard'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PAYROLL & BANKING */}
          {activeTab === 'payroll' && (
            <div className="space-y-6">
              {/* Salary Breakdown Card */}
              <div className="p-4 rounded-2xl bg-white/5 border border-[var(--glass-border)] space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                    <DollarSign size={14} /> Salary Breakdown
                  </h3>
                  <span className="text-sm font-bold text-emerald-400">Total: ₹{totalPayroll.toLocaleString()}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-2.5 rounded-xl bg-white/5">
                    <span className="text-[var(--text-muted)] text-[10px] block">Basic</span>
                    <span className="text-[var(--text-primary)] font-semibold">₹{(staff.basicPayroll || staff.basicSalary || 0).toLocaleString()}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/5">
                    <span className="text-[var(--text-muted)] text-[10px] block">Incentive</span>
                    <span className="text-[var(--text-primary)] font-semibold">₹{(staff.incentive || 0).toLocaleString()}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/5">
                    <span className="text-[var(--text-muted)] text-[10px] block">HRA</span>
                    <span className="text-[var(--text-primary)] font-semibold">₹{(staff.hra || 0).toLocaleString()}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/5">
                    <span className="text-[var(--text-muted)] text-[10px] block">Meal Allowance</span>
                    <span className="text-[var(--text-primary)] font-semibold">₹{(staff.mealAllowance || 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Bank & Statutory Details */}
              <div className="p-4 rounded-2xl bg-white/5 border border-[var(--glass-border)] space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-2">
                  <CreditCard size={14} /> Banking & Statutory
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-[var(--text-muted)] block">Bank Name</span>
                    <span className="text-[var(--text-primary)] font-medium">{staff.bankName || 'Not Set'}</span>
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)] block">Account Number</span>
                    <span className="text-[var(--text-primary)] font-mono">{staff.bankAccountNumber || 'Not Set'}</span>
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)] block">IFSC Code</span>
                    <span className="text-[var(--text-primary)] font-mono">{staff.ifscCode || 'Not Set'}</span>
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)] block">PF / ESI Coverage</span>
                    <span className={`font-semibold ${staff.isStatutory ? 'text-emerald-400' : 'text-[var(--text-muted)]'}`}>
                      {staff.isStatutory ? 'Covered' : 'Not Covered'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: TIMELINE & HISTORY */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-2">
                <TrendingUp size={14} /> Salary Review Timeline
              </h3>
              {hikes.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-[var(--glass-border)] rounded-2xl">
                  <p className="text-xs text-[var(--text-muted)]">No salary hike records found for this employee.</p>
                </div>
              ) : (
                <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-white/10">
                  {hikes.map((hike, idx) => (
                    <div key={hike.id || idx} className="relative">
                      <div className="absolute -left-6 top-1.5 w-3 h-3 rounded-full bg-purple-500 ring-4 ring-slate-900" />
                      <div className="p-3.5 rounded-xl bg-white/5 border border-[var(--glass-border)] text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-emerald-400">₹{(hike.newSalary || hike.newPayroll || 0).toLocaleString()}</span>
                          <span className="text-[10px] text-[var(--text-muted)]">{new Date(hike.hikeDate).toLocaleDateString()}</span>
                        </div>
                        <p className="text-[var(--text-primary)]">Previous: ₹{(hike.oldSalary || hike.oldPayroll || 0).toLocaleString()}</p>
                        {hike.reason && <p className="text-[11px] text-indigo-400 italic">{hike.reason}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: CUSTOM ATTRIBUTES */}
          {activeTab === 'custom' && (
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
                <Layers size={14} /> Custom Profile Attributes
              </h3>
              {customFields.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-[var(--glass-border)] rounded-2xl">
                  <p className="text-xs text-[var(--text-muted)]">No custom fields defined in system settings.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {customFields.map(field => {
                    const value = staff.customFields?.[field.key];
                    return (
                      <div key={field.id} className="p-3 rounded-xl bg-white/5 border border-[var(--glass-border)] space-y-0.5">
                        <span className="text-[var(--text-muted)] text-[10px] block uppercase font-semibold">{field.label}</span>
                        <span className="text-[var(--text-primary)] font-medium">{value ? String(value) : 'Not Provided'}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
