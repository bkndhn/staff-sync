import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Users, Plus, Edit2, Trash2, Eye, EyeOff, Shield, MapPin, Save, X, AlertCircle, Check, Copy, Clock, TrendingUp, QrCode, ChevronDown, Cpu, Globe, Layers } from 'lucide-react';
import { userService, AppUser, CreateUserInput, UpdateUserInput } from '../services/userService';
import { locationService, Branch, type Location } from '../services/locationService';
import { staffService } from '../services/staffService';
import { floorService } from '../services/floorService';
import { appSettingsService } from '../services/appSettingsService';
import { getQRRefreshSeconds, setQRRefreshSeconds } from '../utils/qrCrypto';
import ShiftWindowsPanel from './ShiftWindowsPanel';
import AttendanceRulesPanel from './AttendanceRulesPanel';
import DeviceIntegration from './DeviceIntegration';
import PayrollOverridesPanel from './SalaryOverridesPanel';
import PunctualityPolicyPanel from './PunctualityPolicyPanel';
const SalaryOverridesPanel = PayrollOverridesPanel;
import StatutoryPortalSettingsPanel from './StatutoryPortalSettingsPanel';
import StatutoryCredentialsPanel from './StatutoryCredentialsPanel';
import FaceTuningPanel from './face/FaceTuningPanel';
import { WorkflowBuilder } from './WorkflowBuilder';
import { PayrollRulesEngine } from './PayrollRulesEngine';
import { BiometricIntegrationHub } from './BiometricIntegrationHub';
import { GeofenceSettingsPanel } from './GeofenceSettingsPanel';
import { FeatureTogglesPanel } from './FeatureTogglesPanel';
import { StaffPortalSettingsPanel } from './StaffPortalSettingsPanel';

import { userPreferencesService } from '../services/userPreferencesService';

interface SettingsProps {
    userRole: string;
    currentUserEmail?: string;
    tenantId?: string;
}

