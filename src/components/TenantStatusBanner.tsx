import React from 'react';
import { AlertTriangle, Smartphone, ShieldAlert, ExternalLink, HelpCircle, CheckCircle2 } from 'lucide-react';
import { customAlert } from './CustomDialog';

interface TenantStatusBannerProps {
  tenant?: {
    id?: string;
    name?: string;
    status?: string;
    staff_portal_enabled?: boolean;
  } | null;
  role?: string;
  onEnableStaffPortal?: () => void;
  className?: string;
}

export const TenantStatusBanner: React.FC<TenantStatusBannerProps> = ({
  tenant,
  role,
  onEnableStaffPortal,
  className = '',
}) => {
  if (!tenant) return null;

  const isSuspended = tenant.status && tenant.status.toUpperCase() !== 'ACTIVE';
  const isPortalDisabled = tenant.staff_portal_enabled === false;

  if (!isSuspended && !isPortalDisabled) return null;

  const handleContactSupport = () => {
    customAlert(
      `Support Contact:\n\nClient Workspace: ${tenant.name || 'Current Workspace'}\nAccount ID: ${tenant.id || 'N/A'}\n\nPlease email support@staffsync.app or contact your dedicated Super Admin representative.`
    );
  };

  return (
    <div className={`space-y-2 z-40 w-full ${className}`}>
      {/* Suspended Workspace Banner */}
      {isSuspended && (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-xl border border-red-300 bg-red-900 text-white p-3 sm:p-4 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-start gap-3 min-w-0">
            <div className="rounded-lg bg-red-800 p-2 text-red-100 shrink-0 mt-0.5">
              <ShieldAlert size={20} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-sm tracking-wide" style={{ color: '#fef2f2' }}>
                  Workspace Suspended ({tenant.status?.toUpperCase()})
                </h3>
                <span className="inline-block rounded bg-red-950 px-2 py-0.5 text-[11px] font-bold text-red-200 uppercase">
                  Action Required
                </span>
              </div>
              <p className="text-xs mt-1 leading-relaxed" style={{ color: '#fee2e2' }}>
                {tenant.name || 'This workspace'} is currently suspended by platform administration. Operational features and staff logins are blocked or restricted.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            <button
              onClick={handleContactSupport}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-red-900 hover:bg-red-50 transition-colors focus:ring-2 focus:ring-white focus:outline-none shadow-sm"
            >
              <HelpCircle size={14} /> Contact Support
            </button>
          </div>
        </div>
      )}

      {/* Staff Portal Disabled Banner */}
      {isPortalDisabled && (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-xl border border-amber-400 bg-amber-950 text-amber-50 p-3 sm:p-4 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-start gap-3 min-w-0">
            <div className="rounded-lg bg-amber-900 p-2 text-amber-200 shrink-0 mt-0.5">
              <Smartphone size={20} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-sm tracking-wide" style={{ color: '#fef3c7' }}>
                  Staff Self-Service Portal Disabled
                </h3>
                <span className="inline-block rounded bg-amber-900 px-2 py-0.5 text-[11px] font-bold text-amber-200 uppercase">
                  Portal Off
                </span>
              </div>
              <p className="text-xs mt-1 leading-relaxed" style={{ color: '#fde68a' }}>
                {role === 'staff'
                  ? 'Access to the mobile staff app has been turned off for this workspace by your manager or administrator.'
                  : 'Staff members cannot log into the staff portal to check attendance or payslips because access is disabled.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            {onEnableStaffPortal && (role === 'admin' || role === 'super_admin') ? (
              <button
                onClick={onEnableStaffPortal}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-300 transition-colors focus:ring-2 focus:ring-amber-200 focus:outline-none shadow-sm"
              >
                <CheckCircle2 size={14} /> Enable Staff Portal
              </button>
            ) : (
              <button
                onClick={handleContactSupport}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-700 bg-amber-900 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-800 transition-colors focus:ring-2 focus:ring-amber-400 focus:outline-none"
              >
                <HelpCircle size={14} /> Contact Admin
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TenantStatusBanner;
