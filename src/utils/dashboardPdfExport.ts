import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Staff, Attendance } from '../types';
import { calculateLocationAttendance } from './salaryCalculations';

// Blue/white theme colors matching the app
const THEME = {
  primary: [37, 99, 235] as [number, number, number],      // blue-600
  primaryDark: [30, 64, 175] as [number, number, number],  // blue-800
  accent: [59, 130, 246] as [number, number, number],      // blue-500
  success: [16, 185, 129] as [number, number, number],
  warning: [245, 158, 11] as [number, number, number],
  danger: [239, 68, 68] as [number, number, number],
  purple: [139, 92, 246] as [number, number, number],
  text: [15, 23, 42] as [number, number, number],
  muted: [100, 116, 139] as [number, number, number],
  bg: [248, 250, 252] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

/** Columns the user can toggle for reports / WhatsApp share. */
export type ReportColumnKey =
  | 'name' | 'location' | 'floor' | 'designation' | 'status' | 'in' | 'out' | 'hours';

export const REPORT_COLUMNS: { key: ReportColumnKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'location', label: 'Branch' },
  { key: 'floor', label: 'Zone' },
  { key: 'designation', label: 'Designation' },
  { key: 'status', label: 'Status' },
  { key: 'in', label: 'In' },
  { key: 'out', label: 'Out' },
  { key: 'hours', label: 'Working Time' },
];

export const DEFAULT_REPORT_COLUMNS: ReportColumnKey[] = ['name', 'location', 'floor', 'status', 'in', 'out', 'hours'];

export type ReportSortKey = 'name' | 'location' | 'floor' | 'designation' | 'status';

