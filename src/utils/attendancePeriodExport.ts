import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface PeriodAttendanceRow {
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
    head: [['#', 'Name', 'Location', 'P', 'H', 'A', 'UI', 'Total', 'Working Time']],
    body: rows.map((r, i) => [
      i + 1,
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
