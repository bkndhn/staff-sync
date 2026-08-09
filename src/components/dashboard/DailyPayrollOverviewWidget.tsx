import React from 'react';
import { DollarSign, Wallet, CreditCard, TrendingUp } from 'lucide-react';
import { Staff, Attendance } from '../../types';

interface DailyPayrollOverviewWidgetProps {
  todayAttendance: Attendance[];
  staff: Staff[];
}

export const DailyPayrollOverviewWidget: React.FC<DailyPayrollOverviewWidgetProps> = ({ todayAttendance, staff }) => {
  const dailyMetrics = React.useMemo(() => {
    let totalFullTimeDailyCost = 0;
    let presentFullTimeCount = 0;
    todayAttendance.forEach(att => {
      if (att.status === 'Present' || att.status === 'Half Day') {
        const sm = staff.find(s => s.id === att.staffId);
        if (sm) {
          const monthly = sm.totalPayroll ?? sm.totalSalary ?? 15000;
          const calcDays = sm.salaryCalculationDays || 30;
          const perDay = monthly / Math.max(1, calcDays);
          const weight = att.status === 'Half Day' ? 0.5 : 1.0;
          totalFullTimeDailyCost += Math.round(perDay * weight);
          presentFullTimeCount++;
        }
      }
    });
    const partTimePresent = todayAttendance.filter(a => a.isPartTime && a.status === 'Present');
    const flexCost = partTimePresent.length * 350;
    return { dailyWageBill: totalFullTimeDailyCost + flexCost, fullTimeCost: totalFullTimeDailyCost, flexCost, presentFullTimeCount, partTimeCount: partTimePresent.length };
  }, [todayAttendance, staff]);

  const currency = (n: number) => `₹${n.toLocaleString('en-IN')}`;

  const isLight = document.body.classList.contains('light-theme');
  const c = {
    title: isLight ? '#0F172A' : '#F8FAFC',
    subtitle: isLight ? '#475569' : '#94A3B8',
    emeraldBg: isLight ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.2)',
    emeraldBorder: isLight ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 185, 129, 0.3)',
    emeraldText: isLight ? '#10b981' : '#34d399',
    emeraldTextDark: isLight ? '#047857' : '#34d399',
    purpleTextDark: isLight ? '#7e22ce' : '#c084fc',
    purpleBgSub: isLight ? 'rgba(168, 85, 247, 0.1)' : 'rgba(168, 85, 247, 0.1)',
    purpleBorderSub: isLight ? 'rgba(168, 85, 247, 0.2)' : 'rgba(168, 85, 247, 0.2)',
    emeraldBgSub: isLight ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.1)',
    emeraldBorderSub: isLight ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.2)',
    cardBg: isLight ? '#f9fafb' : 'rgba(255,255,255,0.05)',
  };

  return (
    <div className="glass-card-static p-4 sm:p-5 rounded-2xl shadow-lg" style={{ border: '1px solid var(--glass-border)' }}>
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: c.emeraldBg, borderColor: c.emeraldBorder, borderWidth: 1, color: c.emeraldText }}>
            <DollarSign size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold" style={{ color: c.title }}>Daily Wage Bill Overview</h3>
            <p className="text-xs" style={{ color: c.subtitle }}>Estimated payroll commitment for today</p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-xl font-extrabold" style={{ color: c.emeraldTextDark }}>{currency(dailyMetrics.dailyWageBill)}</span>
          <span className="text-[10px] block uppercase font-semibold" style={{ color: c.subtitle }}>Today's Wage Bill</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="p-3 rounded-xl flex items-center justify-between" style={{ backgroundColor: c.cardBg, border: '1px solid var(--glass-border)' }}>
          <div>
            <span className="text-[10px] uppercase block font-semibold" style={{ color: c.subtitle }}>Full-Time Payroll</span>
            <span className="font-bold" style={{ color: c.title }}>{currency(dailyMetrics.fullTimeCost)}</span>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: c.emeraldTextDark, backgroundColor: c.emeraldBgSub, borderColor: c.emeraldBorderSub, borderWidth: 1 }}>
            {dailyMetrics.presentFullTimeCount} Staff
          </span>
        </div>
        <div className="p-3 rounded-xl flex items-center justify-between" style={{ backgroundColor: c.cardBg, border: '1px solid var(--glass-border)' }}>
          <div>
            <span className="text-[10px] uppercase block font-semibold" style={{ color: c.subtitle }}>Flex Payout</span>
            <span className="font-bold" style={{ color: c.title }}>{currency(dailyMetrics.flexCost)}</span>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: c.purpleTextDark, backgroundColor: c.purpleBgSub, borderColor: c.purpleBorderSub, borderWidth: 1 }}>
            {dailyMetrics.partTimeCount} Flex
          </span>
        </div>
      </div>
    </div>
  );
};

export default DailyPayrollOverviewWidget;
