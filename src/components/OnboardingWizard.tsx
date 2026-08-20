import React, { useEffect, useMemo, useState } from 'react';
import {
  onboardingService,
  applyBranding,
  DEFAULT_BRANDING,
  OrgBranding,
} from '../services/onboardingService';
import { locationService, Branch } from '../services/locationService';
import { floorService, Floor } from '../services/floorService';
import { shiftService, DEFAULT_SHIFT_WINDOWS, ShiftWindows, ShiftKey } from '../services/shiftService';
import { staffService } from '../services/staffService';
import { Staff } from '../types';

interface Props {
  onClose: () => void;
  onFinished?: () => void;
}

const STEPS = ['Branding', 'Branches', 'Zones', 'Shifts', 'Staff', 'Done'] as const;

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30';
const labelCls = 'block text-xs font-semibold text-slate-600 mb-1';
const btnPrimary =
  'inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50';
const btnGhost =
  'inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50';

const OnboardingWizard: React.FC<Props> = ({ onClose, onFinished }) => {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [branding, setBranding] = useState<OrgBranding>({ ...DEFAULT_BRANDING });
  const [locations, setLocations] = useState<Branch[]>([]);
  const [newLocation, setNewLocation] = useState('');
  const [floors, setFloors] = useState<Floor[]>([]);
  const [newFloor, setNewFloor] = useState('');
  const [floorLocation, setFloorLocation] = useState('');
  const [shifts, setShifts] = useState<ShiftWindows>(DEFAULT_SHIFT_WINDOWS);
  const [csv, setCsv] = useState('');
  const [importSummary, setImportSummary] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [state, b, locs, flrs, sh] = await Promise.all([
        onboardingService.getState(),
        onboardingService.getBranding(),
        locationService.getLocations(),
        floorService.getFloors(),
        shiftService.loadGlobal(true),
      ]);
      setStep(Math.min(state.step ?? 0, STEPS.length - 1));
      setBranding(b);
      setLocations(locs);
      setFloors(flrs);
      setShifts(sh);
      if (locs[0]) setFloorLocation(locs[0].name);
    })();
  }, []);

  const goto = async (next: number) => {
    setError(null);
    setNotice(null);
    const clamped = Math.max(0, Math.min(next, STEPS.length - 1));
    setStep(clamped);
    await onboardingService.saveState({ step: clamped });
  };

  const saveBranding = async () => {
    setBusy(true);
    try {
      await onboardingService.saveBranding(branding);
      applyBranding(branding);
      await goto(1);
    } finally {
      setBusy(false);
    }
  };

  const addLocation = async () => {
    const name = newLocation.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const { location } = await locationService.addLocation(name);
      if (!location) {
        setError('Could not create the branch. Check your plan limits and try again.');
        return;
      }
      setLocations(prev => [...prev, location]);
      setNewLocation('');
      if (!floorLocation) setFloorLocation(location.name);
    } finally {
      setBusy(false);
    }
  };

  const addFloor = async () => {
    const name = newFloor.trim();
    if (!name || !floorLocation) return;
    setBusy(true);
    setError(null);
    try {
      const created = await floorService.addFloor(floorLocation, name);
      if (!created) {
        setError('Could not create the zone.');
        return;
      }
      setFloors(prev => [...prev, created]);
      setNewFloor('');
    } finally {
      setBusy(false);
    }
  };

  const saveShifts = async () => {
    setBusy(true);
    try {
      await shiftService.saveGlobal(shifts);
      await goto(4);
    } finally {
      setBusy(false);
    }
  };

  const parsedRows = useMemo(() => {
    return csv
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .filter(l => !/^name\s*,/i.test(l))
      .map(l => l.split(',').map(c => c.trim()));
  }, [csv]);

  const importStaff = async () => {
    if (parsedRows.length === 0) return;
    setBusy(true);
    setError(null);
    let ok = 0;
    let failed = 0;
    for (const row of parsedRows) {
      const [name, location, salaryRaw, joinedRaw] = row;
      if (!name || !location) {
        failed++;
        continue;
      }
      const total = Number(salaryRaw) || 0;
      const payload = {
        name,
        location,
        type: 'full-time',
        experience: 'Novice',
        basicSalary: total,
        incentive: 0,
        hra: 0,
        totalSalary: total,
        joinedDate: joinedRaw || new Date().toISOString().split('T')[0],
        isActive: true,
      } as unknown as Omit<Staff, 'id'>;
      try {
        await staffService.create(payload);
        ok++;
      } catch {
        failed++;
      }
    }
    setImportSummary(`${ok} added${failed ? `, ${failed} skipped` : ''}.`);
    setBusy(false);
  };

  const finish = async () => {
    setBusy(true);
    try {
      await onboardingService.complete();
      onFinished?.();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const skip = async () => {
    await onboardingService.complete();
    onClose();
  };

  const shiftKeys: ShiftKey[] = ['Morning', 'Evening', 'Both'];

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-slate-900/50 p-0 sm:p-4">
      <div className="w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Set up your workspace</h2>
              <p className="text-xs text-slate-500">Step {step + 1} of {STEPS.length} — {STEPS[step]}</p>
            </div>
            <button onClick={skip} className="text-xs font-semibold text-slate-500 hover:text-slate-800">
              Skip for now
            </button>
          </div>
          <div className="mt-3 h-1.5 w-full rounded-full bg-slate-100">
            <div
              className="h-1.5 rounded-full bg-blue-600 transition-all"
              style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            />
          </div>
        </div>

        <div className="px-4 py-5 sm:px-6 space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
          {notice && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">{notice}</div>
          )}

          {step === 0 && (
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Organisation name</label>
                <input
                  className={inputCls}
                  value={branding.orgName}
                  onChange={e => setBranding({ ...branding, orgName: e.target.value })}
                  placeholder="Acme Retail Pvt Ltd"
                />
              </div>
              <div>
                <label className={labelCls}>Tagline</label>
                <input
                  className={inputCls}
                  value={branding.tagline}
                  onChange={e => setBranding({ ...branding, tagline: e.target.value })}
                  placeholder="Workforce operations"
                />
              </div>
              <div>
                <label className={labelCls}>Logo URL (optional)</label>
                <input
                  className={inputCls}
                  value={branding.logoUrl}
                  onChange={e => setBranding({ ...branding, logoUrl: e.target.value })}
                  placeholder="https://…/logo.png"
                />
              </div>
              <div>
                <label className={labelCls}>Accent colour</label>
                <input
                  type="color"
                  className="h-10 w-20 rounded border border-slate-300 bg-white"
                  value={branding.primaryColor}
                  onChange={e => setBranding({ ...branding, primaryColor: e.target.value })}
                />
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">Add each branch or site where staff report to work.</p>
              <div className="flex gap-2">
                <input
                  className={inputCls}
                  value={newLocation}
                  onChange={e => setNewLocation(e.target.value)}
                  placeholder="Main Branch"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLocation(); } }}
                />
                <button className={btnPrimary} disabled={busy || !newLocation.trim()} onClick={addLocation}>Add</button>
              </div>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {locations.length === 0 && (
                  <li className="px-3 py-3 text-sm text-slate-400">No branches yet.</li>
                )}
                {locations.map(l => (
                  <li key={l.id} className="px-3 py-2 text-sm text-slate-800">{l.name}</li>
                ))}
              </ul>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">Zones (floors/departments) inside each branch.</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <select className={inputCls} value={floorLocation} onChange={e => setFloorLocation(e.target.value)}>
                  {locations.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
                </select>
                <input
                  className={inputCls}
                  value={newFloor}
                  onChange={e => setNewFloor(e.target.value)}
                  placeholder="Ground Floor"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFloor(); } }}
                />
                <button className={btnPrimary} disabled={busy || !newFloor.trim() || !floorLocation} onClick={addFloor}>Add</button>
              </div>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {floors.length === 0 && <li className="px-3 py-3 text-sm text-slate-400">No zones yet.</li>}
                {floors.map(f => (
                  <li key={f.id} className="px-3 py-2 text-sm text-slate-800">
                    {f.name} <span className="text-slate-400">— {f.locationName}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">Default shift windows. You can fine-tune these later per branch.</p>
              {shiftKeys.map(key => (
                <div key={key} className="rounded-lg border border-slate-200 p-3">
                  <p className="mb-2 text-sm font-semibold text-slate-800">{key}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelCls}>Start</label>
                      <input
                        type="time"
                        className={inputCls}
                        value={shifts[key].start}
                        onChange={e => setShifts({ ...shifts, [key]: { ...shifts[key], start: e.target.value } })}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>End</label>
                      <input
                        type="time"
                        className={inputCls}
                        value={shifts[key].end}
                        onChange={e => setShifts({ ...shifts, [key]: { ...shifts[key], end: e.target.value } })}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Late grace (min)</label>
                      <input
                        type="number"
                        className={inputCls}
                        value={shifts[key].graceLateMin}
                        onChange={e => setShifts({ ...shifts, [key]: { ...shifts[key], graceLateMin: Number(e.target.value) } })}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Min hours (full day)</label>
                      <input
                        type="number"
                        className={inputCls}
                        value={shifts[key].minHoursFull}
                        onChange={e => setShifts({ ...shifts, [key]: { ...shifts[key], minHoursFull: Number(e.target.value) } })}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Paste staff rows as <code className="rounded bg-slate-100 px-1">Name, Branch, Monthly salary, Joined date</code> — one per line.
              </p>
              <textarea
                className={`${inputCls} h-40 font-mono`}
                value={csv}
                onChange={e => setCsv(e.target.value)}
                placeholder={'Ravi Kumar, Main Branch, 18000, 2026-01-15\nAsha S, Main Branch, 16000, 2026-02-01'}
              />
              <div className="flex items-center gap-3">
                <button className={btnPrimary} disabled={busy || parsedRows.length === 0} onClick={importStaff}>
                  Import {parsedRows.length > 0 ? `${parsedRows.length} row${parsedRows.length > 1 ? 's' : ''}` : ''}
                </button>
                {importSummary && <span className="text-sm text-slate-600">{importSummary}</span>}
              </div>
              <p className="text-xs text-slate-400">You can skip this and add staff from the Staff page later.</p>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-3 text-center py-6">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-2xl">✓</div>
              <h3 className="text-lg font-bold text-slate-900">You're all set</h3>
              <p className="text-sm text-slate-600">
                {locations.length} branch{locations.length === 1 ? '' : 'es'}, {floors.length} zone{floors.length === 1 ? '' : 's'} configured.
                Next: mark attendance, run payroll, invite staff to the portal.
              </p>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
          <button className={btnGhost} disabled={busy || step === 0} onClick={() => goto(step - 1)}>Back</button>
          {step === 0 && <button className={btnPrimary} disabled={busy} onClick={saveBranding}>Save & continue</button>}
          {step === 3 && <button className={btnPrimary} disabled={busy} onClick={saveShifts}>Save & continue</button>}
          {step !== 0 && step !== 3 && step !== STEPS.length - 1 && (
            <button className={btnPrimary} disabled={busy} onClick={() => goto(step + 1)}>Continue</button>
          )}
          {step === STEPS.length - 1 && (
            <button className={btnPrimary} disabled={busy} onClick={finish}>Finish setup</button>
          )}
        </div>
      </div>
    </div>
  );
};

export default OnboardingWizard;
