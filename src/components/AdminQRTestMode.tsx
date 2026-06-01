import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { QrCode, RefreshCw, CheckCircle2, XCircle, Beaker } from 'lucide-react';
import { generateQRPayload, validateQRPayload, getQRRefreshSeconds } from '../utils/qrCrypto';
import { locationService, type Location } from '../services/locationService';
import { ALL_LOCATIONS_QR, displayLocationName } from '../utils/locationUtils';

/**
 * Admin-only test mode:
 *  - Generates a live QR for any location at any refresh interval (or freezes time)
 *  - Validates a pasted payload string against any location (checks expiry + signature)
 *
 * Used to quickly verify QR rotation, expiration grace, and per-location lockdown
 * without needing a phone.
 */
const AdminQRTestMode: React.FC = () => {
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [payload, setPayload] = useState<string>('');
  const [refreshSec, setRefreshSec] = useState<number>(getQRRefreshSeconds());
  const [timeLeft, setTimeLeft] = useState<number>(refreshSec);

  // Validator state
  const [validateText, setValidateText] = useState('');
  const [validateLocation, setValidateLocation] = useState<string>('');
  const [validateResult, setValidateResult] = useState<{ valid: boolean; reason?: string; payload?: any; ageSec?: number } | null>(null);

  useEffect(() => {
    locationService.getLocations().then(locs => {
      setLocations(locs);
      if (locs[0]) {
        setSelectedLocation(prev => prev || locs[0].name);
        setValidateLocation(prev => prev || locs[0].name);
      }
    });
  }, []);

  useEffect(() => {
    if (!selectedLocation) return;
    let active = true;

    const gen = async () => {
      const p = await generateQRPayload(selectedLocation);
      if (active) {
        setPayload(p);
        setTimeLeft(refreshSec);
      }
    };

    gen();
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { gen(); return refreshSec; }
        return prev - 1;
      });
    }, 1000);

    return () => { active = false; clearInterval(interval); };
  }, [selectedLocation, refreshSec]);

  const handleValidate = async () => {
    if (!validateText.trim()) return;
    const res = await validateQRPayload(validateText.trim(), validateLocation, { allowAllLocations: true });
    let payloadObj: any = null;
    let ageSec: number | undefined;
    try {
      payloadObj = JSON.parse(validateText.trim());
      if (payloadObj?.ts) ageSec = Math.floor(Date.now() / 1000) - payloadObj.ts;
    } catch { /* ignore */ }
    setValidateResult({ ...res, payload: payloadObj, ageSec });
  };

  const handlePasteCurrent = () => {
    setValidateText(payload);
    setValidateLocation(selectedLocation);
    setValidateResult(null);
  };

  return (
    <div className="glass-card-static p-4 rounded-xl space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-fuchsia-500/20 flex items-center justify-center">
          <Beaker size={20} className="text-fuchsia-400" />
        </div>
        <div>
          <h3 className="font-semibold text-[var(--text-primary)] text-sm">Admin QR Test Mode</h3>
          <p className="text-xs text-[var(--text-muted)]">Generate a live QR for any location and validate a payload to verify expiration / location rules.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Generator */}
        <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
          <div className="flex items-center gap-2 text-indigo-300 text-sm font-semibold">
            <QrCode size={16} /> Generate
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[140px]">
              <label className="block text-[11px] text-white/50 mb-1">Location</label>
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="input-premium w-full text-sm py-1.5"
              >
                <option value={ALL_LOCATIONS_QR}>All Locations (Admin)</option>
                {locations.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
              </select>
            </div>
            <div className="w-24">
              <label className="block text-[11px] text-white/50 mb-1">Refresh</label>
              <input
                type="number"
                min={3}
                max={60}
                value={refreshSec}
                onChange={(e) => setRefreshSec(Math.max(3, Math.min(60, Number(e.target.value) || 7)))}
                className="input-premium w-full text-sm py-1.5 text-center"
              />
            </div>
          </div>

          {payload && (
            <div className="flex flex-col items-center gap-2">
              <div className="bg-white p-3 rounded-lg">
                <QRCodeSVG value={payload} size={160} level="H" />
              </div>
              <div className="flex items-center gap-2 text-xs text-white/60">
                <RefreshCw size={12} className={timeLeft <= 2 ? 'animate-spin text-orange-400' : ''} />
                Rotates in <span className={timeLeft <= 2 ? 'text-orange-400 font-bold' : 'font-semibold'}>{timeLeft}s</span>
              </div>
              <button
                onClick={handlePasteCurrent}
                className="text-[11px] text-indigo-300 hover:text-indigo-200 underline"
              >
                Paste this payload into validator →
              </button>
              <pre className="w-full text-[10px] text-white/40 bg-black/30 p-2 rounded font-mono break-all whitespace-pre-wrap max-h-20 overflow-y-auto">{payload}</pre>
            </div>
          )}
        </div>

        {/* Validator */}
        <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
          <div className="flex items-center gap-2 text-emerald-300 text-sm font-semibold">
            <CheckCircle2 size={16} /> Validate
          </div>
          <div>
            <label className="block text-[11px] text-white/50 mb-1">Validate against location</label>
            <select
              value={validateLocation}
              onChange={(e) => setValidateLocation(e.target.value)}
              className="input-premium w-full text-sm py-1.5"
            >
              {locations.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-white/50 mb-1">QR payload JSON</label>
            <textarea
              value={validateText}
              onChange={(e) => setValidateText(e.target.value)}
              placeholder='{"loc":"Big Shop","ts":1234567890,"sig":"..."}'
              rows={3}
              className="input-premium w-full text-xs font-mono"
            />
          </div>
          <button
            onClick={handleValidate}
            disabled={!validateText.trim()}
            className="btn-premium w-full py-2 text-sm disabled:opacity-50"
          >
            Validate Payload
          </button>

          {validateResult && (
            <div className={`p-3 rounded-lg text-sm border ${
              validateResult.valid
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/10 border-red-500/30 text-red-300'
            }`}>
              <div className="flex items-center gap-2 font-semibold">
                {validateResult.valid ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                {validateResult.valid ? 'Valid QR ✓' : `Rejected: ${validateResult.reason}`}
              </div>
              {validateResult.payload && (
                <div className="mt-2 text-[11px] text-white/70 font-mono space-y-0.5">
                  <div>loc: <span className="text-white">{displayLocationName(String(validateResult.payload.loc))}</span></div>
                  <div>ts: <span className="text-white">{String(validateResult.payload.ts)}</span></div>
                  {typeof validateResult.ageSec === 'number' && (
                    <div>age: <span className="text-white">{validateResult.ageSec}s</span> (window: {getQRRefreshSeconds() + 3}s)</div>
                  )}
                  <div>sig: <span className="text-white">{String(validateResult.payload.sig)}</span></div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminQRTestMode;
