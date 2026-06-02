/**
 * KKGT Import Export — unified branded report engine.
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
import { LOGO_PNG_DATAURL, LOGO_ASPECT } from '@/lib/brandLogo';

// Brand palette — KKGT Import Export (green + orange from the logo)
const COFFEE = '#126333';      // brand green (header band)
const COFFEE_RGB = [18, 99, 51];
const AMBER = '#EB6C25';       // brand orange (accent / footer)
const AMBER_RGB = [235, 108, 37];
const ROW_ALT = '#EAF1EC';     // light green stripe
const ROW_ALT_RGB = [234, 241, 236];

// Decide which columns are numeric (right-align + number format) by sampling rows.
// A value is numeric only if it's a clean number — NOT a code like "B-023"
// (letters present) and not a date. Accepts thousands separators / % / currency.
function isNumericValue(v) {
  if (typeof v === 'number') return Number.isFinite(v);
  if (v == null) return false;
  const s = String(v).trim();
  if (!s) return false;
  if (/[a-z]/i.test(s)) return false;       // has letters → it's a code/label, not a number
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return false; // ISO date
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(s)) return false; // dd/mm/yyyy date
  const cleaned = s.replace(/[^0-9.\-]/g, '');
  return cleaned !== '' && cleaned !== '-' && Number.isFinite(Number(cleaned));
}

function toNumber(v) {
  if (typeof v === 'number') return v;
  if (!isNumericValue(v)) return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function detectNumericCols(headers, rows) {
  return headers.map((_, c) => {
    let nums = 0, total = 0;
    for (const r of rows) {
      const v = r[c];
      if (v === '' || v == null) continue;
      total++;
      if (isNumericValue(v)) nums++;
    }
    return total > 0 && nums / total >= 0.7;
  });
}

// Among the numeric values in a column, are they ALL whole numbers? (→ no .00)
function detectIntegerCols(headers, rows, numericCols) {
  return headers.map((_, c) => {
    if (!numericCols[c]) return false;
    for (const r of rows) {
      const n = toNumber(r[c]);
      if (n != null && !Number.isInteger(n)) return false;
    }
    return true;
  });
}

// Index/serial columns (#, No, S/N) — numeric but must NOT be summed in totals.
function isIndexHeader(h) {
  return /^(#|no\.?|s\/?n|sr\.?(\s*no)?|序)$/i.test(String(h).trim());
}

// Columns that are numeric but NOT meaningful to sum (rates, unit prices,
// percentages, averages, moisture, grade). Summing these is nonsense.
function isNonSummableHeader(h) {
  return /\b(unit\s*price|price|rate|%|percent|per\b|comm(ission)?\s*%?|avg|average|moisture|grade|year|month)\b/i.test(String(h));
}

// Build a totals row that SUMs every summable numeric, non-index column.
// Returns { values: number|null[], label } where label cell holds "TOTAL".
function computeAutoTotals(headers, rows, numericCols) {
  const sums = headers.map((h, c) => {
    if (!numericCols[c] || isIndexHeader(h) || isNonSummableHeader(h)) return null;
    let s = 0, any = false;
    for (const r of rows) { const n = toNumber(r[c]); if (n != null) { s += n; any = true; } }
    return any ? s : null;
  });
  // First column that isn't a summed number gets the "TOTAL" label.
  let labelIdx = sums.findIndex((v, c) => v == null && !numericCols[c]);
  if (labelIdx === -1) labelIdx = 0;
  return { sums, labelIdx };
}

const fmtNum = (n, integer) =>
  n == null ? '' : Number(n).toLocaleString('en-US', integer
    ? { maximumFractionDigits: 0 }
    : { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
export function exportReportPDF({ title, subtitle, headers, rows, totals, autoTotals, filename = 'report' }) {
  const doc = new jsPDF({ orientation: headers.length > 6 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const numericCols = detectNumericCols(headers, rows);
  const integerCols = detectIntegerCols(headers, rows, numericCols);
  const generated = format(new Date(), 'dd MMM yyyy, HH:mm');

  // Format the displayed body: numeric cells get thousands separators (and no
  // .00 for integer columns); everything else is shown as-is (codes intact).
  const bodyDisplay = rows.map(r => r.map((c, ci) => {
    if (c == null || c === '') return '';
    if (numericCols[ci]) { const n = toNumber(c); return n == null ? String(c) : fmtNum(n, integerCols[ci]); }
    return String(c);
  }));

  // Auto-compute a totals row across all numeric, non-index columns.
  let footRow;
  if (autoTotals) {
    const { sums, labelIdx } = computeAutoTotals(headers, rows, numericCols);
    footRow = headers.map((_, ci) => {
      if (ci === labelIdx) return 'TOTAL';
      return sums[ci] == null ? '' : fmtNum(sums[ci], integerCols[ci]);
    });
  } else if (totals) {
    footRow = totals.map((c, ci) => {
      if (c == null || c === '') return '';
      if (numericCols[ci]) { const n = toNumber(c); return n == null ? String(c) : fmtNum(n, integerCols[ci]); }
      return String(c);
    });
  }

  const drawHeader = () => {
    // Brand green band
    doc.setFillColor(...COFFEE_RGB);
    doc.rect(0, 0, pageW, 64, 'F');
    // Logo on a white chip (logo keeps its green letters, so it needs white behind it)
    const logoH = 30, logoW = logoH * LOGO_ASPECT;
    const chipX = 20, chipY = 12, chipPad = 7;
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(chipX, chipY, logoW + chipPad * 2, logoH + chipPad * 2, 4, 4, 'F');
    try { doc.addImage(LOGO_PNG_DATAURL, 'PNG', chipX + chipPad, chipY + chipPad, logoW, logoH); } catch { /* logo optional */ }
    const textX = chipX + logoW + chipPad * 2 + 14;
    // Brand + title
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('KKGT Import Export', textX, 30);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(title || 'Report', textX, 48);
    // Meta (right)
    doc.setFontSize(8);
    doc.setTextColor(205, 228, 213);
    doc.text(`Generated ${generated}`, pageW - 28, 26, { align: 'right' });
    if (subtitle) doc.text(String(subtitle), pageW - 28, 40, { align: 'right' });
    doc.text('Confidential', pageW - 28, 54, { align: 'right' });
  };

  const columnStyles = {};
  numericCols.forEach((isNum, i) => { if (isNum) columnStyles[i] = { halign: 'right' }; });

  autoTable(doc, {
    head: [headers],
    body: bodyDisplay,
    foot: footRow ? [footRow] : undefined,
    startY: 78,
    margin: { top: 78, left: 28, right: 28, bottom: 36 },
    styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak', valign: 'middle' },
    headStyles: { fillColor: COFFEE_RGB, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'left' },
    footStyles: { fillColor: AMBER_RGB, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: ROW_ALT_RGB },
    columnStyles,
    didDrawPage: () => {
      drawHeader();
      // Footer
      const pageH = doc.internal.pageSize.getHeight();
      const page = doc.internal.getNumberOfPages();
      doc.setFontSize(7);
      doc.setTextColor(120, 120, 120);
      doc.text('KKGT Import Export · Coffee Supply Chain', 28, pageH - 14);
      doc.text(`Page ${page}`, pageW - 28, pageH - 14, { align: 'right' });
    },
  });

  doc.save(`${filename}.pdf`);
}

