import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import { format, parseISO } from 'date-fns';

const BRAND_GREEN = '#6F4E37';
const BRAND_ORANGE = '#C8873E';
const fmt = (n, dp = 2) => typeof n === 'number' ? n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }) : '—';
const fmtDate = d => { try { return format(parseISO(d), 'd MMM yyyy'); } catch { return d || '—'; } };

function getPayments(purchase) {
  if (!purchase.payment_history) return [];
  try { return JSON.parse(purchase.payment_history) || []; } catch { return []; }
}

function getPaidTotal(purchase) {
  return getPayments(purchase).reduce((s, p) => s + (p.amount_etb || 0), 0);
}

// ─── Individual Purchase PDF ─────────────────────────────────────────────────
export function exportSinglePurchasePDF(purchase, payments, receipt) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 15;

  // Header band
  doc.setFillColor(111, 78, 55);
  doc.rect(0, 0, W, 28, 'F');
  doc.setFillColor(200, 135, 62);
  doc.rect(0, 28, W, 3, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('COFFEE ERP — ETHIOPIA', M, 11);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Purchase Receipt', M, 19);
  doc.setFontSize(8);
  doc.text('CONFIDENTIAL', W - M, 19, { align: 'right' });

  doc.setTextColor(50, 50, 50);

  let y = 40;
  const row = (label, value, yPos) => {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 100, 100);
    doc.text(label, M, yPos);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 30, 30);
    doc.text(String(value), M + 55, yPos);
    return yPos + 6;
  };

  y = row('Coffee Code:', purchase.coffee_code || '—', y);
  y = row('Date:', fmtDate(purchase.purchase_date), y);
  y = row('Supplier:', purchase.supplier_name || '—', y);
  y = row('Region:', purchase.region || '—', y);
  y = row('Coffee Type:', purchase.coffee_type || '—', y);
  y = row('Agent:', purchase.agent || '—', y);

  y += 4;
  doc.setDrawColor(200, 200, 200);
  doc.line(M, y, W - M, y); y += 6;

  y = row('Dispatch KG:', purchase.net_dispatch_weight_kg != null ? `${purchase.net_dispatch_weight_kg.toLocaleString()} KG` : '—', y);
  if (receipt?.warehouse_received_net_kg != null) {
    y = row('Warehouse KG:', `${receipt.warehouse_received_net_kg.toLocaleString()} KG`, y);
  }
  y = row('Unit Price:', purchase.unit_price_etb_per_feresula ? `${fmt(purchase.unit_price_etb_per_feresula, 0)} ETB per Feresula` : '—', y);
  y = row('Net Feresula:', purchase.net_feresula ? fmt(purchase.net_feresula) : '—', y);
  y = row('Grand Total:', `${fmt(purchase.grand_total_etb)} ETB`, y);

  y += 4;
  doc.line(M, y, W - M, y); y += 6;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(111, 78, 55);
  doc.text('PAYMENTS:', M, y); y += 5;

  doc.setTextColor(30, 30, 30);
  if (payments.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.text('No payments recorded', M, y); y += 6;
  } else {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('Date', M, y);
    doc.text('Bank', M + 30, y);
    doc.text('Type', M + 75, y);
    doc.text('Amount ETB', W - M, y, { align: 'right' });
    y += 4;
    doc.setFont('helvetica', 'normal');
    payments.forEach(p => {
      doc.text(fmtDate(p.payment_date), M, y);
      doc.text(p.bank_name || '—', M + 30, y);
      doc.text(p.payment_type || '—', M + 75, y);
      doc.text(fmt(p.amount_etb), W - M, y, { align: 'right' });
      y += 5;
    });
  }

  y += 4;
  doc.line(M, y, W - M, y); y += 6;

  const paidTotal = getPaidTotal(purchase);
  const balance = (purchase.grand_total_etb || 0) - paidTotal;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(balance > 0.01 ? 200 : 18, balance > 0.01 ? 30 : 100, balance > 0.01 ? 30 : 51);
  doc.text(`Balance: ${fmt(balance)} ETB`, M, y); y += 6;
  doc.text(`Status: ${purchase._status?.toUpperCase() || '—'}`, M, y);

  // Footer
  doc.setTextColor(150, 150, 150);
  doc.setFontSize(7);
  doc.text(`Generated: ${format(new Date(), 'd MMM yyyy HH:mm')} — Coffee ERP · CONFIDENTIAL`, W / 2, 285, { align: 'center' });

  doc.save(`CoffeeERP-PO-${purchase.coffee_code || purchase.id}.pdf`);
}

