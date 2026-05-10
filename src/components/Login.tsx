import React, { useState, useEffect } from 'react';
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

interface LoginProps {
  onLogin: (user: { email: string; role: string; location?: string; staffId?: string; staffName?: string }) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const staffLoginEnabled = localStorage.getItem('staffLoginEnabled') !== 'false';
  const [loginMode, setLoginMode] = useState<'admin' | 'staff'>(staffLoginEnabled ? 'staff' : 'admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [joinedDate, setJoinedDate] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
        const result = recordFailedAttempt(sanitizedEmail);
        setError('Invalid email address or password. Please check and try again.');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('Unable to connect to server. Please try again.');
    }

    setLoading(false);
  };

  const handleStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const trimmedMobile = mobileNumber.trim();
    const trimmedDate = joinedDate.trim();

    if (!trimmedMobile || trimmedMobile.length < 10) {
      setError('Please enter a valid 10-digit mobile number');
      setLoading(false);
      return;
    }

    if (!trimmedDate || trimmedDate.length !== 8) {
      setError('Please enter joined date in DDMMYYYY format');
      setLoading(false);
      return;
    }

    // Check if staff login is enabled
    const staffLoginEnabledNow = localStorage.getItem('staffLoginEnabled');
    if (staffLoginEnabledNow === 'false') {
      setError('Staff login is currently disabled by admin');
      setLoading(false);
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 300));

    try {
      // Fetch staff with matching contact number (include inactive for past-data viewing)
      const { data: staffData, error: fetchError } = await supabase
        .from('staff')
        .select('*')
        .eq('contact_number', trimmedMobile);

      if (fetchError || !staffData || staffData.length === 0) {
        setError('Invalid mobile number or joined date. Please check your credentials.');
        setLoading(false);
        return;
      }

      // Parse the entered date (DDMMYYYY)
      const enteredDay = trimmedDate.substring(0, 2);
      const enteredMonth = trimmedDate.substring(2, 4);
      const enteredYear = trimmedDate.substring(4, 8);

      // Find matching staff by joined date
      const matchedStaff = staffData.find(s => {
        const jd = s.joined_date;
        if (!jd) return false;

        const joinedParsed = new Date(jd);
        if (isNaN(joinedParsed.getTime())) return false;

        const jDay = String(joinedParsed.getDate()).padStart(2, '0');
        const jMonth = String(joinedParsed.getMonth() + 1).padStart(2, '0');
        const jYear = String(joinedParsed.getFullYear());

        return enteredDay === jDay && enteredMonth === jMonth && enteredYear === jYear;
      });

      if (!matchedStaff) {
        setError('Invalid mobile number or joined date. Please check your credentials.');
        setLoading(false);
        return;
      }

      // Create a staff session
      const session = {
        user: {
          email: `staff_${matchedStaff.id}`,
          role: 'staff',
          location: matchedStaff.location,
          staffId: matchedStaff.id,
          staffName: matchedStaff.name
        },
        expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
      };

      localStorage.setItem('staffManagementLogin', JSON.stringify(session));

      onLogin({
        email: `staff_${matchedStaff.id}`,
        role: 'staff',
        location: matchedStaff.location,
        staffId: matchedStaff.id,
        staffName: matchedStaff.name
      });
    } catch (err) {
      console.error('Staff login error:', err);
      setError('Unable to connect to server. Please try again.');
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

          {/* Login Mode Toggle - only show if staff login is enabled */}
          {staffLoginEnabled ? (
            <div className="flex gap-2 mb-6 p-1 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)]">
              <button
                type="button"
                onClick={() => { setLoginMode('admin'); setError(''); }}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  loginMode === 'admin'
                    ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                <ShieldCheck size={16} />
                Admin / Manager
              </button>
              <button
                type="button"
                onClick={() => { setLoginMode('staff'); setError(''); }}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  loginMode === 'staff'
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Users size={16} />
                Staff
              </button>
            </div>
          ) : null}

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
            <form onSubmit={handleStaffSubmit} className="space-y-5">
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
          )}

          <p className="text-center text-[var(--text-muted)] text-xs mt-6">
            {loginMode === 'admin' ? 'Secure login for authorized personnel only' : 'View-only access to your own records'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
