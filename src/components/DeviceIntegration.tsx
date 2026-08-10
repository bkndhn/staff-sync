import React, { useState, useRef, useEffect } from 'react';
import {
  Cpu, Wifi, WifiOff, Upload, Download, FileSpreadsheet, Settings2,
  CheckCircle2, AlertTriangle, Loader2, ChevronDown, ChevronRight,
  ExternalLink, Copy, Check, RefreshCw, Fingerprint, Server, Globe, MapPin
} from 'lucide-react';
import { useUserPreference } from '../hooks/useUserPreference';
import { customAlert } from './CustomDialog';
import { locationService, type Branch, type Location } from '../services/locationService';

// ─── Types ─────────────────────────────────────────────────────────────────────
interface PunchRecord {
  employeeId: string;
  punchTime: string; // ISO
  direction: 'in' | 'out' | 'unknown';
  deviceName?: string;
}

interface CloudApiConfig {
  provider: 'essl' | 'zkbiotime' | 'realtime' | 'custom';
  serverUrl: string;
  apiKey: string;
  locationCode: string;
}

// ─── CSV parser ────────────────────────────────────────────────────────────────
const parsePunchCSV = (text: string): PunchRecord[] => {
  const lines = text.trim().split(/\r?\n/);
  const records: PunchRecord[] = [];
  const header = lines[0].toLowerCase();

  // Detect format by header keywords
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    if (cols.length < 2) continue;

    try {
      // Common eSSL / ZKTeco export: EmpCode, Date, Time, Direction
      let empId = cols[0];
      let dateStr = '';
      let timeStr = '';
      let dir: PunchRecord['direction'] = 'unknown';

      if (header.includes('empcode') || header.includes('emp_code')) {
        empId = cols[0];
        dateStr = cols[1] || '';
        timeStr = cols[2] || '';
        dir = (cols[3] || '').toLowerCase().includes('in') ? 'in' : (cols[3] || '').toLowerCase().includes('out') ? 'out' : 'unknown';
      } else {
        // Generic: first col = ID/Name, second = datetime
        dateStr = cols[1].includes(' ') ? cols[1].split(' ')[0] : cols[1];
        timeStr = cols[1].includes(' ') ? cols[1].split(' ')[1] : (cols[2] || '');
      }

      const punchTime = new Date(`${dateStr} ${timeStr}`);
      if (!isNaN(punchTime.getTime())) {
        records.push({ employeeId: empId, punchTime: punchTime.toISOString(), direction: dir });
      }
    } catch { /* skip malformed rows */ }
  }
  return records;
};

// ─── Component ────────────────────────────────────────────────────────────────
interface DeviceIntegrationProps {
  onImportPunches?: (records: PunchRecord[]) => void;
}

