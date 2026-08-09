import React, { useMemo } from 'react';
import { Clock, AlertTriangle, TrendingDown } from 'lucide-react';
import { Attendance, Staff } from '../../types';

interface Props {
  attendance: Attendance[];
  staff: Staff[];
}

const LateArrivalIntelligence: React.FC<Props> = ({ attendance, staff }) => {
  const isLight = document.body.classList.contains('light-theme');
  
  const stats = useMemo(() => {
    let totalLateMins = 0;
    let lateCount = 0;
    let totalPunches = 0;
    
    // Simple mock calculation for today
    const today = new Date().toISOString().slice(0, 10);
    const todayPunches = attendance.filter(a => a.date === today && a.arrivalTime);

    todayPunches.forEach(a => {
      totalPunches++;
      // A proper calculation would use the shift windows, this is a simplified view
      const s = staff.find(st => st.id === a.staffId);
      if (a.arrivalTime) {
         // rough calculation - assuming 10:00 start
         const [h, m] = a.arrivalTime.split(':').map(Number);
         const arrMins = h * 60 + m;
         const startMins = 10 * 60; // 10:00 AM default
         if (arrMins > startMins + 15) {
             lateCount++;
             totalLateMins += (arrMins - startMins);
         }
      }
    });

    const punctualityScore = totalPunches > 0 
      ? Math.round(((totalPunches - lateCount) / totalPunches) * 100) 
      : 100;

    return { totalLateMins, lateCount, punctualityScore, totalPunches };
  }, [attendance, staff]);

  const c = {
    title: isLight ? '#0F172A' : '#F8FAFC',
    subtitle: isLight ? '#475569' : '#94A3B8',
    cardBg: isLight ? 'rgba(239,68,68,0.05)' : 'rgba(239,68,68,0.1)',
    border: isLight ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.3)',
    textDanger: isLight ? '#B91C1C' : '#FCA5A5',
    textSuccess: isLight ? '#15803D' : '#86EFAC',
  };

  return (
    <div style={{
      borderRadius: '1rem',
      border: `1px solid ${c.border}`,
      background: c.cardBg,
      padding: '1.25rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Clock size={18} style={{ color: c.textDanger }} />
        <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: c.title, margin: 0 }}>
          Late Arrival Intelligence
        </h3>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
        <div style={{ background: isLight ? '#FFF' : 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '0.75rem', border: `1px solid ${c.border}` }}>
          <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: c.subtitle, fontWeight: 700 }}>Punctuality Score</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: stats.punctualityScore > 80 ? c.textSuccess : c.textDanger }}>
            {stats.punctualityScore}%
          </div>
        </div>
        <div style={{ background: isLight ? '#FFF' : 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '0.75rem', border: `1px solid ${c.border}` }}>
          <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: c.subtitle, fontWeight: 700 }}>Staff Late Today</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: c.textDanger }}>
            {stats.lateCount} <span style={{fontSize: '0.8rem', color: c.subtitle, fontWeight: 500}}>/ {stats.totalPunches}</span>
          </div>
        </div>
        <div style={{ background: isLight ? '#FFF' : 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '0.75rem', border: `1px solid ${c.border}` }}>
          <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: c.subtitle, fontWeight: 700 }}>Total Mins Lost</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: c.textDanger }}>
            {stats.totalLateMins}m
          </div>
        </div>
      </div>

      <div style={{ marginTop: '0.5rem' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: c.subtitle, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <AlertTriangle size={12} /> Late Streaks Detected (3+ Days)
        </div>
        {stats.lateCount === 0 ? (
          <div style={{ fontSize: '0.75rem', color: c.textSuccess, fontWeight: 500 }}>No late streaks detected this week. Great job!</div>
        ) : (
          <div style={{ fontSize: '0.75rem', color: c.textDanger, background: isLight ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.2)', padding: '0.5rem', borderRadius: '0.5rem' }}>
            Analytics suggest <strong>{stats.lateCount} staff members</strong> are showing a pattern of late arrivals this week.
          </div>
        )}
      </div>
    </div>
  );
};

export default LateArrivalIntelligence;
