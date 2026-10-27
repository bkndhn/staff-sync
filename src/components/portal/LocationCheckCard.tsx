import React, { useEffect, useState } from 'react';

/** Lets staff see distance to their branch before punching. Checks once on open. */
const LocationCheckCard: React.FC<{ branch?: string }> = ({ branch }) => {
  const [state, setState] = useState<{ ok: boolean; title: string; subtitle: string; distance?: number; accuracy?: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [radius, setRadius] = useState<number | null>(null);

  const check = async () => {
    setBusy(true);
    try {
      const { locationService } = await import('../../services/locationService');
      const { verifyWithinGeofence, ensureLocationPermission, DEFAULT_RADIUS_METERS } = await import('../../lib/geofence');
      const perm = await ensureLocationPermission();
      if (perm) { setState(perm); return; }
      const key = `branch_fence_${branch || ''}`;
      let cfg: any = null;
      try {
        cfg = (await locationService.getLocations()).find(l => l.name === branch) || null;
        if (cfg) localStorage.setItem(key, JSON.stringify(cfg));
      } catch { try { cfg = JSON.parse(localStorage.getItem(key) || 'null'); } catch { cfg = null; } }
      if (cfg?.latitude != null) setRadius(cfg.radius_meters || DEFAULT_RADIUS_METERS);
      const r = await verifyWithinGeofence(cfg ? { latitude: cfg.latitude, longitude: cfg.longitude, radius_meters: cfg.radius_meters, name: branch } : null);
      setState(r);
    } catch (e: any) {
      setState({ ok: false, title: 'Location check failed', subtitle: e?.message || 'Try again.' });
    } finally { setBusy(false); }
  };

  // Check silently once only if permission is already granted (never pops a prompt on open).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await (navigator as any).permissions?.query({ name: 'geolocation' });
        if (!cancelled && p?.state === 'granted') void check();
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch]);

  const pct = state?.distance != null && radius ? Math.min(100, Math.round((state.distance / radius) * 100)) : null;

  return (
    <div className="mb-3 rounded-xl border border-white/10 p-3 text-sm">
      <div className="flex items-center gap-3">
        <span className="text-xl">{busy ? '⏳' : !state ? '📍' : state.ok ? '🟢' : '🔴'}</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{state ? state.title : `Work location: ${branch || '—'}`}</p>
          <p className="text-xs opacity-70">{state ? state.subtitle : 'Check you are inside the branch before punching.'}</p>
        </div>
        <button onClick={check} disabled={busy} className="btn-secondary px-3 py-1.5 text-xs whitespace-nowrap">
          {busy ? 'Checking…' : state ? 'Recheck' : 'Check'}
        </button>
      </div>
      {pct != null && (
        <div className="mt-2">
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className={`h-full ${state?.ok ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${Math.max(4, pct)}%` }} />
          </div>
          <p className="mt-1 text-[11px] opacity-60">{Math.round(state!.distance!)}m of {radius}m allowed</p>
        </div>
      )}
    </div>
  );
};

export default LocationCheckCard;
