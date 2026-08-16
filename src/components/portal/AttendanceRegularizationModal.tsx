import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  AlertCircle,
  X,
  Send,
  CheckCircle2,
  Loader2,
  Info,
} from 'lucide-react';
import { customAlert } from '../CustomDialog';

export interface AttendanceRegularizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  staffId: string;
  targetDate: string; // YYYY-MM-DD
  currentStatus: string; // 'Present', 'Absent', 'Half Day', etc.
  currentPunchIn?: string;
  currentPunchOut?: string;
  sessionToken: string | null;
  onSuccess?: () => void;
}

export type RequestType =
  | 'Missed Punch'
  | 'Wrong Status'
  | 'Overtime Claim'
  | 'Half Day Correction';

const REQUEST_TYPES: RequestType[] = [
  'Missed Punch',
  'Wrong Status',
  'Overtime Claim',
  'Half Day Correction',
];

const STATUS_OPTIONS = ['Present', 'Half Day', 'Absent', 'Leave'];

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://nsmppwnpdxomjmgrtqka.supabase.co';
const PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const getAuthToken = (sessionTokenProp: string | null): string | null => {
  if (sessionTokenProp) return sessionTokenProp;
  try {
    const direct = localStorage.getItem('sessionToken');
    if (direct) return direct;
    const login = localStorage.getItem('staffManagementLogin');
    if (login) {
      const parsed = JSON.parse(login);
      return parsed?.sessionToken || null;
    }
  } catch {
    // ignore
  }
  return null;
};

