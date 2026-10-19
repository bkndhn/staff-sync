import React, { useState } from 'react';
import { Megaphone, X, Send } from 'lucide-react';
import { buildShiftBroadcast } from '../utils/flexBroadcast';

interface Props { locations: string[]; defaultLocation?: string }

/** Share an urgent "we need flex staff" message to a WhatsApp group in one tap. */
const FlexShiftBroadcast: React.FC<Props> = ({ locations, defaultLocation }) => {
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useState(defaultLocation || locations[0] || '');
  const [shift, setShift] = useState<'Morning' | 'Evening' | 'Full Day'>('Evening');
  const [count, setCount] = useState(2);
  const [rate, setRate] = useState<number | ''>('');
  const [date, setDate] = useState<'Today' | 'Tomorrow'>('Today');

  const text = buildShiftBroadcast({ location, shift, count, rate: rate === '' ? undefined : rate, day: date });
  const send = () => { window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank'); setOpen(false); };

  return (
    <>
      <button onClick={() => setOpen(true)} className="flex items-center gap-2 px-3 md:px-4 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors text-sm">
        <Megaphone size={16} /> <span>Request Staff</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-end sm:items-center justify-center p-3" onClick={() => setOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-card text-foreground border border-border p-4 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-2"><Megaphone size={18} /> Request flex staff</h3>
              <button onClick={() => setOpen(false)} aria-label="Close"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <label className="col-span-2">Branch
                <select value={location} onChange={e => setLocation(e.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-2">
                  {locations.map(l => <option key={l}>{l}</option>)}
                </select>
              </label>
              <label>Day
                <select value={date} onChange={e => setDate(e.target.value as 'Today' | 'Tomorrow')} className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-2">
                  <option>Today</option><option>Tomorrow</option>
                </select>
              </label>
              <label>Shift
                <select value={shift} onChange={e => setShift(e.target.value as typeof shift)} className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-2">
                  <option>Morning</option><option>Evening</option><option>Full Day</option>
                </select>
              </label>
              <label>People needed
                <input type="number" min={1} max={50} value={count} onChange={e => setCount(Math.max(1, Number(e.target.value) || 1))} className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-2" />
              </label>
              <label>Pay (Rs.)
                <input type="number" min={0} value={rate} placeholder="Optional" onChange={e => setRate(e.target.value === '' ? '' : Number(e.target.value))} className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-2" />
              </label>
            </div>
            <pre className="whitespace-pre-wrap text-xs rounded-lg bg-muted p-2 text-muted-foreground">{text}</pre>
            <button onClick={send} disabled={!location} className="w-full rounded-xl bg-emerald-600 text-white py-2.5 font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
              <Send size={16} /> Send on WhatsApp
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default FlexShiftBroadcast;
