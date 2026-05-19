import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Lock, AlertCircle, Eye, EyeOff, Sparkles, Users, ShieldCheck, QrCode, XCircle, Loader2, CheckCircle2 } from 'lucide-react';
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
import jsQR from 'jsqr';

interface LoginProps {
  onLogin: (user: { email: string; role: string; location?: string; staffId?: string; staffName?: string }) => void;
}

// ─── Ultra-fast QR scanner hook for login ────────────────────────────────────
const useLoginQRScanner = (onDecoded: (text: string) => void, active: boolean) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const activeRef = useRef(active);
  const [ready, setReady] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);

  useEffect(() => { activeRef.current = active; }, [active]);

  useEffect(() => {
    if (!active) return;
    let detector: any = null;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } } });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        // Try native BarcodeDetector
        if ('BarcodeDetector' in window) {
          try {
            const fmts = await (window as any).BarcodeDetector.getSupportedFormats();
            if (fmts.includes('qr_code')) detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
          } catch { /* ignore */ }
        }

        setReady(true);

        const loop = async () => {
          if (!activeRef.current) return;
          const video = videoRef.current;
          const canvas = canvasRef.current;
          if (video && canvas && video.readyState >= 2) {
            try {
              let decoded: string | null = null;
              if (detector) {
                const results = await detector.detect(video);
                if (results?.length) decoded = results[0].rawValue;
              } else {
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                if (ctx) {
                  canvas.width = video.videoWidth;
                  canvas.height = video.videoHeight;
                  ctx.drawImage(video, 0, 0);
                  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
                  const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
                  if (code) decoded = code.data;
                }
              }
              if (decoded) {
                if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
                cancelAnimationFrame(rafRef.current);
                onDecoded(decoded);
                return;
              }
            } catch { /* ignore */ }
          }
          rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
      } catch (err: any) {
        setCamError('Camera access denied. Please allow and retry.');
      }
    };

    start();
    return () => {
      activeRef.current = false;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [active, onDecoded]);

  return { videoRef, canvasRef, ready, camError };
};

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const staffLoginEnabled = localStorage.getItem('staffLoginEnabled') !== 'false';
  const [loginMode, setLoginMode] = useState<'admin' | 'staff'>(staffLoginEnabled ? 'staff' : 'admin');
  const [staffInputMode, setStaffInputMode] = useState<'manual' | 'qr'>('manual');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [joinedDate, setJoinedDate] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [qrScanStatus, setQrScanStatus] = useState<'idle' | 'scanning' | 'found' | 'error'>('idle');

  const handleQRDecode = useCallback(async (text: string) => {
    // Expected QR format for staff login: {"type":"staff_identity","mobile":"XXXXXXXXXX","date":"DDMMYYYY"}
    try {
      setQrScanStatus('found');
      const data = JSON.parse(text);
      if (data.type !== 'staff_identity' || !data.mobile || !data.date) {
        setQrScanStatus('error');
        setError('Invalid staff QR code. Use the QR code from your profile card.');
        setTimeout(() => { setStaffInputMode('manual'); setQrScanStatus('idle'); setError(''); }, 3000);
        return;
      }
      setMobileNumber(data.mobile);
      setJoinedDate(data.date);
      // Auto-submit
      setStaffInputMode('manual');
      setQrScanStatus('idle');
    } catch {
      setQrScanStatus('error');
      setError('Unrecognized QR code format.');
      setTimeout(() => { setStaffInputMode('manual'); setQrScanStatus('idle'); setError(''); }, 2500);
    }
  }, []);

  const { videoRef, canvasRef, ready: camReady, camError } = useLoginQRScanner(
    handleQRDecode,
    loginMode === 'staff' && staffInputMode === 'qr'
  );

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

    const staffLoginEnabledNow = localStorage.getItem('staffLoginEnabled');
    if (staffLoginEnabledNow === 'false') {
      setError('Staff login is currently disabled by admin');
      setLoading(false);
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 300));

    try {
      const { data: staffData, error: fetchError } = await supabase
        .from('staff')
        .select('*')
        .eq('contact_number', trimmedMobile);

      if (fetchError || !staffData || staffData.length === 0) {
        setError('Invalid mobile number or joined date. Please check your credentials.');
        setLoading(false);
        return;
      }

      const enteredDay = trimmedDate.substring(0, 2);
      const enteredMonth = trimmedDate.substring(2, 4);
      const enteredYear = trimmedDate.substring(4, 8);

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

      // DEVICE BINDING LOGIC
      const currentFingerprint = await generateDeviceFingerprint();
      
      if (!matchedStaff.device_id) {
        const { error: updateError } = await supabase
          .from('staff')
          .update({ device_id: currentFingerprint })
          .eq('id', matchedStaff.id);
          
        if (updateError) {
          console.error("Failed to bind device:", updateError);
        }
      } else if (matchedStaff.device_id !== currentFingerprint) {
        setError('This account is already registered to another device. Please contact Admin to reset your device lock.');
        setLoading(false);
        return;
      }

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

          {/* Login Mode Toggle */}
          {staffLoginEnabled ? (
            <div className="flex gap-2 mb-6 p-1 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)]">
              <button
                type="button"
                onClick={() => { setLoginMode('admin'); setError(''); setStaffInputMode('manual'); }}
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
            <div className="space-y-4">
              {/* Staff Login Mode Switch */}
              <div className="flex gap-2 p-1 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)]">
                <button
                  type="button"
                  onClick={() => { setStaffInputMode('manual'); setError(''); }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                    staffInputMode === 'manual'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Users size={13} /> Enter Details
                </button>
                <button
                  type="button"
                  onClick={() => { setStaffInputMode('qr'); setError(''); }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                    staffInputMode === 'qr'
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <QrCode size={13} /> Scan QR Card
                </button>
              </div>

              {/* QR Scanner View */}
              {staffInputMode === 'qr' && (
                <div className="space-y-3">
                  <div className="relative bg-black rounded-2xl overflow-hidden aspect-square">
                    <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
                    <canvas ref={canvasRef} className="hidden" />

                    {/* Target corners */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-48 h-48 relative">
                        {['top-0 left-0 border-t-4 border-l-4 rounded-tl-xl', 'top-0 right-0 border-t-4 border-r-4 rounded-tr-xl', 'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-xl', 'bottom-0 right-0 border-b-4 border-r-4 rounded-br-xl'].map((cls, i) => (
                          <div key={i} className={`absolute w-8 h-8 border-indigo-400 ${cls}`} />
                        ))}
                        {camReady && (
                          <div className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-indigo-400 to-transparent animate-[scan_1.5s_ease-in-out_infinite]" />
                        )}
                      </div>
                    </div>

                    {!camReady && !camError && (
                      <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2">
                        <Loader2 size={28} className="text-indigo-400 animate-spin" />
                        <p className="text-white/60 text-sm">Opening camera...</p>
                      </div>
                    )}

                    {qrScanStatus === 'found' && (
                      <div className="absolute inset-0 bg-emerald-900/70 flex items-center justify-center">
                        <CheckCircle2 size={48} className="text-emerald-400" />
                      </div>
                    )}

                    {camError && (
                      <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-2 p-4 text-center">
                        <AlertCircle size={28} className="text-red-400" />
                        <p className="text-white/70 text-sm">{camError}</p>
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-center text-[var(--text-muted)]">
                    Scan the <strong>Staff Identity QR</strong> from your profile card or the one provided by your manager.
                  </p>

                  {error && (
                    <div className="flex items-start gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30">
                      <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={16} />
                      <span className="text-red-400 text-sm">{error}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Manual Entry */}
              {staffInputMode === 'manual' && (
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
              )}
            </div>
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
