import React from 'react';
import { Sparkles, Lightbulb, AlertTriangle, ArrowUpRight } from 'lucide-react';
import { Staff, Attendance } from '../../types';

interface AIWorkforceInsightsWidgetProps {
  staff: Staff[];
  todayAttendance: Attendance[];
  locations: { name: string; color: string; stats: any }[];
}

export const AIWorkforceInsightsWidget: React.FC<AIWorkforceInsightsWidgetProps> = ({
  staff,
  todayAttendance,
  locations,
}) => {
  const isLight = document.body.classList.contains('light-theme');

  const insights = React.useMemo(() => {
    const list: { type: 'positive' | 'warning' | 'info'; title: string; message: string }[] = [];

    const activeCount = staff.filter(s => s.isActive).length;
    const presentCount = todayAttendance.filter(a => (a.status === 'Present' || a.status === 'Half Day') && !a.isPartTime).length;
    const rate = activeCount > 0 ? Math.round((presentCount / activeCount) * 100) : 0;

    if (rate >= 90) {
      list.push({
        type: 'positive',
        title: 'High Workforce Engagement',
        message: `Today's overall turnout is at an impressive ${rate}%. Attendance is operating above benchmark.`
      });
    } else if (rate < 70 && rate > 0) {
      list.push({
        type: 'warning',
        title: 'Elevated Absenteeism Detected',
        message: `Today's attendance stands at ${rate}%. Consider reviewing branch shift coverage.`
      });
    }

    // Branch outlier check
    locations.forEach(loc => {
      const locStaff = staff.filter(s => s.location === loc.name && s.isActive);
      const locAtt = todayAttendance.filter(a => {
        const s = staff.find(st => st.id === a.staffId);
        return s?.location === loc.name && (a.status === 'Present' || a.status === 'Half Day');
      });
      const locRate = locStaff.length > 0 ? Math.round((locAtt.length / locStaff.length) * 100) : 100;
      if (locRate < 60 && locStaff.length > 3) {
        list.push({
          type: 'warning',
          title: `Branch Alert: ${loc.name}`,
          message: `${loc.name} has a lower check-in rate (${locRate}%). Ensure manager follow-ups.`
        });
      }
    });

    // Uninformed leaves check
    const uninformed = todayAttendance.filter(a => a.isUninformed).length;
    if (uninformed > 0) {
      list.push({
        type: 'info',
        title: `${uninformed} Uninformed Absences`,
        message: `${uninformed} employee(s) logged unapproved absences today requiring HR review.`
      });
    }

    if (list.length === 0) {
      list.push({
        type: 'info',
        title: 'Normal Shift Operations',
        message: 'Shift arrivals and attendance ratios are aligned with normal operational baselines.'
      });
    }

    return list;
  }, [staff, todayAttendance, locations]);

  const cardColors = {
    positive: {
      bg: isLight ? 'rgba(16,185,129,0.12)' : 'rgba(16,185,129,0.18)',
      border: '1px solid rgba(16,185,129,0.35)',
      text: isLight ? '#064E3B' : '#A7F3D0',
      titleColor: isLight ? '#065F46' : '#ECFDF5',
      iconColor: isLight ? '#059669' : '#34D399',
    },
    warning: {
      bg: isLight ? 'rgba(245,158,11,0.12)' : 'rgba(245,158,11,0.18)',
      border: '1px solid rgba(245,158,11,0.35)',
      text: isLight ? '#78350F' : '#FDE68A',
      titleColor: isLight ? '#92400E' : '#FFFBEB',
      iconColor: isLight ? '#D97706' : '#FBBF24',
    },
    info: {
      bg: isLight ? 'rgba(99,102,241,0.10)' : 'rgba(99,102,241,0.18)',
      border: '1px solid rgba(99,102,241,0.35)',
      text: isLight ? '#312E81' : '#C7D2FE',
      titleColor: isLight ? '#3730A3' : '#EEF2FF',
      iconColor: isLight ? '#6366F1' : '#818CF8',
    },
  };

  return (
    <div style={{
      borderRadius: '1rem',
      border: '1px solid rgba(99,102,241,0.3)',
      background: isLight
        ? 'linear-gradient(to right, rgba(99,102,241,0.08), rgba(168,85,247,0.06), rgba(236,72,153,0.04))'
        : 'linear-gradient(to right, rgba(99,102,241,0.12), rgba(168,85,247,0.10), rgba(236,72,153,0.05))',
      padding: '1rem 1.25rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.75rem',
      boxShadow: '0 4px 24px rgba(99,102,241,0.08)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
        <div style={{
          width: '2rem', height: '2rem', borderRadius: '0.625rem',
          background: 'rgba(99,102,241,0.15)',
          border: '1px solid rgba(99,102,241,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: isLight ? '#4F46E5' : '#818CF8',
          flexShrink: 0,
        }}>
          <Sparkles size={16} />
        </div>
        <div>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: isLight ? '#0F172A' : '#F8FAFC', margin: 0, lineHeight: 1.3 }}>
            AI Workforce Insights
          </h3>
          <p style={{ fontSize: '0.6875rem', color: isLight ? '#64748B' : '#94A3B8', margin: 0, fontFamily: 'monospace' }}>
            Automated operational pattern analysis
          </p>
        </div>
      </div>

      {/* Insight Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
        {insights.map((item, idx) => {
          const colors = cardColors[item.type];
          return (
            <div key={idx} style={{
              padding: '0.75rem',
              borderRadius: '0.75rem',
              border: colors.border,
              background: colors.bg,
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.5rem',
              fontSize: '0.75rem',
            }}>
              <span style={{ color: colors.iconColor, flexShrink: 0, marginTop: '1px', display: 'flex' }}>
                {item.type === 'positive' ? <Lightbulb size={15} /> : item.type === 'warning' ? <AlertTriangle size={15} /> : <ArrowUpRight size={15} />}
              </span>
              <div>
                <span style={{ fontWeight: 700, display: 'block', fontSize: '0.8125rem', color: colors.titleColor, marginBottom: '2px' }}>
                  {item.title}
                </span>
                <span style={{ color: colors.text, lineHeight: 1.5, display: 'block', opacity: 0.9 }}>
                  {item.message}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AIWorkforceInsightsWidget;
