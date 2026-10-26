import React, { useState } from 'react';

/** Lets staff see distance to their branch before punching. */
const LocationCheckCard: React.FC<{ branch?: string }> = ({ branch }) => {
  const [state, setState] = useState<{ ok: boolean; title: string; subtitle: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const check = async () => {
    setBusy(true);
    try {
      const { locationService } = await import('../../services/locationService');
      const { verifyWithinGeofence, ensureLocationPermission } = await import('../../lib/geofence');
      const perm = await ensureLocationPermission();
      if (perm) { setState(perm); return; }
      const key = `branch_fence_${branch || ''}`;
      let cfg: any = null;
      try {
        cfg = (await locationService.getLocations()).find(l => l.name === branch) || null;
        if (cfg) localStorage.setItem(key, JSON.stringify(cfg));
      } catch { try { cfg = JSON.parse(localStorage.getItem(key) || 'null'); } catch { cfg = null; } }
      const r = await verifyWithinGeofence(cfg ? { latitude: cfg.latitude, longitude: cfg.longitude, radius_meters: cfg.radius_meters, name: branch } : null);
      setState(r);
    } catch (e: any) {
      setState({ ok: false, title: 'Location check failed', subtitle: e?.message || 'Try again.' });
    } finally { setBusy(false); }
  };

  return (
    <div className="mb-3 flex items-center gap-3 rounded-xl border border-white/10 p-3 text-sm">
      <span className="text-xl">{!state ? '📍' : state.ok ? '🟢' : '🔴'}</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold truncate">{state ? state.title : `Work location: ${branch || '—'}`}</p>
        <p className="text-xs opacity-70">{state ? state.subtitle : 'Check you are inside the branch before punching.'}</p>
      </div>
      <button onClick={check} disabled={busy} className="btn-secondary px-3 py-1.5 text-xs whitespace-nowrap">
        {busy ? 'Checking…' : state ? 'Recheck' : 'Check'}
      </button>
    </div>
  );
};

export default LocationCheckCard;
