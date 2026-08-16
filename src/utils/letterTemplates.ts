import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface StaffInfo {
  name: string;
  employee_code?: string;
  designation?: string;
  location: string;
  floor?: string;
  joined_date: string;
  basic_salary?: number;
  incentive?: number;
  hra?: number;
  total_salary?: number;
  contact_number?: string;
}

export interface CompanyInfo {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
}

/**
 * Formats a date string or Date object into DD MMM YYYY (e.g. 16 Aug 2026).
 */
export function formatDate(dateInput?: string | Date | null): string {
  const d = dateInput ? new Date(dateInput) : new Date();
  if (isNaN(d.getTime())) {
    return String(dateInput);
  }
  const day = String(d.getDate()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

/**
 * Draws the official company letterhead on the PDF document.
 * Returns the Y coordinate after the header divider.
 */
function drawLetterhead(doc: jsPDF, company: CompanyInfo): number {
  const companyName = company.name || 'Staff-Sync Technologies';
  const pageWidth = doc.internal.pageSize.getWidth();

  // Company Name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(30, 58, 138); // Deep Navy (#1E3A8A)
  doc.text(companyName, 20, 24);

  // Sub-details (Address, Phone, Email)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139); // Slate (#64748B)

  let contactY = 30;
  const contactParts: string[] = [];
  if (company.address) contactParts.push(company.address);
  if (company.phone) contactParts.push(`Tel: ${company.phone}`);
  if (company.email) contactParts.push(`Email: ${company.email}`);

  if (contactParts.length > 0) {
    const contactText = contactParts.join('  |  ');
    const lines = doc.splitTextToSize(contactText, pageWidth - 40);
    doc.text(lines, 20, contactY);
    contactY += (lines.length * 4.5);
  } else {
    contactY += 2;
  }

  // Accent horizontal divider
  doc.setDrawColor(59, 130, 246); // Blue (#3B82F6)
  doc.setLineWidth(0.8);
  doc.line(20, contactY + 2, pageWidth - 20, contactY + 2);

  return contactY + 12;
}

/**
 * Draws the Date, Reference Number, and Title.
 * Returns the Y coordinate after the title.
 */
function drawDocumentMeta(
  doc: jsPDF,
  startY: number,
  title: string,
  staff: StaffInfo,
  company: CompanyInfo
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const currentDate = formatDate();
  const companyCode = (company.name || 'CORP').replace(/[^a-zA-Z0-9]/g, '').substring(0, 3).toUpperCase();
  const empCode = staff.employee_code || Math.floor(1000 + Math.random() * 9000).toString();
  const refNo = `REF: ${companyCode}/HR/${new Date().getFullYear()}/${empCode}`;

  // Reference Number (Left) & Date (Right)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105); // Slate (#475569)
  doc.text(refNo, 20, startY);

  doc.setFont('helvetica', 'normal');
  doc.text(`Date: ${currentDate}`, pageWidth - 20, startY, { align: 'right' });

  // Document Title
  const titleY = startY + 14;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42); // Slate-900 (#0F172A)
  doc.text(title, pageWidth / 2, titleY, { align: 'center' });

  // Subtle title underline
  const titleWidth = doc.getTextWidth(title);
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.5);
  doc.line((pageWidth - titleWidth) / 2, titleY + 2, (pageWidth + titleWidth) / 2, titleY + 2);

  return titleY + 14;
}

/**
 * Draws the signature block and footer note.
 */
function drawSignatureAndFooter(doc: jsPDF, company: CompanyInfo, startY: number): void {
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  const companyName = company.name || 'Staff-Sync Technologies';

  // Ensure signature does not overflow; keep at least 50mm from bottom or at startY
  const sigY = Math.max(startY, pageHeight - 65);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59); // Slate-800
  doc.text(`For ${companyName}`, 20, sigY);

  // Signatory title and department after gap
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Authorized Signatory', 20, sigY + 24);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('Human Resources & Administration', 20, sigY + 29);

  // System-generated document footer line
  const footerY = pageHeight - 15;
  doc.setDrawColor(226, 232, 240); // Slate-200
  doc.setLineWidth(0.5);
  doc.line(20, footerY - 5, pageWidth - 20, footerY - 5);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.5);
  doc.setTextColor(148, 163, 184); // Slate-400
  doc.text('This is a system-generated document and does not require a physical signature when verified.', pageWidth / 2, footerY, { align: 'center' });
}

