/**
 * Coffee ERP — unified branded report engine.
 *
 * One place that produces beautiful, consistent PDF + Excel for every report.
 *   - PDF   via jsPDF + jspdf-autotable (auto layout, page breaks, header/footer)
 *   - Excel via exceljs (real styling: fills, fonts, number formats, frozen rows,
 *     embedded logo — unlike community SheetJS which silently ignores styles)
 *
 * Public API (kept simple so call sites just pass headers + rows):
 *   exportReportPDF({ title, subtitle, headers, rows, totals, filename })
 *   exportReportXLSX({ title, subtitle, headers, rows, totals, filename })
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ExcelJS from 'exceljs';
import { format } from 'date-fns';
import { LOGO_PNG_DATAURL } from '@/lib/brandLogo';

// Brand palette
const COFFEE = '#2E1A12';      // espresso (header band)
const COFFEE_RGB = [46, 26, 18];
const AMBER = '#C8873E';
const AMBER_RGB = [200, 135, 62];
const ROW_ALT = '#F6F0E9';     // cream stripe
const ROW_ALT_RGB = [246, 240, 233];

// Decide which columns are numeric (right-align + number format) by sampling rows.
function detectNumericCols(headers, rows) {
  return headers.map((_, c) => {
    let nums = 0, total = 0;
    for (const r of rows) {
      const v = r[c];
      if (v === '' || v == null) continue;
      total++;
      const cleaned = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.\-]/g, ''));
      if (Number.isFinite(cleaned) && String(v).match(/[0-9]/)) nums++;
    }
    return total > 0 && nums / total >= 0.7;
  });
}

function toNumber(v) {
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ───────────────────────────────────────────────────────────────────────────
// PDF
// ───────────────────────────────────────────────────────────────────────────
export function exportReportPDF({ title, subtitle, headers, rows, totals, filename = 'report' }) {
  const doc = new jsPDF({ orientation: headers.length > 6 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const numericCols = detectNumericCols(headers, rows);
  const generated = format(new Date(), 'dd MMM yyyy, HH:mm');

  const drawHeader = () => {
    // Espresso band
    doc.setFillColor(...COFFEE_RGB);
    doc.rect(0, 0, pageW, 64, 'F');
    // Logo
    try { doc.addImage(LOGO_PNG_DATAURL, 'PNG', 28, 12, 40, 40); } catch { /* logo optional */ }
    // Brand + title
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Coffee ERP', 80, 30);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(title || 'Report', 80, 48);
    // Meta (right)
    doc.setFontSize(8);
    doc.setTextColor(220, 200, 180);
    doc.text(`Generated ${generated}`, pageW - 28, 26, { align: 'right' });
    if (subtitle) doc.text(String(subtitle), pageW - 28, 40, { align: 'right' });
    doc.text('Confidential', pageW - 28, 54, { align: 'right' });
  };

  const columnStyles = {};
  numericCols.forEach((isNum, i) => { if (isNum) columnStyles[i] = { halign: 'right' }; });

  autoTable(doc, {
    head: [headers],
    body: rows.map(r => r.map(c => (c == null ? '' : c))),
    foot: totals ? [totals.map(c => (c == null ? '' : c))] : undefined,
    startY: 78,
    margin: { top: 78, left: 28, right: 28, bottom: 36 },
    styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak', valign: 'middle' },
    headStyles: { fillColor: COFFEE_RGB, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'left' },
    footStyles: { fillColor: AMBER_RGB, textColor: [46, 26, 18], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: ROW_ALT_RGB },
    columnStyles,
    didDrawPage: () => {
      drawHeader();
      // Footer
      const pageH = doc.internal.pageSize.getHeight();
      const page = doc.internal.getNumberOfPages();
      doc.setFontSize(7);
      doc.setTextColor(120, 120, 120);
      doc.text('Coffee ERP · Coffee Supply Chain', 28, pageH - 14);
      doc.text(`Page ${page}`, pageW - 28, pageH - 14, { align: 'right' });
    },
  });

  doc.save(`${filename}.pdf`);
}