// ─── Full Report PDF ──────────────────────────────────────────────────────────
export function exportPORPDF({ filtered, summary, dateRange }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const W = 297, M = 10;

  const addHeader = (page) => {
    doc.setFillColor(111, 78, 55);
    doc.rect(0, 0, W, 22, 'F');
    doc.setFillColor(200, 135, 62);
    doc.rect(0, 22, W, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('COFFEE ERP — ETHIOPIA', M, 10);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Purchase Orders Report — CONFIDENTIAL', M, 17);
    doc.text(`Generated: ${format(new Date(), 'd MMM yyyy HH:mm')}`, W - M, 17, { align: 'right' });
    doc.text(`Page ${page}`, W - M, 10, { align: 'right' });
  };

  // Cover / summary page
  addHeader(1);
  doc.setTextColor(30, 30, 30);
  let y = 32;

  const rangeLabel = dateRange.from || dateRange.to
    ? `${fmtDate(dateRange.from) || 'Start'} → ${fmtDate(dateRange.to) || 'Today'}`
    : 'All Time';
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`Date Range: ${rangeLabel}`, M, y); y += 8;

  // Summary table
  const sumRows = [
    ['Total POs', summary.totalPOs, 'Total Value', `${fmt(summary.totalValue)} ETB`],
    ['Fully Paid', summary.paidCount, 'Paid Amount', `${fmt(summary.paidAmt)} ETB`],
    ['Partially Paid', summary.partialCount, 'Balance Remaining', `${fmt(summary.partialBalance)} ETB`],
    ['Unpaid', summary.unpaidCount, 'Unpaid Amount', `${fmt(summary.unpaidAmt)} ETB`],
    ['Awaiting Receipt', summary.awaitingCount, '', ''],
  ];
  doc.setFontSize(9);
  sumRows.forEach(r => {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 100, 100);
    doc.text(r[0], M, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 30, 30);
    doc.text(String(r[1]), M + 45, y);
    if (r[2]) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(100, 100, 100);
      doc.text(r[2], M + 80, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 30, 30);
      doc.text(r[3], M + 135, y);
    }
    y += 6;
  });

  // Data table
  const GROUPS_ORDER = ['Awaiting Receipt', 'Unpaid', 'Partial', 'Paid'];
  const COLS = ['#', 'Coffee Code', 'Date', 'Supplier', 'Region', 'Coffee Type', 'Dispatch KG', 'WH KG', 'Grand Total ETB', 'Paid ETB', 'Balance ETB', 'Status', 'Days'];
  const COL_W = [8, 38, 22, 38, 18, 32, 20, 20, 28, 26, 26, 22, 12];

  let pageNum = 2;

  GROUPS_ORDER.forEach(status => {
    const rows = filtered.filter(r => r._status === status);
    if (rows.length === 0) return;

    doc.addPage();
    addHeader(pageNum++);
    let y = 30;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(111, 78, 55);
    doc.text(`${status} (${rows.length})`, M, y); y += 5;

    // Table header
    doc.setFillColor(245, 245, 245);
    doc.rect(M, y, W - 2 * M, 6, 'F');
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(7);
    let x = M;
    COLS.forEach((c, i) => { doc.text(c, x + 1, y + 4.2); x += COL_W[i]; });
    y += 6;

    rows.forEach((row, idx) => {
      if (y > 195) {
        doc.addPage();
        addHeader(pageNum++);
        y = 30;
      }
      const even = idx % 2 === 0;
      if (even) { doc.setFillColor(252, 252, 252); doc.rect(M, y, W - 2 * M, 5.5, 'F'); }
      doc.setTextColor(30, 30, 30);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      const cells = [
        String(idx + 1),
        row.coffee_code || '—',
        fmtDate(row.purchase_date),
        (row.supplier_name || '—').slice(0, 18),
        row.region || '—',
        (row.coffee_type || '—').slice(0, 18),
        row.net_dispatch_weight_kg?.toLocaleString() || '—',
        row._receipt?.warehouse_received_net_kg?.toLocaleString() || '—',
        row.grand_total_etb ? fmt(row.grand_total_etb) : '—',
        fmt(row._paid),
        fmt(row._balance),
        row._status || '—',
        String(row._days),
      ];
      x = M;
      cells.forEach((c, i) => { doc.text(c, x + 1, y + 3.8); x += COL_W[i]; });
      y += 5.5;
    });
  });

  doc.save(`CoffeeERP-PO-Report-${format(new Date(), 'd-MMM-yyyy')}.pdf`);
}

// ─── Excel Export ─────────────────────────────────────────────────────────────
export function exportPORExcel({ filtered, summary, dateRange }) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Summary
  const summaryData = [
    ['Coffee ERP — Purchase Orders Report'],
    [`Generated: ${format(new Date(), 'd MMM yyyy HH:mm')}`],
    [],
    ['Metric', 'Count/Value'],
    ['Total POs', summary.totalPOs],
    ['Total Value (ETB)', summary.totalValue],
    ['Fully Paid Count', summary.paidCount],
    ['Paid Amount (ETB)', summary.paidAmt],
    ['Partially Paid Count', summary.partialCount],
    ['Partial Balance Remaining (ETB)', summary.partialBalance],
    ['Unpaid Count', summary.unpaidCount],
    ['Unpaid Amount (ETB)', summary.unpaidAmt],
    ['Awaiting Receipt Count', summary.awaitingCount],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), 'Summary');

  const HEADERS = ['Coffee Code', 'Date', 'Supplier', 'Agent', 'Region', 'Coffee Type', 'Dispatch KG', 'Warehouse KG', 'Grand Total ETB', 'Total Paid ETB', 'Balance ETB', 'Status', 'Days Since Purchase'];
  const toRow = r => [
    r.coffee_code || '',
    r.purchase_date || '',
    r.supplier_name || '',
    r.agent || '',
    r.region || '',
    r.coffee_type || '',
    r.net_dispatch_weight_kg || 0,
    r._receipt?.warehouse_received_net_kg || 0,
    r.grand_total_etb || 0,
    r._paid || 0,
    r._balance || 0,
    r._status || '',
    r._days || 0,
  ];

  // Sheet 2: All
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADERS, ...filtered.map(toRow)]), 'All Purchases');
  // Sheet 3: Unpaid
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADERS, ...filtered.filter(r => r._status === 'Unpaid').map(toRow)]), 'Unpaid');
  // Sheet 4: Partial
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADERS, ...filtered.filter(r => r._status === 'Partial').map(toRow)]), 'Partial');
  // Sheet 5: Awaiting Receipt
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADERS, ...filtered.filter(r => r._status === 'Awaiting Receipt').map(toRow)]), 'Awaiting Receipt');

  XLSX.writeFile(wb, `CoffeeERP-PO-Report-${format(new Date(), 'd-MMM-yyyy')}.xlsx`);
}