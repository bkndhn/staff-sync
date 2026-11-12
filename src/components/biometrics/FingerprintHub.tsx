import React, { useEffect, useMemo, useState } from 'react';
import { Fingerprint, ShieldCheck, Users, Usb, Maximize2, AlertTriangle } from 'lucide-react';
import { Staff, Attendance } from '../../types';
import FingerprintStation from '../FingerprintStation';
import { fingerprintCloudService, CloudFingerprint } from '../../services/fingerprintCloudService';

interface Props { staff: Staff[]; attendance: Attendance[]; userLocation?: string; onAttendanceUpdated?: () => void }

/** Fingerprint onboarding and punching, kept separate from face punch. */
const FingerprintHub: React.FC<Props> = ({ staff, attendance, userLocation, onAttendanceUpdated }) => {
  const [prints, setPrints] = useState<CloudFingerprint[]>(() => fingerprintCloudService.cached());
  useEffect(() => { fingerprintCloudService.list().then(setPrints).catch(() => {}); }, []);
  const supported = typeof window !== 'undefined' && !!window.PublicKeyCredential && window.isSecureContext;
  const active = useMemo(() => staff.filter(s => s.isActive && (!userLocation || s.location === userLocation)), [staff, userLocation]);
  const enrolled = new Set(prints.filter(p => p.verified).map(p => p.staffId));
  const done = active.filter(s => enrolled.has(s.id)).length;
  const pct = active.length ? Math.round((done / active.length) * 100) : 0;
  const missing = active.filter(s => !enrolled.has(s.id)).slice(0, 12);

  const Card = ({ icon: I, label, value, tone }: { icon: any; label: string; value: string; tone: string }) => (
    <div className="glass-card rounded-2xl p-4 flex items-center gap-3">
      <div className={`p-2.5 rounded-xl ${tone}`}><I className="w-5 h-5" /></div>
      <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-lg font-bold">{value}</p></div>
    </div>
  );

  return (
    <div className="space-y-4 animate-slide-up">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><Fingerprint className="w-6 h-6 text-blue-500" /> Fingerprint Station</h2>
          <p className="text-sm text-muted-foreground">Enrol staff on an external fingerprint reader and punch IN/OUT. Separate from face punch.</p>
        </div>
        <a href="/fingerprint" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-primary-foreground text-sm font-medium">
          <Maximize2 className="w-4 h-4" /> Open full-screen station
        </a>
      </header>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card icon={Users} label="Enrolled staff" value={`${done} / ${active.length}`} tone="bg-blue-500/15 text-blue-400" />
        <Card icon={ShieldCheck} label="Coverage" value={`${pct}%`} tone="bg-emerald-500/15 text-emerald-400" />
        <Card icon={Fingerprint} label="Keys on file" value={String(prints.filter(p => p.verified).length)} tone="bg-violet-500/15 text-violet-400" />
        <Card icon={Usb} label="This device" value={supported ? 'Ready' : 'Not supported'} tone={supported ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'} />
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-blue-500 transition-all duration-700" style={{ width: `${pct}%` }} /></div>
      {missing.length > 0 && (
        <div className="glass-card rounded-2xl p-4">
          <p className="text-sm font-medium flex items-center gap-2 mb-2"><AlertTriangle className="w-4 h-4 text-amber-500" /> Still to enrol ({active.length - done})</p>
          <div className="flex flex-wrap gap-1.5">{missing.map(s => <span key={s.id} className="text-xs px-2 py-1 rounded-full bg-muted">{s.name}</span>)}</div>
        </div>
      )}
      <div className="glass-card rounded-2xl overflow-hidden">
        <FingerprintStation page staff={staff} attendance={attendance} userLocation={userLocation}
          onAttendanceUpdated={() => { onAttendanceUpdated?.(); fingerprintCloudService.list().then(setPrints).catch(() => {}); }} />
      </div>
    </div>
  );
};
export default FingerprintHub;