// ───────────────────────────────────────────────────────────────────────────
// Excel
// ───────────────────────────────────────────────────────────────────────────
export async function exportReportXLSX({ title, subtitle, headers, rows, totals, filename = 'report' }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Coffee ERP';
  wb.created = new Date();
  const ws = wb.addWorksheet((title || 'Report').slice(0, 28), {
    views: [{ state: 'frozen', ySplit: 4 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const nCols = headers.length;
  const numericCols = detectNumericCols(headers, rows);

  // Embed logo (top-left).
  try {
    const imgId = wb.addImage({ base64: LOGO_PNG_DATAURL, extension: 'png' });
    ws.addImage(imgId, { tl: { col: 0, row: 0 }, ext: { width: 44, height: 44 } });
  } catch { /* logo optional */ }

  // Title band (rows 1-3), merged across all columns.
  const lastColLetter = ws.getColumn(nCols).letter;
  ws.mergeCells(`A1:${lastColLetter}1`);
  ws.mergeCells(`A2:${lastColLetter}2`);
  ws.mergeCells(`A3:${lastColLetter}3`);
  const titleCell = ws.getCell('A1');
  titleCell.value = 'Coffee ERP';
  titleCell.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 4 };
  const subCell = ws.getCell('A2');
  subCell.value = title || 'Report';
  subCell.font = { bold: true, size: 12, color: { argb: 'FFF2C98A' } };
  subCell.alignment = { horizontal: 'left', indent: 4 };
  const metaCell = ws.getCell('A3');
  metaCell.value = `Generated ${format(new Date(), 'dd MMM yyyy, HH:mm')}${subtitle ? `   ·   ${subtitle}` : ''}   ·   Confidential`;
  metaCell.font = { size: 9, color: { argb: 'FFD8C8B4' } };
  metaCell.alignment = { horizontal: 'left', indent: 4 };
  for (let r = 1; r <= 3; r++) {
    ws.getRow(r).height = r === 1 ? 24 : 16;
    for (let c = 1; c <= nCols; c++) {
      ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E1A12' } };
    }
  }

  // Header row (row 4).
  const headerRow = ws.getRow(4);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6F4E37' } };
    cell.alignment = { horizontal: numericCols[i] ? 'right' : 'left', vertical: 'middle', wrapText: true };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFFFFFFF' } } };
  });
  headerRow.height = 20;

  // Data rows.
  rows.forEach((r, ri) => {
    const row = ws.getRow(5 + ri);
    headers.forEach((_, ci) => {
      const cell = row.getCell(ci + 1);
      const raw = r[ci];
      if (numericCols[ci]) {
        const n = toNumber(raw);
        cell.value = n == null ? (raw ?? '') : n;
        if (n != null) cell.numFmt = '#,##0.00';
        cell.alignment = { horizontal: 'right' };
      } else {
        cell.value = raw ?? '';
      }
      if (ri % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6F0E9' } };
      }
    });
  });

  // Totals row.
  if (totals) {
    const tr = ws.getRow(5 + rows.length);
    totals.forEach((t, ci) => {
      const cell = tr.getCell(ci + 1);
      if (numericCols[ci]) {
        const n = toNumber(t);
        cell.value = n == null ? (t ?? '') : n;
        if (n != null) cell.numFmt = '#,##0.00';
        cell.alignment = { horizontal: 'right' };
      } else {
        cell.value = t ?? '';
      }
      cell.font = { bold: true, color: { argb: 'FF2E1A12' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC8873E' } };
    });
  }

  // Auto column widths from content.
  headers.forEach((h, i) => {
    let max = String(h).length;
    rows.forEach(r => { const v = r[i]; if (v != null) max = Math.max(max, String(v).length); });
    ws.getColumn(i + 1).width = Math.min(Math.max(max + 3, 12), 42);
  });

  const buf = await wb.xlsx.writeBuffer();
  triggerDownload(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${filename}.xlsx`);
}
