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

export const exportPettyCashPdf = (sheet: PettyCashSheet) => {
  const doc = new jsPDF('p', 'pt', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Document Title Banner: Deep Navy ([30, 58, 138]) with crisp white text
  doc.setFillColor(30, 58, 138);
  doc.rect(40, 25, pageWidth - 80, 42, 'F');
  
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  const title = sheet.template_type === 'godown' ? 'GODOWN PETTY CASH LIST' : 'PETTY CASH VOUCHER';
  doc.text(title, pageWidth / 2, 51, { align: 'center' });
  
  // Date and Location Badges
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 58, 138);
  doc.text(`DATE: ${formatDateDisplay(sheet.date)}`, 42, 85);
  doc.text(`LOCATION: ${sheet.location.toUpperCase()}`, pageWidth - 42, 85, { align: 'right' });
  
  // Staff Tables preparation
  const fullTimeStaff = sheet.staff_meals.filter(s => s.staff_type === 'full-time');
  const partTimeStaff = sheet.staff_meals.filter(s => s.staff_type === 'part-time');
  
  const maxRows = Math.max(fullTimeStaff.length, partTimeStaff.length);
  const staffTableBody: any[][] = [];
  
  for (let i = 0; i < maxRows; i++) {
    const ft = fullTimeStaff[i];
    const pt = partTimeStaff[i];
    
    staffTableBody.push([
      ft ? i + 1 : '',
      ft ? ft.staff_name : '',
      ft ? ft.designation : '',
      ft ? ft.attendance_status : '',
      ft ? (ft.amount > 0 ? ft.amount : '') : '',
      '', // spacer
      pt ? i + 1 : '',
      pt ? pt.staff_name : '',
      pt ? pt.designation : '',
      pt ? pt.attendance_status : '',
      pt ? (pt.amount > 0 ? pt.amount : '') : ''
    ]);
  }
  
  // Main Staff Table with Royal Indigo and Emerald Green headers
  autoTable(doc, {
    startY: 96,
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
    styles: { fontSize: 8, cellPadding: 3, textColor: [15, 23, 42], lineColor: [203, 213, 225], lineWidth: 0.5 },
    headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', lineWidth: 0.5 },
    columnStyles: {
      0: { cellWidth: 25 }, 1: { cellWidth: 70 }, 2: { cellWidth: 50 }, 3: { cellWidth: 25 }, 4: { cellWidth: 35, halign: 'right' },
      5: { cellWidth: 15, lineWidth: 0 },
      6: { cellWidth: 25 }, 7: { cellWidth: 70 }, 8: { cellWidth: 50 }, 9: { cellWidth: 25 }, 10: { cellWidth: 35, halign: 'right' }
    },
    margin: { left: 40, right: 40 }
  });
  
  let finalY = (doc as any).lastAutoTable.finalY + 16;

  // Multi-page safety check: if remaining space is less than 200pt, break to new page
  if (finalY > doc.internal.pageSize.getHeight() - 200) {
    doc.addPage();
    finalY = 40;
  }

  // Calculate totals
  const expensesBody = sheet.expenses.map((e, idx) => [idx + 1, e.label, e.amount > 0 ? e.amount : '']);
  const expensesTotal = sheet.expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  
  const hasTransports = sheet.transport_logistics && sheet.transport_logistics.some(t => t.transport_name || (Number(t.total) || 0) > 0);
  const activeTransports = (sheet.transport_logistics || []).filter(t => t.transport_name || (Number(t.total) || 0) > 0);
  const transportTotal = (sheet.transport_logistics || []).reduce((sum, t) => sum + (Number(t.total) || 0), 0);
  
  const totalExp = expensesTotal + transportTotal;
  const balance = (Number(sheet.received_amount) || 0) - totalExp;

  // Expenses Table (Left Column) - Header in Indigo ([79, 70, 229])
  autoTable(doc, {
    startY: finalY,
    head: [[
      { content: 'DAILY EXPENSES', colSpan: 3, styles: { halign: 'center', fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold' } }
    ], ['S.NO', 'PARTICULARS', 'AMOUNT']],
    body: [
      ...expensesBody,
      [{ content: 'TOTAL EXPENSES', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold', fillColor: [248, 250, 252] } }, { content: expensesTotal, styles: { fontStyle: 'bold', halign: 'right', fillColor: [248, 250, 252] } }]
    ],
    theme: 'grid',
    styles: { fontSize: 8, textColor: [15, 23, 42], lineColor: [203, 213, 225], lineWidth: 0.5 },
    headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42] },
    columnStyles: { 0: { cellWidth: 28 }, 1: { cellWidth: 140 }, 2: { cellWidth: 55, halign: 'right' } },
    margin: { left: 40 },
    tableWidth: 223
  });

  const expenseFinalY = (doc as any).lastAutoTable.finalY;

  // Transport Logistics Table (Right Column) - Header in Violet ([109, 40, 217])
  if (hasTransports && activeTransports.length > 0) {
    const transportBody = activeTransports.map(t => [t.transport_name, t.count, t.freight || '', t.auto || '', t.hamali || '', t.total || '']);
    autoTable(doc, {
      startY: finalY,
      head: [[
        { content: 'TRANSPORT & GOODS INWARD', colSpan: 6, styles: { halign: 'center', fillColor: [109, 40, 217], textColor: [255, 255, 255], fontStyle: 'bold' } }
      ], ['TRANSPORT', 'CNT', 'FRT', 'AUTO', 'HAM', 'TOTAL']],
      body: [
        ...transportBody,
        [{ content: 'TOTAL LOGISTICS', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold', fillColor: [248, 250, 252] } }, { content: transportTotal, styles: { fontStyle: 'bold', halign: 'right', fillColor: [248, 250, 252] } }]
      ],
      theme: 'grid',
      styles: { fontSize: 8, textColor: [15, 23, 42], lineColor: [203, 213, 225], lineWidth: 0.5 },
      headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42] },
      columnStyles: { 0: { cellWidth: 70 }, 1: { cellWidth: 26 }, 2: { cellWidth: 32 }, 3: { cellWidth: 30 }, 4: { cellWidth: 30 }, 5: { cellWidth: 35, halign: 'right' } },
      margin: { left: 275 },
      tableWidth: 223
    });
    
    finalY = Math.max(expenseFinalY, (doc as any).lastAutoTable.finalY) + 16;
  } else {
    finalY = expenseFinalY + 16;
  }

  // Settlement Card with Specified Pastel Fills & Bold Text
  if (finalY > doc.internal.pageSize.getHeight() - 120) {
    doc.addPage();
    finalY = 40;
  }

  autoTable(doc, {
    startY: finalY,
    body: [
      [
        { content: 'TOTAL RECEIVED (CASHIER)', styles: { fillColor: [224, 242, 254], textColor: [30, 58, 138], fontStyle: 'bold' } },
        { content: `Rs. ${(sheet.received_amount || 0).toLocaleString('en-IN')}`, styles: { fillColor: [224, 242, 254], textColor: [30, 58, 138], fontStyle: 'bold', halign: 'right' } }
      ],
      [
        { content: 'TOTAL EXPENSES', styles: { fillColor: [254, 226, 226], textColor: [159, 18, 57], fontStyle: 'bold' } },
        { content: `Rs. ${totalExp.toLocaleString('en-IN')}`, styles: { fillColor: [254, 226, 226], textColor: [159, 18, 57], fontStyle: 'bold', halign: 'right' } }
      ],
      [
        { content: balance >= 0 ? 'BALANCE REFUND TO CASHIER' : 'CASH DEFICIT / REIMBURSEMENT DUE', styles: { fillColor: [209, 250, 229], textColor: [6, 95, 70], fontStyle: 'bold' } },
        { content: `Rs. ${balance.toLocaleString('en-IN')}`, styles: { fillColor: [209, 250, 229], textColor: balance >= 0 ? [6, 95, 70] : [185, 28, 28], fontStyle: 'bold', halign: 'right' } }
      ]
    ],
    theme: 'grid',
    styles: { fontSize: 9.5, cellPadding: 4, lineColor: [203, 213, 225], lineWidth: 0.5 },
    columnStyles: { 0: { cellWidth: 170 }, 1: { cellWidth: 90 } },
    margin: { left: 40 }
  });

  // Footer Signatures
  let sigY = (doc as any).lastAutoTable.finalY + 45;
  if (sigY > doc.internal.pageSize.getHeight() - 40) {
    doc.addPage();
    sigY = 50;
  }
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('_____________________', 40, sigY - 10);
  doc.text('CASHIER SIGNATURE', 40, sigY + 5);
  
  doc.text('_____________________', pageWidth / 2, sigY - 10, { align: 'center' });
  doc.text('MANAGER SIGNATURE', pageWidth / 2, sigY + 5, { align: 'center' });
  
  doc.text('_____________________', pageWidth - 40, sigY - 10, { align: 'right' });
  doc.text('VOU/BILL VERIFICATION', pageWidth - 40, sigY + 5, { align: 'right' });

  doc.save(`Petty_Cash_${sheet.location}_${sheet.date}.pdf`);
};

export const exportPettyCashExcel = (sheet: PettyCashSheet) => {
  const wb = XLSX.utils.book_new();
  
  const wsData: any[][] = [];
  wsData.push([sheet.template_type === 'godown' ? 'GODOWN PETTY CASH LIST' : 'PETTY CASH VOUCHER']);
  wsData.push([`DATE: ${formatDateDisplay(sheet.date)}`, '', '', '', '', '', `LOCATION: ${sheet.location.toUpperCase()}`]);
  wsData.push([]);
  
  wsData.push(['FULL TIME STAFF', '', '', '', '', '', 'PART TIME / FLEX STAFF']);
  wsData.push(['S.NO', 'NAME', 'DESIGNATION', 'F/H', 'AMT', '', 'S.NO', 'NAME', 'DESIGNATION', 'F/H', 'AMT']);
  
  const fullTimeStaff = sheet.staff_meals.filter(s => s.staff_type === 'full-time');
  const partTimeStaff = sheet.staff_meals.filter(s => s.staff_type === 'part-time');
  
  const maxRows = Math.max(fullTimeStaff.length, partTimeStaff.length);
  
  for (let i = 0; i < maxRows; i++) {
    const ft = fullTimeStaff[i];
    const pt = partTimeStaff[i];
    
    wsData.push([
      ft ? i + 1 : '',
      ft ? ft.staff_name : '',
      ft ? ft.designation : '',
      ft ? ft.attendance_status : '',
      ft ? ft.amount : '',
      '',
      pt ? i + 1 : '',
      pt ? pt.staff_name : '',
      pt ? pt.designation : '',
      pt ? pt.attendance_status : '',
      pt ? pt.amount : ''
    ]);
  }
  
  wsData.push([]);
  wsData.push(['DAILY EXPENSES']);
  wsData.push(['S.NO', 'PARTICULARS', 'AMOUNT']);
  
  sheet.expenses.forEach((e, idx) => {
    wsData.push([idx + 1, e.label, e.amount]);
  });
  const expensesTotal = sheet.expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  wsData.push(['', 'TOTAL EXPENSES', expensesTotal]);
  
  const transportItems = (sheet.transport_logistics || []).filter(t => t.transport_name || (Number(t.total) || 0) > 0);
  const transportTotal = (sheet.transport_logistics || []).reduce((sum, t) => sum + (Number(t.total) || 0), 0);

  if (transportItems.length > 0) {
    wsData.push([]);
    wsData.push(['TRANSPORT LOGISTICS (GOODS INWARD)']);
    wsData.push(['TRANSPORT', 'COUNT', 'FREIGHT', 'AUTO', 'HAMALI', 'TOTAL']);
    transportItems.forEach(t => {
      wsData.push([t.transport_name, t.count, t.freight, t.auto, t.hamali, t.total]);
    });
    wsData.push(['', '', '', '', 'TOTAL LOGISTICS', transportTotal]);
  }

  const totalExp = expensesTotal + transportTotal;
  
  wsData.push([]);
  wsData.push(['SETTLEMENT SUMMARY']);
  wsData.push(['TOTAL RECEIVED', sheet.received_amount]);
  wsData.push(['TOTAL EXPENSES', totalExp]);
  wsData.push(['BALANCE', (Number(sheet.received_amount) || 0) - totalExp]);

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, 'PettyCash');
  XLSX.writeFile(wb, `Petty_Cash_${sheet.location}_${sheet.date}.xlsx`);
};
