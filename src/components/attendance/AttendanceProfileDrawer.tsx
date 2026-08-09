import React from 'react';
import { X, User, MapPin, Calendar, Clock, Award } from 'lucide-react';
import { Staff, Attendance } from '../../types';
import AttendanceHeatmap from './AttendanceHeatmap';

interface Props {
  staff: Staff;
  onClose: () => void;
  // Mock data for display
  attendanceData?: Attendance[];
}

const AttendanceProfileDrawer: React.FC<Props> = ({ staff, onClose, attendanceData = [] }) => {
  const isLight = document.body.classList.contains('light-theme');
  
  const c = {
    bg: isLight ? '#FFFFFF' : '#0F172A',
    text: isLight ? '#0F172A' : '#F8FAFC',
    muted: isLight ? '#475569' : '#94A3B8',
    border: isLight ? '#E2E8F0' : '#1E293B',
    accent: isLight ? '#4F46E5' : '#818CF8', // Indigo
    accentBg: isLight ? '#EEF2FF' : '#312E81',
  };

  return (
    <>
      <div 
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40, backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />
      <div style={{
        position: 'fixed', right: 0, top: 0, bottom: 0, width: '400px', maxWidth: '100%',
        background: c.bg, zIndex: 50, boxShadow: '-4px 0 15px rgba(0,0,0,0.1)',
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
        transform: 'translateX(0)', transition: 'transform 0.3s ease-in-out'
      }}>
        {/* Header */}
        <div style={{ padding: '1.5rem', borderBottom: `1px solid ${c.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {staff.photo ? (
              <img src={staff.photo} alt={staff.name} style={{ width: '56px', height: '56px', borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: c.accentBg, color: c.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 'bold' }}>
                {staff.name.charAt(0)}
              </div>
            )}
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: c.text }}>{staff.name}</h2>
              <p style={{ margin: 0, fontSize: '0.875rem', color: c.muted, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <MapPin size={12} /> {staff.location} • {staff.designation || 'Staff'}
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: c.muted }}>
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Quick Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
            <div style={{ padding: '1rem', borderRadius: '0.75rem', border: `1px solid ${c.border}`, background: isLight ? '#F8FAFC' : '#1E293B' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: c.muted, fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>
                <Award size={14} /> YTD Attendance
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: c.text, marginTop: '0.25rem' }}>94%</div>
            </div>
            <div style={{ padding: '1rem', borderRadius: '0.75rem', border: `1px solid ${c.border}`, background: isLight ? '#F8FAFC' : '#1E293B' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: c.muted, fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>
                <Clock size={14} /> Avg. Daily Hours
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: c.text, marginTop: '0.25rem' }}>8.2h</div>
            </div>
          </div>

          {/* Heatmap */}
          <div>
            <AttendanceHeatmap data={[]} year={new Date().getFullYear()} />
          </div>

          {/* Leave History (Mock) */}
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: c.text, display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Calendar size={16} /> Recent Leave History
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {[
                { date: '12 Aug 2026', type: 'Sick Leave', status: 'Approved' },
                { date: '04 Jul 2026', type: 'Casual Leave', status: 'Approved' },
              ].map((l, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', borderRadius: '0.5rem', border: `1px solid ${c.border}` }}>
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: c.text }}>{l.type}</div>
                    <div style={{ fontSize: '0.75rem', color: c.muted }}>{l.date}</div>
                  </div>
                  <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#15803D', background: '#DCFCE7', padding: '2px 8px', borderRadius: '999px' }}>
                    {l.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </>
  );
};

export default AttendanceProfileDrawer;
