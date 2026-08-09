import React, { useState } from 'react';
import { X, CheckSquare, MapPin, Briefcase, MessageSquare, Download, Trash2, ChevronUp } from 'lucide-react';
import { Staff } from '../types';
import { Branch } from '../services/locationService';
import { Designation } from '../services/designationService';

interface StaffBulkActionBarProps {
  selectedStaff: Staff[];
  locations: Branch[];
  designations: Designation[];
  onClearSelection: () => void;
  onBatchUpdateBranch: (branchName: string) => Promise<void>;
  onBatchUpdateDesignation: (designationName: string) => Promise<void>;
  onBatchDelete: (reason: string) => Promise<void>;
  onExportSelected: () => void;
}

export const StaffBulkActionBar: React.FC<StaffBulkActionBarProps> = ({
  selectedStaff,
  locations,
  designations,
  onClearSelection,
  onBatchUpdateBranch,
  onBatchUpdateDesignation,
  onBatchDelete,
  onExportSelected
}) => {
  const [showLocationSelect, setShowLocationSelect] = useState(false);
  const [showDesignationSelect, setShowDesignationSelect] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  if (selectedStaff.length === 0) return null;

  const handleBranchChange = async (branchName: string) => {
    setIsProcessing(true);
    setShowLocationSelect(false);
    await onBatchUpdateBranch(branchName);
    setIsProcessing(false);
  };

  const handleDesignationChange = async (desigName: string) => {
    setIsProcessing(true);
    setShowDesignationSelect(false);
    await onBatchUpdateDesignation(desigName);
    setIsProcessing(false);
  };

  const handleBatchDeleteClick = async () => {
    const reason = prompt(`Enter reason for archiving ${selectedStaff.length} selected staff member(s):`);
    if (!reason || !reason.trim()) return;
    setIsProcessing(true);
    await onBatchDelete(reason.trim());
    setIsProcessing(false);
  };

  const handleWhatsAppBroadcast = () => {
    const phoneNumbers = selectedStaff
      .map(s => s.contactNumber ? s.contactNumber.replace(/[^0-9]/g, '') : '')
      .filter(p => p.length === 10);

    if (phoneNumbers.length === 0) {
      alert('None of the selected staff members have a valid 10-digit mobile number.');
      return;
    }

    const text = encodeURIComponent(`Hello team, broadcast message for selected staff members.`);
    window.open(`https://web.whatsapp.com/send?phone=${phoneNumbers[0]}&text=${text}`, '_blank');
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-3xl px-4 animate-in fade-in slide-in-from-bottom-5 duration-200">
      <div className="p-3 rounded-2xl bg-slate-900/95 border border-purple-500/30 backdrop-blur-xl shadow-2xl flex items-center justify-between gap-3 text-xs flex-wrap sm:flex-nowrap">
        {/* Selection Count Badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30 font-semibold whitespace-nowrap">
          <CheckSquare size={16} />
          <span>{selectedStaff.length} Selected</span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-center flex-1">
          {/* Branch Dropdown */}
          <div className="relative">
            <button
              onClick={() => { setShowLocationSelect(!showLocationSelect); setShowDesignationSelect(false); }}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap"
              disabled={isProcessing}
            >
              <MapPin size={14} /> Branch <ChevronUp size={12} />
            </button>

            {showLocationSelect && (
              <div className="absolute bottom-full mb-2 left-0 w-44 rounded-xl bg-slate-900 border border-white/10 shadow-xl overflow-hidden py-1 z-50">
                <span className="block px-3 py-1 text-[10px] uppercase font-bold text-white/40">Select Branch</span>
                {locations.map(loc => (
                  <button
                    key={loc.id}
                    onClick={() => handleBranchChange(loc.name)}
                    className="w-full text-left px-3 py-1.5 text-xs text-white hover:bg-purple-500/20 hover:text-purple-300 transition-colors"
                  >
                    {loc.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Designation Dropdown */}
          <div className="relative">
            <button
              onClick={() => { setShowDesignationSelect(!showDesignationSelect); setShowLocationSelect(false); }}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap"
              disabled={isProcessing}
            >
              <Briefcase size={14} /> Designation <ChevronUp size={12} />
            </button>

            {showDesignationSelect && (
              <div className="absolute bottom-full mb-2 left-0 w-48 rounded-xl bg-slate-900 border border-white/10 shadow-xl overflow-hidden py-1 z-50">
                <span className="block px-3 py-1 text-[10px] uppercase font-bold text-white/40">Select Designation</span>
                {designations.map(desig => (
                  <button
                    key={desig.id}
                    onClick={() => handleDesignationChange(desig.name)}
                    className="w-full text-left px-3 py-1.5 text-xs text-white hover:bg-purple-500/20 hover:text-purple-300 transition-colors"
                  >
                    {desig.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* WhatsApp Broadcast */}
          <button
            onClick={handleWhatsAppBroadcast}
            className="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap"
            title="Broadcast WhatsApp message to selected staff"
          >
            <MessageSquare size={14} /> WhatsApp
          </button>

          {/* Export Selected */}
          <button
            onClick={onExportSelected}
            className="px-3 py-1.5 rounded-xl bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 border border-indigo-500/30 font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <Download size={14} /> Export
          </button>

          {/* Batch Delete */}
          <button
            onClick={handleBatchDeleteClick}
            className="px-3 py-1.5 rounded-xl bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/30 font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap"
            disabled={isProcessing}
          >
            <Trash2 size={14} /> Archive
          </button>
        </div>

        {/* Clear Selection */}
        <button
          onClick={onClearSelection}
          className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
          title="Clear Selection"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
};
