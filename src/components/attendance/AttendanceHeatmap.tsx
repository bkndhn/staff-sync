import React from 'react';

interface Props {
  data: { date: string; value: number }[];
  year: number;
}

const AttendanceHeatmap: React.FC<Props> = ({ data, year }) => {
  const isLight = document.body.classList.contains('light-theme');
  
  // Basic mock heatmap structure
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  // Calculate color intensity based on value (hours worked)
  const getColor = (value: number) => {
    if (value === 0) return isLight ? '#f1f5f9' : '#1e293b'; // Slate 100 / 800
    if (value < 4) return isLight ? '#dcfce7' : '#064e3b'; // Green 100 / 900
    if (value < 8) return isLight ? '#86efac' : '#047857'; // Green 300 / 700
    return isLight ? '#22c55e' : '#10b981'; // Green 500
  };

  const c = {
    title: isLight ? '#0F172A' : '#F8FAFC',
    subtitle: isLight ? '#64748B' : '#94A3B8',
    border: isLight ? '#E2E8F0' : '#334155',
    bg: isLight ? '#FFFFFF' : '#0F172A',
  };

  // Generate 52 weeks of mock data for visual representation
  const weeks = Array.from({ length: 52 }, (_, weekIndex) => 
    Array.from({ length: 7 }, (_, dayIndex) => {
      // Mock logic: just random values between 0 and 10 to simulate hours
      const val = Math.random() > 0.2 ? Math.floor(Math.random() * 6) + 4 : 0; 
      return val;
    })
  );

  return (
    <div style={{
      background: c.bg,
      border: `1px solid ${c.border}`,
      borderRadius: '0.75rem',
      padding: '1rem',
      width: '100%',
      overflowX: 'auto'
    }}>
      <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: c.title, marginBottom: '0.5rem' }}>
        Attendance Intensity ({year})
      </h4>
      <div style={{ display: 'flex', gap: '3px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '15px' }}>
          {['Mon', 'Wed', 'Fri'].map((day, i) => (
            <div key={day} style={{ fontSize: '0.6rem', color: c.subtitle, height: '24px', lineHeight: '24px' }}>
              {day}
            </div>
          ))}
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px', paddingLeft: '2px' }}>
             {months.map(m => (
               <div key={m} style={{ fontSize: '0.6rem', color: c.subtitle }}>{m}</div>
             ))}
          </div>
          <div style={{ display: 'flex', gap: '3px' }}>
            {weeks.map((week, wIdx) => (
              <div key={wIdx} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {week.map((val, dIdx) => (
                  <div 
                    key={dIdx} 
                    style={{
                      width: '10px', 
                      height: '10px', 
                      borderRadius: '2px',
                      background: getColor(val)
                    }}
                    title={`${val} hours`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.75rem', fontSize: '0.65rem', color: c.subtitle }}>
        <span>Less</span>
        <div style={{ display: 'flex', gap: '2px' }}>
          {[0, 3, 6, 9].map(v => (
            <div key={v} style={{ width: '10px', height: '10px', borderRadius: '2px', background: getColor(v) }} />
          ))}
        </div>
        <span>More</span>
      </div>
    </div>
  );
};

export default AttendanceHeatmap;
