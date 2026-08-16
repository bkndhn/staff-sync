import React, { useState, useEffect } from 'react';
import { AlertTriangle, Check, X, MessageSquare, Clock, Filter, UserCog, CalendarClock, FileText } from 'lucide-react';
import { grievanceService, StaffGrievance } from '../services/grievanceService';
import { customAlert } from './CustomDialog';
import { User } from '../types';
import { dataApi } from '../lib/dataApi';

interface ActionCenterProps {
  user?: User | null;
}

type TabType = 'grievances' | 'profiles' | 'attendance' | 'letters';

export default function ActionCenter({ user }: ActionCenterProps) {
  const [activeTab, setActiveTab] = useState<TabType>('grievances');
  const [grievances, setGrievances] = useState<StaffGrievance[]>([]);
  const [profileRequests, setProfileRequests] = useState<any[]>([]);
  const [attendanceRegs, setAttendanceRegs] = useState<any[]>([]);
  const [letterRequests, setLetterRequests] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [processing, setProcessing] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    // If manager, only get location specific. If admin, get all.
    const loc = user?.role === 'manager' || user?.role === 'floor_supervisor' ? user.location : 'all';
    
    try {
      const gData = await grievanceService.getAllActive(loc);
      setGrievances(gData);

      const { data: pData } = await dataApi.from('profile_change_requests')
        .select('*, staff:staff_id(name)')
        .eq('status', 'pending');
      setProfileRequests(pData || []);

      const { data: aData } = await dataApi.from('attendance_regularizations')
        .select('*, staff:staff_id(name)')
        .eq('status', 'pending');
      setAttendanceRegs(aData || []);

      const { data: lData } = await dataApi.from('letter_requests')
        .select('*, staff:staff_id(name)')
        .eq('status', 'pending');
      setLetterRequests(lData || []);
    } catch (e) {
      console.error("Error fetching action center data", e);
    }
    
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, [user]);

  // Reset selection on tab change
  useEffect(() => {
    setSelectedItem(null);
    setResolutionNotes('');
  }, [activeTab]);

  const handleGrievanceAction = async (action: 'resolved' | 'rejected') => {
    if (!selectedItem) return;
    setProcessing(true);
    const ok = await grievanceService.updateStatus(
      selectedItem.id,
      action,
      resolutionNotes,
      (user as any)?.name || user?.email || 'Admin',
      user?.role || 'admin',
      selectedItem
    );
    setProcessing(false);

    if (ok) {
      customAlert(`Issue marked as ${action}`);
      setSelectedItem(null);
      setResolutionNotes('');
      fetchAll();
    } else {
      customAlert('Failed to update issue status');
    }
  };

  const handleProfileAction = async (action: 'approved' | 'rejected') => {
    if (!selectedItem) return;
    setProcessing(true);
    
    if (action === 'approved') {
      const { error: err1 } = await dataApi.from('profile_change_requests').update({
        status: 'approved',
        reviewed_by: user?.email || 'Admin',
        reviewed_at: new Date().toISOString()
      }).eq('id', selectedItem.id);
      
      const changes = selectedItem.requested_changes || {};
      const { error: err2 } = await dataApi.from('staff').update(changes).eq('id', selectedItem.staff_id);
      
      const { error: err3 } = await dataApi.from('staff_notifications').insert({
        staff_id: selectedItem.staff_id,
        title: 'Profile Update Approved',
        message: 'Your profile change request has been approved.',
        type: 'profile_approved'
      });
      
      if (!err1 && !err2 && !err3) {
        customAlert('Profile change approved and applied.');
      } else {
        customAlert('Error approving profile change.');
      }
    } else {
      const { error } = await dataApi.from('profile_change_requests').update({
        status: 'rejected',
        rejection_reason: resolutionNotes,
        reviewed_by: user?.email || 'Admin',
        reviewed_at: new Date().toISOString()
      }).eq('id', selectedItem.id);
      
      if (!error) customAlert('Profile change rejected.');
      else customAlert('Error rejecting profile change.');
    }
    
    setProcessing(false);
    setSelectedItem(null);
    setResolutionNotes('');
    fetchAll();
  };

  const handleAttendanceAction = async (action: 'approved' | 'rejected') => {
    if (!selectedItem) return;
    setProcessing(true);
    
    if (action === 'approved') {
      const { error: err1 } = await dataApi.from('attendance_regularizations').update({
        status: 'approved'
      }).eq('id', selectedItem.id);
      
      const { error: err2 } = await dataApi.from('attendance').update({
        status: selectedItem.requested_status
      }).eq('staff_id', selectedItem.staff_id).eq('date', selectedItem.target_date);
      
      const { error: err3 } = await dataApi.from('staff_notifications').insert({
        staff_id: selectedItem.staff_id,
        title: 'Attendance Regularization Approved',
        message: `Your request for ${selectedItem.target_date} has been approved.`,
        type: 'regularization_approved'
      });
      
      if (!err1 && !err2) customAlert('Attendance request approved.');
      else customAlert('Error approving attendance request.');
    } else {
      const { error } = await dataApi.from('attendance_regularizations').update({
        status: 'rejected',
        notes: resolutionNotes
      }).eq('id', selectedItem.id);
      
      if (!error) customAlert('Attendance request rejected.');
      else customAlert('Error rejecting attendance request.');
    }
    
    setProcessing(false);
    setSelectedItem(null);
    setResolutionNotes('');
    fetchAll();
  };

  const handleLetterAction = async (action: 'generated' | 'rejected') => {
    if (!selectedItem) return;
    setProcessing(true);
    
    if (action === 'generated') {
      const { error: err1 } = await dataApi.from('letter_requests').update({
        status: 'generated'
      }).eq('id', selectedItem.id);
      
      const { error: err2 } = await dataApi.from('staff_notifications').insert({
        staff_id: selectedItem.staff_id,
        title: 'Letter Ready',
        message: `Your ${selectedItem.letter_type} letter has been generated.`,
        type: 'letter_ready'
      });
      
      if (!err1) customAlert('Letter request marked as generated.');
      else customAlert('Error generating letter.');
    } else {
      const { error } = await dataApi.from('letter_requests').update({
        status: 'rejected',
        notes: resolutionNotes
      }).eq('id', selectedItem.id);
      
      if (!error) customAlert('Letter request rejected.');
      else customAlert('Error rejecting letter request.');
    }
    
    setProcessing(false);
    setSelectedItem(null);
    setResolutionNotes('');
    fetchAll();
  };

  const renderList = () => {
    let items: any[] = [];
    if (activeTab === 'grievances') items = grievances;
    if (activeTab === 'profiles') items = profileRequests;
    if (activeTab === 'attendance') items = attendanceRegs;
    if (activeTab === 'letters') items = letterRequests;

    if (loading) return <div className="p-4 text-center text-gray-400">Loading...</div>;
    
    if (items.length === 0) {
      return (
        <div className="p-8 text-center text-gray-400">
          <Check size={32} className="mx-auto mb-2 text-emerald-400 opacity-50" />
          All caught up! No active requests.
        </div>
      );
    }

    return items.map(item => {
      const isSelected = selectedItem?.id === item.id;
      let title = item.staffName || item.staff?.name || 'Unknown Staff';
      let subtitle = '';
      let dateStr = new Date(item.createdAt || item.created_at).toLocaleDateString();
      
      if (activeTab === 'grievances') subtitle = item.type + ' issue';
      if (activeTab === 'profiles') subtitle = 'Profile Change';
      if (activeTab === 'attendance') subtitle = item.request_type || 'Regularization';
      if (activeTab === 'letters') subtitle = item.letter_type || 'Letter Request';

      return (
        <button
          key={item.id}
          onClick={() => setSelectedItem(item)}
          className={`w-full text-left p-3 rounded-lg border transition-all ${
            isSelected
              ? 'bg-orange-50 border-orange-300 ring-1 ring-orange-400'
              : 'bg-white border-gray-200 hover:border-orange-300 hover:shadow-sm'
          }`}
        >
          <div className="flex justify-between items-start mb-1">
            <span className="font-semibold text-gray-900 truncate pr-2">{title}</span>
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded capitalize whitespace-nowrap">{subtitle}</span>
          </div>
          <p className="text-xs text-gray-500 line-clamp-2 mb-2">
            {activeTab === 'grievances' && item.description}
            {activeTab === 'profiles' && `Changes: ${Object.keys(item.requested_changes || {}).join(', ')}`}
            {activeTab === 'attendance' && `${item.target_date} - ${item.reason}`}
            {activeTab === 'letters' && item.purpose}
          </p>
          <div className="flex justify-between items-center text-xs text-gray-400">
            <span>{dateStr}</span>
            <span className="text-orange-600 font-medium capitalize">Pending</span>
          </div>
        </button>
      );
    });
  };

  const renderDetail = () => {
    if (!selectedItem) {
      return (
        <div className="bg-gray-50 border border-gray-200 border-dashed rounded-xl h-full min-h-[400px] flex items-center justify-center text-gray-400">
          Select an item from the list to review and take action
        </div>
      );
    }

    const title = selectedItem.staffName || selectedItem.staff?.name || 'Unknown Staff';
    const dateStr = new Date(selectedItem.createdAt || selectedItem.created_at).toLocaleString();

    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex justify-between items-start mb-6 pb-6 border-b border-gray-100">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">{title}</h2>
            <p className="text-sm text-gray-500 flex items-center gap-2">
              <span className="capitalize bg-gray-100 px-2 py-0.5 rounded text-gray-700 font-medium">
                {activeTab === 'grievances' && `${selectedItem.type} Issue`}
                {activeTab === 'profiles' && 'Profile Update'}
                {activeTab === 'attendance' && 'Attendance Regularization'}
                {activeTab === 'letters' && 'Letter Request'}
              </span>
              <span>• Reported: {dateStr}</span>
            </p>
          </div>
          <div className="text-right">
            <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-sm font-semibold inline-flex items-center gap-1.5">
              <Clock size={16} /> Pending
            </span>
          </div>
        </div>

        <div className="mb-8">
          <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2 uppercase tracking-wider">
            <MessageSquare size={16} className="text-gray-400" /> Request Details
          </h3>
          
          <div className="bg-gray-50 p-4 rounded-xl text-gray-700 border border-gray-100 text-sm leading-relaxed whitespace-pre-wrap">
            {activeTab === 'grievances' && selectedItem.description}
            
            {activeTab === 'profiles' && (
              <div className="space-y-2">
                <p className="font-medium text-gray-800 mb-2">Requested Changes:</p>
                {Object.entries(selectedItem.requested_changes || {}).map(([key, val]) => (
                  <div key={key} className="flex gap-4 border-b border-gray-200 pb-2">
                    <span className="w-1/3 font-semibold capitalize">{key.replace(/_/g, ' ')}</span>
                    <span className="w-2/3 text-blue-600 font-medium">{String(val)}</span>
                  </div>
                ))}
              </div>
            )}
            
            {activeTab === 'attendance' && (
              <div className="space-y-2">
                <p><strong>Target Date:</strong> {selectedItem.target_date}</p>
                <p><strong>Type:</strong> {selectedItem.request_type}</p>
                <p><strong>Status Change:</strong> {selectedItem.current_status || 'Absent'} &rarr; {selectedItem.requested_status}</p>
                <p><strong>Reason:</strong> {selectedItem.reason}</p>
              </div>
            )}
            
            {activeTab === 'letters' && (
              <div className="space-y-2">
                <p><strong>Letter Type:</strong> {selectedItem.letter_type}</p>
                <p><strong>Purpose:</strong> {selectedItem.purpose}</p>
              </div>
            )}
          </div>
        </div>

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
              onClick={() => {
                if (activeTab === 'grievances') handleGrievanceAction('rejected');
                else if (activeTab === 'profiles') handleProfileAction('rejected');
                else if (activeTab === 'attendance') handleAttendanceAction('rejected');
                else if (activeTab === 'letters') handleLetterAction('rejected');
              }}
              disabled={processing || !resolutionNotes.trim()}
              className="flex-1 py-2.5 px-4 rounded-lg font-semibold border-2 border-red-200 text-red-600 bg-white hover:bg-red-50 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <X size={18} /> Reject
            </button>
            <button
              onClick={() => {
                if (activeTab === 'grievances') handleGrievanceAction('resolved');
                else if (activeTab === 'profiles') handleProfileAction('approved');
                else if (activeTab === 'attendance') handleAttendanceAction('approved');
                else if (activeTab === 'letters') handleLetterAction('generated');
              }}
              disabled={processing}
              className="flex-1 py-2.5 px-4 rounded-lg font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Check size={18} /> 
              {activeTab === 'letters' ? 'Mark Generated' : 'Approve'}
            </button>
          </div>
          {(!resolutionNotes.trim()) && (
            <p className="text-xs text-center text-red-500 mt-2">* Resolution notes are required when rejecting</p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto pb-24 h-full flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <AlertTriangle className="text-orange-500" size={32} />
            Action Center
          </h1>
          <p className="text-gray-500 mt-1">Review and resolve staff requests and discrepancies</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        <button 
          onClick={() => setActiveTab('grievances')}
          className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 whitespace-nowrap transition-colors ${activeTab === 'grievances' ? 'bg-orange-100 text-orange-800' : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'}`}
        >
          <AlertTriangle size={18} /> Issues
          {grievances.length > 0 && <span className="bg-orange-200 text-orange-800 px-2 py-0.5 rounded-full text-xs">{grievances.length}</span>}
        </button>
        <button 
          onClick={() => setActiveTab('profiles')}
          className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 whitespace-nowrap transition-colors ${activeTab === 'profiles' ? 'bg-blue-100 text-blue-800' : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'}`}
        >
          <UserCog size={18} /> Profile Changes
          {profileRequests.length > 0 && <span className="bg-blue-200 text-blue-800 px-2 py-0.5 rounded-full text-xs">{profileRequests.length}</span>}
        </button>
        <button 
          onClick={() => setActiveTab('attendance')}
          className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 whitespace-nowrap transition-colors ${activeTab === 'attendance' ? 'bg-purple-100 text-purple-800' : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'}`}
        >
          <CalendarClock size={18} /> Attendance Reg.
          {attendanceRegs.length > 0 && <span className="bg-purple-200 text-purple-800 px-2 py-0.5 rounded-full text-xs">{attendanceRegs.length}</span>}
        </button>
        <button 
          onClick={() => setActiveTab('letters')}
          className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 whitespace-nowrap transition-colors ${activeTab === 'letters' ? 'bg-emerald-100 text-emerald-800' : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'}`}
        >
          <FileText size={18} /> Letter Requests
          {letterRequests.length > 0 && <span className="bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded-full text-xs">{letterRequests.length}</span>}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
        {/* List of items */}
        <div className="lg:col-span-1 flex flex-col gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex-1">
            <div className="p-4 border-b border-gray-200 bg-gray-50 font-semibold text-gray-700 flex justify-between">
              <span className="capitalize">{activeTab.replace(/_/g, ' ')} Requests</span>
            </div>
            <div className="overflow-y-auto h-[500px] p-2 space-y-2">
              {renderList()}
            </div>
          </div>
        </div>

        {/* Detail View */}
        <div className="lg:col-span-2">
          {renderDetail()}
        </div>
      </div>
    </div>
  );
}