// ───────────────────────────────────────────────────────────────────────────
// Excel
// ───────────────────────────────────────────────────────────────────────────
export async function exportReportXLSX({ title, subtitle, headers, rows, totals, autoTotals, filename = 'report' }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'KKGT Import Export';
  wb.created = new Date();
  const ws = wb.addWorksheet((title || 'Report').slice(0, 28), {
    views: [{ state: 'frozen', ySplit: 4 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const nCols = headers.length;
  const numericCols = detectNumericCols(headers, rows);
  const integerCols = detectIntegerCols(headers, rows, numericCols);
  const numFmtFor = (ci) => (integerCols[ci] ? '#,##0' : '#,##0.00');
  const firstDataRow = 5;
  const lastDataRow = 4 + rows.length;

  // Embed logo (top-left), keeping the wide aspect ratio.
  try {
    const imgId = wb.addImage({ base64: LOGO_PNG_DATAURL, extension: 'png' });
    ws.addImage(imgId, { tl: { col: 0, row: 0 }, ext: { width: Math.round(40 * LOGO_ASPECT), height: 40 } });
  } catch { /* logo optional */ }

  // Title band (rows 1-3), merged across all columns.
  const lastColLetter = ws.getColumn(nCols).letter;
  ws.mergeCells(`A1:${lastColLetter}1`);
  ws.mergeCells(`A2:${lastColLetter}2`);
  ws.mergeCells(`A3:${lastColLetter}3`);
  const titleCell = ws.getCell('A1');
  titleCell.value = 'KKGT Import Export';
  titleCell.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 4 };
  const subCell = ws.getCell('A2');
  subCell.value = title || 'Report';
  subCell.font = { bold: true, size: 12, color: { argb: 'FFF2C98A' } };
  subCell.alignment = { horizontal: 'left', indent: 4 };
  const metaCell = ws.getCell('A3');
  metaCell.value = `Generated ${format(new Date(), 'dd MMM yyyy, HH:mm')}${subtitle ? `   ·   ${subtitle}` : ''}   ·   Confidential`;
  metaCell.font = { size: 9, color: { argb: 'FFCDE4D5' } };
  metaCell.alignment = { horizontal: 'left', indent: 4 };
  for (let r = 1; r <= 3; r++) {
    ws.getRow(r).height = r === 1 ? 24 : 16;
    for (let c = 1; c <= nCols; c++) {
      ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF126333' } };
    }
  }

  // Header row (row 4).
  const headerRow = ws.getRow(4);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF126333' } };
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
        cell.value = n == null ? (raw ?? '') : n;   // real number → formulas can sum it
        if (n != null) cell.numFmt = numFmtFor(ci);
        cell.alignment = { horizontal: 'right' };
      } else {
        cell.value = raw ?? '';                      // codes like "B-023" stay text
      }
      if (ri % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF1EC' } };
      }
    });
  });

  // Totals row — auto-sum every numeric (non-index) column with a real
  // =SUM() formula, so the spreadsheet recalculates if values are edited.
  if ((autoTotals || totals) && rows.length > 0) {
    const { sums, labelIdx } = computeAutoTotals(headers, rows, numericCols);
    const tr = ws.getRow(5 + rows.length);
    headers.forEach((_, ci) => {
      const cell = tr.getCell(ci + 1);
      const colLetter = ws.getColumn(ci + 1).letter;
      if (sums[ci] != null) {
        cell.value = { formula: `SUM(${colLetter}${firstDataRow}:${colLetter}${lastDataRow})`, result: sums[ci] };
        cell.numFmt = numFmtFor(ci);
        cell.alignment = { horizontal: 'right' };
      } else if (ci === labelIdx) {
        cell.value = 'TOTAL';
      }
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEB6C25' } };
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

// ───────────────────────────────────────────────────────────────────────────
// Statement of Account (professional supplier/agent statement)
// ───────────────────────────────────────────────────────────────────────────
const money = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Professional Statement of Account PDF.
 * @param {object} party    — { name, region, agent, phone }
 * @param {Array}  lots     — purchase records: { coffee_code, purchase_date, grand_total_etb }
 * @param {Array}  payments — flat payments: { payment_date, amount_etb, bank_name, cpv_reference|reference_no, coffee_code }
 * @param {object} opts     — { period, filename }
 */
export function exportStatementPDF(party, lots = [], payments = [], opts = {}) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' }); // portrait
  const pageW = doc.internal.pageSize.getWidth();
  const today = format(new Date(), 'dd MMM yyyy');

  // Build a chronological ledger: charges (purchases) increase the balance,
  // payments decrease it. Running balance = what we still owe the supplier.
  const entries = [];
  lots.forEach(l => {
    entries.push({
      date: l.purchase_date || l.created_date || '',
      ref: l.coffee_code || '',
      desc: 'Coffee purchase',
      charge: Number(l.grand_total_etb) || 0,
      payment: 0,
    });
  });
  payments.forEach(p => {
    entries.push({
      date: p.payment_date || '',
      ref: p.cpv_reference || p.reference_no || p.coffee_code || '',
      desc: `Payment${p.bank_name ? ' — ' + p.bank_name : ''}`,
      charge: 0,
      payment: Number(p.amount_etb) || 0,
    });
  });
  entries.sort((a, b) => String(a.date).localeCompare(String(b.date)));

  let running = 0;
  const body = entries.map(e => {
    running += e.charge - e.payment;
    return [
      e.date ? format(new Date(e.date), 'dd/MM/yyyy') : '—',
      e.ref || '—',
      e.desc,
      e.charge ? money(e.charge) : '',
      e.payment ? money(e.payment) : '',
      money(running),
    ];
  });

  const totalCharges = entries.reduce((s, e) => s + e.charge, 0);
  const totalPayments = entries.reduce((s, e) => s + e.payment, 0);
  const balance = totalCharges - totalPayments;

  // ── Header band ──
  doc.setFillColor(...COFFEE_RGB);
  doc.rect(0, 0, pageW, 70, 'F');
  const sLogoH = 32, sLogoW = sLogoH * LOGO_ASPECT, sPad = 7;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(28, 14, sLogoW + sPad * 2, sLogoH + sPad * 2, 4, 4, 'F');
  try { doc.addImage(LOGO_PNG_DATAURL, 'PNG', 28 + sPad, 14 + sPad, sLogoW, sLogoH); } catch { /* optional */ }
  const sTextX = 28 + sLogoW + sPad * 2 + 14;
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(17);
  doc.text('KKGT Import Export', sTextX, 32);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.setTextColor(205, 228, 213);
  doc.text('Coffee Supply Chain', sTextX, 47);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text('STATEMENT OF ACCOUNT', pageW - 32, 34, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  doc.setTextColor(205, 228, 213);
  doc.text(`Statement date: ${today}`, pageW - 32, 50, { align: 'right' });
  if (opts.period) doc.text(`Period: ${opts.period}`, pageW - 32, 62, { align: 'right' });

  // ── Party block ──
  let y = 92;
  doc.setTextColor(80, 80, 80); doc.setFontSize(8);
  doc.text('STATEMENT FOR', 32, y);
  doc.setTextColor(20, 20, 20); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  doc.text(party.name || '—', 32, y + 16);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90, 90, 90);
  const meta = [party.region && `Region: ${party.region}`, party.agent && `Agent: ${party.agent}`, party.phone && `Phone: ${party.phone}`]
    .filter(Boolean).join('    ');
  if (meta) doc.text(meta, 32, y + 30);

  // ── Summary boxes ──
  y += 48;
  const boxW = (pageW - 64 - 24) / 3;
  const boxes = [
    { label: 'TOTAL PURCHASES', value: money(totalCharges), fill: ROW_ALT_RGB, text: COFFEE_RGB },
    { label: 'TOTAL PAID', value: money(totalPayments), fill: ROW_ALT_RGB, text: COFFEE_RGB },
    { label: 'BALANCE DUE (ETB)', value: money(balance), fill: AMBER_RGB, text: [255, 255, 255] },
  ];
  boxes.forEach((b, i) => {
    const x = 32 + i * (boxW + 12);
    doc.setFillColor(...b.fill); doc.roundedRect(x, y, boxW, 46, 4, 4, 'F');
    doc.setTextColor(110, 90, 70); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
    doc.text(b.label, x + 10, y + 16);
    doc.setTextColor(...b.text); doc.setFontSize(13); doc.setFont('helvetica', 'bold');
    doc.text(b.value, x + 10, y + 35);
  });

  // ── Ledger table ──
  autoTable(doc, {
    startY: y + 60,
    head: [['Date', 'Reference', 'Description', 'Charges (ETB)', 'Payments (ETB)', 'Balance (ETB)']],
    body,
    foot: [['', '', 'CLOSING BALANCE', money(totalCharges), money(totalPayments), money(balance)]],
    margin: { left: 32, right: 32, bottom: 50 },
    styles: { fontSize: 8, cellPadding: 4, valign: 'middle' },
    headStyles: { fillColor: COFFEE_RGB, textColor: [255, 255, 255], fontStyle: 'bold' },
    footStyles: { fillColor: AMBER_RGB, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: ROW_ALT_RGB },
    columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
    didDrawPage: () => {
      const pageH = doc.internal.pageSize.getHeight();
      doc.setFontSize(7); doc.setTextColor(120, 120, 120);
      doc.text('KKGT Import Export · Statement of Account · Confidential', 32, pageH - 28);
      doc.text(`Generated ${today}`, pageW - 32, pageH - 28, { align: 'right' });
      // Signature line
      doc.setDrawColor(180, 180, 180);
      doc.line(pageW - 200, pageH - 16, pageW - 32, pageH - 16);
      doc.text('Authorized signature', pageW - 116, pageH - 6, { align: 'center' });
    },
  });

  const safe = (party.name || 'supplier').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  doc.save(`statement-${safe}-${format(new Date(), 'yyyyMMdd')}.pdf`);
}
