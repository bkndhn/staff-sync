import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Plus,
  Download,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  X,
  Send,
  Info,
  Calendar,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { customAlert } from '../CustomDialog';

export interface DocumentsTabProps {
  staffId: string;
  staffName: string;
  sessionToken: string | null;
}

export type LetterType = 'Employment Proof' | 'Salary Certificate' | 'Experience Letter';

export interface LetterRequest {
  id: string;
  staff_id: string;
  letter_type: LetterType | string;
  purpose: string;
  status: 'pending' | 'generated' | 'rejected' | string;
  generated_url?: string | null;
  admin_notes?: string | null;
  created_at: string;
  updated_at?: string;
}

const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  'https://nsmppwnpdxomjmgrtqka.supabase.co';

const SUPABASE_KEY =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  '';

const DATA_API_URL = `${SUPABASE_URL}/functions/v1/data-api`;

const LETTER_TYPE_OPTIONS: Array<{ value: LetterType; label: string; description: string }> = [
  {
    value: 'Employment Proof',
    label: 'Employment Proof',
    description: 'Certifies your current active employment, designation, and branch location.',
  },
  {
    value: 'Salary Certificate',
    label: 'Salary Certificate',
    description: 'Detailed breakdown of your basic salary, allowances, HRA, and annual CTC.',
  },
  {
    value: 'Experience Letter',
    label: 'Experience Letter',
    description: 'Official service record certifying your tenure, roles, and professional contributions.',
  },
];

