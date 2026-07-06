import React, { useMemo, useState } from 'react';
import { Staff } from '../types';
import { Download, FileText, Search, ShieldCheck, LogOut, Sun, Moon } from 'lucide-react';

interface StatutoryDashboardProps {
  staff: Staff[];
  onLogout: () => void;
  isDarkTheme?: boolean;
  toggleTheme?: () => void;
  userEmail?: string;
}

const currency = (n: number | undefined) =>
  `₹${Math.round(Number(n || 0)).toLocaleString('en-IN')}`;

const StatutoryDashboard: React.FC<StatutoryDashboardProps> = ({
  staff, onLogout, isDarkTheme = true, toggleTheme, userEmail,
}) => {
  const [search, setSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState<string>('all');

  // STRICT: only full-time active staff — hide all part-time everywhere
  const fullTimeStaff = useMemo(
    () => staff.filter(s => s.isActive && s.type === 'full-time'),
    [staff]
  );

  const locations = useMemo(
    () => Array.from(new Set(fullTimeStaff.map(s => s.location).filter(Boolean))).sort(),
    [fullTimeStaff]
  );

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return fullTimeStaff.filter(s => {
      if (locationFilter !== 'all' && s.location !== locationFilter) return false;
      if (!term) return true;
      return (
        s.name.toLowerCase().includes(term) ||
        (s.employeeCode || '').toLowerCase().includes(term) ||
        (s.pfNumber || '').toLowerCase().includes(term) ||
        (s.esiNumber || '').toLowerCase().includes(term) ||
        (s.designation || '').toLowerCase().includes(term)
      );
    });
  }, [fullTimeStaff, search, locationFilter]);

  const totals = useMemo(() => {
    const pfCount = rows.filter(s => !!s.pfNumber).length;
    const esiCount = rows.filter(s => !!s.esiNumber).length;
    const totalGross = rows.reduce((sum, s) => sum + (s.totalSalary || 0), 0);
    return { total: rows.length, pfCount, esiCount, totalGross };
  }, [rows]);

  const statutoryValueFor = (s: Staff, key: string) => {
    const cfg = s.statutoryDeductions?.[key];
    if (!cfg?.enabled) return 0;
    if (cfg.base === 'fixed') return cfg.fixedAmount || 0;
    const base =
      cfg.base === 'basic' ? s.basicSalary :
      cfg.base === 'basic_hra' ? s.basicSalary + s.hra :
      cfg.base === 'gross' ? s.totalSalary :
      s.basicSalary;
    return Math.round((base * (cfg.percentage || 0)) / 100);
  };

  const exportCSV = () => {
    const headers = [
      'Name', 'Designation', 'Location', 'Joined Date',
      'PF Number', 'ESI Number', 'Basic', 'HRA', 'Incentive', 'Gross Salary',
      'PF Contribution', 'ESI Contribution',
    ];
    const lines = [headers.join(',')];
    rows.forEach(s => {
      lines.push([
        s.name, s.designation || '', s.location, s.joinedDate,
        s.pfNumber || '', s.esiNumber || '',
        s.basicSalary, s.hra, s.incentive, s.totalSalary,
        statutoryValueFor(s, 'pf'), statutoryValueFor(s, 'esi'),
      ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `statutory-compliance-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportComplianceReport = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    const rowsHtml = rows.map(s => `
      <tr>
        <td>${s.employeeCode || '—'}</td>
        <td>${s.name}</td>
        <td>${s.designation || '—'}</td>
        <td>${s.location}</td>
        <td>${s.joinedDate}</td>
        <td>${s.pfNumber || '—'}</td>
        <td>${s.esiNumber || '—'}</td>
        <td style="text-align:right">${currency(s.basicSalary)}</td>
        <td style="text-align:right">${currency(s.hra)}</td>
        <td style="text-align:right">${currency(s.totalSalary)}</td>
        <td style="text-align:right">${currency(statutoryValueFor(s, 'pf'))}</td>
        <td style="text-align:right">${currency(statutoryValueFor(s, 'esi'))}</td>
      </tr>`).join('');
    win.document.write(`<!doctype html><html><head><title>Statutory Compliance Report</title>
      <style>
        body{font-family:Arial,sans-serif;padding:32px;color:#111}
        h1{margin:0 0 4px 0} .sub{color:#666;margin-bottom:24px;font-size:13px}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
        th{background:#f5f5f5}
        .totals{margin-top:16px;font-size:13px}
        @media print{body{padding:16px}}
      </style></head><body>
      <h1>Statutory Compliance Report</h1>
      <div class="sub">Generated ${new Date().toLocaleString('en-IN')} · Full-time employees only · ${rows.length} records</div>
      <table><thead><tr>
        <th>Emp Code</th><th>Name</th><th>Designation</th><th>Location</th><th>Joined</th>
        <th>PF No</th><th>ESI No</th><th>Basic</th><th>HRA</th><th>Gross</th>
        <th>PF Cont.</th><th>ESI Cont.</th>
      </tr></thead><tbody>${rowsHtml}</tbody></table>
      <div class="totals"><b>Total employees:</b> ${totals.total} &nbsp; <b>PF registered:</b> ${totals.pfCount} &nbsp; <b>ESI registered:</b> ${totals.esiCount} &nbsp; <b>Total gross:</b> ${currency(totals.totalGross)}</div>
      <script>window.onload=()=>window.print()</script>
      </body></html>`);
    win.document.close();
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary,#0b0f1a)] text-[var(--text-primary,#fff)]">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[var(--bg-secondary,rgba(20,25,40,.9))] backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center">
              <ShieldCheck className="text-blue-400" size={22} />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold leading-tight">Statutory Compliance Portal</h1>
              <p className="text-[11px] text-white/50">Read-only · Full-time employees only</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {toggleTheme && (
              <button onClick={toggleTheme} className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10" title="Toggle theme">
                {isDarkTheme ? <Sun size={18} /> : <Moon size={18} />}
              </button>
            )}
            <button
              onClick={onLogout}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-white/80 hover:text-red-300 hover:bg-red-500/10 transition-all text-sm font-medium"
            >
              <LogOut size={16} /> Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Employees', value: totals.total, tint: 'from-blue-500/20 to-blue-500/5' },
            { label: 'PF Registered', value: totals.pfCount, tint: 'from-emerald-500/20 to-emerald-500/5' },
            { label: 'ESI Registered', value: totals.esiCount, tint: 'from-amber-500/20 to-amber-500/5' },
            { label: 'Monthly Gross', value: currency(totals.totalGross), tint: 'from-purple-500/20 to-purple-500/5' },
          ].map((k, i) => (
            <div key={i} className={`rounded-2xl p-4 border border-white/10 bg-gradient-to-br ${k.tint}`}>
              <div className="text-[11px] uppercase tracking-wider text-white/60">{k.label}</div>
              <div className="text-xl sm:text-2xl font-bold mt-1">{k.value}</div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={16} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, code, PF/ESI no, designation…"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm outline-none focus:border-blue-400/50"
            />
          </div>
          <select
            value={locationFilter}
            onChange={e => setLocationFilter(e.target.value)}
            className="px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm"
          >
            <option value="all">All Locations</option>
            {locations.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <button onClick={exportCSV} className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-blue-300 text-sm font-medium">
            <Download size={16} /> Export CSV
          </button>
          <button onClick={exportComplianceReport} className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-sm font-medium">
            <FileText size={16} /> Compliance Report
          </button>
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-[11px] uppercase tracking-wider text-white/60">
                <tr>
                  <th className="text-left p-3">Name</th>
                  <th className="text-left p-3">Designation</th>
                  <th className="text-left p-3">Location</th>
                  <th className="text-left p-3">Joined</th>
                  <th className="text-left p-3">PF No.</th>
                  <th className="text-left p-3">ESI No.</th>
                  <th className="text-right p-3">Basic</th>
                  <th className="text-right p-3">HRA</th>
                  <th className="text-right p-3">Gross</th>
                  <th className="text-right p-3">PF Cont.</th>
                  <th className="text-right p-3">ESI Cont.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.length === 0 ? (
                  <tr><td colSpan={11} className="p-8 text-center text-white/40">No records match your filters.</td></tr>
                ) : rows.map(s => (
                  <tr key={s.id} className="hover:bg-white/[0.03]">
                    <td className="p-3 font-medium">{s.name}</td>
                    <td className="p-3 text-white/70">{s.designation || '—'}</td>
                    <td className="p-3 text-white/70">{s.location}</td>
                    <td className="p-3 text-white/60 whitespace-nowrap">{s.joinedDate}</td>
                    <td className="p-3 font-mono text-xs">{s.pfNumber || <span className="text-red-400/70">Not set</span>}</td>
                    <td className="p-3 font-mono text-xs">{s.esiNumber || <span className="text-red-400/70">Not set</span>}</td>
                    <td className="p-3 text-right font-mono">{currency(s.basicSalary)}</td>
                    <td className="p-3 text-right font-mono">{currency(s.hra)}</td>
                    <td className="p-3 text-right font-mono font-semibold">{currency(s.totalSalary)}</td>
                    <td className="p-3 text-right font-mono text-emerald-300">{currency(statutoryValueFor(s, 'pf'))}</td>
                    <td className="p-3 text-right font-mono text-amber-300">{currency(statutoryValueFor(s, 'esi'))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-[11px] text-white/40 text-center">
          Signed in as {userEmail || 'statutory user'} · Data shown is read-only. Part-time employees are excluded from all statutory reporting.
        </p>
      </main>
    </div>
  );
};

export default StatutoryDashboard;
