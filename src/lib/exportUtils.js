import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';

// ── Professional XLSX export ──────────────────────────────────────────────────
export function exportXLSX(filename, reportTitle, headers, rows, totalsRow, dateRange) {
  const wb = XLSX.utils.book_new();

  const titleRows = [
    ['KKGT IMPORT & EXPORT'],
    [reportTitle],
    [`Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')}${dateRange ? `  |  Period: ${dateRange}` : ''}`],
    [],
    headers,
    ...rows,
  ];
  if (totalsRow) titleRows.push(totalsRow);

  const ws = XLSX.utils.aoa_to_sheet(titleRows);

  const numRows = titleRows.length;
  const numCols = headers.length;

  const colWidths = headers.map((h, ci) => {
    let max = String(h).length;
    rows.forEach(row => { const v = row[ci]; if (v != null) max = Math.max(max, String(v).length); });
    if (totalsRow) { const v = totalsRow[ci]; if (v != null) max = Math.max(max, String(v).length); }
    return { wch: Math.max(max + 4, 12) };
  });
  ws['!cols'] = colWidths;
  ws['!freeze'] = { xSplit: 0, ySplit: 5, topLeftCell: 'A6', activePane: 'bottomLeft' };
  ws['!pageSetup'] = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

  const headerRowIdx = 4;
  const totalsRowIdx = totalsRow ? titleRows.length - 1 : null;

  for (let r = 0; r < numRows; r++) {
    for (let c = 0; c < numCols; c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (!ws[ref]) ws[ref] = { t: 's', v: '' };

      if (r === headerRowIdx) {
        ws[ref].s = {
          fill: { fgColor: { rgb: '126433' } },
          font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
          border: { bottom: { style: 'thin', color: { rgb: 'FFFFFF' } } },
        };
      } else if (totalsRowIdx !== null && r === totalsRowIdx) {
        ws[ref].s = {
          fill: { fgColor: { rgb: 'F06721' } },
          font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
          alignment: { horizontal: c > 1 ? 'right' : 'left' },
        };
      } else if (r > headerRowIdx && r < (totalsRowIdx ?? numRows)) {
        const isAlt = (r - headerRowIdx - 1) % 2 === 1;
        ws[ref].s = {
          fill: { fgColor: { rgb: isAlt ? 'F0F7F0' : 'FFFFFF' } },
          alignment: { horizontal: c > 1 && typeof ws[ref].v === 'number' ? 'right' : 'left' },
        };
        if (typeof ws[ref].v === 'number') ws[ref].z = '#,##0.00';
      } else if (r < headerRowIdx) {
        ws[ref].s = {
          font: r === 0 ? { bold: true, sz: 14, color: { rgb: '126433' } } : r === 1 ? { bold: true, sz: 11 } : { sz: 9, color: { rgb: '666666' } },
        };
      }
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, reportTitle.slice(0, 31));
  XLSX.writeFile(wb, filename + '.xlsx');
}

// ── PDF export ────────────────────────────────────────────────────────────────
export function exportPDF(title, headers, rows, totalsRow) {
  const doc = new jsPDF({ orientation: 'landscape' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const genDate = format(new Date(), 'dd/MM/yyyy HH:mm');
  const season = new Date().getFullYear().toString();

  doc.setFillColor(18, 100, 51);
  doc.rect(0, 0, pageWidth, 22, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  doc.text('KKGT', margin, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(180, 220, 190);
  doc.text('IMPORT & EXPORT  ·  ETHIOPIA', margin + 26, 14);

  doc.setFillColor(240, 103, 33);
  doc.rect(0, 22, pageWidth, 14, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(title.toUpperCase(), margin, 30);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(255, 230, 210);
  const metaText = `Season ${season}  ·  Generated: ${genDate}  ·  CONFIDENTIAL`;
  doc.text(metaText, pageWidth - margin, 30, { align: 'right' });

  const colCount = headers.length;
  const colWidth = (pageWidth - margin * 2) / colCount;
  let y = 42;
  const rowH = 6.5;
  let pageNum = 1;

  const addFooter = (pn) => {
    doc.setFillColor(245, 245, 245);
    doc.rect(0, pageHeight - 10, pageWidth, 10, 'F');
    doc.setDrawColor(18, 100, 51);
    doc.setLineWidth(0.5);
    doc.line(0, pageHeight - 10, pageWidth, pageHeight - 10);
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 100, 100);
    doc.text('KKGT Import & Export  ·  Confidential  ·  Internal use only', margin, pageHeight - 4);
    doc.text(`Page ${pn}  ·  Season ${season}`, pageWidth - margin, pageHeight - 4, { align: 'right' });
  };

  const drawTableHeader = () => {
    doc.setFillColor(18, 100, 51);
    doc.rect(margin, y, pageWidth - margin * 2, rowH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(255, 255, 255);
    headers.forEach((h, i) => {
      const isNumericHeader = i > 1;
      const x = isNumericHeader ? margin + (i + 1) * colWidth - 2 : margin + i * colWidth + 1;
      doc.text(String(h).toUpperCase(), x, y + 4.5, isNumericHeader ? { align: 'right' } : {});
    });
    y += rowH;
  };

  drawTableHeader();

  const allRows = totalsRow ? [...rows, totalsRow] : rows;
  allRows.forEach((row, ri) => {
    if (y > pageHeight - 16) {
      addFooter(pageNum);
      doc.addPage();
      pageNum++;
      y = 10;
      drawTableHeader();
    }

    const isTotals = totalsRow && ri === allRows.length - 1;

    if (isTotals) {
      doc.setFillColor(18, 100, 51);
      doc.rect(margin, y, pageWidth - margin * 2, rowH, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(255, 255, 255);
    } else if (ri % 2 === 0) {
      doc.setFillColor(248, 253, 248);
      doc.rect(margin, y, pageWidth - margin * 2, rowH, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(30, 30, 30);
    } else {
      doc.setFillColor(255, 255, 255);
      doc.rect(margin, y, pageWidth - margin * 2, rowH, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(30, 30, 30);
    }

    row.forEach((cell, i) => {
      const cellStr = String(cell ?? '');
      const isNumericCol = i > 1;
      const x = isNumericCol ? margin + (i + 1) * colWidth - 2 : margin + i * colWidth + 1.5;

      if (!isTotals && (cellStr === 'Paid' || cellStr === 'Paid ✓')) {
        doc.setTextColor(18, 100, 51); doc.setFont('helvetica', 'bold');
      } else if (!isTotals && cellStr === 'Partial') {
        doc.setTextColor(180, 100, 0); doc.setFont('helvetica', 'bold');
      } else if (!isTotals && cellStr === 'Unpaid') {
        doc.setTextColor(200, 40, 40); doc.setFont('helvetica', 'bold');
      } else if (isTotals) {
        doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold');
      } else {
        doc.setTextColor(30, 30, 30); doc.setFont('helvetica', 'normal');
      }

      doc.text(cellStr, x, y + 4.5, isNumericCol ? { align: 'right' } : {});
    });

    doc.setDrawColor(232, 232, 232);
    doc.setLineWidth(0.15);
    doc.line(margin, y + rowH, margin + (pageWidth - margin * 2), y + rowH);
    y += rowH;
  });

  addFooter(pageNum);
  doc.save(title.replace(/\s+/g, '_') + '.pdf');
}