export const DocumentsTab: React.FC<DocumentsTabProps> = ({
  staffId,
  staffName,
  sessionToken,
}) => {
  const [requests, setRequests] = useState<LetterRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [selectedType, setSelectedType] = useState<LetterType>('Employment Proof');
  const [purpose, setPurpose] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  /**
   * Helper to perform authenticated POST calls to the data-api edge function.
   */
  const callDataApi = useCallback(
    async (payload: any) => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
      };

      const effectiveToken =
        sessionToken ||
        (typeof localStorage !== 'undefined'
          ? localStorage.getItem('sessionToken')
          : null);

      if (effectiveToken) {
        headers['Authorization'] = `Bearer ${effectiveToken}`;
        headers['x-session-token'] = effectiveToken;
      }

      const response = await fetch(DATA_API_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(json?.error || `HTTP ${response.status}: Failed to complete request`);
      }

      return json.data;
    },
    [sessionToken]
  );

  /**
   * Fetch letter requests for the current staff member.
   */
  const fetchRequests = useCallback(
    async (isManualRefresh: boolean = false) => {
      if (!staffId) return;

      if (isManualRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const data = await callDataApi({
          table: 'letter_requests',
          op: 'select',
          filters: [{ col: 'staff_id', op: 'eq', val: staffId }],
          order: { col: 'created_at', ascending: false },
        });

        setRequests(Array.isArray(data) ? data : []);
      } catch (err: any) {
        console.error('Error fetching letter requests:', err);
        setError(err?.message || 'Unable to load letter requests.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [staffId, callDataApi]
  );

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  /**
   * Handle form submission to create a new letter request.
   */
  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!purpose.trim()) {
      customAlert('Please describe the purpose or reason for your document request.', 'Purpose Required');
      return;
    }

    setSubmitting(true);
    try {
      await callDataApi({
        table: 'letter_requests',
        op: 'insert',
        values: {
          staff_id: staffId,
          letter_type: selectedType,
          purpose: purpose.trim(),
          status: 'pending',
        },
      });

      await customAlert(
        `Your request for "${selectedType}" has been submitted for review.`,
        'Request Submitted'
      );

      // Reset form and close modal
      setPurpose('');
      setSelectedType('Employment Proof');
      setIsFormOpen(false);

      // Reload list
      fetchRequests(true);
    } catch (err: any) {
      console.error('Error submitting letter request:', err);
      customAlert(
        err?.message || 'Failed to submit letter request. Please try again.',
        'Submission Failed'
      );
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Formatting helpers
   */
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${day} ${months[d.getMonth()]} ${d.getFullYear()}`;
  };

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'generated':
      case 'approved':
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle size={12} className="text-emerald-400" />
            Generated
          </span>
        );
      case 'rejected':
      case 'declined':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
            <XCircle size={12} className="text-red-400" />
            Rejected
          </span>
        );
      case 'pending':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock size={12} className="text-amber-400" />
            Pending Review
          </span>
        );
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'Employment Proof':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            Employment Proof
          </span>
        );
      case 'Salary Certificate':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Salary Certificate
          </span>
        );
      case 'Experience Letter':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
            Experience Letter
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold bg-slate-500/10 text-slate-300 border border-slate-500/20">
            {type}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Section Header Card */}
      <div className="bg-[var(--bg-card)] border border-[var(--glass-border)] rounded-2xl shadow-[var(--shadow-soft)] p-5 md:p-6 transition-all">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
              <FileText className="text-blue-400" size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                Documents &amp; Letters
              </h2>
              <p className="text-xs md:text-sm text-[var(--text-secondary)] mt-0.5">
                Request official letters, certificates, and download approved documents.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-end sm:self-center">
            <button
              onClick={() => fetchRequests(true)}
              disabled={loading || refreshing}
              title="Refresh requests"
              className="p-2.5 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] border border-[var(--glass-border)] transition-all disabled:opacity-50"
            >
              <RefreshCw size={17} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => setIsFormOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm text-white bg-blue-600 hover:bg-blue-700 active:scale-95 shadow-md shadow-blue-500/20 transition-all"
            >
              <Plus size={18} />
              <span>Request a Letter</span>
            </button>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-start gap-3 text-red-400">
          <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-semibold">Unable to fetch documents</p>
            <p className="text-xs opacity-90 mt-0.5">{error}</p>
          </div>
          <button
            onClick={() => fetchRequests(true)}
            className="px-3 py-1 text-xs font-semibold rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 transition-all"
          >
            Retry
          </button>
        </div>
      )}

      {/* Requests List Area */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-[var(--bg-card)] border border-[var(--glass-border)] rounded-2xl p-5 shadow-[var(--shadow-soft)] animate-pulse"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="h-5 w-32 bg-slate-700/40 rounded-lg"></div>
                <div className="h-5 w-24 bg-slate-700/40 rounded-full"></div>
              </div>
              <div className="h-4 w-3/4 bg-slate-700/30 rounded mb-2"></div>
              <div className="h-3 w-1/4 bg-slate-700/20 rounded"></div>
            </div>
          ))}
        </div>
      ) : requests.length === 0 ? (
        /* Empty State */
        <div className="bg-[var(--bg-card)] border border-[var(--glass-border)] rounded-2xl shadow-[var(--shadow-soft)] p-8 md:p-12 text-center">
          <div className="w-16 h-16 rounded-3xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-4">
            <FileText className="text-blue-400" size={32} />
          </div>
          <h3 className="text-lg font-bold text-[var(--text-primary)]">
            No document requests yet
          </h3>
          <p className="text-sm text-[var(--text-muted)] max-w-md mx-auto mt-1.5 mb-6">
            Need an employment proof, salary certificate, or experience letter? Submit a
            request and HR will review and generate it for you.
          </p>
          <button
            onClick={() => setIsFormOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm text-white bg-blue-600 hover:bg-blue-700 active:scale-95 shadow-md shadow-blue-500/20 transition-all"
          >
            <Plus size={18} />
            <span>Request a Letter</span>
          </button>
        </div>
      ) : (
        /* List of Requests */
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              Request History ({requests.length})
            </h3>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {requests.map((req) => (
              <div
                key={req.id}
                className="bg-[var(--bg-card)] border border-[var(--glass-border)] rounded-2xl shadow-[var(--shadow-soft)] p-5 transition-all hover:border-[var(--glass-border-strong)]"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--glass-border)]">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {getTypeBadge(req.letter_type)}
                    <span className="text-xs text-[var(--text-muted)] flex items-center gap-1">
                      <Calendar size={12} />
                      Requested on {formatDate(req.created_at)}
                    </span>
                  </div>
                  <div>{getStatusBadge(req.status)}</div>
                </div>

                <div className="mt-3.5 space-y-3">
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                      Purpose / Reason
                    </h4>
                    <p className="text-sm text-[var(--text-primary)] leading-relaxed bg-[var(--bg-secondary)] p-3 rounded-xl border border-[var(--glass-border)]">
                      {req.purpose || 'No reason specified'}
                    </p>
                  </div>

                  {/* Admin Notes Callout */}
                  {req.admin_notes && (
                    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-blue-500/5 border border-blue-500/20 text-xs text-[var(--text-secondary)]">
                      <Info size={16} className="text-blue-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <span className="font-semibold text-blue-400">HR Remarks: </span>
                        <span>{req.admin_notes}</span>
                      </div>
                    </div>
                  )}

                  {/* Download Action */}
                  {req.generated_url && (
                    <div className="pt-2 flex items-center justify-end">
                      <a
                        href={req.generated_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 shadow-sm shadow-emerald-600/20 transition-all"
                      >
                        <Download size={14} />
                        <span>Download Document</span>
                        <ExternalLink size={12} className="opacity-70" />
                      </a>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Request Form Modal */}
      {isFormOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => !submitting && setIsFormOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-[var(--bg-card)] border border-[var(--glass-border)] rounded-2xl p-6 shadow-2xl relative select-none animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-[var(--glass-border)]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                  <Sparkles size={20} className="text-blue-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[var(--text-primary)]">
                    Request a Letter
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    For {staffName || 'Staff Member'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !submitting && setIsFormOpen(false)}
                disabled={submitting}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-all disabled:opacity-50"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmitRequest} className="mt-5 space-y-4">
              {/* Document Type Dropdown */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5">
                  Document Type <span className="text-red-400">*</span>
                </label>
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value as LetterType)}
                  disabled={submitting}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--glass-border)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                >
                  {LETTER_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value} className="bg-slate-900 text-white">
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  {LETTER_TYPE_OPTIONS.find((o) => o.value === selectedType)?.description}
                </p>
              </div>

              {/* Purpose / Reason Textarea */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5">
                  Purpose / Reason <span className="text-red-400">*</span>
                </label>
                <textarea
                  rows={4}
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  disabled={submitting}
                  placeholder="e.g., Bank loan application, Visa processing, Higher studies, Address verification..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--glass-border)] text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all resize-none"
                />
                <p className="text-[11px] text-[var(--text-muted)] mt-1">
                  Please provide sufficient detail to help HR prepare your document accurately.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--glass-border)]">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] border border-[var(--glass-border)] transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !purpose.trim()}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:opacity-50 disabled:pointer-events-none shadow-md shadow-blue-500/20 transition-all"
                >
                  {submitting ? (
                    <>
                      <RefreshCw size={15} className="animate-spin" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <Send size={15} />
                      <span>Submit Request</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentsTab;
