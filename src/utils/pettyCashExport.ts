import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { PettyCashSheet } from '../services/pettyCashService';

function formatDateDisplay(dateStr: string): string {
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

/** Formats a numeric value into standard Indian currency with rupee symbol: ₹1,300.00 */
function formatINR(val: number | string | undefined): string {
  const num = Number(val) || 0;
  return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Formats an amount cell, showing '—' if 0 or empty */
function formatAmountOrDash(val: number | string | undefined): string {
  const num = Number(val);
  if (!val || isNaN(num) || num === 0) return '—';
  return formatINR(num);
}

export const exportPettyCashPdf = (sheet: PettyCashSheet) => {
  const doc = new jsPDF('p', 'pt', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Reusable Page Header Banner
  const drawPageHeader = () => {
    // Top Branded Banner: Deep Navy ([30, 58, 138]) with crisp white title text
    doc.setFillColor(30, 58, 138);
    doc.rect(40, 24, pageWidth - 80, 38, 'F');
    
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('PETTY CASH VOUCHER', pageWidth / 2, 48, { align: 'center' });
    
    // Date and Location row
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 58, 138);
    doc.text(`DATE: ${formatDateDisplay(sheet.date)}`, 40, 78);
    doc.text(`LOCATION: ${sheet.location.toUpperCase()}`, pageWidth - 40, 78, { align: 'right' });
    
    // Subtle thin divider below the date/location line
    doc.setDrawColor(203, 213, 225); // Slate 300
    doc.setLineWidth(0.75);
    doc.line(40, 85, pageWidth - 40, 85);
  };

  // Staff Tables preparation
  const fullTimeStaff = sheet.staff_meals.filter(s => s.staff_type === 'full-time');
  const partTimeStaff = sheet.staff_meals.filter(s => s.staff_type === 'part-time');
  
  const maxRows = Math.max(fullTimeStaff.length, partTimeStaff.length);
  const staffTableBody: any[][] = [];
  
  for (let i = 0; i < maxRows; i++) {
    const ft = fullTimeStaff[i];
    const pt = partTimeStaff[i];
    
    staffTableBody.push([
      ft ? i + 1 : '—',
      ft ? ft.staff_name : '—',
      ft ? ft.designation : '—',
      ft ? ft.attendance_status : '—',
      ft ? formatAmountOrDash(ft.amount) : '—',
      '', // spacer
      pt ? i + 1 : '—',
      pt ? pt.staff_name : '—',
      pt ? pt.designation : '—',
      pt ? pt.attendance_status : '—',
      pt ? formatAmountOrDash(pt.amount) : '—'
    ]);
  }
  
  // Side-by-side Staff Table with Royal Indigo and Emerald Green headers
  autoTable(doc, {
    startY: 94,
    head: [[
      { content: 'FULL TIME STAFF', colSpan: 5, styles: { halign: 'center', fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold' } },
      { content: '', styles: { fillColor: [255, 255, 255] } },
      { content: 'PART TIME / FLEX STAFF', colSpan: 5, styles: { halign: 'center', fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: 'bold' } }
    ], [
      'S.NO', 'NAME', 'DESIG', 'F/H', 'AMT',
      '',
      'S.NO', 'NAME', 'DESIG', 'F/H', 'AMT'
    ]],
    body: staffTableBody,
    theme: 'grid',
    showHead: 'everyPage',
    margin: { top: 94, left: 40, right: 40, bottom: 45 },
    styles: { fontSize: 8, cellPadding: 3, textColor: [15, 23, 42], lineColor: [203, 213, 225], lineWidth: 0.5 },
    headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', lineWidth: 0.5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 25, halign: 'center' },
      1: { cellWidth: 90 },
      2: { cellWidth: 70 },
      3: { cellWidth: 25, halign: 'center' },
      4: { cellWidth: 40, halign: 'right' },
      5: { cellWidth: 15, lineWidth: 0 },
      6: { cellWidth: 25, halign: 'center' },
      7: { cellWidth: 90 },
      8: { cellWidth: 70 },
      9: { cellWidth: 25, halign: 'center' },
      10: { cellWidth: 40, halign: 'right' }
    },
    didDrawPage: () => {
      drawPageHeader();
    }
  });
  
  let finalY = (doc as any).lastAutoTable.finalY + 16;

  // Subtotals calculation
  const ftMealTotal = fullTimeStaff.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  const ptMealTotal = partTimeStaff.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  const mealTotal = ftMealTotal + ptMealTotal;
  
  const otherExpenses = sheet.expenses.filter(e => e.label !== 'MEAL TOTAL');
  const expensesBody: any[][] = [];
  
  // Total Meals line item
  expensesBody.push([1, 'TOTAL MEALS (FT + PT/FLEX)', formatINR(mealTotal)]);
  
  otherExpenses.forEach((e, idx) => {
    expensesBody.push([idx + 2, e.label, formatAmountOrDash(e.amount)]);
  });
  
  const expensesTotal = sheet.expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  
  const activeTransports = (sheet.transport_logistics || []).filter(t => t.transport_name || (Number(t.total) || 0) > 0);
  const hasTransports = activeTransports.length > 0;
  const transportTotal = (sheet.transport_logistics || []).reduce((sum, t) => sum + (Number(t.total) || 0), 0);
  
  const grandTotalExpense = expensesTotal + transportTotal;
  const balance = (Number(sheet.received_amount) || 0) - grandTotalExpense;

  // Multi-page safety check: if remaining space is less than 210pt, start summaries on a fresh page
  if (finalY > pageHeight - 210) {
    doc.addPage();
    drawPageHeader();
    finalY = 94;
  }

  // Expenses Table (Left Column) - Distinct colored Indigo bar ([79, 70, 229])
  const expensesTableWidth = hasTransports ? 230 : pageWidth - 80;
  
  autoTable(doc, {
    startY: finalY,
    head: [[
      { content: 'DAILY EXPENSES', colSpan: 3, styles: { halign: 'center', fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold' } }
    ], ['S.NO', 'PARTICULARS', 'AMOUNT']],
    body: [
      ...expensesBody,
      [
        { content: 'TOTAL DAILY EXPENSES', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold', fillColor: [241, 245, 249] } },
        { content: formatINR(expensesTotal), styles: { fontStyle: 'bold', halign: 'right', fillColor: [241, 245, 249] } }
      ]
    ],
    theme: 'grid',
    styles: { fontSize: 8, textColor: [15, 23, 42], lineColor: [203, 213, 225], lineWidth: 0.5 },
    headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 26, halign: 'center' },
      1: { cellWidth: hasTransports ? 134 : pageWidth - 160 },
      2: { cellWidth: 70, halign: 'right' }
    },
    margin: { left: 40 },
    tableWidth: expensesTableWidth
  });

  const expenseFinalY = (doc as any).lastAutoTable.finalY;

  // Transport & Goods Inward Table (Right Column) - Distinct colored Violet bar ([109, 40, 217])
  if (hasTransports) {
    const transportBody = activeTransports.map(t => [
      t.transport_name || '—',
      t.count || '—',
      formatAmountOrDash(t.freight),
      formatAmountOrDash(t.auto),
      formatAmountOrDash(t.hamali),
      formatINR(t.total)
    ]);

    autoTable(doc, {
      startY: finalY,
      head: [[
        { content: 'TRANSPORT & GOODS INWARD', colSpan: 6, styles: { halign: 'center', fillColor: [109, 40, 217], textColor: [255, 255, 255], fontStyle: 'bold' } }
      ], ['TRANSPORT', 'CNT', 'FREIGHT', 'AUTO', 'HAMALI', 'TOTAL']],
      body: [
        ...transportBody,
        [
          { content: 'TOTAL LOGISTICS', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold', fillColor: [241, 245, 249] } },
          { content: formatINR(transportTotal), styles: { fontStyle: 'bold', halign: 'right', fillColor: [241, 245, 249] } }
        ]
      ],
      theme: 'grid',
      styles: { fontSize: 8, textColor: [15, 23, 42], lineColor: [203, 213, 225], lineWidth: 0.5 },
      headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 70 },
        1: { cellWidth: 25, halign: 'center' },
        2: { cellWidth: 40, halign: 'right' },
        3: { cellWidth: 35, halign: 'right' },
        4: { cellWidth: 35, halign: 'right' },
        5: { cellWidth: 45, halign: 'right' }
      },
      margin: { left: 285 },
      tableWidth: 250
    });
    
    finalY = Math.max(expenseFinalY, (doc as any).lastAutoTable.finalY) + 14;
  } else {
    finalY = expenseFinalY + 14;
  }

  // Settlement Panel - Multi-page check
  if (finalY > pageHeight - 120) {
    doc.addPage();
    drawPageHeader();
    finalY = 94;
  }

  // High-visibility Settlement Box with Specified Colors
  autoTable(doc, {
    startY: finalY,
    body: [
      [
        { content: 'TOTAL RECEIVED FROM CASHIER', styles: { fillColor: [224, 242, 254], textColor: [30, 58, 138], fontStyle: 'bold' } },
        { content: formatINR(sheet.received_amount), styles: { fillColor: [224, 242, 254], textColor: [30, 58, 138], fontStyle: 'bold', halign: 'right' } }
      ],
      [
        { content: 'GRAND TOTAL EXPENSES (MEALS + EXPENSES + LOGISTICS)', styles: { fillColor: [254, 226, 226], textColor: [159, 18, 57], fontStyle: 'bold' } },
        { content: formatINR(grandTotalExpense), styles: { fillColor: [254, 226, 226], textColor: [159, 18, 57], fontStyle: 'bold', halign: 'right' } }
      ],
      [
        {
          content: balance >= 0 ? 'BALANCE TO RETURN TO CASHIER' : 'CASH DEFICIT / REIMBURSEMENT DUE',
          styles: {
            fillColor: balance >= 0 ? [209, 250, 229] : [254, 226, 226],
            textColor: balance >= 0 ? [6, 95, 70] : [185, 28, 28],
            fontStyle: 'bold'
          }
        },
        {
          content: formatINR(balance),
          styles: {
            fillColor: balance >= 0 ? [209, 250, 229] : [254, 226, 226],
            textColor: balance >= 0 ? [6, 95, 70] : [185, 28, 28],
            fontStyle: 'bold',
            halign: 'right'
          }
        }
      ]
    ],
    theme: 'grid',
    styles: { fontSize: 9.5, cellPadding: 4, lineColor: [203, 213, 225], lineWidth: 0.5 },
    columnStyles: { 0: { cellWidth: 280 }, 1: { cellWidth: 100 } },
    margin: { left: 40 }
  });

  // Signatures Section (Always on final page, spacious)
  let sigY = (doc as any).lastAutoTable.finalY + 45;
  if (sigY > pageHeight - 45) {
    doc.addPage();
    drawPageHeader();
    sigY = 120;
  }
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  
  doc.text('________________________________', 40, sigY - 8);
  doc.text('CASHIER SIGNATURE', 40, sigY + 6);
  
  doc.text('________________________________', pageWidth / 2, sigY - 8, { align: 'center' });
  doc.text('PETTY CASH MANAGER SIGNATURE', pageWidth / 2, sigY + 6, { align: 'center' });
  
  doc.text('________________________________', pageWidth - 40, sigY - 8, { align: 'right' });
  doc.text('VERIFIED BY / VOU-BILL VERIFICATION', pageWidth - 40, sigY + 6, { align: 'right' });

  // Page numbering in footer: Page X of Y on all pages
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184); // Slate 400
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - 40, pageHeight - 16, { align: 'right' });
    doc.text('Confidential — System Generated Petty Cash Voucher', 40, pageHeight - 16);
  }

  // Filename format: Petty_Cash_<Location>_<YYYY-MM-DD>.pdf
  const safeLoc = (sheet.location || 'Shop').replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`Petty_Cash_${safeLoc}_${sheet.date}.pdf`);
};

