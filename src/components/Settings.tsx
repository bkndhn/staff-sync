import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Users, Plus, Edit2, Trash2, Eye, EyeOff, Shield, MapPin, Save, X, AlertCircle, Check, Copy, Clock, TrendingUp } from 'lucide-react';
import { userService, AppUser, CreateUserInput, UpdateUserInput } from '../services/userService';
import { locationService, Location } from '../services/locationService';
import { appSettingsService } from '../services/appSettingsService';
import ShiftWindowsPanel from './ShiftWindowsPanel';

interface SettingsProps {
    userRole: string;
}

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
                        <label className="block text-xs font-medium text-white/50 mb-1">Email</label>
                        <div className="flex items-center justify-between">
                            <span className="text-white font-mono text-sm break-all">{credentials.email}</span>
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
                        <label className="block text-xs font-medium text-white/50 mb-1">Password</label>
                        <div className="flex items-center justify-between">
                            <span className="text-white font-mono tracking-wider">
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
    formatLastLogin: (lastLogin: string | null | undefined) => string;
}> = ({ user, onEdit, onDelete, formatLastLogin }) => {
    return (
        <div className="glass-card-static p-4 rounded-xl space-y-3">
            <div className="flex items-start justify-between">
                <div>
                    <h3 className="font-semibold text-white text-lg">{user.full_name}</h3>
                    <p className="text-white/60 text-sm font-mono break-all">{user.email}</p>
                </div>
                <span className={`badge-premium ${user.role === 'admin' ? 'badge-purple' : 'badge-info'}`}>
                    {user.role === 'admin' ? 'Admin' : 'Manager'}
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
                    className="flex-1 py-2.5 px-3 rounded-lg bg-red-600 hover:bg-red-700 transition-colors flex items-center justify-center gap-2 font-medium"
                    style={{ color: '#ffffff' }}
                >
                    <Trash2 size={16} color="#ffffff" />
                    Delete
                </button>
            </div>
        </div>
    );
};

