import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';

function fmt(n, d = 2) {
  if (n == null || isNaN(n)) return '';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function drawTable(doc, headers, rows, startY) {
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 10;
  const colW = (pageW - margin * 2) / headers.length;
  let y = startY;

  doc.setFontSize(8);
  doc.setFont(undefined, 'bold');
  doc.setFillColor(13, 100, 50);
  doc.setTextColor(255, 255, 255);
  doc.rect(margin, y, pageW - margin * 2, 7, 'F');
  headers.forEach((h, i) => doc.text(String(h), margin + i * colW + 1.5, y + 5));
  y += 7;

  doc.setFont(undefined, 'normal');
  doc.setTextColor(20, 20, 20);
  rows.forEach((row, idx) => {
    if (y > doc.internal.pageSize.getHeight() - 15) {
      doc.addPage();
      y = 15;
    }
    if (idx % 2 === 0) {
      doc.setFillColor(245, 245, 245);
      doc.rect(margin, y, pageW - margin * 2, 6, 'F');
    }
    row.forEach((cell, i) => {
      const s = String(cell ?? '');
      doc.text(s.length > 22 ? s.slice(0, 22) + '…' : s, margin + i * colW + 1.5, y + 4);
    });
    y += 6;
  });
  return y;
}

export function exportMaterialsPDF({ title, summary, headers, rows }) {
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(204, 85, 0);
  doc.text('KKGT Import Export', 10, 12);
  doc.setTextColor(13, 100, 50);
  doc.setFontSize(11);
  doc.text(title, 10, 18);
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.setFont(undefined, 'normal');
  doc.text(`Generated: ${format(new Date(), 'd MMM yyyy HH:mm')}`, 10, 23);

  let y = 30;
  if (summary && summary.length) {
    doc.setFontSize(9);
    doc.setTextColor(20, 20, 20);
    summary.forEach((line) => { doc.text(line, 10, y); y += 5; });
    y += 2;
  }
  drawTable(doc, headers, rows, y);
  doc.save(`${title.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.pdf`);
}

export function exportMaterialsExcel({ title, sheetName, headers, rows }) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Sheet1');
  XLSX.writeFile(wb, `${title.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.xlsx`);
}

export { fmt };