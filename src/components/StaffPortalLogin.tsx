import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, Sparkles, Users, Camera, Upload, Check, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { compressImage } from '../utils/imageCompression';
import { generateDeviceFingerprint } from '../utils/deviceFingerprint';
import { hardResetAppCache } from '../lib/cacheService';

interface StaffPortalLoginProps {
  slug: string;
  onLogin: (user: any) => void;
}

const StaffPortalLogin: React.FC<StaffPortalLoginProps> = ({ slug, onLogin }) => {
  const [tenant, setTenant] = useState<any>(null);
  const [loadingTenant, setLoadingTenant] = useState(true);
  
  const [mobileNumber, setMobileNumber] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [showStaffPassword, setShowStaffPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [doj, setDoj] = useState('');
  const [managerPin, setManagerPin] = useState('');

  // First-login / forced password change flow
  const [mustSetPassword, setMustSetPassword] = useState<null | {
    contactNumber: string;
    currentCredential: string;
    deviceFingerprint: string;
    staff: any;
  }>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [staffPhoto, setStaffPhoto] = useState<string>('');

  useEffect(() => {
    const fetchTenant = async () => {
      if (!slug) return;
      try {
        const { data, error } = await supabase.functions.invoke('tenant-lookup', {
          body: { slug },
        });
        if (error || !data || (data as any).error) {
          setTenant(null);
        } else {
          setTenant(data as any);
        }

      } catch (err) {
        console.error('Error fetching tenant:', err);
      } finally {
        setLoadingTenant(false);
      }
    };
    fetchTenant();
  }, [slug]);

  const finalizeStaffSession = (matchedStaff: any, sessionToken?: string) => {
    const session = {
      user: {
        email: `staff_${matchedStaff.id}`,
        role: 'staff',
        location: matchedStaff.location,
        staffId: matchedStaff.id,
        staffName: matchedStaff.name,
        staffRecord: matchedStaff,
      },
      sessionToken: sessionToken || null,
      expiresAt: Date.now() + (24 * 60 * 60 * 1000)
    };
    localStorage.setItem('staffManagementLogin', JSON.stringify(session));
    if (sessionToken) {
      localStorage.setItem('sessionToken', sessionToken);
    }
    onLogin({
      email: `staff_${matchedStaff.id}`,
      role: 'staff',
      location: matchedStaff.location,
      staffId: matchedStaff.id,
      staffName: matchedStaff.name,
      staffRecord: matchedStaff,
    });
  };

  const handleStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!tenant || !tenant.staff_portal_enabled || tenant.status !== 'ACTIVE') {
      setError('Staff login is currently disabled for this organisation.');
      setLoading(false);
      return;
    }

    const trimmedMobile = mobileNumber.trim();
    const trimmedPassword = staffPassword.trim();

    if (!trimmedMobile || trimmedMobile.length < 10) {
      setError('Please enter a valid 10-digit mobile number');
      setLoading(false);
      return;
    }

    if (!trimmedPassword) {
      setError('Please enter your password (first-time users: use your joined date as DDMMYYYY)');
      setLoading(false);
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 300));

    try {
      const currentFingerprint = await generateDeviceFingerprint();
      const looksLikeDate = /^\d{8}$/.test(trimmedPassword);
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://nsmppwnpdxomjmgrtqka.supabase.co";
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/staff-login`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '',
          },
          body: JSON.stringify({
            contactNumber: trimmedMobile,
            password: trimmedPassword,
            ...(looksLikeDate ? { joinedDate: trimmedPassword } : {}),
            deviceFingerprint: currentFingerprint,
          }),
        },
      );
      const payload = await res.json();

      if (!res.ok) {
        if (payload?.error === 'device_locked') {
          setError('This account is already registered to another device. Please contact Admin to reset your device lock.');
        } else if (payload?.error === 'staff_portal_disabled') {
          setError('Staff login is currently disabled for your organisation. Please contact your administrator.');
        } else {
          setError('Invalid mobile number or password. Please check your credentials.');
        }
        setLoading(false);
        return;
      }

      const matchedStaff = payload.staff;
      // Double check tenant matches to prevent cross-tenant login via generic URL if they guessed the slug
      if (matchedStaff.tenant_id && matchedStaff.tenant_id !== tenant.id) {
          setError('Invalid credentials for this organisation portal.');
          setLoading(false);
          return;
      }
      
      const sessionToken = payload.sessionToken;

      if (payload.mustChangePassword) {
        setMustSetPassword({
          contactNumber: trimmedMobile,
          currentCredential: trimmedPassword,
          deviceFingerprint: currentFingerprint,
          staff: matchedStaff,
        });
        if (matchedStaff.photo_url || matchedStaff.photo) {
          setStaffPhoto(matchedStaff.photo_url || matchedStaff.photo);
        }
        setLoading(false);
        return;
      }

      finalizeStaffSession(matchedStaff, sessionToken);
    } catch (err) {
      console.error('Staff login error:', err);
      setError('Unable to connect to server. Please try again.');
    }

    setLoading(false);
  };

  const handleStaffSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mustSetPassword) return;
    setError('');

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (/^\d{8}$/.test(newPassword) && newPassword === mustSetPassword.currentCredential) {
      setError('Please choose a new password different from your joined date');
      return;
    }

    setLoading(true);
    try {
      const looksLikeDate = /^\d{8}$/.test(mustSetPassword.currentCredential);
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://nsmppwnpdxomjmgrtqka.supabase.co";
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/staff-set-password`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '',
          },
          body: JSON.stringify({
            contactNumber: mustSetPassword.contactNumber,
            deviceFingerprint: mustSetPassword.deviceFingerprint,
            ...(looksLikeDate
              ? { joinedDate: mustSetPassword.currentCredential }
              : { currentPassword: mustSetPassword.currentCredential }),
            newPassword,
            ...(staffPhoto ? { photo: staffPhoto } : {}),
          }),
        },
      );
      const payload = await res.json();
      if (!res.ok) {
        setError(payload?.message || (payload?.error === 'device_locked'
          ? 'Device mismatch — contact Admin.'
          : (payload?.error || 'Could not update password. Please try again.')));
        setLoading(false);
        return;
      }
      finalizeStaffSession(mustSetPassword.staff, payload.sessionToken);
    } catch (err) {
      console.error('Set password error:', err);
      setError('Unable to reach server. Please try again.');
    }
    setLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedMobile = mobileNumber.replace(/[^0-9]/g, '').slice(0, 10);
    if (trimmedMobile.length !== 10) {
      setError('Please enter a valid 10-digit mobile number');
      return;
    }

    if (!doj) {
      setError('Please enter your date of joining');
      return;
    }

    if (!managerPin || managerPin.length !== 4) {
      setError('Please enter the 4-digit Manager Reset PIN');
      return;
    }

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://nsmppwnpdxomjmgrtqka.supabase.co";
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/staff-password-reset`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '',
          },
          body: JSON.stringify({
            contactNumber: trimmedMobile,
            doj,
            managerPin,
            newPassword,
            tenantSlug: slug
          }),
        },
      );
      const payload = await res.json();
      if (!res.ok) {
        setError(payload?.message || payload?.error || 'Could not reset password. Please check your details.');
        setLoading(false);
        return;
      }
      
      // Success
      setIsForgotPassword(false);
      setDoj('');
      setManagerPin('');
      setNewPassword('');
      setConfirmPassword('');
      setStaffPassword('');
      setError('');
      alert('Password reset successful. Please sign in with your new password.');
      
    } catch (err) {
      console.error('Forgot password error:', err);
      setError('Unable to reach server. Please try again.');
    }
    setLoading(false);
  };

  if (loadingTenant) {
    return <div className="min-h-screen flex items-center justify-center p-4"><div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-600 rounded-full animate-spin" /></div>;
  }

  if (!tenant || !tenant.staff_portal_enabled || tenant.status !== 'ACTIVE') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center">
        <AlertCircle size={48} className="text-red-500 mb-4" />
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Portal Unavailable</h1>
        <p className="text-[var(--text-secondary)]">The staff portal you are looking for does not exist or is currently disabled.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-x-clip">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gradient-to-r from-blue-500/10 to-sky-400/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-gradient-to-r from-sky-400/10 to-blue-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />

      <div className="max-w-md w-full relative z-10 space-y-4">
        <div className="glass-card-static p-8 md:p-10">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="w-20 h-20 mx-auto mb-6 relative">
              <div className="absolute inset-0 bg-gradient-to-br from-sky-400 to-blue-600 rounded-2xl rotate-6 opacity-40" />
              <div className="absolute inset-0 bg-gradient-to-br from-sky-400 to-blue-600 rounded-2xl flex items-center justify-center">
                <Sparkles className="text-white" size={36} />
              </div>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-gradient mb-2">
              {tenant.name}
            </h1>
            <p className="text-[var(--text-muted)]">Staff Portal Login</p>
          </div>

          {/* Staff Login Form */}
          {!mustSetPassword ? (
            <div className="space-y-4">
              <form onSubmit={handleStaffSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Mobile Number</label>
                  <input
                    type="tel"
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    className="input-premium"
                    placeholder="Enter your 10-digit mobile number"
                    maxLength={10}
                    required
                    autoComplete="username"
                  />
                  <p className="text-xs text-[var(--text-muted)] mt-1">Username is your registered mobile number</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Password</label>
                  <div className="relative">
                    <input
                      type={showStaffPassword ? 'text' : 'password'}
                      value={staffPassword}
                      onChange={(e) => setStaffPassword(e.target.value.slice(0, 128))}
                      className="input-premium pr-12"
                      placeholder="Your password (or DDMMYYYY joined date)"
                      maxLength={128}
                      required
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowStaffPassword(v => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-600 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400 transition-colors focus:outline-none flex items-center justify-center rounded-md hover:bg-slate-200/50 dark:hover:bg-slate-700/50"
                      aria-label={showStaffPassword ? 'Hide password' : 'Show password'}
                    >
                      {showStaffPassword ? <EyeOff size={18} className="text-slate-600 dark:text-slate-300" /> : <Eye size={18} className="text-slate-600 dark:text-slate-300" />}
                    </button>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    First-time login: use your joined date in DDMMYYYY format. You'll be asked to set a new password.
                  </p>
                </div>

                {error && (
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30">
                    <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={18} />
                    <span className="text-red-600 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{error}</span>
                  </div>
                )}

                <button type="submit" disabled={loading} className="w-full py-4 text-base disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden group rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-all shadow-lg">
                  <span className="relative z-10 flex items-center justify-center gap-2 !text-white">
                    {loading ? (
                      <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span className="!text-white">Signing in...</span></>
                    ) : (
                      <><Users size={18} className="!text-white" /><span className="!text-white">Staff Sign In</span></>
                    )}
                  </span>
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                </button>
                
                {tenant && tenant.staff_device_lock_enabled === false && (
                  <div className="mt-4 text-center">
                    <button type="button" onClick={() => { setIsForgotPassword(true); setError(''); }} className="text-sm font-medium text-blue-500 hover:text-blue-400 transition-colors">
                      Forgot Password?
                    </button>
                  </div>
                )}
              </form>
            </div>
          ) : isForgotPassword ? (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Mobile Number</label>
                <input
                  type="tel"
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  className="input-premium"
                  placeholder="Enter your registered mobile number"
                  maxLength={10}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Date of Joining (DDMMYYYY)</label>
                <input
                  type="text"
                  value={doj}
                  onChange={(e) => setDoj(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  className="input-premium"
                  placeholder="DDMMYYYY"
                  maxLength={8}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Manager Reset PIN</label>
                <input
                  type="text"
                  value={managerPin}
                  onChange={(e) => setManagerPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="input-premium font-mono tracking-widest"
                  placeholder="4-digit PIN from your manager"
                  maxLength={4}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="input-premium"
                  placeholder="Enter new password"
                  minLength={6}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input-premium"
                  placeholder="Confirm new password"
                  minLength={6}
                  required
                />
              </div>
              {error && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30">
                  <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={18} />
                  <span className="text-red-600 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{error}</span>
                </div>
              )}
              <button type="submit" disabled={loading} className="w-full py-4 text-base disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-all shadow-lg">
                {loading ? 'Resetting...' : 'Reset Password'}
              </button>
              <button
                type="button"
                onClick={() => { setIsForgotPassword(false); setError(''); }}
                className="w-full py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                Back to Login
              </button>
            </form>
          ) : (
            <form onSubmit={handleStaffSetPassword} className="space-y-4">
              <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30">
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  Welcome {mustSetPassword.staff.name}! Please set a new password to continue.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">New Password</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value.slice(0, 128))}
                    className="input-premium pr-12"
                    placeholder="At least 6 characters"
                    minLength={6}
                    maxLength={128}
                    required
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-600 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400 transition-colors focus:outline-none flex items-center justify-center rounded-md hover:bg-slate-200/50 dark:hover:bg-slate-700/50"
                    aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                  >
                    {showNewPassword ? <EyeOff size={18} className="text-slate-600 dark:text-slate-300" /> : <Eye size={18} className="text-slate-600 dark:text-slate-300" />}
                  </button>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Profile Photo (Optional)</label>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-blue-500/10 border-2 border-blue-500/30 flex items-center justify-center overflow-hidden shrink-0">
                    {staffPhoto ? (
                      <img src={staffPhoto} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <Camera size={24} className="text-blue-400" />
                    )}
                  </div>
                  <label className="px-4 py-2.5 text-sm cursor-pointer flex items-center gap-2 font-bold bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md transition-all shrink-0" style={{ color: '#ffffff' }}>
                    <Upload size={16} style={{ color: '#ffffff' }} />
                    Upload Photo
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          try {
                            const compressed = await compressImage(file);
                            setStaffPhoto(compressed);
                          } catch (err) {
                            console.error('Error compressing image:', err);
                            setError('Failed to process image');
                          }
                        }
                      }}
                    />
                  </label>
                  {staffPhoto && <Check size={20} className="text-emerald-500 shrink-0" />}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Confirm Password</label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value.slice(0, 128))}
                    className="input-premium pr-12"
                    placeholder="Re-enter new password"
                    minLength={6}
                    maxLength={128}
                    required
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-600 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400 transition-colors focus:outline-none flex items-center justify-center rounded-md hover:bg-slate-200/50 dark:hover:bg-slate-700/50"
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <EyeOff size={18} className="text-slate-600 dark:text-slate-300" /> : <Eye size={18} className="text-slate-600 dark:text-slate-300" />}
                  </button>
                </div>
              </div>
              {error && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30">
                  <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={18} />
                  <span className="text-red-600 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{error}</span>
                </div>
              )}
              <button type="submit" disabled={loading} className="w-full py-4 text-base disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-all shadow-lg">
                {loading ? 'Saving...' : 'Save Password & Continue'}
              </button>
              <button
                type="button"
                onClick={() => { setMustSetPassword(null); setNewPassword(''); setConfirmPassword(''); setStaffPassword(''); setError(''); }}
                className="w-full py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                Cancel
              </button>
            </form>
          )}

          <div className="mt-4 pt-4 border-t border-[var(--glass-border)] text-center">
            <button
              type="button"
              onClick={hardResetAppCache}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300 hover:bg-amber-500/20 text-xs font-semibold transition-colors shadow-sm"
              title="Purges all local storage, service worker, and cached app data"
            >
              ⚡ Hard Reset App & Clear Cache
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};

export default StaffPortalLogin;
