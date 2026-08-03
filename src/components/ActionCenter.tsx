import React, { useState, useEffect } from 'react';
import { AlertTriangle, Check, X, MessageSquare, Clock, Filter } from 'lucide-react';
import { grievanceService, StaffGrievance } from '../services/grievanceService';
import { customAlert } from './CustomDialog';
import { User } from '../types';

interface ActionCenterProps {
  user?: User | null;
}

export default function ActionCenter({ user }: ActionCenterProps) {
  const [grievances, setGrievances] = useState<StaffGrievance[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGrievance, setSelectedGrievance] = useState<StaffGrievance | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [processing, setProcessing] = useState(false);

  const fetchGrievances = async () => {
    setLoading(true);
    // If manager, only get location specific. If admin, get all.
    const loc = user?.role === 'manager' || user?.role === 'floor_supervisor' ? user.location : 'all';
    const data = await grievanceService.getAllActive(loc);
    
    // Further filter by approval level if needed based on roles, 
    // for simplicity, we show them, but manager might only resolve L1, admin L2 etc.
    setGrievances(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchGrievances();
  }, [user]);

  const handleAction = async (action: 'resolved' | 'rejected') => {
    if (!selectedGrievance) return;
    
    setProcessing(true);
    const ok = await grievanceService.updateStatus(
      selectedGrievance.id,
      action,
      resolutionNotes,
      user?.name || user?.email || 'Admin',
      user?.role || 'admin',
      selectedGrievance
    );
    setProcessing(false);

    if (ok) {
      customAlert(`Issue marked as ${action}`);
      setSelectedGrievance(null);
      setResolutionNotes('');
      fetchGrievances();
    } else {
      customAlert('Failed to update issue status');
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto pb-24 h-full flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <AlertTriangle className="text-orange-500" size={32} />
            Action Center
          </h1>
          <p className="text-gray-500 mt-1">Review and resolve staff issues and discrepancies</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
        {/* List of grievances */}
        <div className="lg:col-span-1 flex flex-col gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex-1">
            <div className="p-4 border-b border-gray-200 bg-gray-50 font-semibold text-gray-700 flex justify-between">
              <span>Active Issues</span>
              <span className="bg-orange-100 text-orange-700 py-0.5 px-2 rounded-full text-xs">{grievances.length}</span>
            </div>
            <div className="overflow-y-auto h-[600px] p-2 space-y-2">
              {loading ? (
                <div className="p-4 text-center text-gray-400">Loading...</div>
              ) : grievances.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                  <Check size={32} className="mx-auto mb-2 text-emerald-400 opacity-50" />
                  All caught up! No active issues.
                </div>
              ) : (
                grievances.map(g => (
                  <button
                    key={g.id}
                    onClick={() => setSelectedGrievance(g)}
                    className={`w-full text-left p-3 rounded-lg border transition-all ${
                      selectedGrievance?.id === g.id
                        ? 'bg-orange-50 border-orange-300 ring-1 ring-orange-400'
                        : 'bg-white border-gray-200 hover:border-orange-300 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-semibold text-gray-900 truncate pr-2">{g.staffName}</span>
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded capitalize whitespace-nowrap">{g.type}</span>
                    </div>
                    <p className="text-xs text-gray-500 line-clamp-2 mb-2">{g.description}</p>
                    <div className="flex justify-between items-center text-xs text-gray-400">
                      <span>{new Date(g.createdAt).toLocaleDateString()}</span>
                      <span className="text-orange-600 font-medium">{g.status === 'escalated' ? 'Escalated' : 'Pending'}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Detail View */}
        <div className="lg:col-span-2">
          {selectedGrievance ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex justify-between items-start mb-6 pb-6 border-b border-gray-100">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-1">{selectedGrievance.staffName}</h2>
                  <p className="text-sm text-gray-500 flex items-center gap-2">
                    <span className="capitalize bg-gray-100 px-2 py-0.5 rounded text-gray-700 font-medium">{selectedGrievance.type} Issue</span>
                    {selectedGrievance.location && <span>• {selectedGrievance.location}</span>}
                    <span>• Reported: {new Date(selectedGrievance.createdAt).toLocaleString()}</span>
                  </p>
                </div>
                <div className="text-right">
                  <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-sm font-semibold inline-flex items-center gap-1.5">
                    <Clock size={16} /> L{selectedGrievance.currentApprovalLevel} {selectedGrievance.status}
                  </span>
                </div>
              </div>

              <div className="mb-8">
                <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2 uppercase tracking-wider">
                  <MessageSquare size={16} className="text-gray-400" /> Issue Description
                </h3>
                <div className="bg-gray-50 p-4 rounded-xl text-gray-700 border border-gray-100 text-sm leading-relaxed whitespace-pre-wrap">
                  {selectedGrievance.description}
                </div>
                {selectedGrievance.targetDate && (
                  <p className="text-sm mt-3 text-gray-600 font-medium">
                    <span className="text-gray-400 mr-2">Target Date:</span> {selectedGrievance.targetDate}
                  </p>
                )}
              </div>

              {selectedGrievance.approvalHistory && selectedGrievance.approvalHistory.length > 0 && (
                <div className="mb-8">
                  <h3 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wider">History & Comments</h3>
                  <div className="space-y-3">
                    {selectedGrievance.approvalHistory.map((h, i) => (
                      <div key={i} className="flex gap-3 text-sm">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold flex-shrink-0">
                          {h.user.charAt(0).toUpperCase()}
                        </div>
                        <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 flex-1">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-semibold text-gray-900">{h.user} <span className="text-gray-400 text-xs font-normal">({h.role})</span></span>
                            <span className="text-xs text-gray-500">{new Date(h.date).toLocaleString()}</span>
                          </div>
                          <div className="text-gray-700">Marked as <span className="font-semibold capitalize">{h.action}</span></div>
                          {h.comment && <div className="mt-2 text-gray-600 italic">"{h.comment}"</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-blue-50 border border-blue-100 p-5 rounded-xl">
                <h3 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wider">Take Action</h3>
                <textarea
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="Enter resolution notes, explanations, or questions... (Sent to staff)"
                  className="w-full p-3 border border-blue-200 rounded-lg bg-white mb-4 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                  rows={3}
                ></textarea>
                
                <div className="flex gap-3">
                  <button
                    onClick={() => handleAction('rejected')}
                    disabled={processing || !resolutionNotes.trim()}
                    className="flex-1 py-2.5 px-4 rounded-lg font-semibold border-2 border-red-200 text-red-600 bg-white hover:bg-red-50 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <X size={18} /> Reject / Invalid
                  </button>
                  <button
                    onClick={() => handleAction('resolved')}
                    disabled={processing}
                    className="flex-1 py-2.5 px-4 rounded-lg font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Check size={18} /> 
                    {selectedGrievance.currentApprovalLevel < selectedGrievance.requiredApprovalLevels ? 'Approve & Escalate' : 'Resolve Issue'}
                  </button>
                </div>
                {(!resolutionNotes.trim()) && (
                  <p className="text-xs text-center text-red-500 mt-2">* Resolution notes are required when rejecting</p>
                )}
              </div>

            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 border-dashed rounded-xl h-full min-h-[400px] flex items-center justify-center text-gray-400">
              Select an issue from the list to review and take action
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
