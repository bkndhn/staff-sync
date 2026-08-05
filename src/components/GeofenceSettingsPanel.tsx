import React, { useState, useEffect } from 'react';
import { MapPin, Smartphone, Shield, Check, X, Edit2, Save } from 'lucide-react';
import { settingsService } from '../services/settingsService';
import { locationService, Branch } from '../services/locationService';

export const GeofenceSettingsPanel: React.FC = () => {
    const [requireGeofence, setRequireGeofence] = useState(false);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [editingBranch, setEditingBranch] = useState<string | null>(null);
    const [lat, setLat] = useState('');
    const [lng, setLng] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setRequireGeofence(settingsService.getRequireGeofence());
        loadBranches();
    }, []);

    const loadBranches = async () => {
        setLoading(true);
        const locs = await locationService.getLocations();
        setBranches(locs);
        setLoading(false);
    };

    const handleToggle = (checked: boolean) => {
        setRequireGeofence(checked);
        settingsService.setRequireGeofence(checked);
        setSuccess(`Mobile Geofencing ${checked ? 'Enforced' : 'Disabled'}`);
        setTimeout(() => setSuccess(''), 3000);
    };

    const handleEdit = (branch: Branch) => {
        setEditingBranch(branch.id);
        setLat(branch.latitude?.toString() || '');
        setLng(branch.longitude?.toString() || '');
    };

    const handleSave = async (id: string) => {
        const numLat = parseFloat(lat);
        const numLng = parseFloat(lng);
        
        if (isNaN(numLat) || isNaN(numLng)) {
            alert('Invalid coordinates');
            return;
        }

        const success = await locationService.updateLocationConfig(id, { 
            latitude: numLat, 
            longitude: numLng, 
            radius_meters: 50 // Enforce strict 50m radius as requested
        });

        if (success) {
            setEditingBranch(null);
            loadBranches();
            setSuccess('Coordinates updated successfully');
            setTimeout(() => setSuccess(''), 3000);
        } else {
            alert('Failed to update coordinates');
        }
    };

    return (
        <div className="space-y-6">
            <div className="glass-card-static p-4 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center shrink-0">
                        <Smartphone size={20} className="text-indigo-400" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="font-semibold text-[var(--text-primary)] text-sm flex items-center gap-2">
                            Require Mobile App Geofencing 
                            <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-[10px] text-indigo-300">STRICT</span>
                        </h3>
                        <p className="text-xs text-[var(--text-muted)]">When enabled, managers CANNOT manually clock-in via web. They must use the React Native Companion App while physically within 50 meters of the Branch GPS coordinates.</p>
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
                    <h4 className="text-sm font-semibold text-[var(--text-primary)]">Branch GPS Coordinates</h4>
                </div>
                
                <div className="divide-y divide-[var(--glass-border)]">
                    {loading ? (
                        <div className="p-4 text-center text-[var(--text-muted)] text-sm">Loading branches...</div>
                    ) : branches.map(branch => (
                        <div key={branch.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <h5 className="font-semibold text-[var(--text-primary)] text-sm">{branch.name}</h5>
                                {!editingBranch || editingBranch !== branch.id ? (
                                    <div className="text-xs text-[var(--text-muted)] mt-1 flex gap-4">
                                        <span>Lat: {branch.latitude || 'Not set'}</span>
                                        <span>Lng: {branch.longitude || 'Not set'}</span>
                                    </div>
                                ) : (
                                    <div className="flex gap-2 mt-2">
                                        <input 
                                            type="number" 
                                            placeholder="Latitude (e.g. 11.1085)" 
                                            value={lat} 
                                            onChange={e => setLat(e.target.value)}
                                            className="input-premium text-xs py-1 px-2 w-32"
                                        />
                                        <input 
                                            type="number" 
                                            placeholder="Longitude (e.g. 77.3411)" 
                                            value={lng} 
                                            onChange={e => setLng(e.target.value)}
                                            className="input-premium text-xs py-1 px-2 w-32"
                                        />
                                    </div>
                                )}
                            </div>
                            
                            <div>
                                {editingBranch === branch.id ? (
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => handleSave(branch.id)} className="p-1.5 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 rounded-lg">
                                            <Save size={16} />
                                        </button>
                                        <button onClick={() => setEditingBranch(null)} className="p-1.5 bg-white/10 text-white hover:bg-white/20 rounded-lg">
                                            <X size={16} />
                                        </button>
                                    </div>
                                ) : (
                                    <button onClick={() => handleEdit(branch)} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-[var(--text-secondary)] rounded-lg text-xs font-semibold transition-colors">
                                        <Edit2 size={12} /> Edit GPS
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
