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
}

export const exportDashboardPDF = (opts: DashboardExportOptions) => {
  const { staff, attendance, selectedDate, locations, scope = 'overall' } = opts;
  const doc = new jsPDF();

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
  const pt = scopedAtt.filter(r => r.isPartTime && r.status === 'Present');

  let y = 38;
  y = drawStatCards(doc, y, [
    { label: 'Active Staff', value: scopedStaff.length, color: THEME.primary },
    { label: 'Present', value: present, color: THEME.success },
    { label: 'Half Day', value: half, color: THEME.warning },
    { label: 'Absent', value: absent, color: THEME.danger },
    { label: 'Part-Time', value: pt.length, color: THEME.purple },
  ]);

  // Per-location breakdown (only for overall)
  if (scope === 'overall' && locations.length > 0) {
    const rows = locations.map(loc => {
      const s = calculateLocationAttendance(activeStaff, dayAtt, selectedDate, loc.name);
      const locPt = dayAtt.filter(r => r.isPartTime && r.status === 'Present' && r.location === loc.name).length;
      return [
        loc.name,
        s.totalStaff ?? activeStaff.filter(a => a.location === loc.name).length,
        s.present ?? 0,
        s.halfDay ?? 0,
        s.absent ?? 0,
        locPt,
      ];
    });
    autoTable(doc, {
      head: [['Location', 'Staff', 'Present', 'Half Day', 'Absent', 'Part-Time']],
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
  const ftRows = scopedStaff
    .filter(s => s.type === 'full-time')
    .map((m, i) => {
      const rec = ft.find(r => r.staffId === m.id);
      return [
        i + 1,
        m.name,
        m.location || '—',
        rec?.status || 'Absent',
        rec?.arrivalTime || '—',
        rec?.leavingTime || '—',
      ];
    });
  if (ftRows.length > 0) {
    autoTable(doc, {
      head: [['#', 'Name', 'Location', 'Status', 'In', 'Out']],
      body: ftRows,
      startY: y,
      theme: 'striped',
      headStyles: { fillColor: THEME.accent, textColor: 255 },
      styles: { fontSize: 9, cellPadding: 2.5 },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 3) {
          const v = String(data.cell.raw);
          if (v === 'Present') data.cell.styles.textColor = THEME.success;
          else if (v === 'Half Day') data.cell.styles.textColor = THEME.warning;
          else if (v === 'Absent') data.cell.styles.textColor = THEME.danger;
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // Part-time detail
  if (pt.length > 0) {
    const ptRows = pt.map((r, i) => [
      i + 1,
      r.staffName || '—',
      r.location || '—',
      r.shift || '—',
      r.arrivalTime || '—',
      r.leavingTime || '—',
    ]);
    autoTable(doc, {
      head: [['#', 'Name', 'Location', 'Shift', 'In', 'Out']],
      body: ptRows,
      startY: y,
      theme: 'striped',
      headStyles: { fillColor: THEME.purple, textColor: 255 },
      styles: { fontSize: 9, cellPadding: 2.5 },
    });
  }

  drawFooter(doc);
  const suffix = scope === 'overall' ? 'overall' : scope.toLowerCase().replace(/\s+/g, '-');
  doc.save(`dashboard-${suffix}-${selectedDate}.pdf`);
};

export const shareDashboardPDFWhatsApp = async (opts: DashboardExportOptions, text: string) => {
  // WhatsApp Web can't accept file attachments via URL; we open share text and download PDF
  exportDashboardPDF(opts);
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
};