/**
 * 1. Generates Employment Proof Letter PDF
 */
export function generateEmploymentProof(
  staff: StaffInfo,
  company: CompanyInfo,
  purpose: string = 'official'
): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const headerEndY = drawLetterhead(doc, company);
  const bodyStartY = drawDocumentMeta(doc, headerEndY, 'TO WHOM IT MAY CONCERN', staff, company);

  const companyName = company.name || 'the Company';
  const designation = staff.designation || 'Staff Member';
  const location = staff.location || 'Head Office';
  const joinedDate = formatDate(staff.joined_date);
  const empCodeText = staff.employee_code ? ` (Employee Code: ${staff.employee_code})` : '';
  const cleanPurpose = purpose && purpose.trim().length > 0 ? purpose.trim() : 'official';

  const p1 = `This is to certify that Mr./Ms. ${staff.name}${empCodeText} is currently employed with ${companyName} as ${designation} at our ${location} branch since ${joinedDate}.`;
  const p2 = `During their tenure with us, their conduct and performance have been found to be satisfactory and professional.`;
  const p3 = `This certificate is issued upon request for ${cleanPurpose} purposes.`;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(30, 41, 59);

  let currentY = bodyStartY;
  const maxWidth = 170;
  const lineHeight = 6;

  const lines1 = doc.splitTextToSize(p1, maxWidth);
  doc.text(lines1, 20, currentY);
  currentY += lines1.length * lineHeight + 6;

  const lines2 = doc.splitTextToSize(p2, maxWidth);
  doc.text(lines2, 20, currentY);
  currentY += lines2.length * lineHeight + 6;

  const lines3 = doc.splitTextToSize(p3, maxWidth);
  doc.text(lines3, 20, currentY);
  currentY += lines3.length * lineHeight + 14;

  drawSignatureAndFooter(doc, company, currentY);

  return doc;
}

/**
 * 2. Generates Salary Certificate PDF
 */
