import React, { useState } from 'react';
import { Settings as SettingsIcon, EyeOff, Eye, AlertCircle, Save } from 'lucide-react';
import { User } from '../types';
import { userService } from '../services/userService';

interface Props {
  user: User;
  onUpdateUser: (u: User) => void;
}

const ProfileSettings: React.FC<Props> = ({ user, onUpdateUser }) => {
  const [form, setForm] = useState({
    currentPassword: '',
    newEmail: user.email,
    newPassword: '',
    confirmPassword: ''
  });
  
  const [showPwd, setShowPwd] = useState({ current: false, new: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const inputCls = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.currentPassword) { setError('Current password is required'); return; }
    if (form.newPassword && form.newPassword !== form.confirmPassword) {
      setError('New passwords do not match'); return;
    }
    if (form.newPassword && form.newPassword.length < 8) {
      setError('New password must be at least 8 characters'); return;
    }
    
    setBusy(true); setError(''); setSuccess('');
    try {
      const validation = await userService.validateLogin(user.email, form.currentPassword);
      if (!validation) {
        throw new Error('Incorrect current password');
      }

      if (!user.id) throw new Error('User ID missing from session');
      
      const updatePayload: any = {};
      if (form.newEmail !== user.email) updatePayload.email = form.newEmail;
      if (form.newPassword) updatePayload.password = form.newPassword;
      
      if (Object.keys(updatePayload).length > 0) {
        const updatedUser = await userService.updateUser(user.id, updatePayload);
        if (!updatedUser) throw new Error('Failed to update profile');
        
        onUpdateUser({ ...user, email: form.newEmail });
        setSuccess('Profile updated successfully!');
        setForm(prev => ({ ...prev, currentPassword: '', newPassword: '', confirmPassword: '' }));
      } else {
        setError('No changes to save');
      }
    } catch (err: any) {
      setError(err.message || 'Error updating profile');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
          <SettingsIcon className="text-blue-500" size={20} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Profile Settings</h1>
          <p className="text-sm text-[var(--text-muted)]">Update your account credentials</p>
        </div>
      </div>

      <div className="glass-card p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Email Address</label>
            <input 
              required 
              type="email" 
              value={form.newEmail} 
              onChange={e => setForm({ ...form, newEmail: e.target.value })} 
              className={inputCls} 
            />
          </div>
          
          <div className="pt-2">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">Change Password</h3>
            <p className="text-xs text-[var(--text-muted)] mb-3">Leave blank to keep current password</p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">New Password</label>
                <div className="relative">
                  <input 
                    type={showPwd.new ? "text" : "password"} 
                    value={form.newPassword} 
                    onChange={e => setForm({ ...form, newPassword: e.target.value })} 
                    className={inputCls} 
                  />
                  <button type="button" onClick={() => setShowPwd(p => ({ ...p, new: !p.new }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                    {showPwd.new ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Confirm New Password</label>
                <input 
                  type={showPwd.new ? "text" : "password"} 
                  value={form.confirmPassword} 
                  onChange={e => setForm({ ...form, confirmPassword: e.target.value })} 
                  className={inputCls} 
                />
              </div>
            </div>
          </div>

          <div className="h-px bg-slate-200 dark:bg-slate-700/50" />

          <div className="rounded-xl border border-amber-200 dark:border-amber-900/30 bg-amber-50 dark:bg-amber-900/10 p-4">
            <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-500 mb-1">Current Password Required</h3>
            <p className="text-xs text-amber-700/80 dark:text-amber-500/70 mb-3">Please enter your current password to save changes.</p>
            <div className="relative">
              <input 
                required 
                type={showPwd.current ? "text" : "password"} 
                value={form.currentPassword} 
                onChange={e => setForm({ ...form, currentPassword: e.target.value })} 
                className={inputCls} 
              />
              <button type="button" onClick={() => setShowPwd(p => ({ ...p, current: !p.current }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                {showPwd.current ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-600 dark:text-red-400">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          
          {success && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-600 dark:text-emerald-400">
              {success}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button 
              disabled={busy} 
              className="btn-premium flex items-center gap-2 px-6"
            >
              <Save size={18} />
              {busy ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
          
        </form>
      </div>
    </div>
  );
};

export default ProfileSettings;
