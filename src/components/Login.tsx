import React, { useState } from 'react';
import { Lock, AlertCircle, Eye, EyeOff, Sparkles, Users, ShieldCheck } from 'lucide-react';
import {
  isRateLimited,
  recordFailedAttempt,
  clearFailedAttempts,
  sanitizeInput,
  isValidEmail,
  createSecureSession
} from '../lib/security';
import { userService } from '../services/userService';
import { supabase } from '../lib/supabase';
import { generateDeviceFingerprint } from '../utils/deviceFingerprint';

interface LoginProps {
  onLogin: (user: { email: string; role: string; location?: string; staffId?: string; staffName?: string }) => void;
}


const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const staffLoginEnabled = localStorage.getItem('staffLoginEnabled') !== 'false';
  const [loginMode, setLoginMode] = useState<'admin' | 'staff'>(staffLoginEnabled ? 'staff' : 'admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showStaffPassword, setShowStaffPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // First-login / forced password change flow
  const [mustSetPassword, setMustSetPassword] = useState<null | {
    contactNumber: string;
    currentCredential: string; // joined_date or current password used to log in
    deviceFingerprint: string;
    staff: any;
  }>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');


  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const sanitizedEmail = sanitizeInput(email.toLowerCase().trim());

    if (!isValidEmail(sanitizedEmail)) {
      setError('Please enter a valid email address');
      setLoading(false);
      return;
    }

    if (!password.trim()) {
      setError('Please enter your password');
      setLoading(false);
      return;
    }

    const rateLimitStatus = isRateLimited(sanitizedEmail);
    if (rateLimitStatus.limited) {
      setError(`Account temporarily locked. Please try again in ${rateLimitStatus.remainingTime} minutes.`);
      setLoading(false);
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 500));

    try {
      const result = await userService.validateLogin(sanitizedEmail, password);

      if (result) {
        const { user: dbUser, sessionToken } = result;
        clearFailedAttempts(sanitizedEmail);

        const session = {
          ...createSecureSession({
            email: dbUser.email,
            role: dbUser.role,
            location: dbUser.location
          }),
          sessionToken
        };

        localStorage.setItem('staffManagementLogin', JSON.stringify(session));

        onLogin({
          email: dbUser.email,
          role: dbUser.role,
          location: dbUser.location || undefined
        });
      } else {
        recordFailedAttempt(sanitizedEmail);
        setError('Invalid email address or password. Please check and try again.');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('Unable to connect to server. Please try again.');
    }

    setLoading(false);
  };





  const finalizeStaffSession = (matchedStaff: any) => {
    const session = {
      user: {
        email: `staff_${matchedStaff.id}`,
        role: 'staff',
        location: matchedStaff.location,
        staffId: matchedStaff.id,
        staffName: matchedStaff.name
      },
      expiresAt: Date.now() + (24 * 60 * 60 * 1000)
    };
    localStorage.setItem('staffManagementLogin', JSON.stringify(session));
    onLogin({
      email: `staff_${matchedStaff.id}`,
      role: 'staff',
      location: matchedStaff.location,
      staffId: matchedStaff.id,
      staffName: matchedStaff.name
    });
  };

  const handleStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

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

    const staffLoginEnabledNow = localStorage.getItem('staffLoginEnabled');
    if (staffLoginEnabledNow === 'false') {
      setError('Staff login is currently disabled by admin');
      setLoading(false);
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 300));

    try {
      const currentFingerprint = await generateDeviceFingerprint();
      // Send both `password` and `joinedDate` when the input looks like a
      // DDMMYYYY string — the server will accept whichever matches. Otherwise
      // only send it as `password`.
      const looksLikeDate = /^\d{8}$/.test(trimmedPassword);
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/staff-login`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
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
        } else {
          setError('Invalid mobile number or password. Please check your credentials.');
        }
        setLoading(false);
        return;
      }

      const matchedStaff = payload.staff;

      if (payload.mustChangePassword) {
        // Do not create a session yet — force the staff member to pick a real
        // password first. finalizeStaffSession runs only after the set-password
        // call succeeds.
        setMustSetPassword({
          contactNumber: trimmedMobile,
          currentCredential: trimmedPassword,
          deviceFingerprint: currentFingerprint,
          staff: matchedStaff,
        });
        setLoading(false);
        return;
      }

      finalizeStaffSession(matchedStaff);
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
    // Refuse letting them "reuse" the joined-date fallback as their new password.
    if (/^\d{8}$/.test(newPassword) && newPassword === mustSetPassword.currentCredential) {
      setError('Please choose a new password different from your joined date');
      return;
    }

    setLoading(true);
    try {
      const looksLikeDate = /^\d{8}$/.test(mustSetPassword.currentCredential);
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/staff-set-password`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            contactNumber: mustSetPassword.contactNumber,
            deviceFingerprint: mustSetPassword.deviceFingerprint,
            ...(looksLikeDate
              ? { joinedDate: mustSetPassword.currentCredential }
              : { currentPassword: mustSetPassword.currentCredential }),
            newPassword,
          }),
        },
      );
      const payload = await res.json();
      if (!res.ok) {
        setError(payload?.error === 'device_locked'
          ? 'Device mismatch — contact Admin.'
          : 'Could not update password. Please try again.');
        setLoading(false);
        return;
      }
      finalizeStaffSession(mustSetPassword.staff);
    } catch (err) {
      console.error('Set password error:', err);
      setError('Unable to reach server. Please try again.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gradient-to-r from-purple-600/20 to-blue-600/20 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-gradient-to-r from-pink-600/20 to-purple-600/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />

      <div className="max-w-md w-full relative z-10">
        <div className="glass-card-static p-8 md:p-10">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="w-20 h-20 mx-auto mb-6 relative">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl rotate-6 opacity-50" />
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center">
                <Sparkles className="text-white" size={36} />
              </div>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-gradient mb-2">
              Staff Management
            </h1>
            <p className="text-[var(--text-muted)]">Sign in to your account</p>
          </div>

          {/* Login Mode Toggle */}
          <div className={`grid ${staffLoginEnabled ? 'grid-cols-2' : 'grid-cols-1'} gap-1 mb-6 p-1 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)]`}>
            <button
              type="button"
              onClick={() => { setLoginMode('admin'); setError(''); }}
              className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                loginMode === 'admin'
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <ShieldCheck size={14} />
              <span className="hidden sm:inline">Admin/Mgr</span><span className="sm:hidden">Admin</span>
            </button>
            {staffLoginEnabled && (
              <button
                type="button"
                onClick={() => { setLoginMode('staff'); setError(''); }}
                className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                  loginMode === 'staff'
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Users size={14} /> Staff
              </button>
            )}
          </div>


          {/* Admin Login Form */}
          {loginMode === 'admin' && (
            <form onSubmit={handleAdminSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-premium"
                  placeholder="Enter your email"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-premium pr-12"
                    placeholder="Enter your password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 z-20 p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 transition-colors"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={18} color="#ffffff" /> : <Eye size={18} color="#ffffff" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30">
                  <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={18} />
                  <span className="text-red-600 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{error}</span>
                </div>
              )}

              <button type="submit" disabled={loading} className="w-full btn-premium py-4 text-base disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden group">
                <span className="relative z-10 flex items-center justify-center gap-2">
                  {loading ? (
                    <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Signing in...</>
                  ) : (
                    <><Lock size={18} />Sign In</>
                  )}
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
              </button>
            </form>
          )}

          {/* Staff Login Form */}
          {loginMode === 'staff' && (
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
                    />
                    <p className="text-xs text-[var(--text-muted)] mt-1">Username is your registered mobile number</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Joined Date (DDMMYYYY)</label>
                    <input
                      type="text"
                      value={joinedDate}
                      onChange={(e) => setJoinedDate(e.target.value.replace(/\D/g, '').slice(0, 8))}
                      className="input-premium"
                      placeholder="e.g. 15032024"
                      maxLength={8}
                      required
                    />
                    <p className="text-xs text-[var(--text-muted)] mt-1">Password is your joining date in DDMMYYYY format</p>
                  </div>

                  {error && (
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30">
                      <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={18} />
                      <span className="text-red-600 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{error}</span>
                    </div>
                  )}

                  <button type="submit" disabled={loading} className="w-full py-4 text-base disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden group rounded-xl font-semibold text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 transition-all shadow-lg">
                    <span className="relative z-10 flex items-center justify-center gap-2">
                      {loading ? (
                        <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Signing in...</>
                      ) : (
                        <><Users size={18} />Staff Sign In</>
                      )}
                    </span>
                  </button>
              </form>
            </div>
          )}

          <p className="text-center text-[var(--text-muted)] text-xs mt-6">
            {loginMode === 'admin' ? 'Secure login for authorized personnel only'
              : 'View-only access to your own records'}
          </p>


        </div>
      </div>
    </div>
  );
};

export default Login;