export function generateSalaryCertificate(
  staff: StaffInfo,
  company: CompanyInfo
): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const headerEndY = drawLetterhead(doc, company);
  const bodyStartY = drawDocumentMeta(doc, headerEndY, 'SALARY CERTIFICATE', staff, company);

  const companyName = company.name || 'the Company';
  const designation = staff.designation || 'Staff Member';
  const location = staff.location || 'Head Office';
  const joinedDate = formatDate(staff.joined_date);
  const empCodeText = staff.employee_code ? ` (Employee Code: ${staff.employee_code})` : '';

  const basic = Number(staff.basic_salary) || 0;
  const incentive = Number(staff.incentive) || 0;
  const hra = Number(staff.hra) || 0;
  const gross = staff.total_salary !== undefined && staff.total_salary !== null && Number(staff.total_salary) > 0
    ? Number(staff.total_salary)
    : (basic + incentive + hra);
  const annualCtc = gross * 12;

  const p1 = `This is to certify that Mr./Ms. ${staff.name}${empCodeText} is an active employee of ${companyName}, serving as ${designation} at our ${location} branch since ${joinedDate}.`;
  const p2 = `The remuneration structure and monthly salary breakdown for the employee is detailed below:`;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(30, 41, 59);

  let currentY = bodyStartY;
  const maxWidth = 170;
  const lineHeight = 6;

  const lines1 = doc.splitTextToSize(p1, maxWidth);
  doc.text(lines1, 20, currentY);
  currentY += lines1.length * lineHeight + 4;

  const lines2 = doc.splitTextToSize(p2, maxWidth);
  doc.text(lines2, 20, currentY);
  currentY += lines2.length * lineHeight + 6;

  // Salary Table
  const tableData = [
    ['Basic Salary', `Rs. ${basic.toLocaleString('en-IN')}`, `Rs. ${(basic * 12).toLocaleString('en-IN')}`],
    ['Incentive / Allowances', `Rs. ${incentive.toLocaleString('en-IN')}`, `Rs. ${(incentive * 12).toLocaleString('en-IN')}`],
    ['House Rent Allowance (HRA)', `Rs. ${hra.toLocaleString('en-IN')}`, `Rs. ${(hra * 12).toLocaleString('en-IN')}`],
    ['Total Gross Monthly Salary', `Rs. ${gross.toLocaleString('en-IN')}`, `Rs. ${annualCtc.toLocaleString('en-IN')}`],
  ];

  autoTable(doc, {
    startY: currentY,
    head: [['Salary Component', 'Monthly Amount', 'Annualized Amount']],
    body: tableData,
    margin: { left: 20, right: 20 },
    theme: 'grid',
    headStyles: {
      fillColor: [30, 58, 138], // Deep navy
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9.5,
      cellPadding: 3.5,
    },
    bodyStyles: {
      fontSize: 9.5,
      cellPadding: 3.5,
      textColor: [30, 41, 59],
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    didParseCell: (data) => {
      // Highlight the Gross Total row
      if (data.row.index === tableData.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [238, 242, 255]; // Indigo-50
        data.cell.styles.textColor = [30, 58, 138];
      }
    },
  });

  const finalTableY = (doc as any).lastAutoTable?.finalY || (currentY + 45);

  // CTC Summary Box
  const summaryBoxY = finalTableY + 6;
  doc.setFillColor(248, 250, 252); // Slate-50
  doc.setDrawColor(203, 213, 225); // Slate-300
  doc.roundedRect(20, summaryBoxY, 170, 14, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Total Cost to Company (CTC) per Annum:', 25, summaryBoxY + 9);

  doc.setTextColor(30, 58, 138);
  doc.text(`Rs. ${annualCtc.toLocaleString('en-IN')}`, 185, summaryBoxY + 9, { align: 'right' });

  const noteY = summaryBoxY + 20;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text('This certificate is issued at the request of the employee for official record purposes.', 20, noteY);

  drawSignatureAndFooter(doc, company, noteY + 12);

  return doc;
}

/**
 * 3. Generates Experience Letter PDF
 */
export function generateExperienceLetter(
  staff: StaffInfo,
  company: CompanyInfo,
  lastWorkingDate: string
): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const headerEndY = drawLetterhead(doc, company);
  const bodyStartY = drawDocumentMeta(doc, headerEndY, 'EXPERIENCE CERTIFICATE', staff, company);

  const companyName = company.name || 'the Company';
  const designation = staff.designation || 'Staff Member';
  const location = staff.location || 'Head Office';
  const joinedDate = formatDate(staff.joined_date);
  const lastDate = formatDate(lastWorkingDate);
  const empCodeText = staff.employee_code ? ` (Employee Code: ${staff.employee_code})` : '';

  const p1 = `This is to certify that Mr./Ms. ${staff.name}${empCodeText} was employed with ${companyName} as ${designation} at our ${location} branch from ${joinedDate} to ${lastDate}.`;
  const p2 = `During their tenure with us, they displayed dedication, diligence, and a high standard of professionalism in executing their responsibilities.`;
  const p3 = `We thank them for their valuable contributions to our organization and wish them success in all their future endeavors.`;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(30, 41, 59);

  let currentY = bodyStartY;
  const maxWidth = 170;
  const lineHeight = 6;

  const lines1 = doc.splitTextToSize(p1, maxWidth);
  doc.text(lines1, 20, currentY);
  currentY += lines1.length * lineHeight + 6;

  const lines2 = doc.splitTextToSize(p2, maxWidth);
  doc.text(lines2, 20, currentY);
  currentY += lines2.length * lineHeight + 6;

  const lines3 = doc.splitTextToSize(p3, maxWidth);
  doc.text(lines3, 20, currentY);
  currentY += lines3.length * lineHeight + 14;

  drawSignatureAndFooter(doc, company, currentY);

  return doc;
}
