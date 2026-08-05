import React from 'react';
import { Shield, Check, X, Info } from 'lucide-react';
import { AppRole } from '../lib/roleVisibility';

type Feature = string;

interface RolePermission {
  role: AppRole;
  label: string;
  description: string;
  permissions: Record<Feature, boolean>;
}

const features: Feature[] = [
  'Dashboard Analytics',
  'Manage Staff Profiles',
  'View Payroll Details',
  'Manage Attendance',
  'Approve Leaves',
  'Manage Branchs & Zones',
  'Run Payroll',
  'View Audit Logs',
  'Manage Admin Credentials',
  'Tenant & Billing Management',
];

const permissionsData: RolePermission[] = [
  {
    role: 'super_admin',
    label: 'Super Admin',
    description: 'Platform owner managing all tenants and billing.',
    permissions: {
      'Dashboard Analytics': false,
      'Manage Staff Profiles': false,
      'View Payroll Details': false,
      'Manage Attendance': false,
      'Approve Leaves': false,
      'Manage Branchs & Zones': false,
      'Run Payroll': false,
      'View Audit Logs': false,
      'Manage Admin Credentials': true,
      'Tenant & Billing Management': true,
    }
  },
  {
    role: 'admin',
    label: 'Client Admin',
    description: 'Full access to a specific tenant/client account.',
    permissions: {
      'Dashboard Analytics': true,
      'Manage Staff Profiles': true,
      'View Payroll Details': true,
      'Manage Attendance': true,
      'Approve Leaves': true,
      'Manage Branchs & Zones': true,
      'Run Payroll': true,
      'View Audit Logs': true,
      'Manage Admin Credentials': true,
      'Tenant & Billing Management': false,
    }
  },
  {
    role: 'statutory_admin',
    label: 'Statutory Admin',
    description: 'Access restricted to statutory staff only.',
    permissions: {
      'Dashboard Analytics': true,
      'Manage Staff Profiles': true,
      'View Payroll Details': true,
      'Manage Attendance': true,
      'Approve Leaves': true,
      'Manage Branchs & Zones': false,
      'Run Payroll': true,
      'View Audit Logs': false,
      'Manage Admin Credentials': false,
      'Tenant & Billing Management': false,
    }
  },
  {
    role: 'manager',
    label: 'Branch Manager',
    description: 'Manages a specific location.',
    permissions: {
      'Dashboard Analytics': true,
      'Manage Staff Profiles': false,
      'View Payroll Details': false,
      'Manage Attendance': true,
      'Approve Leaves': true,
      'Manage Branchs & Zones': false,
      'Run Payroll': false,
      'View Audit Logs': false,
      'Manage Admin Credentials': false,
      'Tenant & Billing Management': false,
    }
  },
  {
    role: 'floor_supervisor',
    label: 'Zone Supervisor',
    description: 'Manages attendance on a specific floor.',
    permissions: {
      'Dashboard Analytics': true,
      'Manage Staff Profiles': false,
      'View Payroll Details': false,
      'Manage Attendance': true,
      'Approve Leaves': false,
      'Manage Branchs & Zones': false,
      'Run Payroll': false,
      'View Audit Logs': false,
      'Manage Admin Credentials': false,
      'Tenant & Billing Management': false,
    }
  },
  {
    role: 'staff',
    label: 'Staff',
    description: 'Employee access via Staff Portal.',
    permissions: {
      'Dashboard Analytics': false,
      'Manage Staff Profiles': false,
      'View Payroll Details': true,
      'Manage Attendance': true,
      'Approve Leaves': false,
      'Manage Branchs & Zones': false,
      'Run Payroll': false,
      'View Audit Logs': false,
      'Manage Admin Credentials': false,
      'Tenant & Billing Management': false,
    }
  },
];

const PermissionsMatrix: React.FC = () => {
  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-blue-500/20 rounded-xl">
          <Shield className="text-blue-400" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Roles & Permissions</h1>
          <p className="text-white/50 text-sm mt-1">Read-only overview of access levels across the platform.</p>
        </div>
      </div>

      <div className="glass-card-static rounded-2xl overflow-hidden shadow-xl border border-white/10">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr>
                <th className="p-4 bg-slate-900/50 border-b border-white/10 border-r min-w-[200px]">
                  <span className="font-semibold text-white/80">Features & Capabilities</span>
                </th>
                {permissionsData.map((role) => (
                  <th key={role.role} className="p-4 bg-slate-900/50 border-b border-white/10 min-w-[140px] text-center group">
                    <div className="font-semibold text-white">{role.label}</div>
                    <div className="text-[10px] text-white/40 mt-1 font-normal hidden group-hover:block transition-all absolute bg-slate-800 p-2 rounded-lg shadow-lg z-10 w-48 -translate-x-1/2 left-1/2 border border-white/10">
                      {role.description}
                    </div>
                    <div className="text-[10px] text-white/40 mt-1 font-normal group-hover:opacity-0">Hover for info</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {features.map((feature, idx) => (
                <tr key={feature} className={idx % 2 === 0 ? 'bg-white/[0.02]' : 'bg-transparent'}>
                  <td className="p-4 border-b border-white/10 border-r border-r-white/10 text-sm font-medium text-white/70">
                    {feature}
                  </td>
                  {permissionsData.map((role) => (
                    <td key={role.role} className="p-4 border-b border-white/10 text-center">
                      {role.permissions[feature] ? (
                        <div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400">
                          <Check size={14} strokeWidth={3} />
                        </div>
                      ) : (
                        <div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-800/50 text-slate-500">
                          <X size={14} strokeWidth={2} />
                        </div>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="glass-card-static p-4 rounded-xl border-l-4 border-blue-500 flex items-start gap-3">
        <Info className="text-blue-400 mt-0.5 shrink-0" size={18} />
        <div className="text-sm text-white/70">
          <strong className="text-white block mb-1">Role Hierarchy Notes</strong>
          <ul className="list-disc pl-4 space-y-1 mt-2 text-white/60">
            <li><strong>Super Admins</strong> only manage tenant lifecycles, global settings, and client creation. They cannot see client employee data.</li>
            <li><strong>Client Admins</strong> have full read/write access to their tenant's workforce data but cannot change subscription limits.</li>
            <li><strong>Statutory Admins</strong> can only view and manage employees flagged as "Statutory".</li>
            <li><strong>Branch Managers & Supervisors</strong> only see data scoped to their assigned location/floor.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default PermissionsMatrix;
