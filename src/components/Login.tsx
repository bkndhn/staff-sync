import React, { useState, useEffect } from 'react';
import { Lock, AlertCircle, Eye, EyeOff, Sparkles, Users, ShieldCheck, Camera, Upload, Check } from 'lucide-react';
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
import { hardResetAppCache } from '../lib/cacheService';

interface LoginProps {
  onLogin: (user: { id?: string; email: string; role: string; location?: string; floor?: string; floorId?: string; staffId?: string; staffName?: string; staffRecord?: any }) => void;
}


const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Surface the reason a session was ended (expired token, deactivated account).
  useEffect(() => {
    try {
      const msg = localStorage.getItem('authError');
      if (msg) {
        setError(msg);
        localStorage.removeItem('authError');
      }
    } catch { /* ignore storage failures */ }
  }, []);

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
          user: { ...dbUser, token: sessionToken },
          expiresAt: Date.now() + (24 * 60 * 60 * 1000),
          sessionToken
        };

        onLogin({
          id: dbUser.id,
          email: dbUser.email,
          role: dbUser.role,
          location: dbUser.location || undefined,
          floor: (dbUser as any).floor || undefined,
          floorId: (dbUser as any).floor_id || undefined,
          tenant_id: (dbUser as any).tenant_id || undefined,
        } as any);
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

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError('Please enter your email address to reset password');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      
      if (resetError) {
        setError(resetError.message);
      } else {
        alert('Password reset link sent to your email!');
      }
    } catch (err) {
      setError('Unable to request password reset. Please try again.');
    }
    
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-x-clip">
      {/* Soft blue background wash */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gradient-to-r from-blue-500/10 to-sky-400/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-gradient-to-r from-sky-400/10 to-blue-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />

      <div className="max-w-md w-full relative z-10 space-y-4">
        <div className="glass-card-static p-8 md:p-10">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="w-20 h-20 mx-auto mb-6 relative">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl rotate-6 opacity-40" />
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center">
                <Sparkles className="text-white" size={36} />
              </div>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-gradient mb-2">
              Staff Management
            </h1>
            <p className="text-[var(--text-muted)]">Sign in to your account</p>
          </div>

          {/* Admin Login Form */}
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
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-600 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400 transition-colors focus:outline-none flex items-center justify-center rounded-md hover:bg-slate-200/50 dark:hover:bg-slate-700/50"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} className="text-slate-600 dark:text-slate-300" /> : <Eye size={18} className="text-slate-600 dark:text-slate-300" />}
                </button>
              </div>
              <div className="flex justify-end mt-1">
                <button 
                  type="button" 
                  onClick={handleForgotPassword}
                  className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition-colors"
                >
                  Forgot Password?
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
              <span className="relative z-10 flex items-center justify-center gap-2 !text-white">
                {loading ? (
                  <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span className="!text-white">Signing in...</span></>
                ) : (
                  <><Lock size={18} className="!text-white" /><span className="!text-white">Sign In</span></>
                )}
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
            </button>
          </form>

          <p className="text-center text-[var(--text-muted)] text-xs mt-6">
            Secure login for authorized personnel only
          </p>

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

export default Login;
