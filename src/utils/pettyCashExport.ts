import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { PettyCashSheet, StaffMeal } from '../services/pettyCashService';

const formatDateDMY = (dateStr: string) => {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return d && m && y ? `${d}/${m}/${y}` : dateStr;
};

export const exportPettyCashPdf = (sheet: PettyCashSheet) => {
  const doc = new jsPDF('p', 'pt', 'a4');
  
  // Headers
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  const title = sheet.template_type === 'godown' ? 'GODOWN PETTY CASH LIST' : 'PETTY CASH';
  doc.text(title, doc.internal.pageSize.getWidth() / 2, 40, { align: 'center' });
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`DATE: ${formatDateDMY(sheet.date)}`, 40, 70);
  doc.text(`LOCATION: ${sheet.location.toUpperCase()}`, doc.internal.pageSize.getWidth() - 40, 70, { align: 'right' });
  
  // Tables preparation
  const fullTimeStaff = sheet.staff_meals.filter(s => s.staff_type === 'full-time');
  const partTimeStaff = sheet.staff_meals.filter(s => s.staff_type === 'part-time');
  
  const maxRows = Math.max(fullTimeStaff.length, partTimeStaff.length);
  const staffTableBody = [];
  
  for (let i = 0; i < maxRows; i++) {
    const ft = fullTimeStaff[i];
    const pt = partTimeStaff[i];
    
    staffTableBody.push([
      ft ? i + 1 : '',
      ft ? ft.staff_name : '',
      ft ? ft.designation : '',
      ft ? ft.attendance_status : '',
      ft ? ft.amount : '',
      '', // spacer
      pt ? i + 1 : '',
      pt ? pt.staff_name : '',
      pt ? pt.designation : '',
      pt ? pt.attendance_status : '',
      pt ? pt.amount : ''
    ]);
  }
  
  autoTable(doc, {
    startY: 90,
    head: [[
      { content: 'FULL TIME', colSpan: 5, styles: { halign: 'center', fillColor: [200, 200, 200], textColor: 0 } },
      { content: '', styles: { fillColor: 255 } },
      { content: 'PART TIME', colSpan: 5, styles: { halign: 'center', fillColor: [200, 200, 200], textColor: 0 } }
    ], [
      'S.NO', 'NAME', 'DESIG', 'F/H', 'AMT',
      '',
      'S.NO', 'NAME', 'DESIG', 'F/H', 'AMT'
    ]],
    body: staffTableBody,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 3, textColor: 0, lineColor: 0, lineWidth: 0.5 },
    headStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: 'bold', lineWidth: 0.5 },
    columnStyles: {
      0: { cellWidth: 25 }, 1: { cellWidth: 70 }, 2: { cellWidth: 50 }, 3: { cellWidth: 25 }, 4: { cellWidth: 35 },
      5: { cellWidth: 15, lineWidth: 0 },
      6: { cellWidth: 25 }, 7: { cellWidth: 70 }, 8: { cellWidth: 50 }, 9: { cellWidth: 25 }, 10: { cellWidth: 35 }
    },
    margin: { left: 40, right: 40 }
  });
  
  let finalY = (doc as any).lastAutoTable.finalY + 20;

  // Expenses Table
  const expensesBody = sheet.expenses.map((e, idx) => [idx + 1, e.label, e.amount]);
  const expensesTotal = sheet.expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  
  let transportTotal = 0;
  if (sheet.template_type === 'godown') {
     transportTotal = sheet.transport_logistics.reduce((sum, t) => sum + (t.total || 0), 0);
  }
  
  const totalExp = expensesTotal + transportTotal;
  const balance = sheet.received_amount - totalExp;
  
  autoTable(doc, {
    startY: finalY,
    head: [['S.NO', 'PARTICULARS', 'AMOUNT']],
    body: [
      ...expensesBody,
      [{ content: 'TOTAL EXPENSES', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold' } }, { content: totalExp, styles: { fontStyle: 'bold' } }]
    ],
    theme: 'grid',
    styles: { fontSize: 8, textColor: 0, lineColor: 0, lineWidth: 0.5 },
    headStyles: { fillColor: [240, 240, 240], textColor: 0 },
    columnStyles: { 0: { cellWidth: 30 }, 1: { cellWidth: 150 }, 2: { cellWidth: 60 } },
    margin: { left: 40 },
    tableWidth: 240
  });

  const expenseY = (doc as any).lastAutoTable.finalY;

  // Godown transport logistics if applicable
  if (sheet.template_type === 'godown') {
    const transportBody = sheet.transport_logistics.map(t => [t.transport_name, t.count, t.freight, t.auto, t.hamali, t.total]);
    autoTable(doc, {
      startY: finalY,
      head: [['TRANSPORT', 'COUNT', 'FREIGHT', 'AUTO', 'HAMALI', 'TOTAL']],
      body: [
        ...transportBody,
        [{ content: 'TOTAL LOGISTICS', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold' } }, { content: transportTotal, styles: { fontStyle: 'bold' } }]
      ],
      theme: 'grid',
      styles: { fontSize: 8, textColor: 0, lineColor: 0, lineWidth: 0.5 },
      headStyles: { fillColor: [240, 240, 240], textColor: 0 },
      margin: { left: 300 },
      tableWidth: 'auto'
    });
    
    finalY = Math.max(expenseY, (doc as any).lastAutoTable.finalY) + 20;
  } else {
    finalY = expenseY + 20;
  }

  // Settlement Box
  autoTable(doc, {
    startY: finalY,
    body: [
      ['TOTAL RECEIVED', sheet.received_amount],
      ['TOTAL EXP', totalExp],
      ['BALANCE', balance]
    ],
    theme: 'grid',
    styles: { fontSize: 10, textColor: 0, lineColor: 0, lineWidth: 0.5, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 120, fillColor: [240, 240, 240] }, 1: { cellWidth: 80 } },
    margin: { left: 40 }
  });

  // Footer signatures
  finalY = (doc as any).lastAutoTable.finalY + 50;
  if (finalY > doc.internal.pageSize.getHeight() - 40) {
    doc.addPage();
    finalY = 50;
  }
  
  doc.setFontSize(9);
  doc.text('CASHIER SIGNATURE', 40, finalY);
  doc.text('MANAGER SIGNATURE', doc.internal.pageSize.getWidth() / 2, finalY, { align: 'center' });
  doc.text('VOU/BILL VERIFICATION', doc.internal.pageSize.getWidth() - 40, finalY, { align: 'right' });

  doc.save(`Petty_Cash_${sheet.location}_${sheet.date}.pdf`);
};

export const exportPettyCashExcel = (sheet: PettyCashSheet) => {
  const wb = XLSX.utils.book_new();
  
  const wsData = [];
  wsData.push([sheet.template_type === 'godown' ? 'GODOWN PETTY CASH LIST' : 'PETTY CASH']);
  wsData.push([`DATE: ${formatDateDMY(sheet.date)}`, '', '', '', '', '', `LOCATION: ${sheet.location.toUpperCase()}`]);
  wsData.push([]);
  
  wsData.push(['FULL TIME', '', '', '', '', '', 'PART TIME']);
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
  wsData.push(['EXPENSES']);
  wsData.push(['S.NO', 'PARTICULARS', 'AMOUNT']);
  
  sheet.expenses.forEach((e, idx) => {
    wsData.push([idx + 1, e.label, e.amount]);
  });
  
  let transportTotal = 0;
  if (sheet.template_type === 'godown') {
    wsData.push([]);
    wsData.push(['LOGISTICS']);
    wsData.push(['TRANSPORT', 'COUNT', 'FREIGHT', 'AUTO', 'HAMALI', 'TOTAL']);
    sheet.transport_logistics.forEach(t => {
      wsData.push([t.transport_name, t.count, t.freight, t.auto, t.hamali, t.total]);
      transportTotal += (t.total || 0);
    });
    wsData.push(['', '', '', '', 'TOTAL', transportTotal]);
  }

  const expensesTotal = sheet.expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const totalExp = expensesTotal + transportTotal;
  
  wsData.push([]);
  wsData.push(['SETTLEMENT']);
  wsData.push(['TOTAL RECEIVED', sheet.received_amount]);
  wsData.push(['TOTAL EXP', totalExp]);
  wsData.push(['BALANCE', sheet.received_amount - totalExp]);

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, 'PettyCash');
  XLSX.writeFile(wb, `Petty_Cash_${sheet.location}_${sheet.date}.xlsx`);
};