/** Format "HH:mm" (24h) or ISO-ish time into 12h AM/PM. */
const fmt12h = (t?: string): string => {
  if (!t) return '—';
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return t;
  let h = parseInt(m[1], 10);
  const min = m[2];
  if (isNaN(h)) return t;
  const period = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${min} ${period}`;
};

const toMin = (t?: string): number | null => {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
};

/** Working duration between in/out as "7h 45m". */
export const workingTime = (inT?: string, outT?: string, breakMinutes?: number): string => {
  const a = toMin(inT);
  const b = toMin(outT);
  if (a == null || b == null) return '—';
  let mins = b - a;
  if (mins < 0) mins += 24 * 60;
  mins -= Math.max(0, breakMinutes || 0);
  if (mins <= 0) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
};

/** Session word for half-days: Morning / Evening. */
const sessionLabel = (shift?: string): string => {
  const s = (shift || '').toLowerCase();
  if (s.includes('morning') || s === 'am' || s === 'm') return 'Morning';
  if (s.includes('evening') || s.includes('afternoon') || s === 'pm' || s === 'e') return 'Evening';
  return shift ? shift : '';
};

/** Full status text incl. half-day session and uninformed leave tag. */
export const statusText = (rec?: Attendance): string => {
  if (!rec) return 'Absent';
  const base = rec.status || 'Absent';
  if (base === 'Half Day') {
    const sess = sessionLabel(rec.shift);
    return sess ? `Half Day (${sess} Present)` : 'Half Day';
  }
  if (base === 'Absent' && rec.isUninformed) return 'Absent (Uninformed)';
  return base;
};

const drawHeader = (doc: jsPDF, title: string, subtitle: string) => {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...THEME.primary);
  doc.rect(0, 0, w, 30, 'F');
  doc.setFillColor(...THEME.primaryDark);
  doc.rect(0, 28, w, 4, 'F');

  doc.setTextColor(...THEME.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(title, 14, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(subtitle, 14, 23);

  doc.setTextColor(...THEME.text);
};

const drawFooter = (doc: jsPDF) => {
  const pageCount = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFillColor(...THEME.bg);
    doc.rect(0, h - 12, w, 12, 'F');
    doc.setFontSize(8);
    doc.setTextColor(...THEME.muted);
    doc.text('Staff Management • Generated ' + new Date().toLocaleString('en-IN'), 14, h - 5);
    doc.text(`Page ${i} of ${pageCount}`, w - 14, h - 5, { align: 'right' });
  }
};

const drawStatCards = (
  doc: jsPDF,
  y: number,
  cards: { label: string; value: string | number; color: [number, number, number] }[]
) => {
  const w = doc.internal.pageSize.getWidth();
  const margin = 14;
  const gap = 4;
  const cardW = (w - margin * 2 - gap * (cards.length - 1)) / cards.length;
  const cardH = 22;

  cards.forEach((c, i) => {
    const x = margin + i * (cardW + gap);
    doc.setFillColor(...c.color);
    doc.roundedRect(x, y, cardW, cardH, 2, 2, 'F');
    doc.setTextColor(...THEME.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(String(c.value), x + cardW / 2, y + 11, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(c.label, x + cardW / 2, y + 18, { align: 'center' });
  });

  doc.setTextColor(...THEME.text);
  return y + cardH + 6;
};

export interface DashboardExportOptions {
  staff: Staff[];
  attendance: Attendance[];
  selectedDate: string;
  locations: { name: string }[];
  scope?: 'overall' | string; // location name or 'overall'
  columns?: ReportColumnKey[];
  sortBy?: ReportSortKey;
}

interface Row {
  name: string;
  location: string;
  floor: string;
  designation: string;
  status: string;
  in: string;
  out: string;
  hours: string;
}

const buildCells = (rows: Row[], cols: ReportColumnKey[], sortBy: ReportSortKey) => {
  const sorted = [...rows].sort((a, b) => String(a[sortBy] || '').localeCompare(String(b[sortBy] || '')));
  const head = ['#', ...cols.map(c => REPORT_COLUMNS.find(rc => rc.key === c)!.label)];
  const body = sorted.map((r, i) => [i + 1, ...cols.map(c => r[c] || '—')]);
  return { head, body, statusIdx: cols.indexOf('status') + 1 };
};

/** Render a single report section (overall or a specific location) into the current page(s). */
const renderReportSection = (
  doc: jsPDF,
  staff: Staff[],
  attendance: Attendance[],
  selectedDate: string,
  locations: { name: string }[],
  scope: 'overall' | string,
  cols: ReportColumnKey[],
  sortBy: ReportSortKey,
) => {
  const dateObj = new Date(selectedDate + 'T00:00:00');
  const dateStr = dateObj.toLocaleDateString('en-IN', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });

  const title = scope === 'overall' ? 'Dashboard Report' : `${scope} — Dashboard Report`;
  drawHeader(doc, title, dateStr);

  const activeStaff = staff.filter(s => s.isActive);
  const dayAtt = attendance.filter(r => r.date === selectedDate);
  const scopedAtt = scope === 'overall'
    ? dayAtt
    : dayAtt.filter(r => {
        if (r.isPartTime) return r.location === scope;
        const m = activeStaff.find(s => s.id === r.staffId);
        return m?.location === scope;
      });
  const scopedStaff = scope === 'overall' ? activeStaff : activeStaff.filter(s => s.location === scope);

  const ft = scopedAtt.filter(r => !r.isPartTime);
  const present = ft.filter(r => r.status === 'Present').length;
  const half = ft.filter(r => r.status === 'Half Day').length;
  const absent = ft.filter(r => r.status === 'Absent').length;
  const uninformed = ft.filter(r => r.isUninformed).length;
  const pt = scopedAtt.filter(r => r.isPartTime && r.status === 'Present');

  let y = 38;
  y = drawStatCards(doc, y, [
    { label: 'Active Staff', value: scopedStaff.length, color: THEME.primary },
    { label: 'Present', value: present, color: THEME.success },
    { label: 'Half Day', value: half, color: THEME.warning },
    { label: 'Absent', value: absent, color: THEME.danger },
    { label: 'Uninformed', value: uninformed, color: THEME.primaryDark },
    { label: 'Temp Guest', value: pt.length, color: THEME.purple },
  ]);

  // Per-location breakdown (only for overall)
  if (scope === 'overall' && locations.length > 0) {
    const rows = locations.map(loc => {
      const s = calculateLocationAttendance(activeStaff, dayAtt, selectedDate, loc.name);
      const locPt = dayAtt.filter(r => r.isPartTime && r.status === 'Present' && r.location === loc.name).length;
      return [loc.name, s.total, s.present, s.halfDay, s.absent, locPt];
    });
    autoTable(doc, {
      head: [['Branch', 'Staff', 'Present', 'Half Day', 'Absent', 'Temp Guest']],
      body: rows,
      startY: y,
      theme: 'grid',
      headStyles: { fillColor: THEME.primary, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: THEME.bg },
      styles: { fontSize: 10, cellPadding: 3 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // Full-time attendance detail
  const ftRows: Row[] = scopedStaff
    .filter(s => s.type === 'full-time')
    .map((m) => {
      const rec = ft.find(r => r.staffId === m.id);
      return {
        name: m.name,
        location: m.location || '—',
        floor: (m as any).floor || '—',
        designation: (m as any).designation || '—',
        status: statusText(rec),
        in: fmt12h(rec?.arrivalTime),
        out: fmt12h(rec?.leavingTime),
        hours: workingTime(rec?.arrivalTime, rec?.leavingTime, (rec as any)?.breakMinutes),
      };
    });
  if (ftRows.length > 0) {
    const { head, body, statusIdx } = buildCells(ftRows, cols, sortBy);
    autoTable(doc, {
      head: [head],
      body,
      startY: y,
      theme: 'striped',
      headStyles: { fillColor: THEME.accent, textColor: 255 },
      styles: { fontSize: 9, cellPadding: 2.5 },
      didParseCell: (data) => {
        if (data.section === 'body' && statusIdx > 0 && data.column.index === statusIdx) {
          const v = String(data.cell.raw);
          if (v.startsWith('Present')) data.cell.styles.textColor = THEME.success;
          else if (v.startsWith('Half Day')) data.cell.styles.textColor = THEME.warning;
          else if (v.startsWith('Absent')) data.cell.styles.textColor = THEME.danger;
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // Temp guest / part-time detail
  if (pt.length > 0) {
    const ptRows: Row[] = pt.map(r => ({
      name: r.staffName || '—',
      location: r.location || '—',
      floor: r.floor || '—',
      designation: sessionLabel(r.shift) || r.shift || 'Temp Guest',
      status: r.shift ? `Present (${sessionLabel(r.shift) || r.shift})` : 'Present',
      in: fmt12h(r.arrivalTime),
      out: fmt12h(r.leavingTime),
      hours: workingTime(r.arrivalTime, r.leavingTime, (r as any)?.breakMinutes),
    }));
    const { head, body } = buildCells(ptRows, cols, sortBy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...THEME.purple);
    doc.text('Temp Guest / Flex — Working Time', 14, y);
    doc.setTextColor(...THEME.text);
    y += 4;
    autoTable(doc, {
      head: [head],
      body,
      startY: y,
      theme: 'striped',
      headStyles: { fillColor: THEME.purple, textColor: 255 },
      styles: { fontSize: 9, cellPadding: 2.5 },
    });
  }
};

const buildDoc = (opts: DashboardExportOptions): jsPDF => {
  const {
    staff, attendance, selectedDate, locations, scope = 'overall',
    columns = DEFAULT_REPORT_COLUMNS, sortBy = 'name',
  } = opts;
  const cols = columns.length ? columns : DEFAULT_REPORT_COLUMNS;
  const doc = new jsPDF();

  if (scope === 'overall') {
    renderReportSection(doc, staff, attendance, selectedDate, locations, 'overall', cols, sortBy);
    locations.forEach(loc => {
      doc.addPage();
      renderReportSection(doc, staff, attendance, selectedDate, locations, loc.name, cols, sortBy);
    });
  } else {
    renderReportSection(doc, staff, attendance, selectedDate, locations, scope, cols, sortBy);
  }

  drawFooter(doc);
  return doc;
};

const fileNameFor = (opts: DashboardExportOptions) => {
  const scope = opts.scope || 'overall';
  const suffix = scope === 'overall' ? 'overall' : scope.toLowerCase().replace(/\s+/g, '-');
  return `dashboard-${suffix}-${opts.selectedDate}.pdf`;
};

export const exportDashboardPDF = (opts: DashboardExportOptions) => {
  buildDoc(opts).save(fileNameFor(opts));
};

/**
 * Share the PDF straight into WhatsApp (native share sheet on Android/iOS).
 * Falls back to a wa.me deep link + local download on desktop browsers.
 */
export const shareDashboardPDFWhatsApp = async (opts: DashboardExportOptions, text: string) => {
  const doc = buildDoc(opts);
  const name = fileNameFor(opts);
  const blob = doc.output('blob') as Blob;
  const file = new File([blob], name, { type: 'application/pdf' });

  const nav: any = navigator;
  if (nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], text, title: name });
      return;
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
    }
  }

  doc.save(name);
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
};