export const exportPettyCashExcel = (sheet: PettyCashSheet) => {
  const wb = XLSX.utils.book_new();
  
  const wsData: any[][] = [];
  
  // Row 1: Merged Title Area
  wsData.push(['PETTY CASH VOUCHER', '', '', '', '', '', '', '', '', '', '']);
  
  // Row 2: Date & Location
  wsData.push([`DATE: ${formatDateDisplay(sheet.date)}`, '', '', '', '', '', '', '', `LOCATION: ${sheet.location.toUpperCase()}`, '', '']);
  
  // Row 3: Blank Spacer
  wsData.push([]);
  
  // Row 4: Merged Section Headers
  wsData.push(['FULL TIME STAFF', '', '', '', '', '', 'PART TIME / FLEX STAFF', '', '', '', '']);
  
  // Row 5: Column Headers
  wsData.push(['S.NO', 'NAME', 'DESIGNATION', 'F/H', 'AMOUNT', '', 'S.NO', 'NAME', 'DESIGNATION', 'F/H', 'AMOUNT']);
  
  const fullTimeStaff = sheet.staff_meals.filter(s => s.staff_type === 'full-time');
  const partTimeStaff = sheet.staff_meals.filter(s => s.staff_type === 'part-time');
  
  const maxRows = Math.max(fullTimeStaff.length, partTimeStaff.length);
  
  for (let i = 0; i < maxRows; i++) {
    const ft = fullTimeStaff[i];
    const pt = partTimeStaff[i];
    
    wsData.push([
      ft ? i + 1 : '—',
      ft ? ft.staff_name : '—',
      ft ? ft.designation : '—',
      ft ? ft.attendance_status : '—',
      ft ? (ft.amount > 0 ? formatINR(ft.amount) : '—') : '—',
      '',
      pt ? i + 1 : '—',
      pt ? pt.staff_name : '—',
      pt ? pt.designation : '—',
      pt ? pt.attendance_status : '—',
      pt ? (pt.amount > 0 ? formatINR(pt.amount) : '—') : '—'
    ]);
  }
  
  const ftMealTotal = fullTimeStaff.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  const ptMealTotal = partTimeStaff.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  const mealTotal = ftMealTotal + ptMealTotal;
  
  // Subtotal for Staff Meals
  wsData.push(['', '', '', 'TOTAL FT:', formatINR(ftMealTotal), '', '', '', '', 'TOTAL PT:', formatINR(ptMealTotal)]);
  wsData.push(['', '', '', 'MEAL TOTAL:', formatINR(mealTotal), '', '', '', '', '', '']);
  
  // Daily Expenses Section
  wsData.push([]);
  wsData.push(['DAILY EXPENSES']);
  wsData.push(['S.NO', 'PARTICULARS', 'AMOUNT']);
  
  // Meal Total line item in expenses
  wsData.push([1, 'TOTAL MEALS (FT + PT/FLEX)', formatINR(mealTotal)]);
  
  const otherExpenses = sheet.expenses.filter(e => e.label !== 'MEAL TOTAL');
  otherExpenses.forEach((e, idx) => {
    wsData.push([idx + 2, e.label, formatAmountOrDash(e.amount)]);
  });
  
  const expensesTotal = sheet.expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  wsData.push(['', 'TOTAL DAILY EXPENSES', formatINR(expensesTotal)]);
  
  // Transport Logistics Section (rendered only when entries exist)
  const activeTransports = (sheet.transport_logistics || []).filter(t => t.transport_name || (Number(t.total) || 0) > 0);
  const transportTotal = (sheet.transport_logistics || []).reduce((sum, t) => sum + (Number(t.total) || 0), 0);

  if (activeTransports.length > 0) {
    wsData.push([]);
    wsData.push(['TRANSPORT LOGISTICS (GOODS INWARD)']);
    wsData.push(['TRANSPORT', 'COUNT', 'FREIGHT', 'AUTO', 'HAMALI', 'TOTAL LOGISTICS']);
    activeTransports.forEach(t => {
      wsData.push([
        t.transport_name || '—',
        t.count || '—',
        formatAmountOrDash(t.freight),
        formatAmountOrDash(t.auto),
        formatAmountOrDash(t.hamali),
        formatINR(t.total)
      ]);
    });
    wsData.push(['', '', '', '', 'TOTAL LOGISTICS:', formatINR(transportTotal)]);
  }

  const grandTotalExpense = expensesTotal + transportTotal;
  const balance = (Number(sheet.received_amount) || 0) - grandTotalExpense;
  
  // Settlement Summary Section
  wsData.push([]);
  wsData.push(['CASH SETTLEMENT SUMMARY']);
  wsData.push(['TOTAL RECEIVED FROM CASHIER', formatINR(sheet.received_amount)]);
  wsData.push(['GRAND TOTAL EXPENSES', formatINR(grandTotalExpense)]);
  wsData.push([
    balance >= 0 ? 'BALANCE TO RETURN TO CASHIER' : 'CASH DEFICIT / REIMBURSEMENT DUE',
    formatINR(balance)
  ]);

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  
  // Column Widths for clean layout
  ws['!cols'] = [
    { wch: 6 },  // A: S.No
    { wch: 24 }, // B: Name
    { wch: 18 }, // C: Designation
    { wch: 8 },  // D: F/H
    { wch: 15 }, // E: Amount
    { wch: 4 },  // F: Spacer
    { wch: 6 },  // G: S.No
    { wch: 24 }, // H: Name
    { wch: 18 }, // I: Designation
    { wch: 8 },  // J: F/H
    { wch: 15 }, // K: Amount
  ];

  // Cell merges
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 10 } }, // A1:K1 Voucher Title
    { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } },  // A2:C2 Date
    { s: { r: 1, c: 8 }, e: { r: 1, c: 10 } }, // I2:K2 Location
    { s: { r: 3, c: 0 }, e: { r: 3, c: 4 } },  // A4:E4 Full Time Staff
    { s: { r: 3, c: 6 }, e: { r: 3, c: 10 } }, // G4:K4 Part Time Staff
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Petty Cash');
  
  // Filename format: Petty_Cash_<Location>_<YYYY-MM-DD>.xlsx
  const safeLoc = (sheet.location || 'Shop').replace(/[^a-zA-Z0-9_-]/g, '_');
  XLSX.writeFile(wb, `Petty_Cash_${safeLoc}_${sheet.date}.xlsx`);
};
