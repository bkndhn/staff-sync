import React, { useState, useEffect } from 'react';
import { MapPin, Smartphone, Check, X, Edit2, Save, Crosshair, Activity, Loader2 } from 'lucide-react';
import { settingsService } from '../services/settingsService';
import { locationService, Branch } from '../services/locationService';
import { acquirePosition, verifyWithinGeofence, DEFAULT_RADIUS_METERS, GeofenceResult } from '../lib/geofence';

export const GeofenceSettingsPanel: React.FC = () => {
    const [requireGeofence, setRequireGeofence] = useState(false);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [editingBranch, setEditingBranch] = useState<string | null>(null);
    const [lat, setLat] = useState('');
    const [lng, setLng] = useState('');
    const [radius, setRadius] = useState(String(DEFAULT_RADIUS_METERS));
    const [capturing, setCapturing] = useState(false);
    const [testingId, setTestingId] = useState<string | null>(null);
    const [testResult, setTestResult] = useState<Record<string, GeofenceResult>>({});
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        settingsService.getRequireGeofence().then(setRequireGeofence);
        loadBranches();
    }, []);

    const loadBranches = async () => {
        setLoading(true);
        const locs = await locationService.getLocations();
        setBranches(locs);
        setLoading(false);
    };

    const flash = (msg: string) => {
        setSuccess(msg);
        setTimeout(() => setSuccess(''), 3000);
    };

    const handleToggle = (checked: boolean) => {
        setRequireGeofence(checked);
        settingsService.setRequireGeofence(checked);
        flash(`Mobile Geofencing ${checked ? 'Enforced' : 'Disabled'}`);
    };

    const handleEdit = (branch: Branch) => {
        setEditingBranch(branch.id);
        setLat(branch.latitude?.toString() || '');
        setLng(branch.longitude?.toString() || '');
        setRadius(String(branch.radius_meters || DEFAULT_RADIUS_METERS));
    };

    const handleCapture = async () => {
        setCapturing(true);
        try {
            const { pos } = await acquirePosition();
            setLat(pos.coords.latitude.toFixed(6));
            setLng(pos.coords.longitude.toFixed(6));
            flash(`Captured current position (±${Math.round(pos.coords.accuracy)}m)`);
        } catch (err) {
            alert((err as Error).message);
        } finally {
            setCapturing(false);
        }
    };

    const handleTest = async (branch: Branch) => {
        setTestingId(branch.id);
        const result = await verifyWithinGeofence({
            latitude: branch.latitude as number,
            longitude: branch.longitude as number,
            radius_meters: branch.radius_meters,
            name: branch.name,
        });
        setTestResult(prev => ({ ...prev, [branch.id]: result }));
        setTestingId(null);
    };

    const handleSave = async (id: string) => {
        const numLat = parseFloat(lat);
        const numLng = parseFloat(lng);
        const numRadius = parseInt(radius, 10);

        if (isNaN(numLat) || isNaN(numLng)) {
            alert('Invalid coordinates');
            return;
        }
        if (isNaN(numRadius) || numRadius < 20 || numRadius > 1000) {
            alert('Radius must be between 20 and 1000 meters');
            return;
        }

        const ok = await locationService.updateLocationConfig(id, {
            latitude: numLat,
            longitude: numLng,
            radius_meters: numRadius,
        });

        if (ok) {
            setEditingBranch(null);
            loadBranches();
            flash('Geofence updated successfully');
        } else {
            alert('Failed to update coordinates');
        }
    };

    return (
        <div className="space-y-6">
            <div className="glass-card-static p-4 rounded-xl flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center shrink-0">
                        <Smartphone size={20} className="text-indigo-400" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="font-semibold text-[var(--text-primary)] text-sm flex items-center gap-2 flex-wrap">
                            Require Mobile App Geofencing
                            <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-[10px] text-indigo-300">STRICT</span>
                        </h3>
                        <p className="text-xs text-[var(--text-muted)]">When enabled, web clock-in is blocked. Staff must punch from the companion app while physically inside the branch radius, with anti-spoofing checks on every fix.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={requireGeofence}
                            onChange={(e) => handleToggle(e.target.checked)}
                            className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-white/30 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
                    </label>
                </div>
            </div>

            {success && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl text-xs flex items-center gap-2">
                    <Check size={14} /> {success}
                </div>
            )}

            <div className="bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-[var(--glass-border)] bg-black/20 flex items-center gap-2">
                    <MapPin size={16} className="text-[var(--text-secondary)]" />
                    <h4 className="text-sm font-semibold text-[var(--text-primary)]">Branch GPS Fences</h4>
                </div>

                <div className="divide-y divide-[var(--glass-border)]">
                    {loading ? (
                        <div className="p-4 text-center text-[var(--text-muted)] text-sm">Loading branches...</div>
                    ) : branches.length === 0 ? (
                        <div className="p-4 text-center text-[var(--text-muted)] text-sm">No active branches found.</div>
                    ) : branches.map(branch => {
                        const result = testResult[branch.id];
                        const isEditing = editingBranch === branch.id;
                        return (
                            <div key={branch.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="min-w-0 flex-1">
                                    <h5 className="font-semibold text-[var(--text-primary)] text-sm">{branch.name}</h5>
                                    {!isEditing ? (
                                        <>
                                            <div className="text-xs text-[var(--text-muted)] mt-1 flex flex-wrap gap-x-4 gap-y-1">
                                                <span>Lat: {branch.latitude ?? 'Not set'}</span>
                                                <span>Lng: {branch.longitude ?? 'Not set'}</span>
                                                <span>Radius: {branch.radius_meters || DEFAULT_RADIUS_METERS}m</span>
                                            </div>
                                            {result && (
                                                <div className={`mt-2 text-xs rounded-lg px-2 py-1.5 border ${result.ok ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'}`}>
                                                    <strong>{result.title}</strong> — {result.subtitle}
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="flex flex-wrap gap-2 mt-2">
                                            <input
                                                type="number"
                                                placeholder="Latitude"
                                                value={lat}
                                                onChange={e => setLat(e.target.value)}
                                                className="input-premium text-xs py-1 px-2 w-32"
                                            />
                                            <input
                                                type="number"
                                                placeholder="Longitude"
                                                value={lng}
                                                onChange={e => setLng(e.target.value)}
                                                className="input-premium text-xs py-1 px-2 w-32"
                                            />
                                            <input
                                                type="number"
                                                placeholder="Radius (m)"
                                                value={radius}
                                                onChange={e => setRadius(e.target.value)}
                                                className="input-premium text-xs py-1 px-2 w-28"
                                            />
                                            <button
                                                onClick={handleCapture}
                                                disabled={capturing}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 rounded-lg text-xs font-semibold disabled:opacity-50"
                                            >
                                                {capturing ? <Loader2 size={12} className="animate-spin" /> : <Crosshair size={12} />}
                                                Use my location
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div className="shrink-0">
                                    {isEditing ? (
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => handleSave(branch.id)} className="p-1.5 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 rounded-lg">
                                                <Save size={16} />
                                            </button>
                                            <button onClick={() => setEditingBranch(null)} className="p-1.5 bg-white/10 text-[var(--text-primary)] hover:bg-white/20 rounded-lg">
                                                <X size={16} />
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleTest(branch)}
                                                disabled={testingId === branch.id || branch.latitude == null}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-[var(--text-secondary)] rounded-lg text-xs font-semibold transition-colors disabled:opacity-40"
                                            >
                                                {testingId === branch.id ? <Loader2 size={12} className="animate-spin" /> : <Activity size={12} />}
                                                Test GPS
                                            </button>
                                            <button onClick={() => handleEdit(branch)} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-[var(--text-secondary)] rounded-lg text-xs font-semibold transition-colors">
                                                <Edit2 size={12} /> Edit fence
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
