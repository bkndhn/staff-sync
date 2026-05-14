import React, { useEffect, useState, useCallback } from 'react';
import {
  Clock, Save, RotateCcw, Check, Shield, ScanFace, Sun, AlertTriangle, MapPin,
  ChevronDown, ChevronUp, Loader2
} from 'lucide-react';
import { locationShiftService, LocationShiftConfig, DEFAULT_LOCATION_CONFIG } from '../services/locationShiftService';
import { locationService } from '../services/locationService';
import { appSettingsService } from '../services/appSettingsService';

// ─── Global Settings Panel ────────────────────────────────────────────────────

const GlobalKioskSettings: React.FC = () => {
  const [settings, setSettings] = useState({
    morningCutoff: '12:00',
    earlyExitTime: '16:00',
    eveningVerificationTime: '18:00',
    fullDayRequiresMorning: true,
    matchThreshold: 0.55,
    antiSpoofLevel: 'strict' as 'standard' | 'strict' | 'max',
    managerCanOverride: true,
  });
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    appSettingsService.getKioskGlobalSettings()
      .then(setSettings)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await Promise.all([
      appSettingsService.setSetting('kiosk_morning_cutoff', settings.morningCutoff),
      appSettingsService.setSetting('kiosk_early_exit_time', settings.earlyExitTime),
      appSettingsService.setSetting('kiosk_evening_verification_time', settings.eveningVerificationTime),
      appSettingsService.setSetting('kiosk_full_day_requires_morning', String(settings.fullDayRequiresMorning)),
      appSettingsService.setSetting('kiosk_match_threshold', String(settings.matchThreshold)),
      appSettingsService.setSetting('anti_spoof_level', settings.antiSpoofLevel),
      appSettingsService.setSetting('manager_can_override', String(settings.managerCanOverride)),
    ]);
    setSaving(false);
    setSavedAt(Date.now());
    setTimeout(() => setSavedAt(null), 2500);
  };

  if (loading) return <div className="text-center text-xs text-white/50 py-6"><Loader2 size={16} className="animate-spin inline mr-2" />Loading…</div>;

  return (
    <div className="space-y-5">
      {/* Attendance Timing Rules */}
      <div className="glass-card-static p-4 rounded-xl space-y-4">
        <div className="flex items-center gap-2 mb-3">
          <Clock size={16} className="text-indigo-400" />
          <h4 className="font-semibold text-[var(--text-primary)] text-sm">Global Attendance Timing Rules</h4>
          <span className="text-[10px] text-white/40 ml-auto">Applied when no location-specific config exists</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-white/60 mb-1.5">
              Morning Cutoff Time
              <span className="block text-[10px] text-white/40 mt-0.5">Arrival BEFORE this = Full Day eligible</span>
            </label>
            <input
              type="time"
              value={settings.morningCutoff}
              onChange={e => setSettings(p => ({ ...p, morningCutoff: e.target.value }))}
              className="input-premium px-3 py-2 text-sm w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-white/60 mb-1.5">
              Early Exit Time
              <span className="block text-[10px] text-white/40 mt-0.5">Morning staff leaving BEFORE this = Half Day</span>
            </label>
            <input
              type="time"
              value={settings.earlyExitTime}
              onChange={e => setSettings(p => ({ ...p, earlyExitTime: e.target.value }))}
              className="input-premium px-3 py-2 text-sm w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-white/60 mb-1.5">
              Evening Verification Time
              <span className="block text-[10px] text-white/40 mt-0.5">Pending morning staffs resolve to Full Day if no OUT punch</span>
            </label>
            <input
              type="time"
              value={settings.eveningVerificationTime}
              onChange={e => setSettings(p => ({ ...p, eveningVerificationTime: e.target.value }))}
              className="input-premium px-3 py-2 text-sm w-full"
            />
          </div>
        </div>

        <label className="flex items-center gap-3 cursor-pointer select-none group p-3 rounded-xl hover:bg-white/5 transition-colors">
          <div
            onClick={() => setSettings(p => ({ ...p, fullDayRequiresMorning: !p.fullDayRequiresMorning }))}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${settings.fullDayRequiresMorning ? 'bg-indigo-500' : 'bg-white/20'}`}
          >
            <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${settings.fullDayRequiresMorning ? 'translate-x-5' : 'translate-x-1'}`} />
          </div>
          <div>
            <span className="text-sm text-[var(--text-primary)] font-medium">Full Day requires morning entry</span>
            <p className="text-[11px] text-white/40">When ON: arrival after morning cutoff = always Half Day</p>
          </div>
        </label>
      </div>

      {/* Anti-Spoof & Face Match */}
      <div className="glass-card-static p-4 rounded-xl space-y-4">
        <div className="flex items-center gap-2 mb-3">
          <ScanFace size={16} className="text-emerald-400" />
          <h4 className="font-semibold text-[var(--text-primary)] text-sm">Kiosk Face Recognition</h4>
        </div>

        <div>
          <label className="block text-xs font-medium text-white/60 mb-2">Anti-Spoof Level</label>
          <div className="grid grid-cols-3 gap-2">
            {(['standard', 'strict', 'max'] as const).map(level => (
              <button
                key={level}
                onClick={() => setSettings(p => ({ ...p, antiSpoofLevel: level }))}
                className={`py-2 px-3 rounded-lg text-xs font-semibold capitalize border transition-all ${settings.antiSpoofLevel === level
                  ? 'bg-indigo-500 border-indigo-400 text-white'
                  : 'bg-white/5 border-white/10 text-white/60 hover:border-white/20'
                }`}
              >
                {level}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-white/40 mt-2">
            Standard: texture + blink &nbsp;·&nbsp; Strict: + depth consistency (recommended) &nbsp;·&nbsp; Max: + head-turn challenge
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-white/60 mb-1.5">
            Face Match Confidence — Threshold: <strong className="text-white">{settings.matchThreshold.toFixed(2)}</strong>
            <span className="block text-[10px] text-white/40 mt-0.5">Lower = stricter (0.3 very strict / 0.5 lenient)</span>
          </label>
          <input
            type="range"
            min="0.30"
            max="0.65"
            step="0.01"
            value={settings.matchThreshold}
            onChange={e => setSettings(p => ({ ...p, matchThreshold: parseFloat(e.target.value) }))}
            className="w-full accent-indigo-500"
          />
          <div className="flex justify-between text-[10px] text-white/30 mt-1">
            <span>0.30 (very strict)</span>
            <span>0.65 (lenient)</span>
          </div>
        </div>
      </div>

      {/* Manager Permissions */}
      <div className="glass-card-static p-4 rounded-xl">
        <div className="flex items-center gap-2 mb-3">
          <Shield size={16} className="text-amber-400" />
          <h4 className="font-semibold text-[var(--text-primary)] text-sm">Manager Permissions</h4>
        </div>
        <label className="flex items-center gap-3 cursor-pointer select-none group p-3 rounded-xl hover:bg-white/5 transition-colors">
          <div
            onClick={() => setSettings(p => ({ ...p, managerCanOverride: !p.managerCanOverride }))}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${settings.managerCanOverride ? 'bg-amber-500' : 'bg-white/20'}`}
          >
            <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${settings.managerCanOverride ? 'translate-x-5' : 'translate-x-1'}`} />
          </div>
          <div>
            <span className="text-sm text-[var(--text-primary)] font-medium">Allow managers to override attendance</span>
            <p className="text-[11px] text-white/40">Admins can always override. Managers only if this is ON.</p>
          </div>
        </label>
      </div>

      {/* Save */}
      <div className="flex justify-end gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-premium px-5 py-2 text-sm flex items-center gap-2"
        >
          {savedAt ? <><Check size={14} /> Saved</> : saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Save size={14} /> Save Global Settings</>}
        </button>
      </div>
    </div>
  );
};

