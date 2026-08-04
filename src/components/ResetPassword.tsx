import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Lock, Check } from 'lucide-react';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check if the user arrived here with a valid recovery token in the URL hash
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        setError('No active session found. The password reset link may be invalid or expired.');
      }
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      
      if (updateError) {
        setError(updateError.message);
      } else {
        setMessage('Password updated successfully. You can now log in.');
        setTimeout(() => {
          window.location.href = '/';
        }, 3000);
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-900">
      <div className="max-w-md w-full bg-slate-800 rounded-2xl shadow-2xl p-8 border border-slate-700">
        <div className="flex justify-center mb-6">
          <div className="p-3 bg-blue-500/10 rounded-full">
            <Lock className="text-blue-500 w-8 h-8" />
          </div>
        </div>
        
        <h2 className="text-2xl font-bold text-white text-center mb-2">Reset Password</h2>
        <p className="text-slate-400 text-center mb-8 text-sm">
          Enter your new password below.
        </p>

        {error && (
          <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-sm font-medium">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-4 p-4 rounded-xl bg-green-500/10 border border-green-500/30 flex items-center gap-2 text-green-500 text-sm font-medium">
            <Check size={18} />
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">New Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="At least 6 characters"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="Confirm your new password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3.5 font-medium transition-colors disabled:opacity-50 mt-4"
          >
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
        
        <div className="mt-6 text-center">
          <a href="/" className="text-blue-500 hover:text-blue-400 text-sm font-medium transition-colors">
            Return to Login
          </a>
        </div>
      </div>
    </div>
  );
}
