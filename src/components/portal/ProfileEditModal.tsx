import React, { useState, useEffect } from 'react';
import {
  User,
  X,
  Save,
  Phone,
  MapPin,
  Building2,
  CreditCard,
  Shield,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { customAlert } from '../CustomDialog';

export interface ProfileEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  staff: any; // current staff record
  sessionToken: string | null;
}

interface FormFields {
  address: string;
  contactNumber: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
}

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

export const ProfileEditModal: React.FC<ProfileEditModalProps> = ({
  isOpen,
  onClose,
  staff,
  sessionToken,
}) => {
  const [formValues, setFormValues] = useState<FormFields>({
    address: '',
    contactNumber: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    bankName: '',
    accountNumber: '',
    ifscCode: '',
  });

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Extract current values safely from staff object (supporting camelCase & snake_case)
  const currentValues: FormFields = {
    address: staff?.address || '',
    contactNumber: staff?.contactNumber || staff?.phone || staff?.contact_number || '',
    emergencyContactName: staff?.emergencyContactName || staff?.emergency_contact_name || '',
    emergencyContactPhone: staff?.emergencyContactPhone || staff?.emergency_contact_phone || '',
    bankName: staff?.bankName || staff?.bank_name || '',
    accountNumber:
      staff?.bankAccountNumber ||
      staff?.accountNumber ||
      staff?.bank_account_number ||
      staff?.account_number ||
      '',
    ifscCode: staff?.ifscCode || staff?.ifsc_code || '',
  };

  useEffect(() => {
    if (isOpen && staff) {
      setFormValues({
        address: currentValues.address,
        contactNumber: currentValues.contactNumber,
        emergencyContactName: currentValues.emergencyContactName,
        emergencyContactPhone: currentValues.emergencyContactPhone,
        bankName: currentValues.bankName,
        accountNumber: currentValues.accountNumber,
        ifscCode: currentValues.ifscCode,
      });
      setErrorMessage(null);
    }
  }, [isOpen, staff]);

  if (!isOpen) return null;

  // Calculate changes
  const getChanges = () => {
    const changes: Record<string, any> = {};

    if (formValues.address.trim() !== currentValues.address.trim()) {
      changes.address = formValues.address.trim();
    }
    if (formValues.contactNumber.trim() !== currentValues.contactNumber.trim()) {
      changes.contact_number = formValues.contactNumber.trim();
    }
    if (formValues.emergencyContactName.trim() !== currentValues.emergencyContactName.trim()) {
      changes.emergency_contact_name = formValues.emergencyContactName.trim();
    }
    if (formValues.emergencyContactPhone.trim() !== currentValues.emergencyContactPhone.trim()) {
      changes.emergency_contact_phone = formValues.emergencyContactPhone.trim();
    }
    if (formValues.bankName.trim() !== currentValues.bankName.trim()) {
      changes.bank_name = formValues.bankName.trim();
    }
    if (formValues.accountNumber.trim() !== currentValues.accountNumber.trim()) {
      changes.bank_account_number = formValues.accountNumber.trim();
    }
    if (formValues.ifscCode.trim().toUpperCase() !== currentValues.ifscCode.trim().toUpperCase()) {
      changes.ifsc_code = formValues.ifscCode.trim().toUpperCase();
    }

    return changes;
  };

  const changedFields = getChanges();
  const changedCount = Object.keys(changedFields).length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (changedCount === 0) {
      setErrorMessage('No changes detected. Please modify at least one field before submitting.');
      return;
    }

    // Validation
    if (changedFields.contact_number) {
      const cleanPhone = changedFields.contact_number.replace(/\D/g, '');
      if (cleanPhone.length !== 10) {
        setErrorMessage('Contact Number must be a valid 10-digit number.');
        return;
      }
    }

    if (changedFields.emergency_contact_phone) {
      const cleanEmPhone = changedFields.emergency_contact_phone.replace(/\D/g, '');
      if (cleanEmPhone.length !== 10) {
        setErrorMessage('Emergency Contact Phone must be a valid 10-digit number.');
        return;
      }
    }

    if (changedFields.ifsc_code) {
      const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
      if (!ifscRegex.test(changedFields.ifsc_code)) {
        setErrorMessage('IFSC code format is invalid (e.g. SBIN0001234).');
        return;
      }
    }

    setLoading(true);

    try {
      const token = getAuthToken(sessionToken);
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
        body: JSON.stringify({
          table: 'profile_change_requests',
          op: 'insert',
          values: {
            staff_id: staff.id,
            requested_changes: changedFields,
            status: 'pending',
          },
        }),
      });

      const json = await res.json();

      if (!res.ok || json.error) {
        throw new Error(json.error || `Failed to submit request (HTTP ${res.status})`);
      }

      await customAlert(
        'Your profile update request has been submitted for administrator review.',
        'Request Submitted'
      );
      onClose();
    } catch (err: any) {
      console.error('Profile change request error:', err);
      setErrorMessage(err.message || 'An error occurred while submitting your request.');
    } finally {
      setLoading(false);
    }
  };

  const isFieldChanged = (key: keyof FormFields): boolean => {
    if (key === 'ifscCode') {
      return formValues.ifscCode.trim().toUpperCase() !== currentValues.ifscCode.trim().toUpperCase();
    }
    return formValues[key].trim() !== currentValues[key].trim();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-[var(--bg-card)] border border-[var(--glass-border)] rounded-2xl shadow-[var(--shadow-soft)] w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--glass-border)] bg-[var(--bg-secondary)]/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <User size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                Request Profile Changes
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Proposed changes will be sent to management for approval
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

        {/* Form Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Staff Info Pill */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--glass-border)] text-xs">
            <div className="flex items-center gap-2 text-[var(--text-primary)] font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>{staff?.name || 'Staff Member'}</span>
              {staff?.employeeCode && (
                <span className="text-[var(--text-muted)]">({staff.employeeCode})</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-muted)]">Modified:</span>
              <span
                className={`px-2 py-0.5 rounded-full font-semibold ${
                  changedCount > 0
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'bg-[var(--glass-bg)] text-[var(--text-muted)]'
                }`}
              >
                {changedCount} {changedCount === 1 ? 'field' : 'fields'}
              </span>
            </div>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="flex items-start gap-2 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs sm:text-sm">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Section: Contact & Personal */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 uppercase tracking-wider">
              <Shield size={14} />
              <span>Contact & Personal Details</span>
            </div>

            <div className="space-y-3">
              {/* Contact Number */}
              <div
                className={`p-3.5 rounded-xl border transition-colors ${
                  isFieldChanged('contactNumber')
                    ? 'bg-blue-500/5 border-blue-500/30'
                    : 'bg-[var(--bg-secondary)] border-[var(--glass-border)]'
                }`}
              >
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Phone size={13} className="text-[var(--text-muted)]" />
                    Contact Number (10-digit)
                  </span>
                  {isFieldChanged('contactNumber') && (
                    <span className="text-[10px] text-blue-400 font-semibold uppercase">
                      Changed
                    </span>
                  )}
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
                  <div className="p-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--glass-border)] text-xs text-[var(--text-muted)] truncate">
                    <span className="block text-[10px] text-[var(--text-muted)]/70 uppercase">
                      Current Value
                    </span>
                    <span className="font-mono text-[var(--text-secondary)]">
                      {currentValues.contactNumber || 'Not provided'}
                    </span>
                  </div>
                  <div>
                    <input
                      type="tel"
                      maxLength={10}
                      value={formValues.contactNumber}
                      onChange={(e) =>
                        setFormValues((prev) => ({
                          ...prev,
                          contactNumber: e.target.value.replace(/\D/g, ''),
                        }))
                      }
                      placeholder="Enter 10-digit mobile number"
                      className="w-full bg-[var(--bg-card)] border border-[var(--glass-border)] focus:border-blue-500 text-[var(--text-primary)] placeholder-[var(--text-muted)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                    />
                  </div>
                </div>
              </div>

              {/* Address */}
              <div
                className={`p-3.5 rounded-xl border transition-colors ${
                  isFieldChanged('address')
                    ? 'bg-blue-500/5 border-blue-500/30'
                    : 'bg-[var(--bg-secondary)] border-[var(--glass-border)]'
                }`}
              >
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <MapPin size={13} className="text-[var(--text-muted)]" />
                    Residential Address
                  </span>
                  {isFieldChanged('address') && (
                    <span className="text-[10px] text-blue-400 font-semibold uppercase">
                      Changed
                    </span>
                  )}
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
                  <div className="p-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--glass-border)] text-xs text-[var(--text-muted)] min-h-[60px]">
                    <span className="block text-[10px] text-[var(--text-muted)]/70 uppercase mb-0.5">
                      Current Value
                    </span>
                    <span className="text-[var(--text-secondary)] whitespace-pre-wrap">
                      {currentValues.address || 'Not provided'}
                    </span>
                  </div>
                  <div>
                    <textarea
                      rows={2}
                      value={formValues.address}
                      onChange={(e) =>
                        setFormValues((prev) => ({ ...prev, address: e.target.value }))
                      }
                      placeholder="Enter new full residential address"
                      className="w-full bg-[var(--bg-card)] border border-[var(--glass-border)] focus:border-blue-500 text-[var(--text-primary)] placeholder-[var(--text-muted)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50 resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* Emergency Contact Name & Phone */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Emergency Contact Name */}
                <div
                  className={`p-3.5 rounded-xl border transition-colors ${
                    isFieldChanged('emergencyContactName')
                      ? 'bg-blue-500/5 border-blue-500/30'
                      : 'bg-[var(--bg-secondary)] border-[var(--glass-border)]'
                  }`}
                >
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-2 flex items-center justify-between">
                    <span>Emergency Contact Name</span>
                    {isFieldChanged('emergencyContactName') && (
                      <span className="text-[10px] text-blue-400 font-semibold uppercase">
                        Changed
                      </span>
                    )}
                  </label>
                  <div className="space-y-2">
                    <div className="p-2 rounded-lg bg-[var(--bg-card)] border border-[var(--glass-border)] text-xs text-[var(--text-muted)] truncate">
                      <span className="block text-[9px] text-[var(--text-muted)]/70 uppercase">
                        Current
                      </span>
                      <span className="text-[var(--text-secondary)]">
                        {currentValues.emergencyContactName || 'Not provided'}
                      </span>
                    </div>
                    <input
                      type="text"
                      value={formValues.emergencyContactName}
                      onChange={(e) =>
                        setFormValues((prev) => ({
                          ...prev,
                          emergencyContactName: e.target.value,
                        }))
                      }
                      placeholder="e.g. Jane Doe (Spouse)"
                      className="w-full bg-[var(--bg-card)] border border-[var(--glass-border)] focus:border-blue-500 text-[var(--text-primary)] placeholder-[var(--text-muted)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                    />
                  </div>
                </div>

                {/* Emergency Contact Phone */}
                <div
                  className={`p-3.5 rounded-xl border transition-colors ${
                    isFieldChanged('emergencyContactPhone')
                      ? 'bg-blue-500/5 border-blue-500/30'
                      : 'bg-[var(--bg-secondary)] border-[var(--glass-border)]'
                  }`}
                >
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-2 flex items-center justify-between">
                    <span>Emergency Contact Phone</span>
                    {isFieldChanged('emergencyContactPhone') && (
                      <span className="text-[10px] text-blue-400 font-semibold uppercase">
                        Changed
                      </span>
                    )}
                  </label>
                  <div className="space-y-2">
                    <div className="p-2 rounded-lg bg-[var(--bg-card)] border border-[var(--glass-border)] text-xs text-[var(--text-muted)] truncate">
                      <span className="block text-[9px] text-[var(--text-muted)]/70 uppercase">
                        Current
                      </span>
                      <span className="font-mono text-[var(--text-secondary)]">
                        {currentValues.emergencyContactPhone || 'Not provided'}
                      </span>
                    </div>
                    <input
                      type="tel"
                      maxLength={10}
                      value={formValues.emergencyContactPhone}
                      onChange={(e) =>
                        setFormValues((prev) => ({
                          ...prev,
                          emergencyContactPhone: e.target.value.replace(/\D/g, ''),
                        }))
                      }
                      placeholder="10-digit phone"
                      className="w-full bg-[var(--bg-card)] border border-[var(--glass-border)] focus:border-blue-500 text-[var(--text-primary)] placeholder-[var(--text-muted)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section: Banking Details */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 uppercase tracking-wider">
              <Building2 size={14} />
              <span>Banking & Payout Information</span>
            </div>

            <div className="space-y-3">
              {/* Bank Name */}
              <div
                className={`p-3.5 rounded-xl border transition-colors ${
                  isFieldChanged('bankName')
                    ? 'bg-blue-500/5 border-blue-500/30'
                    : 'bg-[var(--bg-secondary)] border-[var(--glass-border)]'
                }`}
              >
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Building2 size={13} className="text-[var(--text-muted)]" />
                    Bank Name
                  </span>
                  {isFieldChanged('bankName') && (
                    <span className="text-[10px] text-blue-400 font-semibold uppercase">
                      Changed
                    </span>
                  )}
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
                  <div className="p-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--glass-border)] text-xs text-[var(--text-muted)] truncate">
                    <span className="block text-[10px] text-[var(--text-muted)]/70 uppercase">
                      Current Value
                    </span>
                    <span className="text-[var(--text-secondary)]">
                      {currentValues.bankName || 'Not provided'}
                    </span>
                  </div>
                  <div>
                    <input
                      type="text"
                      value={formValues.bankName}
                      onChange={(e) =>
                        setFormValues((prev) => ({ ...prev, bankName: e.target.value }))
                      }
                      placeholder="e.g. State Bank of India, HDFC"
                      className="w-full bg-[var(--bg-card)] border border-[var(--glass-border)] focus:border-blue-500 text-[var(--text-primary)] placeholder-[var(--text-muted)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                    />
                  </div>
                </div>
              </div>

              {/* Account Number & IFSC Code */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Account Number */}
                <div
                  className={`p-3.5 rounded-xl border transition-colors ${
                    isFieldChanged('accountNumber')
                      ? 'bg-blue-500/5 border-blue-500/30'
                      : 'bg-[var(--bg-secondary)] border-[var(--glass-border)]'
                  }`}
                >
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <CreditCard size={13} className="text-[var(--text-muted)]" />
                      Account Number
                    </span>
                    {isFieldChanged('accountNumber') && (
                      <span className="text-[10px] text-blue-400 font-semibold uppercase">
                        Changed
                      </span>
                    )}
                  </label>
                  <div className="space-y-2">
                    <div className="p-2 rounded-lg bg-[var(--bg-card)] border border-[var(--glass-border)] text-xs text-[var(--text-muted)] truncate">
                      <span className="block text-[9px] text-[var(--text-muted)]/70 uppercase">
                        Current
                      </span>
                      <span className="font-mono text-[var(--text-secondary)]">
                        {currentValues.accountNumber || 'Not provided'}
                      </span>
                    </div>
                    <input
                      type="text"
                      value={formValues.accountNumber}
                      onChange={(e) =>
                        setFormValues((prev) => ({
                          ...prev,
                          accountNumber: e.target.value.replace(/\s+/g, ''),
                        }))
                      }
                      placeholder="Bank account number"
                      className="w-full bg-[var(--bg-card)] border border-[var(--glass-border)] focus:border-blue-500 text-[var(--text-primary)] placeholder-[var(--text-muted)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                    />
                  </div>
                </div>

                {/* IFSC Code */}
                <div
                  className={`p-3.5 rounded-xl border transition-colors ${
                    isFieldChanged('ifscCode')
                      ? 'bg-blue-500/5 border-blue-500/30'
                      : 'bg-[var(--bg-secondary)] border-[var(--glass-border)]'
                  }`}
                >
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-2 flex items-center justify-between">
                    <span>IFSC Code</span>
                    {isFieldChanged('ifscCode') && (
                      <span className="text-[10px] text-blue-400 font-semibold uppercase">
                        Changed
                      </span>
                    )}
                  </label>
                  <div className="space-y-2">
                    <div className="p-2 rounded-lg bg-[var(--bg-card)] border border-[var(--glass-border)] text-xs text-[var(--text-muted)] truncate">
                      <span className="block text-[9px] text-[var(--text-muted)]/70 uppercase">
                        Current
                      </span>
                      <span className="font-mono text-[var(--text-secondary)]">
                        {currentValues.ifscCode || 'Not provided'}
                      </span>
                    </div>
                    <input
                      type="text"
                      maxLength={11}
                      value={formValues.ifscCode}
                      onChange={(e) =>
                        setFormValues((prev) => ({
                          ...prev,
                          ifscCode: e.target.value.toUpperCase().replace(/\s+/g, ''),
                        }))
                      }
                      placeholder="11-character IFSC (e.g. SBIN0001234)"
                      className="w-full bg-[var(--bg-card)] border border-[var(--glass-border)] focus:border-blue-500 text-[var(--text-primary)] placeholder-[var(--text-muted)] rounded-lg px-3 py-2 text-xs uppercase font-mono focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--glass-border)] bg-[var(--bg-secondary)]/50">
          <div className="text-xs text-[var(--text-muted)]">
            {changedCount > 0 ? (
              <span className="text-blue-400 font-medium flex items-center gap-1">
                <CheckCircle2 size={14} />
                Ready to submit {changedCount} field {changedCount === 1 ? 'change' : 'changes'}
              </span>
            ) : (
              <span>No modifications made yet</span>
            )}
          </div>
          <div className="flex items-center gap-2.5">
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
              disabled={loading || changedCount === 0}
              className="px-5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors flex items-center gap-1.5 shadow-sm shadow-blue-500/20"
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <>
                  <Save size={14} />
                  <span>Submit Request</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileEditModal;