const Settings: React.FC<SettingsProps> = ({ userRole }) => {
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
    const [staffLoginEnabled, setStaffLoginEnabled] = useState(() => {
        const saved = localStorage.getItem('staffLoginEnabled');
        return saved !== 'false';
    });
    const [defaultHikeInterval, setDefaultHikeInterval] = useState(12);
    const [hikeSaving, setHikeSaving] = useState(false);
    const [showTodayPunches, setShowTodayPunches] = useState(true);
    const [punchesSaving, setPunchesSaving] = useState(false);
    const [backupBusy, setBackupBusy] = useState(false);
    // Form state
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        full_name: '',
        role: 'manager' as 'admin' | 'manager',
        location: ''
    });
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
            const [usersData, locationsData] = await Promise.all([
                userService.getUsers(),
                locationService.getLocations()
            ]);
            setUsers(usersData);
            setLocations(locationsData);
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
            location: locations[0]?.name || ''
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
            role: user.role,
            location: user.location || ''
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
                    location: formData.role === 'manager' ? formData.location : null
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
                    location: formData.role === 'manager' ? formData.location : null
                };

                const created = await userService.createUser(input);
                if (created) {
                    setUsers(prev => [...prev, created]);
                    setSuccess('User created successfully');
                    setShowAddModal(false);
                    resetForm();
                } else {
                    setError('Failed to create user. Email may already exist.');
                }
            }
        } catch (err) {
            console.error('Error saving user:', err);
            setError('An error occurred while saving');
        }
    };

    const handleDelete = async () => {
        if (!showDeleteModal) return;

        try {
            const success = await userService.deleteUser(showDeleteModal.id);
            if (success) {
                setUsers(prev => prev.filter(u => u.id !== showDeleteModal.id));
                setSuccess('User deleted successfully');
                setShowDeleteModal(null);
            } else {
                setError('Failed to delete user');
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

            {/* Staff Self-Service Toggle */}
            <div className="glass-card-static p-4 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                        <Users size={20} className="text-emerald-400" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-[var(--text-primary)] text-sm">Staff Self-Service Login</h3>
                        <p className="text-xs text-[var(--text-muted)]">Allow staff to log in and view their own records (salary, attendance, hikes)</p>
                    </div>
                </div>
                <button
                    onClick={() => {
                        const newVal = !staffLoginEnabled;
                        setStaffLoginEnabled(newVal);
                        localStorage.setItem('staffLoginEnabled', String(newVal));
                    }}
                    className={`relative w-14 h-7 rounded-full transition-colors ${staffLoginEnabled ? 'bg-emerald-500' : 'bg-gray-500'}`}
                >
                    <div className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${staffLoginEnabled ? 'translate-x-7' : 'translate-x-0.5'}`} />
                </button>
            </div>

            {/* Biometric / Fingerprint Device Integration (placeholder) */}
            <div className="glass-card-static p-4 rounded-xl">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                            <Shield size={20} className="text-cyan-400" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-[var(--text-primary)] text-sm">Biometric / Fingerprint Device</h3>
                            <p className="text-xs text-[var(--text-muted)]">
                                Connect any fingerprint attendance device (eSSL, ZKTeco, Realtime, Mantra, Matrix etc.)
                            </p>
                        </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 whitespace-nowrap">
                        Coming Soon
                    </span>
                </div>
                <div className="mt-3 p-3 rounded-lg bg-white/5 border border-white/10 text-xs text-white/60 space-y-1.5">
                    <p className="font-semibold text-white/80">Planned integration options:</p>
                    <ul className="list-disc list-inside space-y-0.5 pl-1">
                        <li><b>CSV / Excel import</b> — export daily punches from any device and upload here</li>
                        <li><b>Cloud API push</b> — eSSL eTimeTrack / ZKTeco BioTime / Realtime Cloud</li>
                        <li><b>Local bridge service</b> — small Windows utility to sync device → app in real time</li>
                    </ul>
                    <p className="text-[10px] text-white/40 mt-2">Tell us your device model and we'll prioritise that integration.</p>
                </div>
            </div>

            {/* Default Salary Hike Interval */}
            <div className="glass-card-static p-4 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                        <TrendingUp size={20} className="text-amber-400" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-[var(--text-primary)] text-sm">Default Salary Hike Interval (All Staff)</h3>
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

            {/* Shift Windows & Auto Half-Day Rules */}
            <ShiftWindowsPanel />

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
                                <th>Name</th>
                                <th>Email</th>
                                <th>Role</th>
                                <th>Location</th>
                                <th>Last Login</th>
                                <th>Actions</th>
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
                                        <td className="font-medium text-white">{user.full_name}</td>
                                        <td className="text-white/70 font-mono text-sm">{user.email}</td>
                                        <td>
                                            <span className={`badge-premium ${user.role === 'admin' ? 'badge-purple' : 'badge-info'}`}>
                                                {user.role === 'admin' ? 'Admin' : 'Manager'}
                                            </span>
                                        </td>
                                        <td>
                                            {user.location ? (
                                                <span className="flex items-center gap-1 text-white/70">
                                                    <MapPin size={14} />
                                                    {user.location}
                                                </span>
                                            ) : (
                                                <span className="text-white/40">All Locations</span>
                                            )}
                                        </td>
                                        <td>
                                            <span className="flex items-center gap-1 text-white/50 text-sm">
                                                <Clock size={12} />
                                                {formatLastLogin(user.last_login)}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="flex items-center gap-2">
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
                                                    className="p-2 rounded-lg bg-red-600 hover:bg-red-700 transition-colors"
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
                                        className="absolute right-2 top-1/2 transform -translate-y-1/2 p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 transition-colors"
                                    >
                                        {showPassword ? <EyeOff size={16} color="#fff" /> : <Eye size={16} color="#fff" />}
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-white/70 mb-1">Role *</label>
                                <select
                                    value={formData.role}
                                    onChange={(e) => setFormData({ ...formData, role: e.target.value as 'admin' | 'manager' })}
                                    className="input-premium w-full"
                                >
                                    <option value="admin">Admin</option>
                                    <option value="manager">Manager</option>
                                </select>
                            </div>
                            {formData.role === 'manager' && (
                                <div>
                                    <label className="block text-sm font-medium text-white/70 mb-1">Location *</label>
                                    <select
                                        value={formData.location}
                                        onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                                        className="input-premium w-full"
                                        required
                                    >
                                        <option value="">Select Location</option>
                                        {locations.map(loc => (
                                            <option key={loc.id} value={loc.name}>{loc.name}</option>
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
