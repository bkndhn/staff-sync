import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export interface PeriodAttendanceRow {
  employeeCode?: string;
  name: string;
  location?: string;
  present: number;
  halfDay: number;
  absent: number;
  uninformed: number;
  total: number;
  workingTime: string;
}

const buildDoc = (title: string, rows: PeriodAttendanceRow[]) => {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(title, 14, 18);
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 14, 25);

  autoTable(doc, {
    startY: 30,
    head: [['#', 'Emp Code', 'Name', 'Branch', 'P', 'H', 'A', 'UI', 'Total', 'Working Time']],
    body: rows.map((r, i) => [
      i + 1,
      r.employeeCode || '-',
      r.name,
      r.location || '-',
      r.present,
      r.halfDay,
      r.absent,
      r.uninformed,
      r.total,
      r.workingTime,
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [37, 99, 235] },
  });

  return doc;
};

export const exportPeriodAttendancePDF = (title: string, rows: PeriodAttendanceRow[]) => {
  const doc = buildDoc(title, rows);
  doc.save(`${title.replace(/[^\w]+/g, '_')}.pdf`);
};

export const exportPeriodAttendanceExcel = (title: string, rows: PeriodAttendanceRow[]) => {
  const data = rows.map((r, i) => ({
    'S.No': i + 1,
    'Emp Code': r.employeeCode || '-',
    'Name': r.name,
    'Branch': r.location || '-',
    'Present (P)': r.present,
    'Half Day (H)': r.halfDay,
    'Absent (A)': r.absent,
    'Uninformed (UI)': r.uninformed,
    'Total Points': r.total,
    'Working Time': r.workingTime,
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance');

  XLSX.writeFile(workbook, `${title.replace(/[^\w]+/g, '_')}.xlsx`);
};

export const sharePeriodAttendanceWhatsApp = async (title: string, rows: PeriodAttendanceRow[]) => {
  const doc = buildDoc(title, rows);
  const fileName = `${title.replace(/[^\w]+/g, '_')}.pdf`;

  try {
    const blob = doc.output('blob');
    const file = new File([blob], fileName, { type: 'application/pdf' });
    const nav: any = navigator;
    if (nav.canShare && nav.canShare({ files: [file] })) {
      await nav.share({ files: [file], title, text: title });
      return;
    }
  } catch {
    // fall through to text share
  }

  const lines = rows
    .slice(0, 40)
    .map(r => `• ${r.name} — P:${r.present} H:${r.halfDay} A:${r.absent} | Total ${r.total} | ${r.workingTime}`);
  const text = `*${title}*\n\n${lines.join('\n')}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
};

/* ------------------------------------------------------------------ */
/* Daily attendance export (rows exactly as rendered on the page)      */
/* ------------------------------------------------------------------ */

export interface DailyAttendanceRow {
  serialNo: number;
  employeeCode?: string;
  originalName?: string;
  name: string;
  location?: string;
  floor?: string;
  designation?: string;
  shift?: string;
  status: string;
  isUninformed?: boolean;
  arrivalTime?: string;
  leavingTime?: string;
  totalHours?: number;
  overtimeHours?: number;
}

const statusLabel = (r: DailyAttendanceRow) =>
  r.status === 'Absent' && r.isUninformed ? 'Absent (Uninformed)' : r.status;

const dailyRecords = (rows: DailyAttendanceRow[], showEmployeeCode: boolean) =>
  rows.map(r => {
    const base: Record<string, any> = { 'S.No': r.serialNo };
    if (showEmployeeCode) base['Emp Code'] = r.employeeCode || '-';
    return {
      ...base,
      'Name': r.originalName || r.name,
      'Branch': r.location || '-',
      'Floor': r.floor || '-',
      'Designation': r.designation || '-',
      'Shift': r.shift || '-',
      'Status': statusLabel(r),
      'In Time': r.arrivalTime || '-',
      'Out Time': r.leavingTime || '-',
      'Total Hours': r.totalHours ? Number(r.totalHours).toFixed(2) : '-',
      'Overtime': r.overtimeHours ? Number(r.overtimeHours).toFixed(2) : '-',
    };
  });

const safeName = (title: string) => title.replace(/[^\w]+/g, '_');

export const exportAttendanceRowsPDF = (
  title: string,
  rows: DailyAttendanceRow[],
  showEmployeeCode: boolean = true
) => {
  const records = dailyRecords(rows, showEmployeeCode);
  const headers = records.length
    ? Object.keys(records[0])
    : ['S.No', ...(showEmployeeCode ? ['Emp Code'] : []), 'Name', 'Branch', 'Floor', 'Designation', 'Shift', 'Status', 'In Time', 'Out Time', 'Total Hours', 'Overtime'];

  const doc = new jsPDF('landscape');
  doc.setFontSize(16);
  doc.text(title, 14, 16);
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 14, 23);

  autoTable(doc, {
    startY: 28,
    head: [headers],
    body: records.map(rec => headers.map(h => (rec as any)[h])),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [37, 99, 235] },
  });

  doc.save(`${safeName(title)}.pdf`);
};

export const exportAttendanceRowsCSV = (
  title: string,
  rows: DailyAttendanceRow[],
  showEmployeeCode: boolean = true
) => {
  const worksheet = XLSX.utils.json_to_sheet(dailyRecords(rows, showEmployeeCode));
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeName(title)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/** Sum working minutes from arrival/leaving HH:MM strings */
export const workingMinutes = (arrival?: string, leaving?: string): number => {
  if (!arrival || !leaving) return 0;
  const [ah, am] = arrival.split(':').map(Number);
  const [lh, lm] = leaving.split(':').map(Number);
  if ([ah, am, lh, lm].some(n => Number.isNaN(n))) return 0;
  const diff = lh * 60 + lm - (ah * 60 + am);
  return diff > 0 ? diff : 0;
};

export const formatWorkingMinutes = (mins: number): string => {
  if (!mins) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};