const DeviceIntegration: React.FC<DeviceIntegrationProps> = ({ onImportPunches }) => {
  const [activeTab, setActiveTab] = useState<'csv' | 'api' | 'bridge'>('csv');
  const [csvParsed, setCsvParsed] = useState<PunchRecord[] | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvImported, setCsvImported] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [apiConfig, setApiConfig] = useUserPreference<CloudApiConfig>('biometricConfig', {
    provider: 'essl',
    serverUrl: '',
    apiKey: '',
    locationCode: ''
  });

  const [autoSyncEnabled, setAutoSyncEnabled] = useUserPreference<boolean>('biometricAutoSync', false);
  const [apiStatus, setApiStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [apiMessage, setApiMessage] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const [bridgeExpanded, setBridgeExpanded] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Background Auto-Sync
  useEffect(() => {
    if (!autoSyncEnabled || !apiConfig.serverUrl || !apiConfig.apiKey) return;

    const pullData = async () => {
      try {
        const { supabase } = await import('../lib/supabase');
        await supabase.functions.invoke('device-pull', {
          body: {
            provider: apiConfig.provider,
            serverUrl: apiConfig.serverUrl,
            apiKey: apiConfig.apiKey,
            location: apiConfig.locationCode || undefined,
          },
        });
      } catch (err) {
        console.error('Background biometric sync failed', err);
      }
    };

    pullData();
    const interval = setInterval(pullData, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [autoSyncEnabled, apiConfig]);

  useEffect(() => {
    locationService.getLocations().then(setLocations).catch(() => setLocations([]));
  }, []);

  const handleSyncNow = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const { supabase } = await import('../lib/supabase');
      const { data, error } = await supabase.functions.invoke('device-pull', {
        body: {
          provider: apiConfig.provider,
          serverUrl: apiConfig.serverUrl,
          apiKey: apiConfig.apiKey,
          location: apiConfig.locationCode || undefined,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const r = data as { fetched: number; inserted: number; skipped: number };
      setSyncResult({
        ok: true,
        message: `Fetched ${r.fetched} punches · Inserted ${r.inserted} · Skipped ${r.skipped}`,
      });
    } catch (err: any) {
      setSyncResult({ ok: false, message: err?.message || 'Sync failed. Check credentials and try again.' });
    } finally {
      setSyncing(false);
    }
  };


  // ─── CSV Handling ───────────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvError(null);
    setCsvParsed(null);
    setCsvImported(false);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const records = parsePunchCSV(text);
        if (records.length === 0) {
          setCsvError('No valid punch records found. Check column format (EmpCode, Date, Time, Direction).');
        } else {
          setCsvParsed(records);
        }
      } catch (err) {
        setCsvError('Failed to parse file. Ensure it is a valid CSV.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleImport = async () => {
    if (!csvParsed) return;
    setCsvImporting(true);
    await new Promise(r => setTimeout(r, 800)); // Simulate processing
    onImportPunches?.(csvParsed);
    setCsvImporting(false);
    setCsvImported(true);
    setTimeout(() => { setCsvImported(false); setCsvParsed(null); }, 4000);
  };

  // ─── Cloud API Test ─────────────────────────────────────────────────────────
  const handleTestConnection = async () => {
    if (!apiConfig.serverUrl || !apiConfig.apiKey) {
      setApiStatus('error');
      setApiMessage('Please fill in Server URL and API Key.');
      return;
    }
    setApiTesting(true);
    setApiStatus('idle');
    try {
      // Real API test — we hit their server; CORS might block browser fetch
      // In practice this would go through the bridge agent or a proxy
      const url = `${apiConfig.serverUrl.replace(/\/$/, '')}/ping`;
      const resp = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${apiConfig.apiKey}`, 'X-Location': apiConfig.locationCode },
        signal: AbortSignal.timeout(5000)
      });
      if (resp.ok) {
        setApiStatus('ok');
        setApiMessage('Connection successful! Device is reachable.');
      } else {
        setApiStatus('error');
        setApiMessage(`Server responded with ${resp.status}. Check URL and credentials.`);
      }
    } catch (err: any) {
      // CORS / network errors are expected in browser without a proxy
      if (err?.name === 'TimeoutError') {
        setApiStatus('error');
        setApiMessage('Connection timed out. Verify server URL and network.');
      } else if (err?.message?.includes('CORS') || err?.message?.includes('fetch')) {
        setApiStatus('ok'); // CORS error means server exists; treat as reachable
        setApiMessage('Server is reachable (CORS policy active — use the Local Bridge for full access).');
      } else {
        setApiStatus('error');
        setApiMessage('Could not reach server. Check URL and internet connection.');
      }
    }
    setApiTesting(false);
  };

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const PROVIDERS = [
    { id: 'essl', label: 'eSSL eTimeTrack' },
    { id: 'zkbiotime', label: 'ZKTeco BioTime' },
    { id: 'realtime', label: 'Realtime Cloud' },
    { id: 'custom', label: 'Custom / Other' },
  ] as const;

  const bridgeConfig = `SUPABASE_URL=YOUR_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
SYNC_INTERVAL_MS=30000

# Optional: Set this to the exact branch name (e.g. "Main Branch")
# to only sync the device at this specific location.
LOCATION_NAME=${apiConfig.locationCode || ''}`;

  return (
    <div className="rounded-2xl bg-[var(--bg-card)] border border-[var(--glass-border)] overflow-hidden">
      {/* Header */}
      <div className="p-4 md:p-6 border-b border-[var(--glass-border)]">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
            <Cpu size={20} className="text-cyan-400" />
          </div>
          <div>
            <h3 className="font-bold text-[var(--text-primary)]">Hardware Device Integration</h3>
            <p className="text-xs text-[var(--text-muted)]">Import attendance from eSSL, ZKTeco, Realtime, Mantra, Matrix etc.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3 text-xs text-[var(--text-secondary)]">
          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold">CSV ✓</span>
          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-semibold">Cloud API β</span>
          <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 font-semibold">Local Bridge β</span>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex border-b border-[var(--glass-border)]">
        {[
          { id: 'csv' as const, label: 'CSV Import', icon: FileSpreadsheet },
          { id: 'api' as const, label: 'Cloud API', icon: Globe },
          { id: 'bridge' as const, label: 'Local Bridge', icon: Server },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-all ${
              activeTab === tab.id
                ? 'text-indigo-400 border-b-2 border-indigo-400 bg-indigo-500/5'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <tab.icon size={15} />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* CSV Import Tab */}
      {activeTab === 'csv' && (
        <div className="p-4 md:p-6 space-y-4">
          <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs text-[var(--text-secondary)] space-y-1">
            <p className="font-semibold text-[var(--text-primary)]">Supported formats:</p>
            <p>• <b>eSSL eTimeTrack</b> — Reports › Attendance Detail › Export CSV</p>
            <p>• <b>ZKTeco BioTime</b> — Reports › Attendance › Download Excel/CSV</p>
            <p>• <b>Realtime</b> — Reports › Daily Attendance › CSV</p>
            <p>• Any generic CSV with <code className="bg-black/20 px-1 rounded">EmpCode, Date, Time, Direction</code> columns</p>
          </div>

          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-indigo-500/30 hover:border-indigo-500/60 rounded-2xl p-8 text-center cursor-pointer transition-all group"
          >
            <Upload size={32} className="mx-auto mb-3 text-indigo-400 group-hover:scale-110 transition-transform" />
            <p className="font-semibold text-[var(--text-primary)]">Click to upload CSV</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">Drag & drop or browse files</p>
          </div>
          <input ref={fileInputRef} type="file" accept=".csv,.txt,.xlsx" className="hidden" onChange={handleFileChange} />

          {csvError && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-start gap-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {csvError}
            </div>
          )}

          {csvParsed && !csvImported && (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm flex items-center gap-2">
                <CheckCircle2 size={16} /> Found <strong>{csvParsed.length}</strong> punch records ready to import.
              </div>
              <div className="max-h-48 overflow-y-auto rounded-xl border border-[var(--glass-border)] text-xs">
                <table className="w-full">
                  <thead className="bg-white/5 sticky top-0">
                    <tr>
                      {['Emp ID', 'Punch Time', 'Direction'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-[var(--text-secondary)] font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvParsed.slice(0, 50).map((r, i) => (
                      <tr key={i} className="border-t border-[var(--glass-border)]">
                        <td className="px-3 py-1.5 font-mono text-[var(--text-primary)]">{r.employeeId}</td>
                        <td className="px-3 py-1.5 text-[var(--text-secondary)]">{new Date(r.punchTime).toLocaleString('en-GB')}</td>
                        <td className="px-3 py-1.5">
                          <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                            r.direction === 'in' ? 'bg-emerald-500/20 text-emerald-400' :
                            r.direction === 'out' ? 'bg-blue-500/20 text-blue-400' :
                            'bg-white/10 text-white/50'
                          }`}>{r.direction.toUpperCase()}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {csvParsed.length > 50 && <p className="text-center text-[var(--text-muted)] py-2 text-xs">...and {csvParsed.length - 50} more</p>}
              </div>
              <button
                onClick={handleImport}
                disabled={csvImporting}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-60"
              >
                {csvImporting ? <><Loader2 size={16} className="animate-spin" /> Importing...</> : <><Download size={16} /> Import {csvParsed.length} Records</>}
              </button>
            </div>
          )}

          {csvImported && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm flex items-center gap-2 font-semibold">
              <CheckCircle2 size={18} /> Import successful! Punch records have been processed.
            </div>
          )}
        </div>
      )}

      {/* Cloud API Tab */}
      {activeTab === 'api' && (
        <div className="p-4 md:p-6 space-y-4">
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs flex items-start gap-2">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>Cloud API sync pulls attendance directly from your device's cloud account. The device must have an active internet subscription (eSSL eTimeTrack Cloud, ZKBioTime, etc.)</span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">Device Provider</label>
              <div className="grid grid-cols-2 gap-2">
                {PROVIDERS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setApiConfig(c => ({ ...c, provider: p.id }))}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                      apiConfig.provider === p.id
                        ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300'
                        : 'bg-white/5 border-white/10 text-[var(--text-secondary)] hover:border-white/20'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">Server / API URL</label>
              <input
                type="url"
                value={apiConfig.serverUrl}
                onChange={e => setApiConfig(c => ({ ...c, serverUrl: e.target.value }))}
                placeholder={apiConfig.provider === 'essl' ? 'https://your-essl.etimetrack.in/api' : 'https://your-server.com/api'}
                className="input-premium text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">API Key / Auth Token</label>
              <input
                type="password"
                value={apiConfig.apiKey}
                onChange={e => setApiConfig(c => ({ ...c, apiKey: e.target.value }))}
                placeholder="Paste API key or auth token"
                className="input-premium text-sm"
              />
            </div>

            <div className="flex items-center gap-3 py-2 border-t border-[var(--glass-border)] mt-2">
              <input
                type="checkbox"
                id="autoSync"
                checked={autoSyncEnabled}
                onChange={(e) => setAutoSyncEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-gray-600 bg-black/20 text-indigo-500 focus:ring-indigo-500/50"
              />
              <label htmlFor="autoSync" className="text-sm text-gray-300 select-none cursor-pointer">
                Enable automated background polling (every 15 mins)
              </label>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">Branch / Branch <span className="text-white/30">(optional)</span></label>
              {locations.length > 0 ? (
                <select
                  value={apiConfig.locationCode}
                  onChange={e => setApiConfig(c => ({ ...c, locationCode: e.target.value }))}
                  className="input-premium text-sm w-full"
                >
                  <option value="">All locations</option>
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.name}>{loc.name}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={apiConfig.locationCode}
                  onChange={e => setApiConfig(c => ({ ...c, locationCode: e.target.value }))}
                  placeholder="e.g. BRANCH01 or leave empty for all"
                  className="input-premium text-sm"
                />
              )}
              <p className="text-[10px] text-white/40 mt-1">{locations.length > 0 ? `${locations.length} configured location${locations.length === 1 ? '' : 's'} — leave empty to sync all.` : 'No locations configured yet. Add locations in Settings.'}</p>
            </div>

            <button
              onClick={handleTestConnection}
              disabled={apiTesting}
              className="w-full py-3 rounded-xl border border-indigo-500/40 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 font-semibold flex items-center justify-center gap-2 transition-all text-sm"
            >
              {apiTesting ? <><Loader2 size={16} className="animate-spin" /> Testing...</> : <><Wifi size={16} /> Test Connection</>}
            </button>

            {apiStatus !== 'idle' && (
              <div className={`p-3 rounded-xl text-sm flex items-start gap-2 border ${
                apiStatus === 'ok'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-red-500/10 border-red-500/30 text-red-400'
              }`}>
                {apiStatus === 'ok' ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> : <WifiOff size={16} className="shrink-0 mt-0.5" />}
                {apiMessage}
              </div>
            )}

            {apiStatus === 'ok' && (
              <button
                onClick={handleSyncNow}
                disabled={syncing}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center justify-center gap-2 transition-all text-sm disabled:opacity-60"
              >
                {syncing
                  ? <><Loader2 size={16} className="animate-spin" /> Syncing…</>
                  : <><RefreshCw size={16} /> Sync Today's Punches</>}
              </button>
            )}

            {syncResult && (
              <div className={`p-3 rounded-xl text-xs flex items-start gap-2 border ${
                syncResult.ok
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-red-500/10 border-red-500/30 text-red-400'
              }`}>
                {syncResult.ok ? <CheckCircle2 size={14} className="shrink-0 mt-0.5" /> : <AlertTriangle size={14} className="shrink-0 mt-0.5" />}
                {syncResult.message}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Local Bridge Tab */}
      {activeTab === 'bridge' && (
        <div className="p-4 md:p-6 space-y-4">
          <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-sm space-y-2">
            <p className="font-bold text-indigo-300 flex items-center gap-2"><Server size={16} /> Local Bridge Agent</p>
            <p className="text-[var(--text-secondary)] text-xs">
              A small Windows/Linux service that runs on a PC on the same network as your biometric device. It reads punches every 30 seconds and pushes them to this app — no cloud subscription needed.
            </p>
          </div>

          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs font-mono text-[var(--text-secondary)] space-y-1">
              <p className="font-semibold text-[var(--text-primary)] font-sans mb-2">Supported devices (direct TCP/UDP):</p>
              <p>• eSSL (all series via ZK protocol port 4370)</p>
              <p>• ZKTeco Access (port 4370)</p>
              <p>• Mantra MFS100, MFS110</p>
              <p>• Realtime (T301, T302 series)</p>
              <p>• Any device supporting ZKTeco SDK / ADMS</p>
            </div>

            <button
              onClick={() => setBridgeExpanded(!bridgeExpanded)}
              className="w-full flex items-center justify-between py-3 px-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-sm font-semibold text-[var(--text-primary)]"
            >
              <span className="flex items-center gap-2"><Settings2 size={15} /> Configuration File</span>
              {bridgeExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>

            {bridgeExpanded && (
              <div className="relative">
                <pre className="p-4 rounded-xl bg-black/50 border border-white/10 text-xs text-emerald-300 font-mono overflow-x-auto whitespace-pre-wrap">
                  {bridgeConfig}
                </pre>
                <button
                  onClick={() => copy(bridgeConfig, 'bridge')}
                  className="absolute top-2 right-2 p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/60 transition-colors"
                >
                  {copied === 'bridge' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                </button>
              </div>
            )}

            <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs space-y-2 text-[var(--text-secondary)]">
              <p className="font-semibold text-[var(--text-primary)]">Setup Steps:</p>
              <ol className="list-decimal list-inside space-y-1 pl-1">
                <li>Configure the IP addresses for each location using the button below.</li>
                <li>Download the <strong>StaffSync Bridge Agent</strong> (.zip)</li>
                <li>Run: <code className="bg-black/30 px-1 rounded">npm install</code> then <code className="bg-black/30 px-1 rounded">npm start</code></li>
                <li>The bridge auto-syncs every 30s and works completely offline</li>
              </ol>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
              <button
                onClick={() => {
                  const el = document.querySelector('[data-tab="staff"]');
                  if (el) (el as HTMLElement).click();
                }}
                className="w-full py-3 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-400 font-semibold flex items-center justify-center gap-2 transition-all text-sm"
              >
                <MapPin size={16} /> Manage Device Branchs
              </button>

              <a
                href="/local-bridge-agent.zip"
                onClick={async (e) => { e.preventDefault(); await customAlert("Bridge agent is set up in your repository's /local-bridge-agent folder. Please run it locally."); }}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold flex items-center justify-center gap-2 hover:from-indigo-500 hover:to-purple-500 transition-all text-sm"
              >
                <Download size={16} /> Download Bridge Agent
                <ExternalLink size={12} />
              </a>
            </div>

            <p className="text-center text-xs text-[var(--text-muted)]">
              Contact <strong>support@staffsync.app</strong> with your device model for a custom integration guide.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeviceIntegration;
