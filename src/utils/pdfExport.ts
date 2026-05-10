import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Staff, Attendance, SalaryDetail, OldStaffRecord, PartTimeSalaryDetail } from '../types';

export const exportAttendancePDF = (
  staff: Staff[],
  attendance: Attendance[],
  selectedDate: string,
  isMonthly: boolean = false,
  monthlyData?: { month: number; year: number }
) => {
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

  // Add part-time staff
  const partTimeAttendance = attendance.filter(a => a.isPartTime && a.date === selectedDate);
  partTimeAttendance.forEach((record, index) => {
    tableData.push([
      staff.length + index + 1,
      record.staffName || 'Unknown',
      'Part-Time',
      'part-time',
      record.status,
      record.shift || '-'
    ]);
  });

  autoTable(doc, {
    head: [['S.No', 'Name', 'Location', 'Type', 'Status', 'Shift']],
    body: tableData,
    startY: 45,
    styles: { fontSize: 10 },
    headStyles: { fillColor: [59, 130, 246] }
  });

  doc.save(`attendance-report-${selectedDate}.pdf`);
};

export const exportSalaryPDF = (
  salaryDetails: SalaryDetail[],
  partTimeSalaries: PartTimeSalaryDetail[],
  staff: Staff[],
  month: number,
  year: number
) => {
  const doc = new jsPDF('landscape');
  
  // Header
  doc.setFontSize(20);
  doc.text('Salary Report', 20, 20);
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
      `₹${detail.grossSalary}`,
      `₹${detail.netSalary}`,
      `₹${detail.newAdv}`
    ];
  });

  autoTable(doc, {
    head: [['S.No', 'Name', 'Present', 'Half', 'Leave', 'Sun Abs', 'Old Adv', 'Cur Adv', 'Deduction', 'Basic', 'Incentive', 'HRA', 'Sun Penalty', 'ESI/PF/Stat', 'Gross', 'Net Salary', 'New Adv']],
    body: fullTimeData,
    startY: 45,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [34, 197, 94] }
  });

  // Part-time staff salary data
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
      head: [['S.No', 'Name', 'Location', 'Days', 'Shifts', 'Rate/Day', 'Rate/Shift', 'Total Earnings']],
      body: partTimeData,
      startY: (doc as any).lastAutoTable.finalY + 20,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [168, 85, 247] }
    });
  }

  doc.save(`salary-report-${new Date(0, month).toLocaleString('default', { month: 'long' })}-${year}.pdf`);
};

export const exportOldStaffPDF = (oldStaffRecords: OldStaffRecord[]) => {
  const doc = new jsPDF('landscape');
  
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

    return [
      index + 1,
      record.name,
      record.location,
      record.type,
      record.experience,
      tenure,
      `₹${record.totalSalary.toLocaleString()}`,
      `₹${record.totalAdvanceOutstanding.toLocaleString()}`,
      record.reason
    ];
  });

  autoTable(doc, {
    head: [['S.No', 'Name', 'Location', 'Type', 'Experience', 'Tenure', 'Last Salary', 'Outstanding Advance', 'Reason']],
    body: tableData,
    startY: 45,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [107, 114, 128] }
  });

  doc.save(`old-staff-records-${new Date().toISOString().split('T')[0]}.pdf`);
};