export const AttendanceRegularizationModal: React.FC<AttendanceRegularizationModalProps> = ({
  isOpen,
  onClose,
  staffId,
  targetDate,
  currentStatus,
  currentPunchIn = '',
  currentPunchOut = '',
  sessionToken,
  onSuccess,
}) => {
  const [requestType, setRequestType] = useState<RequestType>('Missed Punch');
  const [requestedStatus, setRequestedStatus] = useState<string>('Present');
  const [punchInTime, setPunchInTime] = useState<string>('');
  const [punchOutTime, setPunchOutTime] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setRequestType('Missed Punch');
      setRequestedStatus(currentStatus === 'Absent' ? 'Present' : currentStatus || 'Present');
      setPunchInTime(currentPunchIn || '');
      setPunchOutTime(currentPunchOut || '');
      setReason('');
      setErrorMessage(null);
    }
  }, [isOpen, targetDate, currentStatus, currentPunchIn, currentPunchOut]);

  // Adjust defaults whenever requestType changes
  useEffect(() => {
    if (requestType === 'Half Day Correction') {
      setRequestedStatus('Half Day');
    } else if (requestType === 'Overtime Claim') {
      setRequestedStatus(currentStatus === 'Absent' ? 'Present' : currentStatus || 'Present');
    } else if (requestType === 'Missed Punch') {
      setRequestedStatus(currentStatus === 'Absent' ? 'Present' : currentStatus || 'Present');
    }
  }, [requestType, currentStatus]);

  if (!isOpen) return null;

  const formattedDate = (() => {
    try {
      if (!targetDate) return '';
      const date = new Date(targetDate + 'T00:00:00');
      return date.toLocaleDateString(undefined, {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return targetDate;
    }
  })();

  const getStatusBadgeStyle = (status: string) => {
    const s = (status || '').toLowerCase();
    if (s.includes('present')) {
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    }
    if (s.includes('absent')) {
      return 'bg-red-500/10 text-red-400 border-red-500/20';
    }
    if (s.includes('half')) {
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    }
    return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!reason.trim()) {
      setErrorMessage('Please provide a reason explaining the attendance correction request.');
      return;
    }

    if (reason.trim().length < 5) {
      setErrorMessage('Reason is too short. Please provide more context (minimum 5 characters).');
      return;
    }

    if (requestType === 'Missed Punch' && !punchInTime && !punchOutTime) {
      setErrorMessage('Please enter at least a punch-in or punch-out time for Missed Punch.');
      return;
    }

    if (requestType === 'Overtime Claim' && !punchOutTime) {
      setErrorMessage('Please enter the punch-out time for Overtime Claim.');
      return;
    }

    if (requestType === 'Wrong Status' && requestedStatus === currentStatus) {
      setErrorMessage('Requested status must be different from current recorded status.');
      return;
    }

    setLoading(true);

    try {
      const token = getAuthToken(sessionToken);

      const payload = {
        table: 'attendance_regularizations',
        op: 'insert',
        values: {
          staff_id: staffId,
          target_date: targetDate,
          request_type: requestType,
          current_status: currentStatus,
          requested_status:
            requestType === 'Half Day Correction'
              ? 'Half Day'
              : requestType === 'Wrong Status'
              ? requestedStatus
              : requestedStatus || null,
          punch_in_time: punchInTime || null,
          punch_out_time: punchOutTime || null,
          reason: reason.trim(),
          status: 'pending',
        },
      };

      const res = await fetch(`${SUPABASE_URL}/functions/v1/data-api`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: PUBLISHABLE_KEY,
          ...(token
            ? {
                'x-session-token': token,
                Authorization: `Bearer ${token}`,
              }
            : {}),
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok || json.error) {
        throw new Error(json.error || `Failed to submit request (HTTP ${res.status})`);
      }

      await customAlert(
        `Your regularization request for ${formattedDate} has been submitted for manager approval.`,
        'Request Submitted'
      );

      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (err: any) {
      console.error('Attendance regularization error:', err);
      setErrorMessage(err.message || 'An error occurred while submitting regularization request.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-[var(--bg-card)] border border-[var(--glass-border)] rounded-2xl shadow-[var(--shadow-soft)] w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--glass-border)] bg-[var(--bg-secondary)]/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Calendar size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                Attendance Regularization
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Request correction for missing or inaccurate attendance
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg)] border border-transparent hover:border-[var(--glass-border)] transition-colors"
            title="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Target Date & Current Status Summary */}
          <div className="p-3.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--glass-border)] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--text-muted)] flex items-center gap-1.5">
                <Calendar size={13} className="text-blue-400" />
                Target Date
              </span>
              <span className="font-semibold text-[var(--text-primary)]">{formattedDate}</span>
            </div>
            <div className="flex items-center justify-between text-xs pt-1 border-t border-[var(--glass-border)]/50">
              <span className="text-[var(--text-muted)]">Current Status</span>
              <span
                className={`px-2.5 py-0.5 rounded-full font-medium border text-xs ${getStatusBadgeStyle(
                  currentStatus
                )}`}
              >
                {currentStatus || 'Not Recorded'}
              </span>
            </div>
            {(currentPunchIn || currentPunchOut) && (
              <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] pt-1 border-t border-[var(--glass-border)]/50">
                <span>Recorded Punches</span>
                <span className="font-mono text-[var(--text-secondary)]">
                  {currentPunchIn ? `In: ${currentPunchIn}` : 'In: --:--'} &bull;{' '}
                  {currentPunchOut ? `Out: ${currentPunchOut}` : 'Out: --:--'}
                </span>
              </div>
            )}
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="flex items-start gap-2 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs sm:text-sm">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Request Type Selector */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              Request Type <span className="text-red-400">*</span>
            </label>
            <select
              value={requestType}
              onChange={(e) => setRequestType(e.target.value as RequestType)}
              className="w-full bg-[var(--bg-secondary)] border border-[var(--glass-border)] focus:border-blue-500 text-[var(--text-primary)] rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50"
            >
              {REQUEST_TYPES.map((type) => (
                <option key={type} value={type} className="bg-[var(--bg-card)]">
                  {type}
                </option>
              ))}
            </select>
          </div>

          {/* Conditional Fields based on Request Type */}

          {/* 1. Missed Punch */}
          {requestType === 'Missed Punch' && (
            <div className="space-y-3 p-3.5 rounded-xl bg-blue-500/5 border border-blue-500/20">
              <div className="flex items-center gap-1.5 text-xs text-blue-400 font-medium">
                <Clock size={14} />
                <span>Specify Missing Punch Timings</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                    Punch In Time
                  </label>
                  <input
                    type="time"
                    value={punchInTime}
                    onChange={(e) => setPunchInTime(e.target.value)}
                    className="w-full bg-[var(--bg-card)] border border-[var(--glass-border)] text-[var(--text-primary)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                    Punch Out Time
                  </label>
                  <input
                    type="time"
                    value={punchOutTime}
                    onChange={(e) => setPunchOutTime(e.target.value)}
                    className="w-full bg-[var(--bg-card)] border border-[var(--glass-border)] text-[var(--text-primary)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50 font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 2. Wrong Status */}
          {requestType === 'Wrong Status' && (
            <div className="space-y-3 p-3.5 rounded-xl bg-purple-500/5 border border-purple-500/20">
              <div className="flex items-center gap-1.5 text-xs text-purple-400 font-medium">
                <Info size={14} />
                <span>Correct Status Selection</span>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                  Requested Status <span className="text-red-400">*</span>
                </label>
                <select
                  value={requestedStatus}
                  onChange={(e) => setRequestedStatus(e.target.value)}
                  className="w-full bg-[var(--bg-card)] border border-[var(--glass-border)] text-[var(--text-primary)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                >
                  {STATUS_OPTIONS.map((st) => (
                    <option key={st} value={st} className="bg-[var(--bg-card)]">
                      {st}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                    Punch In Time (Optional)
                  </label>
                  <input
                    type="time"
                    value={punchInTime}
                    onChange={(e) => setPunchInTime(e.target.value)}
                    className="w-full bg-[var(--bg-card)] border border-[var(--glass-border)] text-[var(--text-primary)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500/50 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                    Punch Out Time (Optional)
                  </label>
                  <input
                    type="time"
                    value={punchOutTime}
                    onChange={(e) => setPunchOutTime(e.target.value)}
                    className="w-full bg-[var(--bg-card)] border border-[var(--glass-border)] text-[var(--text-primary)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500/50 font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 3. Overtime Claim */}
          {requestType === 'Overtime Claim' && (
            <div className="space-y-3 p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/20">
              <div className="flex items-center gap-1.5 text-xs text-amber-400 font-medium">
                <Clock size={14} />
                <span>Claimed Shift Punch-out Time</span>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                  Actual Punch Out Time <span className="text-red-400">*</span>
                </label>
                <input
                  type="time"
                  value={punchOutTime}
                  onChange={(e) => setPunchOutTime(e.target.value)}
                  className="w-full bg-[var(--bg-card)] border border-[var(--glass-border)] text-[var(--text-primary)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500/50 font-mono"
                />
              </div>
            </div>
          )}

          {/* 4. Half Day Correction */}
          {requestType === 'Half Day Correction' && (
            <div className="space-y-3 p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
              <div className="flex items-center justify-between text-xs text-emerald-400 font-medium">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 size={14} />
                  Correction to Half Day
                </span>
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 font-semibold text-[10px]">
                  Half Day
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                    Punch In Time (Optional)
                  </label>
                  <input
                    type="time"
                    value={punchInTime}
                    onChange={(e) => setPunchInTime(e.target.value)}
                    className="w-full bg-[var(--bg-card)] border border-[var(--glass-border)] text-[var(--text-primary)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500/50 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                    Punch Out Time (Optional)
                  </label>
                  <input
                    type="time"
                    value={punchOutTime}
                    onChange={(e) => setPunchOutTime(e.target.value)}
                    className="w-full bg-[var(--bg-card)] border border-[var(--glass-border)] text-[var(--text-primary)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500/50 font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Reason Textarea */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider flex items-center justify-between">
              <span>
                Reason for Correction <span className="text-red-400">*</span>
              </span>
              <span className="text-[10px] text-[var(--text-muted)] font-normal">
                {reason.length} characters
              </span>
            </label>
            <textarea
              rows={3}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Please explain in detail why this attendance record requires regularization..."
              className="w-full bg-[var(--bg-secondary)] border border-[var(--glass-border)] focus:border-blue-500 text-[var(--text-primary)] placeholder-[var(--text-muted)] rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50 resize-none"
            />
          </div>
        </form>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-[var(--glass-border)] bg-[var(--bg-secondary)]/50">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-secondary)] hover:bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || !reason.trim()}
            className="px-5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors flex items-center gap-1.5 shadow-sm shadow-blue-500/20"
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Submitting...</span>
              </>
            ) : (
              <>
                <Send size={14} />
                <span>Submit Regularization</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AttendanceRegularizationModal;
