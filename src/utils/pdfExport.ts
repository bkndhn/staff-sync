import { Staff, Attendance, PayrollDetail, OldStaffRecord, PartTimeSalaryDetail } from '../types';

export const exportAttendancePDF = async (
  staff: Staff[],
  attendance: Attendance[],
  selectedDate: string,
  isMonthly: boolean = false,
  monthlyData?: { month: number; year: number }
) => {
  const XLSX = await import('xlsx');
  const { default: jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF();
  
  // Header
  doc.setFontSize(20);
  doc.text('Staff Attendance Report', 20, 20);
  
  if (isMonthly && monthlyData) {
    doc.setFontSize(12);
    doc.text(`Month: ${new Date(0, monthlyData.month).toLocaleString('default', { month: 'long' })} ${monthlyData.year}`, 20, 35);
  } else {
    doc.setFontSize(12);
    doc.text(`Date: ${new Date(selectedDate).toLocaleDateString()}`, 20, 35);
  }

  // Prepare data
  const tableData = staff.filter(s => s.isActive).map((member, index) => {
    const attendanceRecord = attendance.find(a => a.staffId === member.id && a.date === selectedDate);
    return [
      index + 1,
      member.name,
      member.location,
      member.type,
      attendanceRecord?.status || 'Absent',
      attendanceRecord?.shift || '-'
    ];
  });

  // Add flex staff
  const partTimeAttendance = attendance.filter(a => a.isPartTime && a.date === selectedDate);
  partTimeAttendance.forEach((record, index) => {
    tableData.push([
      staff.length + index + 1,
      record.staffName || 'Unknown',
      'Flex',
      'part-time',
      record.status,
      record.shift || '-'
    ]);
  });

  autoTable(doc, {
    head: [['S.No', 'Name', 'Branch', 'Type', 'Status', 'Shift']],
    body: tableData,
    startY: 45,
    styles: { fontSize: 10 },
    headStyles: { fillColor: [59, 130, 246] }
  });

  doc.save(`attendance-report-${selectedDate}.pdf`);
};

export const exportSalaryPDF = async (
  salaryDetails: PayrollDetail[],
  partTimeSalaries: PartTimeSalaryDetail[],
  staff: Staff[],
  month: number,
  year: number
) => {
  const XLSX = await import('xlsx');
  const { default: jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF('landscape');
  
  // Header
  doc.setFontSize(20);
  doc.text('Payroll Report', 20, 20);
  doc.setFontSize(12);
  doc.text(`Month: ${new Date(0, month).toLocaleString('default', { month: 'long' })} ${year}`, 20, 35);

  // Full-time staff salary data
  const fullTimeData = salaryDetails.map((detail, index) => {
    const staffMember = staff.find(s => s.id === detail.staffId);
    return [
      index + 1,
      staffMember?.name || 'Unknown',
      detail.presentDays,
      detail.halfDays,
      detail.leaveDays,
      detail.sundayAbsents,
      `₹${detail.oldAdv}`,
      `₹${detail.curAdv}`,
      `₹${detail.deduction}`,
      `₹${detail.basicEarned}`,
      `₹${detail.incentiveEarned}`,
      `₹${detail.hraEarned}`,
      `₹${detail.sundayPenalty}`,
      `₹${detail.statutoryTotal || 0}`,
      `₹${detail.grossPayroll ?? detail.grossSalary ?? 0}`,
      `₹${detail.netPayroll ?? detail.netSalary ?? 0}`,
      `₹${detail.newAdv}`
    ];
  });

  autoTable(doc, {
    head: [['S.No', 'Name', 'Present', 'Half', 'Leave', 'Sun Abs', 'Old Adv', 'Cur Adv', 'Deduction', 'Basic', 'Incentive', 'HRA', 'Sun Penalty', 'ESI/PF/Stat', 'Gross', 'Net Payroll', 'New Adv']],
    body: fullTimeData,
    startY: 45,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [34, 197, 94] }
  });

  // flex staff salary data
  if (partTimeSalaries.length > 0) {
    const partTimeData = partTimeSalaries.map((detail, index) => [
      index + 1,
      detail.staffName,
      detail.location,
      detail.totalDays,
      detail.totalShifts,
      `₹${detail.ratePerDay}`,
      `₹${detail.ratePerShift}`,
      `₹${detail.totalEarnings}`
    ]);

    autoTable(doc, {
      head: [['S.No', 'Name', 'Branch', 'Days', 'Shifts', 'Rate/Day', 'Rate/Shift', 'Total Earnings']],
      body: partTimeData,
      startY: (doc as any).lastAutoTable.finalY + 20,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [168, 85, 247] }
    });
  }

  doc.save(`salary-report-${new Date(0, month).toLocaleString('default', { month: 'long' })}-${year}.pdf`);
};

export const OLD_STAFF_PDF_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'location', label: 'Branch' },
  { key: 'type', label: 'Type' },
  { key: 'experience', label: 'Experience' },
  { key: 'tenure', label: 'Tenure' },
  { key: 'salary', label: 'Last Payroll' },
  { key: 'advance', label: 'Outstanding Advance' },
  { key: 'reason', label: 'Reason' },
];

export const exportOldStaffPDF = async (
  oldStaffRecords: OldStaffRecord[],
  visibleColumns?: string[]
) => {
  const XLSX = await import('xlsx');
  const { default: jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF('landscape');
  const cols = OLD_STAFF_PDF_COLUMNS.filter(c => !visibleColumns || visibleColumns.includes(c.key));

  // Header
  doc.setFontSize(20);
  doc.text('Old Staff Records', 20, 20);
  doc.setFontSize(12);
  doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 20, 35);

  const tableData = oldStaffRecords.map((record, index) => {
    const joinedDate = new Date(record.joinedDate);
    const leftDate = new Date(record.leftDate);
    const tenureMonths = Math.round((leftDate.getTime() - joinedDate.getTime()) / (1000 * 60 * 60 * 24 * 30));
    const tenureYears = Math.floor(tenureMonths / 12);
    const remainingMonths = tenureMonths % 12;
    const tenure = `${tenureYears > 0 ? `${tenureYears}y ` : ''}${remainingMonths}m`;

    const values: Record<string, any> = {
      name: record.name,
      location: record.location,
      type: record.type,
      experience: record.experience,
      tenure,
      salary: `₹${(record.totalPayroll ?? record.totalSalary ?? 0).toLocaleString()}`,
      advance: `₹${record.totalAdvanceOutstanding.toLocaleString()}`,
      reason: record.reason
    };

    return [index + 1, ...cols.map(c => values[c.key])];
  });

  autoTable(doc, {
    head: [['S.No', ...cols.map(c => c.label)]],
    body: tableData,
    startY: 45,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [107, 114, 128] }
  });

  doc.save(`old-staff-records-${new Date().toISOString().split('T')[0]}.pdf`);
};