// ─── Per-Location Config Row ──────────────────────────────────────────────────

interface LocationRowProps {
  locationName: string;
  config: LocationShiftConfig;
  onChange: (config: LocationShiftConfig) => void;
  onSave: (config: LocationShiftConfig) => Promise<void>;
  onReset: (locationName: string) => Promise<void>;
}

const LocationConfigRow: React.FC<LocationRowProps> = ({ locationName, config, onChange, onSave, onReset }) => {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const handleSave = async () => {
    setSaving(true);
    await onSave(config);
    setSaving(false);
    setSavedAt(Date.now());
    setTimeout(() => setSavedAt(null), 2500);
  };

  const update = (key: keyof LocationShiftConfig, value: string | number | boolean) => {
    onChange({ ...config, [key]: value });
  };

  return (
    <div className="glass-card-static rounded-xl overflow-hidden">
      {/* Header row */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-2">
          <MapPin size={14} className="text-indigo-400" />
          <span className="font-semibold text-[var(--text-primary)] text-sm">{locationName}</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-white/50">
          <span>{config.shiftStart} – {config.shiftEnd}</span>
          <span>Cutoff: {config.morningCutoff}</span>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-white/10 p-4 space-y-4">
          {/* Shift Times */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { key: 'shiftStart', label: 'Shift Start', type: 'time' },
              { key: 'shiftEnd', label: 'Shift End', type: 'time' },
              { key: 'morningCutoff', label: 'Morning Cutoff', type: 'time' },
              { key: 'earlyExitTime', label: 'Early Exit Time', type: 'time' },
              { key: 'eveningVerificationTime', label: 'Evening Verification', type: 'time' },
            ].map(({ key, label, type }) => (
              <div key={key}>
                <label className="block text-[10px] font-medium text-white/50 mb-1">{label}</label>
                <input
                  type={type}
                  value={config[key as keyof LocationShiftConfig] as string}
                  onChange={e => update(key as keyof LocationShiftConfig, e.target.value)}
                  className="input-premium px-2 py-1.5 text-xs w-full"
                />
              </div>
            ))}
          </div>

          {/* Numeric Fields */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { key: 'graceLateMin', label: 'Late Grace (min)', min: 0, max: 120 },
              { key: 'graceEarlyMin', label: 'Early Grace (min)', min: 0, max: 120 },
              { key: 'minHoursFull', label: 'Min Hrs Full Day', min: 0, max: 24, step: 0.5 },
              { key: 'minHoursHalf', label: 'Min Hrs Half Day', min: 0, max: 24, step: 0.5 },
            ].map(({ key, label, min, max, step }) => (
              <div key={key}>
                <label className="block text-[10px] font-medium text-white/50 mb-1">{label}</label>
                <input
                  type="number"
                  min={min}
                  max={max}
                  step={step || 1}
                  value={config[key as keyof LocationShiftConfig] as number}
                  onChange={e => update(key as keyof LocationShiftConfig, parseFloat(e.target.value))}
                  className="input-premium px-2 py-1.5 text-xs w-full text-center"
                />
              </div>
            ))}
          </div>

          {/* Toggles */}
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-[var(--text-primary)]">
              <div
                onClick={() => update('fullDayRequiresMorning', !config.fullDayRequiresMorning)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${config.fullDayRequiresMorning ? 'bg-indigo-500' : 'bg-white/20'}`}
              >
                <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${config.fullDayRequiresMorning ? 'translate-x-5' : 'translate-x-1'}`} />
              </div>
              Full day requires morning entry
            </label>

            <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-[var(--text-primary)]">
              <div
                onClick={() => update('allowManagerOverride', !config.allowManagerOverride)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${config.allowManagerOverride ? 'bg-amber-500' : 'bg-white/20'}`}
              >
                <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${config.allowManagerOverride ? 'translate-x-5' : 'translate-x-1'}`} />
              </div>
              Allow manager override for this location
            </label>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t border-white/10 justify-end">
            <button
              onClick={() => onReset(locationName)}
              className="px-3 py-1.5 text-xs rounded-lg bg-white/5 hover:bg-white/10 text-white/60 border border-white/10 flex items-center gap-1.5"
            >
              <RotateCcw size={12} /> Reset to Global
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-premium px-4 py-1.5 text-xs flex items-center gap-1.5"
            >
              {savedAt ? <><Check size={12} /> Saved</> : saving ? <><Loader2 size={12} className="animate-spin" /> Saving…</> : <><Save size={12} /> Save Location</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Main Panel ───────────────────────────────────────────────────────────────

type PanelTab = 'global' | 'locations';

const AttendanceRulesPanel: React.FC = () => {
  const [tab, setTab] = useState<PanelTab>('global');
  const [locationNames, setLocationNames] = useState<string[]>([]);
  const [configs, setConfigs] = useState<Map<string, LocationShiftConfig>>(new Map());
  const [loading, setLoading] = useState(false);

  const loadLocationConfigs = useCallback(async () => {
    setLoading(true);
    const [locations, existingConfigs] = await Promise.all([
      locationService.getLocations(),
      locationShiftService.listAll(),
    ]);
    const names = locations.map(l => l.name);
    setLocationNames(names);

    const configMap = new Map<string, LocationShiftConfig>();
    existingConfigs.forEach(c => configMap.set(c.locationName, c));

    // For locations with no config, create a default in-memory one
    names.forEach(name => {
      if (!configMap.has(name)) {
        configMap.set(name, { ...DEFAULT_LOCATION_CONFIG, locationName: name });
      }
    });
    setConfigs(configMap);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (tab === 'locations') loadLocationConfigs();
  }, [tab, loadLocationConfigs]);

  const handleConfigChange = (config: LocationShiftConfig) => {
    setConfigs(prev => {
      const next = new Map(prev);
      next.set(config.locationName, config);
      return next;
    });
  };

  const handleSave = async (config: LocationShiftConfig) => {
    await locationShiftService.upsert(config);
  };

  const handleReset = async (locationName: string) => {
    if (!window.confirm(`Reset "${locationName}" to global defaults?`)) return;
    await locationShiftService.deleteByLocation(locationName);
    setConfigs(prev => {
      const next = new Map(prev);
      next.set(locationName, { ...DEFAULT_LOCATION_CONFIG, locationName });
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-2">
        {([
          { id: 'global', label: 'Global Rules', icon: Sun },
          { id: 'locations', label: 'Per-Location', icon: MapPin },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              tab === t.id
                ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/25'
                : 'bg-white/5 border border-white/10 text-white/60 hover:text-white hover:border-white/20'
            }`}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'global' && <GlobalKioskSettings />}

      {tab === 'locations' && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <AlertTriangle size={14} className="text-blue-400 mt-0.5 flex-shrink-0" />
            <p className="text-[11px] text-blue-300">
              Per-location configs override global rules. Click a location to expand and edit its timing.
              Changes are saved independently per location.
            </p>
          </div>

          {loading ? (
            <div className="text-center py-8 text-white/40 text-sm">
              <Loader2 size={16} className="animate-spin inline mr-2" /> Loading locations…
            </div>
          ) : locationNames.length === 0 ? (
            <p className="text-center py-8 text-white/40 text-sm">No locations found. Add locations in the Locations section first.</p>
          ) : (
            locationNames.map(name => (
              <LocationConfigRow
                key={name}
                locationName={name}
                config={configs.get(name) || { ...DEFAULT_LOCATION_CONFIG, locationName: name }}
                onChange={handleConfigChange}
                onSave={handleSave}
                onReset={handleReset}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default AttendanceRulesPanel;