// Native-style collapsible settings section
const SettingsSection: React.FC<{
    title: string;
    subtitle?: string;
    icon: any;
    defaultOpen?: boolean;
    children: React.ReactNode;
}> = ({ title, subtitle, icon: Icon, defaultOpen = false, children }) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--bg-card)] overflow-hidden">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center gap-3 px-4 py-3 min-h-[56px] text-left active:opacity-80 transition-opacity"
            >
                <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center flex-shrink-0">
                    <Icon size={18} className="text-blue-500" />
                </div>
                <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-semibold text-[var(--text-primary)] truncate">{title}</h2>
                    {subtitle && <p className="text-[11px] text-[var(--text-muted)] truncate">{subtitle}</p>}
                </div>
                <ChevronDown
                    size={18}
                    className={`text-[var(--text-muted)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                />
            </button>
            {open && <div className="px-3 pb-3 space-y-3 md:px-4 md:pb-4">{children}</div>}
        </div>
    );
};


interface CredentialsModalProps {
    credentials: { email: string; password: string };
    locationName: string;
    onClose: () => void;
}

// Credentials Modal Component
const CredentialsModal: React.FC<CredentialsModalProps> = ({ credentials, locationName, onClose }) => {
    const [copiedField, setCopiedField] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);

    const copyToClipboard = async (text: string, field: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedField(field);
            setTimeout(() => setCopiedField(null), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
                <div className="text-center mb-6">
                    <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl flex items-center justify-center">
                        <Check className="text-white" size={32} />
                    </div>
                    <h3 className="text-xl font-bold text-white">Manager Account Created</h3>
                    <p className="text-white/60 text-sm mt-1">for {locationName}</p>
                </div>

                <div className="space-y-4 mb-6">
                    <div className="glass-card-static p-4 rounded-xl">
                        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Email</label>
                        <div className="flex items-center justify-between">
                            <span className="text-[var(--text-primary)] font-mono text-sm break-all">{credentials.email}</span>
                            <button
                                onClick={() => copyToClipboard(credentials.email, 'email')}
                                className={`p-2 rounded-lg transition-colors flex-shrink-0 ml-2 ${copiedField === 'email' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}
                                title="Copy Email"
                            >
                                {copiedField === 'email' ? <Check size={16} /> : <Copy size={16} />}
                            </button>
                        </div>
                    </div>

                    <div className="glass-card-static p-4 rounded-xl">
                        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Password</label>
                        <div className="flex items-center justify-between">
                            <span className="text-[var(--text-primary)] font-mono tracking-wider">
                                {showPassword ? credentials.password : '••••••••••••'}
                            </span>
                            <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                                <button
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="p-2 rounded-lg bg-white/5 text-white/60 hover:bg-white/10 transition-colors"
                                    title={showPassword ? "Mask Password" : "Reveal Password"}
                                >
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                                <button
                                    onClick={() => copyToClipboard(credentials.password, 'password')}
                                    className={`p-2 rounded-lg transition-colors ${copiedField === 'password' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}
                                    title="Copy Password"
                                >
                                    {copiedField === 'password' ? <Check size={16} /> : <Copy size={16} />}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 mb-6">
                    <AlertCircle className="text-amber-400 flex-shrink-0" size={18} />
                    <p className="text-amber-400 text-sm">Save these credentials securely. You can change them in Settings.</p>
                </div>

                <button onClick={onClose} className="w-full btn-premium">
                    Done
                </button>
            </div>
        </div>
    );
};

// Mobile User Card Component
const UserCard: React.FC<{
    user: AppUser;
    onEdit: () => void;
    onDelete: () => void;
    formatLastLogin: (lastLogin: string | null | undefined) => string; currentUserRole: string;
}> = ({ user, onEdit, onDelete, formatLastLogin, currentUserRole }) => {
    return (
        <div className="glass-card-static p-4 rounded-xl space-y-3">
            <div className="flex items-start justify-between">
                <div>
                    <h3 className="font-semibold text-white text-lg">{user.full_name}</h3>
                    <p className="text-white/60 text-sm font-mono break-all">{user.email}</p>
                </div>
                <span className={`badge-premium ${user.role === 'admin' ? 'badge-purple' : user.role === 'statutory_admin' ? 'badge-success' : user.role === 'floor_supervisor' ? 'badge-warning' : 'badge-info'}`}>
                    {user.role === 'admin' ? 'Admin' : user.role === 'statutory_admin' ? 'Statutory Admin' : user.role === 'floor_supervisor' ? 'Zone Sup' : 'Manager'}
                </span>
            </div>

            <div className="flex items-center gap-4 text-sm">
                {user.location && (
                    <span className="flex items-center gap-1 text-white/60">
                        <MapPin size={14} />
                        {user.location}
                    </span>
                )}
                <span className="flex items-center gap-1 text-white/50">
                    <Clock size={12} />
                    {formatLastLogin(user.last_login)}
                </span>
            </div>



            {/* Actions */}
            <div className="flex gap-2 pt-2">
                <button
                    onClick={onEdit}
                    className="flex-1 py-2.5 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 font-medium"
                    style={{ color: '#ffffff' }}
                >
                    <Edit2 size={16} color="#ffffff" />
                    Edit
                </button>
                <button
                    onClick={onDelete}
                    disabled={user.role === "admin" && currentUserRole !== "super_admin"} className="flex-1 py-2.5 px-3 rounded-lg bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-700 transition-colors flex items-center justify-center gap-2 font-medium"
                    style={{ color: '#ffffff' }}
                >
                    <Trash2 size={16} color="#ffffff" />
                    Delete
                </button>
            </div>
        </div>
    );
};

const Settings: React.FC<SettingsProps> = ({ userRole, currentUserEmail, tenantId }) => {
    const [users, setUsers] = useState<AppUser[]>([]);
    const [locations, setLocations] = useState<Location[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingUser, setEditingUser] = useState<AppUser | null>(null);
    const [showDeleteModal, setShowDeleteModal] = useState<AppUser | null>(null);
    const [showCredentialsModal, setShowCredentialsModal] = useState<{ credentials: { email: string; password: string }; locationName: string } | null>(null);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    const [defaultHikeInterval, setDefaultHikeInterval] = useState(12);
    const [hikeSaving, setHikeSaving] = useState(false);
    const [showTodayPunches, setShowTodayPunches] = useState(true);
    const [punchesSaving, setPunchesSaving] = useState(false);
    const [backupBusy, setBackupBusy] = useState(false);
    const [qrRefresh, setQrRefresh] = useState<number>(getQRRefreshSeconds());
    // Form state
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        full_name: '',
        role: 'manager' as 'admin' | 'manager' | 'floor_supervisor' | 'supervisor' | 'statutory_admin',
        location: '',
        floor: ''
    });
    const [floorOptions, setFloorOptions] = useState<{ name: string; locationName: string }[]>([]);
    const [showPassword, setShowPassword] = useState(false);

    // Fetch users and locations on mount
    useEffect(() => {
        loadData();
        appSettingsService.getDefaultHikeInterval().then(setDefaultHikeInterval);
        appSettingsService.getSetting('show_today_punches').then(v => setShowTodayPunches(v !== 'false'));
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [usersRes, locationsRes, staffRes, floorsRes] = await Promise.allSettled([
                userService.getUsers(),
                locationService.getLocations(),
                staffService.getAll(),
                floorService.getFloors()
            ]);

            const usersData = usersRes.status === 'fulfilled' ? usersRes.value : [];
            const locationsData = locationsRes.status === 'fulfilled' ? locationsRes.value : [];
            const staffData = staffRes.status === 'fulfilled' ? staffRes.value : [];
            const floorsData = floorsRes.status === 'fulfilled' ? floorsRes.value : [];

            setUsers(usersData);
            setLocations(locationsData);

            const map = new Map<string, { name: string; locationName: string }>();
            floorsData
                .filter(f => f.isActive !== false)
                .forEach(f => map.set(`${f.locationName}||${f.name}`, { name: f.name, locationName: f.locationName }));
            staffData
                .filter(s => s.floor && s.location)
                .forEach(s => map.set(`${s.location}||${s.floor}`, { name: s.floor!, locationName: s.location }));
            setFloorOptions(Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name)));
        } catch (err) {
            console.error('Error loading data:', err);
            setError('Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setFormData({
            email: '',
            password: '',
            full_name: '',
            role: 'manager',
            location: locations[0]?.name || '',
            floor: ''
        });
        setShowPassword(false);
    };

    const handleAdd = () => {
        resetForm();
        setEditingUser(null);
        setShowAddModal(true);
    };

    const handleEdit = (user: AppUser) => {
        setFormData({
            email: user.email,
            password: '',
            full_name: user.full_name,
            role: (['admin','manager','floor_supervisor','supervisor','statutory_admin'].includes(user.role) ? user.role : 'manager') as any,
            location: user.location || '',
            floor: user.floor || ''
        });
        setEditingUser(user);
        setShowAddModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        try {
            if (editingUser) {
                const updates: UpdateUserInput = {
                    email: formData.email,
                    full_name: formData.full_name,
                    role: formData.role,
                    location: (formData.role === 'manager' || formData.role === 'supervisor' || formData.role === 'floor_supervisor') ? formData.location : null,
                    floor: (formData.role === 'supervisor' || formData.role === 'floor_supervisor') ? formData.floor : null
                };

                if (formData.password) {
                    updates.password = formData.password;
                }

                const updated = await userService.updateUser(editingUser.id, updates);
                if (updated) {
                    setUsers(prev => prev.map(u => u.id === editingUser.id ? updated : u));
                    setSuccess('User updated successfully');
                    setShowAddModal(false);
                    resetForm();
                } else {
                    setError('Failed to update user');
                }
            } else {
                if (!formData.password) {
                    setError('Password is required for new users');
                    return;
                }

                const input: CreateUserInput = {
                    email: formData.email,
                    password: formData.password,
                    full_name: formData.full_name,
                    role: formData.role,
                    location: (formData.role === 'manager' || formData.role === 'supervisor' || formData.role === 'floor_supervisor') ? formData.location : null,
                    floor: (formData.role === 'supervisor' || formData.role === 'floor_supervisor') ? formData.floor : null
                };

                const created = await userService.createUser(input);
                if (created) {
                    setUsers(prev => [...prev, created]);
                    setSuccess('User created successfully');
                    setShowAddModal(false);
                    resetForm();
                } else {
                    setError('Failed to create user. Please try again.');
                }
            }
        } catch (err: any) {
            console.error('Error saving user:', err);
            setError(err?.message || 'An error occurred while saving');
        }
    };

    const handleDelete = async () => {
        if (!showDeleteModal) return;

                // Prevent deleting yourself
        if (showDeleteModal.email === currentUserEmail) {
            setError("You cannot delete your own account.");
            setShowDeleteModal(null);
            return;
        }

        try {
            const success = await userService.deleteUser(showDeleteModal.id);
            if (success) {
                setSuccess('User deleted successfully');
                setShowDeleteModal(null);
                // Always reload full list so stale data is cleared
                const fresh = await userService.getUsers();
                setUsers(fresh);
            } else {
                setError('Failed to delete user. They may not belong to your account.');
            }
        } catch (err) {
            console.error('Error deleting user:', err);
            setError('An error occurred while deleting');
        }
    };

    const formatLastLogin = (lastLogin: string | null | undefined): string => {
        if (!lastLogin) return 'Never';
        const date = new Date(lastLogin);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    };

    // Filter users based on search query
    const filteredUsers = users.filter(user => {
        const query = searchQuery.toLowerCase();
        return (
            user.full_name.toLowerCase().includes(query) ||
            user.email.toLowerCase().includes(query) ||
            (user.location && user.location.toLowerCase().includes(query)) ||
            user.role.toLowerCase().includes(query)
        );
    });

    // Only admins can access settings
    if (userRole !== 'admin') {
        return (
            <div className="p-6 flex items-center justify-center min-h-[60vh]">
                <div className="glass-card-static p-8 text-center max-w-md">
                    <Shield className="mx-auto text-red-400 mb-4" size={48} />
                    <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
                    <p className="text-white/60">Only administrators can access the settings page.</p>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="p-6 flex items-center justify-center min-h-[60vh]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
            </div>
        );
    }

    return (
        <div className="p-2 md:p-6 space-y-4 md:space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="stat-icon stat-icon-primary">
                    <SettingsIcon size={24} />
                </div>
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-white">Settings</h1>
                    <p className="text-white/50 text-sm">Manage user accounts and access</p>
                </div>
            </div>
            {(userRole as string) === 'super_admin' && (
                <SettingsSection
                    title="Feature Toggles"
                    subtitle="Enable or disable heavy modules globally across the tenant."
                    icon={Layers}
                    defaultOpen={true}
                >
                    <FeatureTogglesPanel />
                </SettingsSection>
            )}
            <SettingsSection title="Staff Portal Setup" subtitle="Configure your customized Web URL and staff access" icon={Globe}>
                <StaffPortalSettingsPanel tenantId={tenantId} />
            </SettingsSection>

            <SettingsSection title="General" subtitle="Login, QR and hike defaults" icon={SettingsIcon}>
            {/* QR Refresh Interval */}
            <div className="glass-card-static p-4 rounded-xl flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                        <QrCode size={20} className="text-indigo-400" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="font-semibold text-[var(--text-primary)] text-sm">Attendance QR Refresh Interval</h3>
                        <p className="text-xs text-[var(--text-muted)]">How often the tablet QR rotates. Default 7s. Range 3–60s.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <input
                        type="number"
                        value={qrRefresh}
                        onChange={(e) => setQrRefresh(Number(e.target.value))}
                        className="input-premium w-20 text-center text-sm"
                        min={3}
                        max={60}
                    />
                    <span className="text-sm text-[var(--text-muted)]">sec</span>
                    <button
                        onClick={() => {
                            const saved = setQRRefreshSeconds(qrRefresh);
                            setQrRefresh(saved);
                            setSuccess(`QR refresh set to ${saved}s`);
                            setTimeout(() => setSuccess(''), 3000);
                        }}
                        className="btn-premium px-3 py-1.5 text-xs"
                    >
                        Save
                    </button>
                </div>
            </div>

            {/* Default Payroll Hike Interval */}
            <div className="glass-card-static p-4 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                        <TrendingUp size={20} className="text-amber-400" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-[var(--text-primary)] text-sm">Default Payroll Hike Interval (All Staff)</h3>
                        <p className="text-xs text-[var(--text-muted)]">How often staff are eligible for a salary hike (can be overridden per staff)</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <input
                        type="number"
                        value={defaultHikeInterval}
                        onChange={(e) => setDefaultHikeInterval(Number(e.target.value))}
                        className="input-premium w-20 text-center text-sm"
                        min="1"
                        max="60"
                    />
                    <span className="text-sm text-[var(--text-muted)]">months</span>
                    <button
                        onClick={async () => {
                            setHikeSaving(true);
                            await appSettingsService.setDefaultHikeInterval(defaultHikeInterval);
                            setHikeSaving(false);
                            setSuccess('Hike interval updated');
                            setTimeout(() => setSuccess(''), 3000);
                        }}
                        disabled={hikeSaving}
                        className="btn-premium px-3 py-1.5 text-xs"
                    >
                        {hikeSaving ? '...' : 'Save'}
                    </button>
                </div>
            </div>
            </SettingsSection>

            <SettingsSection title="Access & Compliance" subtitle="Visibility, statutory portal, face tuning" icon={Shield}>
            {/* Show Today's Punches toggle (admin only) */}
            {userRole === 'admin' && (
                <div className="glass-card-static p-4 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                            <Clock size={20} className="text-cyan-400" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-[var(--text-primary)] text-sm">Show Today's Punches on Dashboard</h3>
                            <p className="text-xs text-[var(--text-muted)]">When off, managers/staff won't see IN/OUT times. Admins always see them.</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={showTodayPunches}
                                disabled={punchesSaving}
                                onChange={async (e) => {
                                    const next = e.target.checked;
                                    setShowTodayPunches(next);
                                    setPunchesSaving(true);
                                    await appSettingsService.setSetting('show_today_punches', next ? 'true' : 'false');
                                    setPunchesSaving(false);
                                    setSuccess(`Today's punches ${next ? 'visible to all' : 'hidden from non-admins'}`);
                                    setTimeout(() => setSuccess(''), 3000);
                                }}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-white/30 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
                        </label>
                    </div>
                </div>
            )}

            {userRole === 'admin' && (
                <>
                    <StatutoryPortalSettingsPanel />
                    <StatutoryCredentialsPanel />
                </>
            )}
            {(userRole === 'admin' || userRole === 'manager') && <FaceTuningPanel />}
            {userRole === 'admin' && (
                <div className="mt-4">
                    <GeofenceSettingsPanel />
                </div>
            )}
            </SettingsSection>

            {userRole === 'admin' && (
                <SettingsSection title="Enterprise Workflows" subtitle="Configure multi-level approval chains for leaves and expenses" icon={Users}>
                    <WorkflowBuilder />
                </SettingsSection>
            )}

            {userRole === 'admin' && (
                <SettingsSection title="Custom Payroll Formulas" subtitle="Configure dynamic formulas to override standard payroll mathematics" icon={Cpu}>
                    <PayrollRulesEngine />
                </SettingsSection>
            )}

            <SettingsSection title="Data & Backup" subtitle="Export a full snapshot" icon={Save}>
            {/* Backup all data (admin only) */}
            {userRole === 'admin' && (
                <div className="glass-card-static p-4 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                            <Save size={20} className="text-emerald-400" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-[var(--text-primary)] text-sm">Backup All Data (JSON)</h3>
                            <p className="text-xs text-[var(--text-muted)]">Download a full snapshot of every table. See <code>BACKUP_AND_MIGRATION.md</code> for restore / DR.</p>
                        </div>
                    </div>
                    <button
                        disabled={backupBusy}
                        onClick={async () => {
                            setBackupBusy(true);
                            try {
                                const { exportFullBackup } = await import('../utils/backupExport');
                                await exportFullBackup();
                                setSuccess('Backup downloaded');
                                setTimeout(() => setSuccess(''), 3000);
                            } catch (err: any) {
                                setError(err?.message || 'Backup failed');
                                setTimeout(() => setError(''), 5000);
                            } finally {
                                setBackupBusy(false);
                            }
                        }}
                        className="btn-premium px-4 py-2 text-xs"
                    >
                        {backupBusy ? 'Exporting...' : 'Download Backup'}
                    </button>
                </div>
            )}
            </SettingsSection>

            <SettingsSection title="Attendance & Devices" subtitle="Shifts, smart rules and kiosk" icon={Clock}>
            {/* Biometric & eSSL Integration Hub */}
            <div className="mb-6">
                <BiometricIntegrationHub />
            </div>

            {/* Hardware Device Integration */}
            <div className="mb-6">
                <DeviceIntegration
                    onImportPunches={(records) => {
                        console.log('[DeviceIntegration] Imported', records.length, 'punch records');
                    }}
                />
            </div>

            {/* Shift Windows & Auto Half-Day Rules */}
            <ShiftWindowsPanel />

            {/* Attendance Rules (per-location + global kiosk settings) */}
            <div className="glass-card-static p-4 rounded-xl space-y-3 overflow-hidden min-w-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center shrink-0">
                  <Clock size={20} className="text-purple-400" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-[var(--text-primary)] text-sm">Smart Attendance Rules & Kiosk Settings</h3>
                  <p className="text-xs text-[var(--text-muted)]">Configure morning cutoff, early-exit time, full/half day rules, anti-spoof level, and per-location overrides.</p>
                </div>
              </div>
              <AttendanceRulesPanel />
            </div>
            </SettingsSection>

            <SettingsSection title='Payroll' subtitle="Override configuration" icon={TrendingUp}>
            {/* Payroll Overrides Config */}
            <div className="glass-card-static p-4 rounded-xl space-y-3 mt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                  <Edit2 size={20} className="text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-[var(--text-primary)] text-sm">Payroll Overrides configuration</h3>
                  <p className="text-xs text-[var(--text-muted)]">Select which salary components can be manually overridden in the Payroll Management page.</p>
                </div>
              </div>
              <SalaryOverridesPanel />
            </div>

            {/* Punctuality deduction switches */}
            <div className="glass-card-static p-4 rounded-xl space-y-3 mt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                  <Clock size={20} className="text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-[var(--text-primary)] text-sm">Late / Early Deduction Rules</h3>
                  <p className="text-xs text-[var(--text-muted)]">Turn off late-coming or early-leaving deductions for the whole organisation.</p>
                </div>
              </div>
              <PunctualityPolicyPanel />
            </div>
            </SettingsSection>


            <div className="flex flex-col sm:flex-row gap-3">
                <input
                    type="text"
                    placeholder="Search users..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="input-premium flex-1"
                />
                <button
                    onClick={handleAdd}
                    className="btn-premium flex items-center justify-center gap-2 px-4 py-3"
                >
                    <Plus size={20} />
                    <span>Add User</span>
                </button>
            </div>

            {/* Success/Error Messages */}
            {success && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                    <Check className="text-emerald-400 flex-shrink-0" size={20} />
                    <span className="text-emerald-400 text-sm flex-1">{success}</span>
                    <button onClick={() => setSuccess('')} className="text-emerald-400 hover:text-emerald-300">
                        <X size={18} />
                    </button>
                </div>
            )}
            {error && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30">
                    <AlertCircle className="text-red-400 flex-shrink-0" size={20} />
                    <span className="text-red-400 text-sm flex-1">{error}</span>
                    <button onClick={() => setError('')} className="text-red-400 hover:text-red-300">
                        <X size={18} />
                    </button>
                </div>
            )}

            {/* Users Section */}
            <div className="glass-card-static overflow-hidden">
                <div className="p-4 border-b border-white/10">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Users size={20} />
                        User Accounts ({filteredUsers.length}{searchQuery && ` of ${users.length}`})
                    </h2>
                </div>

                {/* Mobile: Card Layout */}
                <div className="md:hidden p-4 space-y-4">
                    {filteredUsers.length === 0 ? (
                        <p className="text-center py-8 text-white/50">
                            {searchQuery ? 'No users match your search.' : 'No users found. Add a user to get started.'}
                        </p>
                    ) : (
                        filteredUsers.map(user => (
                            <UserCard
                                    currentUserRole={userRole}
                                key={user.id}
                                user={user}
                                onEdit={() => handleEdit(user)}
                                onDelete={() => setShowDeleteModal(user)}
                                formatLastLogin={formatLastLogin}
                            />
                        ))
                    )}
                </div>

                {/* Desktop: Table Layout */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="table-premium w-full">
                        <thead>
                            <tr>
                                <th className="!text-left">Name</th>
                                <th className="!text-left">Email</th>
                                <th className="!text-center">Role</th>
                                <th className="!text-left">Branch</th>
                                <th className="!text-left">Last Login</th>
                                <th className="!text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredUsers.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="text-center py-8 text-white/50">
                                        {searchQuery ? 'No users match your search.' : 'No users found. Add a user to get started.'}
                                    </td>
                                </tr>
                            ) : (
                                filteredUsers.map(user => (
                                    <tr key={user.id}>
                                        <td className="font-medium text-white !text-left">{user.full_name}</td>
                                        <td className="text-white/70 font-mono text-sm !text-left">{user.email}</td>
                                        <td className="!text-center">
                                            <span className={`badge-premium ${user.role === 'admin' ? 'badge-purple' : user.role === 'statutory_admin' ? 'badge-success' : user.role === 'floor_supervisor' ? 'badge-warning' : 'badge-info'}`}>
                                                {user.role === 'admin' ? 'Admin' : user.role === 'statutory_admin' ? 'Statutory Admin' : user.role === 'floor_supervisor' ? 'Zone Sup' : 'Manager'}
                                            </span>
                                        </td>
                                        <td className="!text-left">
                                            {user.location ? (
                                                <span className="flex items-center justify-start gap-1 text-white/70">
                                                    <MapPin size={14} />
                                                    {user.location}
                                                </span>
                                            ) : (
                                                <span className="text-white/40">All Branches</span>
                                            )}
                                        </td>
                                        <td className="!text-left">
                                            <span className="flex items-center justify-start gap-1 text-white/50 text-sm">
                                                <Clock size={12} />
                                                {formatLastLogin(user.last_login)}
                                            </span>
                                        </td>
                                        <td className="!text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                <button
                                                    onClick={() => handleEdit(user)}
                                                    className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 transition-colors"
                                                    style={{ color: '#ffffff' }}
                                                    title="Edit User"
                                                >
                                                    <Edit2 size={16} color="#ffffff" />
                                                </button>
                                                <button
                                                    onClick={() => setShowDeleteModal(user)}
                                                    className="p-2 rounded-lg bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-700 transition-colors"
                                                    style={{ color: '#ffffff' }}
                                                    title="Delete User"
                                                >
                                                    <Trash2 size={16} color="#ffffff" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add/Edit Modal */}
            {showAddModal && (
                <div className="modal-overlay" onClick={() => { setShowAddModal(false); resetForm(); }}>
                    <div className="modal-content max-w-lg" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            {editingUser ? <Edit2 size={20} /> : <Plus size={20} />}
                            {editingUser ? 'Edit User' : 'Add New User'}
                        </h3>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-white/70 mb-1">Full Name *</label>
                                <input
                                    type="text"
                                    value={formData.full_name}
                                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                                    className="input-premium w-full"
                                    required
                                    placeholder="Enter full name"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-white/70 mb-1">Email *</label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="input-premium w-full"
                                    required
                                    placeholder="user@example.com"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-white/70 mb-1">
                                    Password {editingUser ? '(leave empty to keep current)' : '*'}
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        className="input-premium w-full pr-12"
                                        required={!editingUser}
                                        placeholder={editingUser ? '••••••••' : 'Enter password'}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-600 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400 transition-colors focus:outline-none flex items-center justify-center rounded-md hover:bg-slate-200/50 dark:hover:bg-slate-700/50"
                                        aria-label={showPassword ? "Hide password" : "Show password"}
                                    >
                                        {showPassword ? <EyeOff size={18} className="text-slate-600 dark:text-slate-300" /> : <Eye size={18} className="text-slate-600 dark:text-slate-300" />}
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-white/70 mb-1">Role *</label>
                                <select
                                    value={formData.role}
                                    onChange={(e) => {
                                        const newRole = e.target.value as 'admin' | 'manager' | 'floor_supervisor' | 'supervisor' | 'statutory_admin';
                                        setFormData(prev => ({ 
                                            ...prev, 
                                            role: newRole,
                                            location: newRole === 'admin' || newRole === 'statutory_admin' ? '' : prev.location,
                                            floor: (newRole !== 'supervisor' && newRole !== 'floor_supervisor') ? '' : prev.floor
                                        }));
                                    }}
                                    className="input-premium w-full"
                                >
                                    <option value="admin">Admin</option>
                                    <option value="manager">Manager</option>
                                    <option value="supervisor">Supervisor</option>
                                    <option value="floor_supervisor">Zone Supervisor</option>
                                    <option value="statutory_admin">Statutory Admin</option>
                                </select>
                            </div>
                            {(formData.role === 'manager' || formData.role === 'supervisor' || formData.role === 'floor_supervisor') && (
                                <div>
                                    <label className="block text-sm font-medium text-white/70 mb-1">Branch *</label>
                                    <select
                                        value={formData.location}
                                        onChange={(e) => setFormData({ ...formData, location: e.target.value, floor: '' })}
                                        className="input-premium w-full"
                                        required
                                    >
                                        <option value="">Select Branch</option>
                                        {locations.map(loc => (
                                            <option key={loc.id} value={loc.name}>{loc.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            {(formData.role === 'supervisor' || formData.role === 'floor_supervisor') && (
                                <div>
                                    <label className="block text-sm font-medium text-white/70 mb-1">Zone *</label>
                                    <select
                                        value={formData.floor}
                                        onChange={(e) => setFormData({ ...formData, floor: e.target.value })}
                                        className="input-premium w-full"
                                        required
                                    >
                                        <option value="">Select Zone</option>
                                        {floorOptions
                                            .filter(f => !formData.location || f.locationName === formData.location)
                                            .map(f => (
                                                <option key={`${f.locationName}-${f.name}`} value={f.name}>{f.name}</option>
                                            ))}
                                    </select>
                                </div>
                            )}
                            <div className="flex gap-3 pt-4">
                                <button type="submit" className="flex-1 btn-premium flex items-center justify-center gap-2">
                                    <Save size={18} />
                                    {editingUser ? 'Update User' : 'Create User'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setShowAddModal(false); resetForm(); }}
                                    className="flex-1 btn-ghost"
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )
            }

            {/* Delete Confirmation Modal */}
            {
                showDeleteModal && (
                    <div className="modal-overlay" onClick={() => setShowDeleteModal(null)}>
                        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                <Trash2 className="text-red-400" size={20} />
                                Delete User
                            </h3>
                            <p className="text-white/60 mb-6">
                                Are you sure you want to delete <strong className="text-white">{showDeleteModal.full_name}</strong>?
                                This action cannot be undone.
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={handleDelete}
                                    className="flex-1 btn-premium btn-premium-danger"
                                >
                                    Delete
                                </button>
                                <button
                                    onClick={() => setShowDeleteModal(null)}
                                    className="flex-1 btn-ghost"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Credentials Modal */}
            {
                showCredentialsModal && (
                    <CredentialsModal
                        credentials={showCredentialsModal.credentials}
                        locationName={showCredentialsModal.locationName}
                        onClose={() => setShowCredentialsModal(null)}
                    />
                )
            }
        </div >
    );
};

export default Settings;
