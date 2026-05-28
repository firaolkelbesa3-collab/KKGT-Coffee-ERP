import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/shared/PageHeader';
import RoleGuard from '@/components/RoleGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, FileSpreadsheet } from 'lucide-react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import { parsePayments } from '@/components/purchases/PaymentHistoryPanel';
import { calcTotalPaid, calcBalance, calcPaymentStatus } from '@/lib/paymentUtils';
import PurchaseDetailPanel from '@/components/reports/PurchaseDetailPanel';
import DateRangePicker from '@/components/shared/DateRangePicker';
import FilterPanel, { FilterButton } from '@/components/shared/FilterPanel';
import TablePagination from '@/components/shared/TablePagination';
import { base44 } from '@/api/supabaseClient';

function fmt(n, d = 2) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function pct(n) {
  if (n == null || isNaN(n)) return '—';
  return `${Number(n).toFixed(1)}%`;
}
function fmtDate(str) {
  if (!str) return '—';
  try { return format(new Date(str), 'dd/MM/yyyy'); } catch { return str; }
}

// ── Professional XLSX export (all reports) ────────────────────────────────────
function exportXLSX(filename, reportTitle, headers, rows, totalsRow, dateRange) {
  const wb = XLSX.utils.book_new();

  // Title rows
  const titleRows = [
    ['KKGT IMPORT & EXPORT'],
    [reportTitle],
    [`Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')}${dateRange ? `  |  Period: ${dateRange}` : ''}`],
    [], // blank
    headers,
    ...rows,
  ];
  if (totalsRow) titleRows.push(totalsRow);

  const ws = XLSX.utils.aoa_to_sheet(titleRows);

  const numRows = titleRows.length;
  const numCols = headers.length;

  // Auto-width: measure max char length per column
  const colWidths = headers.map((h, ci) => {
    let max = String(h).length;
    rows.forEach(row => { const v = row[ci]; if (v != null) max = Math.max(max, String(v).length); });
    if (totalsRow) { const v = totalsRow[ci]; if (v != null) max = Math.max(max, String(v).length); }
    return { wch: Math.max(max + 4, 12) };
  });
  ws['!cols'] = colWidths;

  // Freeze row 6 (header row)
  ws['!freeze'] = { xSplit: 0, ySplit: 5, topLeftCell: 'A6', activePane: 'bottomLeft' };

  // Page setup
  ws['!pageSetup'] = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

  // Style helpers via cell format
  const headerRowIdx = 4; // 0-indexed (row 5 = index 4)
  const totalsRowIdx = totalsRow ? titleRows.length - 1 : null;

  for (let r = 0; r < numRows; r++) {
    for (let c = 0; c < numCols; c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (!ws[ref]) ws[ref] = { t: 's', v: '' };

      if (r === headerRowIdx) {
        // Green header
        ws[ref].s = {
          fill: { fgColor: { rgb: '126433' } },
          font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
          border: { bottom: { style: 'thin', color: { rgb: 'FFFFFF' } } },
        };
      } else if (totalsRowIdx !== null && r === totalsRowIdx) {
        // Orange totals row
        ws[ref].s = {
          fill: { fgColor: { rgb: 'F06721' } },
          font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
          alignment: { horizontal: c > 1 ? 'right' : 'left' },
        };
      } else if (r > headerRowIdx && r < (totalsRowIdx ?? numRows)) {
        // Alternating rows
        const isAlt = (r - headerRowIdx - 1) % 2 === 1;
        ws[ref].s = {
          fill: { fgColor: { rgb: isAlt ? 'F0F7F0' : 'FFFFFF' } },
          alignment: { horizontal: c > 1 && typeof ws[ref].v === 'number' ? 'right' : 'left' },
        };
        // Number format for numeric cells
        if (typeof ws[ref].v === 'number') ws[ref].z = '#,##0.00';
      } else if (r < headerRowIdx) {
        // Title section
        ws[ref].s = {
          font: r === 0 ? { bold: true, sz: 14, color: { rgb: '126433' } } : r === 1 ? { bold: true, sz: 11 } : { sz: 9, color: { rgb: '666666' } },
        };
      }
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, reportTitle.slice(0, 31));
  XLSX.writeFile(wb, filename + '.xlsx');
}


// ── PDF export — Premium professional branded format ──────────────────────────
function exportPDF(title, headers, rows, totalsRow) {
  const doc = new jsPDF({ orientation: 'landscape' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const genDate = format(new Date(), 'dd/MM/yyyy HH:mm');
  const season = '2026';

  // ── HEADER BLOCK ────────────────────────────────────────────────────────────
  // Dark green background (full width)
  doc.setFillColor(18, 100, 51);
  doc.rect(0, 0, pageWidth, 22, 'F');

  // Company name (Georgia serif feel via bold + large)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  doc.text('KKGT', margin, 14);

  // Subtext
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(180, 220, 190);
  doc.text('IMPORT & EXPORT  ·  ETHIOPIA', margin + 26, 14);

  // Orange band below green header
  doc.setFillColor(240, 103, 33);
  doc.rect(0, 22, pageWidth, 14, 'F');

  // Report name in white bold on orange band
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(title.toUpperCase(), margin, 30);

  // Season / date / confidential (right-aligned on orange band)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(255, 230, 210);
  const metaText = `Season ${season}  ·  Generated: ${genDate}  ·  CONFIDENTIAL`;
  doc.text(metaText, pageWidth - margin, 30, { align: 'right' });

  // ── TABLE ───────────────────────────────────────────────────────────────────
  const colCount = headers.length;
  const colWidth = (pageWidth - margin * 2) / colCount;
  let y = 42;
  const rowH = 6.5;
  let pageNum = 1;
  let totalPages = 1; // approximate; we'll use a 2-pass approach note — jsPDF doesn't support true 2-pass, so we'll put "Page N" only
  const pageNums = []; // track page starts for footer retroactive edit not possible easily; use simple approach

  const addFooter = (pn) => {
    // Gray footer band
    doc.setFillColor(245, 245, 245);
    doc.rect(0, pageHeight - 10, pageWidth, 10, 'F');
    // Green top border on footer
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
    // Green header row
    doc.setFillColor(18, 100, 51);
    doc.rect(margin, y, pageWidth - margin * 2, rowH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(255, 255, 255);
    headers.forEach((h, i) => {
      const isNumericHeader = i > 1;
      const x = isNumericHeader
        ? margin + (i + 1) * colWidth - 2
        : margin + i * colWidth + 1;
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
      // Totals: solid green background
      doc.setFillColor(18, 100, 51);
      doc.rect(margin, y, pageWidth - margin * 2, rowH, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(255, 255, 255);
    } else if (ri % 2 === 0) {
      // Even: very light green tint
      doc.setFillColor(248, 253, 248);
      doc.rect(margin, y, pageWidth - margin * 2, rowH, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(30, 30, 30);
    } else {
      // Odd: white
      doc.setFillColor(255, 255, 255);
      doc.rect(margin, y, pageWidth - margin * 2, rowH, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(30, 30, 30);
    }

    row.forEach((cell, i) => {
      const cellStr = String(cell ?? '');
      const isNumericCol = i > 1;
      const x = isNumericCol
        ? margin + (i + 1) * colWidth - 2
        : margin + i * colWidth + 1.5;

      // Status column special coloring (last column often contains status)
      if (!isTotals && (cellStr === 'Paid' || cellStr === 'Paid ✓')) {
        doc.setTextColor(18, 100, 51);
        doc.setFont('helvetica', 'bold');
      } else if (!isTotals && cellStr === 'Partial') {
        doc.setTextColor(180, 100, 0);
        doc.setFont('helvetica', 'bold');
      } else if (!isTotals && cellStr === 'Unpaid') {
        doc.setTextColor(200, 40, 40);
        doc.setFont('helvetica', 'bold');
      } else if (isTotals) {
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
      } else {
        doc.setTextColor(30, 30, 30);
        doc.setFont('helvetica', 'normal');
      }

      doc.text(cellStr, x, y + 4.5, isNumericCol ? { align: 'right' } : {});
    });

    // Thin row border
    doc.setDrawColor(232, 232, 232);
    doc.setLineWidth(0.15);
    doc.line(margin, y + rowH, margin + (pageWidth - margin * 2), y + rowH);

    y += rowH;
  });

  addFooter(pageNum);
  doc.save(title.replace(/\s+/g, '_') + '.pdf');
}

// ── Filters Bar (simple date+supplier — used by Warehouse Stock, Supplier Balance, Processing) ───
function FiltersBar({ fromDate, setFromDate, toDate, setToDate, supplier, setSupplier, suppliers }) {
  return (
    <div className="flex flex-wrap gap-3 items-center mb-5">
      <DateRangePicker
        from={fromDate}
        to={toDate}
        onChange={({ from, to }) => { setFromDate(from); setToDate(to); }}
      />
      {suppliers && (
        <Select value={supplier} onValueChange={setSupplier}>
          <SelectTrigger className="h-9 w-44"><SelectValue placeholder="All suppliers" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Suppliers</SelectItem>
            {[...new Set(suppliers.map(s => s.supplier_name))].map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      {(fromDate || toDate || (supplier && supplier !== 'all')) && (
        <Button variant="ghost" size="sm" onClick={() => { setFromDate(''); setToDate(''); if (setSupplier) setSupplier('all'); }}>
          Clear
        </Button>
      )}
    </div>
  );
}

function inRange(dateStr, from, to) {
  if (!dateStr) return true;
  const d = dateStr.slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

// ── Report: Purchase Summary ──────────────────────────────────────────────────
const PURCHASE_REGIONS = ['Wollega', 'Guji', 'Yirgacheffe', 'Sidama', 'Jimma', 'Harrar', 'Kaffa', 'Bench', 'Gedeo', 'Other'];
const PURCHASE_STATUSES = [
  { value: 'Paid ✓', label: 'Paid' },
  { value: 'Partial', label: 'Partial' },
  { value: 'Unpaid', label: 'Unpaid' },
];

function PurchaseSummaryReport({ purchases, suppliers, receipts }) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState({
    date: { from: '', to: '' },
    coffeeCode: '',
    supplier: 'all',
    region: 'all',
    status: 'all',
  });
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const fromDate = filters.date?.from || '';
  const toDate = filters.date?.to || '';

  const activeCount = [
    fromDate || toDate,
    filters.coffeeCode,
    filters.supplier !== 'all',
    filters.region !== 'all',
    filters.status !== 'all',
  ].filter(Boolean).length;

  useMemo(() => { setPage(1); }, [filters]);

  const receiptByCoffeeCode = useMemo(() => {
    const map = {};
    receipts.forEach(r => { if (r.coffee_code) map[r.coffee_code] = r; });
    return map;
  }, [receipts]);

  const filtered = useMemo(() => {
    const rows = purchases.filter(p => {
      if (!inRange(p.purchase_date, fromDate, toDate)) return false;
      if (filters.supplier !== 'all' && p.supplier_name !== filters.supplier) return false;
      if (filters.region !== 'all' && p.region !== filters.region) return false;
      if (filters.coffeeCode && !p.coffee_code?.toLowerCase().includes(filters.coffeeCode.toLowerCase())) return false;
      return true;
    });
    return rows.sort((a, b) => (a.coffee_code || '').localeCompare(b.coffee_code || ''));
  }, [purchases, filters]);

  // Compute per-row payment data from Payment History only (never from old 1st/2nd payment fields)
  const rowData = useMemo(() => filtered.map(p => {
    const totalPaid = calcTotalPaid(p);
    const grandTotal = p.grand_total_etb ?? null;
    const balance = calcBalance(grandTotal, totalPaid);
    const status = grandTotal == null ? 'Pending' : (calcPaymentStatus(grandTotal, totalPaid) ?? 'Unpaid');
    const displayStatus = status === 'Paid' ? 'Paid ✓' : status;
    return { ...p, totalPaid, balance, status: displayStatus };
  }), [filtered]);

  const totals = useMemo(() => ({
    net_dispatch_weight_kg: rowData.reduce((s, p) => s + (p.net_dispatch_weight_kg || 0), 0),
    grand_total_etb: rowData.reduce((s, p) => s + (p.grand_total_etb ?? 0), 0),
    totalPaid: rowData.reduce((s, p) => s + p.totalPaid, 0),
    balance: rowData.reduce((s, p) => s + (p.balance ?? 0), 0),
  }), [rowData]);

  const colDefs = [
    { label: '#',              width: 32,  align: 'left'  },
    { label: 'Coffee Code',    width: 190, align: 'left'  },
    { label: 'Date',           width: 90,  align: 'left'  },
    { label: 'Supplier',       width: 120, align: 'left'  },
    { label: 'Region',         width: 90,  align: 'left'  },
    { label: 'Net KG',         width: 90,  align: 'right' },
    { label: 'Unit Price',     width: 90,  align: 'right' },
    { label: 'Commission%',    width: 80,  align: 'right' },
    { label: 'Grand Total ETB',width: 120, align: 'right' },
    { label: 'Total Paid ETB', width: 120, align: 'right' },
    { label: 'Balance ETB',    width: 110, align: 'right' },
    { label: 'Status',         width: 90,  align: 'left'  },
  ];

  const exportHeaders = ['#', 'Coffee Code', 'Date', 'Supplier', 'Region', 'Net KG', 'Unit Price', 'Commission%', 'Grand Total ETB', 'Total Paid ETB', 'Balance ETB', 'Status'];
  const exportRows = rowData.map((p, i) => [
    i+1, p.coffee_code||'—', fmtDate(p.purchase_date), p.supplier_name, p.region||'—',
    fmt(p.net_dispatch_weight_kg), fmt(p.unit_price_etb_per_feresula),
    p.commission_percent!=null?`${p.commission_percent}%`:'—',
    p.grand_total_etb!=null ? fmt(p.grand_total_etb) : 'Pending',
    fmt(p.totalPaid),
    p.balance!=null ? fmt(p.balance) : 'Pending',
    p.status,
  ]);
  const totalsRow = ['', '', '', 'TOTAL', '', fmt(totals.net_dispatch_weight_kg), '', '', fmt(totals.grand_total_etb), fmt(totals.totalPaid), fmt(totals.balance), ''];

  const statusStyle = (status) => {
    if (status === 'Paid ✓') return 'text-green-700 font-bold';
    if (status === 'Partial') return 'text-amber-600 font-bold';
    if (status === 'Unpaid') return 'text-destructive font-bold';
    if (status?.startsWith('Overpaid')) return 'text-blue-600 font-bold';
    return 'text-muted-foreground';
  };

  // status filter applied post-calculation
  const rowDataFiltered = useMemo(() => {
    if (!filters.status || filters.status === 'all') return rowData;
    return rowData.filter(r => {
      if (filters.status === 'Paid ✓') return r.status === 'Paid ✓';
      return r.status === filters.status;
    });
  }, [rowData, filters.status]);

  const supplierOptions = useMemo(() => [...new Set(suppliers.map(s => s.supplier_name))].map(n => ({ value: n, label: n })), [suppliers]);
  const regionOptions = PURCHASE_REGIONS.map(r => ({ value: r, label: r }));

  return (
    <div>
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <DateRangePicker from={fromDate} to={toDate} onChange={v => setFilters(f => ({ ...f, date: v }))} />
        <FilterButton onClick={() => setFilterOpen(true)} activeCount={activeCount} />
      </div>
      <FilterPanel
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        fields={[
          { key: 'date', label: 'Date', type: 'date' },
          { key: 'coffeeCode', label: 'Coffee Code', type: 'text', placeholder: 'e.g. KKGT/Wollega/001' },
          { key: 'supplier', label: 'Supplier', type: 'select', options: supplierOptions, placeholder: 'All Suppliers' },
          { key: 'region', label: 'Region', type: 'select', options: regionOptions, placeholder: 'All Regions' },
          { key: 'status', label: 'Status', type: 'select', options: PURCHASE_STATUSES, placeholder: 'All Statuses' },
        ]}
        values={filters}
        onApply={v => { setFilters(v); setPage(1); }}
        onReset={() => { setFilters({ date: { from: '', to: '' }, coffeeCode: '', supplier: 'all', region: 'all', status: 'all' }); setPage(1); }}
      />
      <ExportBar
        onPDF={() => exportPDF('Purchase Summary Report', exportHeaders, exportRows, totalsRow)}
        onXLSX={() => exportXLSX('Purchase_Summary_Report', 'Purchase Summary Report', exportHeaders, exportRows, totalsRow, fromDate || toDate ? `${fromDate||'start'} – ${toDate||'today'}` : null)}
      />
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-muted/50">
                {colDefs.map(col => (
                  <th
                    key={col.label}
                    style={{ minWidth: col.width, textAlign: col.align }}
                    className="px-2 py-[6px] text-[8px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap border-b border-border"
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowData.length === 0 ? (
                <tr><td colSpan={colDefs.length} className="text-center py-10 text-muted-foreground text-xs">No data for selected filters.</td></tr>
              ) : <>
                {rowDataFiltered.slice((page - 1) * pageSize, page * pageSize).map((p, idx) => {
                  const i = (page - 1) * pageSize + idx;
                  const isBrokenCode = p.coffee_code && /KKGT\/\//.test(p.coffee_code);
                  const hasNoRegion = !p.region;
                  const isAmber = isBrokenCode || hasNoRegion;
                  const isPendingGT = p.grand_total_etb == null;
                  return (
                    <tr
                      key={p.id}
                      onClick={() => setSelectedRecord(p)}
                      className={`border-b border-border hover:bg-primary/5 cursor-pointer transition-colors ${isAmber ? 'bg-amber-50' : i % 2 === 0 ? '' : 'bg-muted/10'}`}
                    >
                      <td className="px-2 py-[6px] text-muted-foreground" style={{ textAlign: 'left' }}>{i+1}</td>
                      <td className="px-2 py-[6px] font-mono font-semibold text-primary whitespace-nowrap" style={{ minWidth: 190, textAlign: 'left' }}>
                        {p.coffee_code || '—'}
                        {isAmber && <span className="ml-1.5 text-[8px] font-bold text-amber-700 bg-amber-200 rounded px-1 py-0.5">⚠ Missing Region</span>}
                      </td>
                      <td className="px-2 py-[6px] whitespace-nowrap" style={{ textAlign: 'left' }}>{fmtDate(p.purchase_date)}</td>
                      <td className="px-2 py-[6px]" style={{ textAlign: 'left' }}>{p.supplier_name}</td>
                      <td className="px-2 py-[6px]" style={{ textAlign: 'left' }}>{p.region || <span className="text-amber-600 font-semibold">—</span>}</td>
                      <td className="px-2 py-[6px]" style={{ textAlign: 'right' }}>{fmt(p.net_dispatch_weight_kg)}</td>
                      <td className="px-2 py-[6px]" style={{ textAlign: 'right' }}>{fmt(p.unit_price_etb_per_feresula)}</td>
                      <td className="px-2 py-[6px]" style={{ textAlign: 'right' }}>{p.commission_percent!=null?`${p.commission_percent}%`:'—'}</td>
                      <td className="px-2 py-[6px] font-medium" style={{ textAlign: 'right' }}>
                        {isPendingGT ? <span className="text-muted-foreground italic text-[9px]">Pending</span> : fmt(p.grand_total_etb)}
                      </td>
                      <td className="px-2 py-[6px] font-medium text-primary" style={{ textAlign: 'right' }}>
                        {fmt(p.totalPaid)}
                      </td>
                      <td className={`px-2 py-[6px] font-bold ${isPendingGT ? 'text-muted-foreground' : (p.balance ?? 0) > 0 ? 'text-destructive' : 'text-green-700'}`} style={{ textAlign: 'right' }}>
                        {isPendingGT ? <span className="italic text-[9px] font-normal">Pending</span> : p.balance === 0 ? '—' : fmt(p.balance)}
                      </td>
                      <td className={`px-2 py-[6px] whitespace-nowrap ${statusStyle(p.status)}`} style={{ textAlign: 'left' }}>
                        {p.status}
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-muted/40 border-t-2 border-border font-bold text-[11px]">
                  <td className="px-2 py-[6px]"></td>
                  <td className="px-2 py-[6px]"></td>
                  <td className="px-2 py-[6px]"></td>
                  <td className="px-2 py-[6px]">TOTAL</td>
                  <td className="px-2 py-[6px]"></td>
                  <td className="px-2 py-[6px]" style={{ textAlign: 'right' }}>{fmt(totals.net_dispatch_weight_kg)}</td>
                  <td className="px-2 py-[6px]"></td>
                  <td className="px-2 py-[6px]"></td>
                  <td className="px-2 py-[6px]" style={{ textAlign: 'right' }}>{fmt(totals.grand_total_etb)}</td>
                  <td className="px-2 py-[6px]" style={{ textAlign: 'right' }}>{fmt(totals.totalPaid)}</td>
                  <td className="px-2 py-[6px]" style={{ textAlign: 'right' }}>{fmt(totals.balance)}</td>
                  <td className="px-2 py-[6px]"></td>
                </tr>
              </>}
            </tbody>
          </table>
        </div>
      </div>

      <TablePagination
        page={page}
        totalPages={Math.max(1, Math.ceil(rowDataFiltered.length / pageSize))}
        total={rowDataFiltered.length}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSize={setPageSize}
      />

      <PurchaseDetailPanel
        record={selectedRecord}
        receipt={selectedRecord ? receiptByCoffeeCode[selectedRecord.coffee_code] : null}
        open={!!selectedRecord}
        onClose={() => setSelectedRecord(null)}
      />
    </div>
  );
}

// ── Report: Warehouse Stock ───────────────────────────────────────────────────
function WarehouseStockReport({ receipts, sampleLogs, processingLogs, purchases, suppliers }) {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [supplier, setSupplier] = useState('all');

  const rows = useMemo(() => {
    // Build dispatch KG map: sum net_dispatch_weight_kg from purchases per supplier
    const dispatchBySupplier = {};
    purchases.forEach(p => {
      const name = p.supplier_name;
      if (!dispatchBySupplier[name]) dispatchBySupplier[name] = 0;
      dispatchBySupplier[name] += (p.net_dispatch_weight_kg || 0);
    });

    // Deduplicate supplier names
    const uniqueNames = [...new Set(suppliers.map(s => s.supplier_name))];
    const list = uniqueNames.filter(name => supplier === 'all' || name === supplier);
    return list.map(name => {
      const received = receipts.filter(r => r.supplier_name === name && inRange(r.received_date, fromDate, toDate)).reduce((sum, r) => sum + (r.warehouse_received_net_kg || 0), 0);
      const dispatched = dispatchBySupplier[name] || 0;
      const samples = sampleLogs.filter(l => l.supplier_name === name && inRange(l.sample_date, fromDate, toDate)).reduce((sum, l) => sum + (l.sample_kg || 0), 0);
      const processing = processingLogs.filter(p => p.supplier_name === name && inRange(p.date, fromDate, toDate)).reduce((sum, p) => sum + (p.kg_sent || 0), 0);
      const remaining = received - samples - processing;
      const shrinkage = received - dispatched;
      return { name, received, dispatched, shrinkage, samples, processing, remaining };
    }).filter(r => r.received > 0);
  }, [suppliers, receipts, sampleLogs, processingLogs, purchases, fromDate, toDate, supplier]);

  const totals = useMemo(() => ({
    received: rows.reduce((s, r) => s + r.received, 0),
    dispatched: rows.reduce((s, r) => s + r.dispatched, 0),
    shrinkage: rows.reduce((s, r) => s + r.shrinkage, 0),
    samples: rows.reduce((s, r) => s + r.samples, 0),
    processing: rows.reduce((s, r) => s + r.processing, 0),
    remaining: rows.reduce((s, r) => s + r.remaining, 0),
  }), [rows]);

  const headers = ['#', 'Supplier', 'Received KG', 'Dispatch KG', 'Shrinkage KG', 'Samples KG', 'Processing KG', 'Remaining KG'];
  const csvRows = rows.map((r, i) => [i+1, r.name, fmt(r.received), fmt(r.dispatched), fmt(r.shrinkage), fmt(r.samples), fmt(r.processing), fmt(r.remaining)]);
  const totalsRow = ['', 'TOTAL', fmt(totals.received), fmt(totals.dispatched), fmt(totals.shrinkage), fmt(totals.samples), fmt(totals.processing), fmt(totals.remaining)];

  return (
    <div>
      <FiltersBar {...{fromDate, setFromDate, toDate, setToDate, supplier, setSupplier, suppliers}} />
      <ExportBar onPDF={() => exportPDF('Warehouse Stock Report', headers, csvRows, totalsRow)} onXLSX={() => exportXLSX('Warehouse_Stock_Report', 'Warehouse Stock Report', headers, csvRows, totalsRow)} />
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                {headers.map(h => <TableHead key={h} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{h}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={headers.length} className="text-center py-10 text-muted-foreground">No data for selected filters.</TableCell></TableRow>
              ) : <>
                {rows.map((r, i) => (
                  <TableRow key={r.name} className="hover:bg-muted/20">
                    <TableCell className="text-muted-foreground text-xs">{i+1}</TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-right">{fmt(r.received)}</TableCell>
                    <TableCell className="text-right">{fmt(r.dispatched)}</TableCell>
                    <TableCell className={`text-right ${r.shrinkage < 0 ? 'text-destructive' : 'text-accent'}`}>{fmt(r.shrinkage)}</TableCell>
                    <TableCell className="text-right">{fmt(r.samples)}</TableCell>
                    <TableCell className="text-right">{fmt(r.processing)}</TableCell>
                    <TableCell className={`text-right font-bold ${r.remaining < 0 ? 'text-destructive' : 'text-accent'}`}>{fmt(r.remaining)}</TableCell>
                  </TableRow>
                ))}
                <TotalsRow cols={[null, 'TOTAL', totals.received, totals.dispatched, totals.shrinkage, totals.samples, totals.processing, totals.remaining]} />
              </>}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

// ── Report: Supplier Balance ──────────────────────────────────────────────────
function SupplierBalanceReport({ purchases, suppliers }) {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [supplier, setSupplier] = useState('all');

  const rows = useMemo(() => {
    // Group by supplier name (case-insensitive)
    const nameMap = {};
    purchases.forEach(p => {
      if (!p.supplier_name) return;
      if (!inRange(p.purchase_date, fromDate, toDate)) return;
      if (supplier !== 'all' && p.supplier_name.toLowerCase() !== supplier.toLowerCase()) return;
      const key = p.supplier_name.toLowerCase();
      if (!nameMap[key]) nameMap[key] = { displayName: p.supplier_name, lots: [] };
      nameMap[key].lots.push(p);
    });

    return Object.values(nameMap).map(({ displayName, lots }) => {
      const lotCount = lots.length;
      const totalPurchased = lots.reduce((sum, p) => sum + (p.grand_total_etb || 0), 0);

      // Aggregate all payments across all lots — always from payment_history JSON
      const allPayments = lots.flatMap(p => {
        const pmts = parsePayments(p);
        return pmts.map(pay => ({ ...pay, coffee_code: p.coffee_code }));
      }).sort((a, b) => (a.payment_date || '') > (b.payment_date || '') ? 1 : -1);

      const totalPaid = allPayments.reduce((s, pay) => s + (parseFloat(pay.amount_etb) || 0), 0);
      const balance = calcBalance(totalPurchased, totalPaid) ?? 0;

      const bankBreakdown = {};
      allPayments.forEach(pay => {
        const bank = pay.bank_name || 'Unknown';
        bankBreakdown[bank] = (bankBreakdown[bank] || 0) + (parseFloat(pay.amount_etb) || 0);
      });

      let runningBalance = totalPurchased;
      const paymentRowsWithBalance = allPayments.map(pay => {
        runningBalance -= parseFloat(pay.amount_etb) || 0;
        return { ...pay, runningBalance };
      });

      return { name: displayName, lotCount, totalPurchased, totalPaid, balance, bankBreakdown, paymentRowsWithBalance };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [suppliers, purchases, fromDate, toDate, supplier]);

  const totals = useMemo(() => ({
    totalPurchased: rows.reduce((s, r) => s + r.totalPurchased, 0),
    totalPaid: rows.reduce((s, r) => s + r.totalPaid, 0),
    balance: rows.reduce((s, r) => s + r.balance, 0),
  }), [rows]);

  const exportHeaders = ['#', 'Supplier', 'Grand Total ETB', 'Total Paid ETB', 'Balance Owed ETB'];
  const exportRows = rows.map((r, i) => [i+1, r.name, fmt(r.totalPurchased), fmt(r.totalPaid), fmt(r.balance)]);
  const exportTotalsRow = ['', 'TOTAL', fmt(totals.totalPurchased), fmt(totals.totalPaid), fmt(totals.balance)];

  return (
    <div className="space-y-4">
      <FiltersBar {...{fromDate, setFromDate, toDate, setToDate, supplier, setSupplier, suppliers}} />
      <ExportBar onPDF={() => exportPDF('Supplier Balance Report', exportHeaders, exportRows, exportTotalsRow)} onXLSX={() => exportXLSX('Supplier_Balance_Report', 'Supplier Balance Report', exportHeaders, exportRows, exportTotalsRow)} />

      {rows.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">No data for selected filters.</div>
      ) : rows.map(r => (
        <div key={r.name} className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Supplier header */}
          <div className="px-5 py-4 bg-muted/30 border-b border-border flex flex-wrap items-center gap-4 justify-between">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold text-foreground capitalize">{r.name}</p>
                {r.lotCount > 1 && (
                  <span className="text-xs font-semibold bg-primary/10 text-primary rounded px-2 py-0.5">{r.lotCount} lots</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">Grand Total: {fmt(r.totalPurchased)} ETB</p>
            </div>
            <div className="flex gap-6 text-sm">
              <div><p className="text-xs text-muted-foreground">Total Paid</p><p className="font-bold text-primary">{fmt(r.totalPaid)} ETB</p></div>
              <div><p className="text-xs text-muted-foreground">Balance</p><p className={`font-bold ${r.balance > 0 ? 'text-destructive' : 'text-green-700'}`}>{fmt(r.balance)} ETB</p></div>
            </div>
          </div>

          {/* Payment rows */}
          {r.paymentRowsWithBalance.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    {['Pay No', 'Lot', 'Date', 'Bank', 'Branch/Account', 'Type', 'CPV Ref', 'Amount ETB', 'Running Balance', 'Note'].map(h => (
                      <TableHead key={h} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.paymentRowsWithBalance.map((pay, pi) => (
                    <TableRow key={pi} className="hover:bg-muted/20">
                      <TableCell className="text-xs font-bold text-primary">#{pay.payment_no || pi + 1}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap">{pay.coffee_code || '—'}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{pay.payment_date || '—'}</TableCell>
                      <TableCell><span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-primary/10 text-primary">{pay.bank_name || '—'}</span></TableCell>
                      <TableCell className="text-xs">{pay.branch_account || '—'}</TableCell>
                      <TableCell className="text-xs">{pay.payment_type || '—'}</TableCell>
                      <TableCell className="text-xs font-mono">{pay.cpv_reference || '—'}</TableCell>
                      <TableCell className={`text-right font-semibold text-sm ${(parseFloat(pay.amount_etb) || 0) < 0 ? 'text-blue-600' : 'text-foreground'}`}>{fmt(parseFloat(pay.amount_etb))}</TableCell>
                      <TableCell className={`text-right font-bold text-sm ${pay.runningBalance > 0 ? 'text-destructive' : 'text-green-700'}`}>{fmt(pay.runningBalance)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{pay.note || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="px-5 py-4 text-sm text-muted-foreground">No payments recorded.</div>
          )}

          {/* Bank breakdown */}
          {Object.keys(r.bankBreakdown).length > 0 && (
            <div className="px-5 py-3 bg-muted/20 border-t border-border flex flex-wrap gap-4">
              <span className="text-xs font-semibold text-muted-foreground uppercase">Payment by Bank:</span>
              {Object.entries(r.bankBreakdown).map(([bank, amt]) => (
                <span key={bank} className="text-xs"><span className="font-bold text-foreground">{bank}</span>: {fmt(amt)} ETB</span>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Overall totals */}
      {rows.length > 1 && (
        <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4 flex flex-wrap gap-6">
          <div><p className="text-xs text-muted-foreground">Grand Total ETB</p><p className="font-bold text-foreground">{fmt(totals.totalPurchased)}</p></div>
          <div><p className="text-xs text-muted-foreground">Total Paid ETB</p><p className="font-bold text-primary">{fmt(totals.totalPaid)}</p></div>
          <div><p className="text-xs text-muted-foreground">Total Balance Owed ETB</p><p className={`font-bold ${totals.balance > 0 ? 'text-destructive' : 'text-green-700'}`}>{fmt(totals.balance)}</p></div>
        </div>
      )}
    </div>
  );
}

// ── Report: Payments ──────────────────────────────────────────────────────────
const BANKS_LIST = ['CBE', 'AWASH', 'BOA', 'COOP', 'OROMI', 'DASHEN', 'Other'];

function PaymentsReport({ purchases, suppliers }) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState({ date: { from: '', to: '' }, supplier: 'all', bank: 'all', paymentType: 'all', cpvRef: '' });

  const fromDate = filters.date?.from || '';
  const toDate = filters.date?.to || '';

  const activeCount = [
    fromDate || toDate,
    filters.supplier !== 'all',
    filters.bank !== 'all',
    filters.paymentType !== 'all',
    filters.cpvRef,
  ].filter(Boolean).length;

  const allPaymentRows = useMemo(() => {
    const rows = [];
    purchases.forEach(p => {
      const pmts = parsePayments(p);
      pmts.forEach(pay => {
        rows.push({
          ...pay,
          supplier_name: p.supplier_name,
          coffee_code: p.coffee_code,
          grand_total_etb: p.grand_total_etb,
        });
      });
    });
    return rows.sort((a, b) => (a.payment_date || '') > (b.payment_date || '') ? 1 : -1);
  }, [purchases]);

  // Running balance per supplier
  const filtered = useMemo(() => {
    const f = allPaymentRows.filter(r =>
      inRange(r.payment_date, fromDate, toDate) &&
      (filters.supplier === 'all' || r.supplier_name === filters.supplier) &&
      (filters.bank === 'all' || r.bank_name === filters.bank) &&
      (filters.paymentType === 'all' || r.payment_type === filters.paymentType) &&
      (!filters.cpvRef || (r.cpv_reference || '').toLowerCase().includes(filters.cpvRef.toLowerCase()))
    );
    // compute running balance per supplier
    const balMap = {};
    purchases.forEach(p => { if (!balMap[p.supplier_name]) balMap[p.supplier_name] = p.grand_total_etb || 0; });
    return f.map(r => {
      balMap[r.supplier_name] = (balMap[r.supplier_name] || 0) - (parseFloat(r.amount_etb) || 0);
      return { ...r, runningBalance: balMap[r.supplier_name] };
    });
  }, [allPaymentRows, filters, purchases]);

  const totalPaid = filtered.reduce((s, r) => s + (parseFloat(r.amount_etb) || 0), 0);
  const bankTotals = useMemo(() => {
    const m = {};
    filtered.forEach(r => { m[r.bank_name || 'Unknown'] = (m[r.bank_name || 'Unknown'] || 0) + (parseFloat(r.amount_etb) || 0); });
    return m;
  }, [filtered]);

  const supplierTotals = useMemo(() => {
    const m = {};
    filtered.forEach(r => { m[r.supplier_name] = (m[r.supplier_name] || 0) + (parseFloat(r.amount_etb) || 0); });
    return m;
  }, [filtered]);

  const exportHeaders = ['#', 'Date', 'Supplier', 'Coffee Code', 'Bank', 'Branch/Account', 'CPV Ref', 'Type', 'Amount ETB', 'Running Balance', 'Note'];
  const exportRows = filtered.map((r, i) => [i+1, r.payment_date||'—', r.supplier_name, r.coffee_code||'—', r.bank_name||'—', r.branch_account||'—', r.cpv_reference||'—', r.payment_type||'—', fmt(parseFloat(r.amount_etb)), fmt(r.runningBalance), r.note||'—']);
  const exportTotalsRow = ['', '', '', '', '', '', 'TOTAL', '', fmt(totalPaid), '', ''];

  const supplierOpts = useMemo(() => [...new Set(suppliers.map(s => s.supplier_name))].map(n => ({ value: n, label: n })), [suppliers]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <DateRangePicker from={fromDate} to={toDate} onChange={v => setFilters(f => ({ ...f, date: v }))} />
        <FilterButton onClick={() => setFilterOpen(true)} activeCount={activeCount} />
      </div>
      <FilterPanel
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        fields={[
          { key: 'date', label: 'Date', type: 'date' },
          { key: 'supplier', label: 'Supplier', type: 'select', options: supplierOpts, placeholder: 'All Suppliers' },
          { key: 'bank', label: 'Bank', type: 'select', options: BANKS_LIST.map(b => ({ value: b, label: b })), placeholder: 'All Banks' },
          { key: 'paymentType', label: 'Payment Type', type: 'select', options: ['Advance', 'Final Payment', 'Adjustment'].map(t => ({ value: t, label: t })), placeholder: 'All Types' },
          { key: 'cpvRef', label: 'CPV Reference', type: 'text', placeholder: 'Search CPV...' },
        ]}
        values={filters}
        onApply={v => setFilters(v)}
        onReset={() => setFilters({ date: { from: '', to: '' }, supplier: 'all', bank: 'all', paymentType: 'all', cpvRef: '' })}
      />

      <ExportBar onPDF={() => exportPDF('Payments Report', exportHeaders, exportRows, exportTotalsRow)} onXLSX={() => exportXLSX('Payments_Report', 'Payments Report', exportHeaders, exportRows, exportTotalsRow)} />

      <PaymentsReportBody filtered={filtered} totalPaid={totalPaid} bankTotals={bankTotals} supplierTotals={supplierTotals} exportHeaders={exportHeaders} exportRows={exportRows} exportTotalsRow={exportTotalsRow} />
    </div>
  );
}

function PaymentsReportBody({ filtered, totalPaid, bankTotals, supplierTotals, exportHeaders, exportRows, exportTotalsRow }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  useMemo(() => { setPage(1); }, [filtered.length]);
  const totalPages = Math.max(1, Math.ceil(exportRows.length / pageSize));
  const pagedRows = exportRows.slice((page - 1) * pageSize, page * pageSize);
  return (
    <>
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-3">
          <p className="text-xs text-muted-foreground">Total Paid (filtered)</p>
          <p className="text-lg font-bold text-primary">{fmt(totalPaid)} ETB</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3">
          <p className="text-xs text-muted-foreground">Payments Count</p>
          <p className="text-lg font-bold text-foreground">{filtered.length}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 col-span-2">
          <p className="text-xs text-muted-foreground mb-1">By Bank</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(bankTotals).map(([b, amt]) => (
              <span key={b} className="text-xs bg-primary/10 text-primary rounded px-2 py-0.5 font-semibold">{b}: {fmt(amt)}</span>
            ))}
          </div>
        </div>
      </div>

      <ReportTable headers={exportHeaders} rows={pagedRows} totalsRow={exportTotalsRow} />
      <TablePagination page={page} totalPages={totalPages} total={exportRows.length} pageSize={pageSize} onPageChange={setPage} onPageSize={setPageSize} />

      {/* Per-supplier totals */}
      {Object.keys(supplierTotals).length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Total Paid Per Supplier</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(supplierTotals).sort((a, b) => b[1] - a[1]).map(([name, amt]) => (
              <div key={name} className="flex justify-between items-center py-1.5 border-b border-border/50">
                <span className="text-sm truncate mr-2">{name}</span>
                <span className="text-sm font-semibold text-primary whitespace-nowrap">{fmt(amt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ── Report: Processing ────────────────────────────────────────────────────────
function ProcessingReport({ processingLogs, suppliers }) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState({ date: { from: '', to: '' }, supplier: 'all', mode: 'all', batchNo: '' });

  const fromDate = filters.date?.from || '';
  const toDate = filters.date?.to || '';

  const activeCount = [fromDate || toDate, filters.supplier !== 'all', filters.mode !== 'all', filters.batchNo].filter(Boolean).length;

  const filtered = useMemo(() => processingLogs.filter(p => {
    if (!inRange(p.date, fromDate, toDate)) return false;
    if (filters.supplier !== 'all' && p.supplier_name !== filters.supplier) return false;
    if (filters.mode !== 'all' && p.entry_mode !== filters.mode) return false;
    if (filters.batchNo && !(p.batch_no || '').toLowerCase().includes(filters.batchNo.toLowerCase())) return false;
    return true;
  }).sort((a, b) => (a.date || '') > (b.date || '') ? 1 : -1), [processingLogs, filters]);

  let cumulative = 0;
  const rowsWithCum = filtered.map(p => {
    cumulative += p.kg_sent || 0;
    return { ...p, cumulative };
  });

  const totalBags = filtered.reduce((s, p) => s + (p.bags_sent || 0), 0);
  const totalKg = filtered.reduce((s, p) => s + (p.kg_sent || 0), 0);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  useMemo(() => { setPage(1); }, [filters]);

  const headers = ['#', 'Date', 'Supplier', 'Bags Sent', 'KG Sent', 'Cumulative KG', 'Batch No', 'Remark'];
  const csvRows = rowsWithCum.map((p, i) => [i+1, fmtDate(p.date), p.supplier_name, p.bags_sent??'—', fmt(p.kg_sent), fmt(p.cumulative), p.batch_no||'—', p.remark||'—']);
  const totalsRow = ['', '', 'TOTAL', totalBags, fmt(totalKg), '', '', ''];

  const totalPages = Math.max(1, Math.ceil(csvRows.length / pageSize));
  const pagedRows = csvRows.slice((page - 1) * pageSize, page * pageSize);

  const supplierOpts2 = useMemo(() => [...new Set(suppliers.map(s => s.supplier_name))].map(n => ({ value: n, label: n })), [suppliers]);

  return (
    <div>
      <div className="flex items-center gap-3 flex-wrap mb-5">
        <DateRangePicker from={fromDate} to={toDate} onChange={v => setFilters(f => ({ ...f, date: v }))} />
        <FilterButton onClick={() => setFilterOpen(true)} activeCount={activeCount} />
      </div>
      <FilterPanel
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        fields={[
          { key: 'date', label: 'Date', type: 'date' },
          { key: 'supplier', label: 'Supplier', type: 'select', options: supplierOpts2, placeholder: 'All Suppliers' },
          { key: 'mode', label: 'Mode', type: 'select', options: [{ value: 'By Bags', label: 'By Bags' }, { value: 'By KG', label: 'By KG' }], placeholder: 'All Modes' },
          { key: 'batchNo', label: 'Batch No', type: 'text', placeholder: 'Search batch...' },
        ]}
        values={filters}
        onApply={v => { setFilters(v); setPage(1); }}
        onReset={() => { setFilters({ date: { from: '', to: '' }, supplier: 'all', mode: 'all', batchNo: '' }); setPage(1); }}
      />
      <ExportBar onPDF={() => exportPDF('Processing Report', headers, csvRows, totalsRow)} onXLSX={() => exportXLSX('Processing_Report', 'Processing Report', headers, csvRows, totalsRow)} />
      <ReportTable headers={headers} rows={pagedRows} totalsRow={totalsRow} />
      <TablePagination page={page} totalPages={totalPages} total={csvRows.length} pageSize={pageSize} onPageChange={setPage} onPageSize={setPageSize} />
    </div>
  );
}

// ── Report: Output / Export ───────────────────────────────────────────────────
function OutputReportView({ outputReports }) {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const filtered = useMemo(() => outputReports
    .filter(r => inRange(r.date, fromDate, toDate))
    .sort((a, b) => (a.date || '') > (b.date || '') ? 1 : -1),
    [outputReports, fromDate, toDate]);

  const totals = useMemo(() => ({
    total_kg_processed: filtered.reduce((s, r) => s + (r.total_kg_processed || 0), 0),
    export_bags: filtered.reduce((s, r) => s + (r.export_bags || 0), 0),
    export_kg: filtered.reduce((s, r) => s + (r.export_kg || 0), 0),
    reject_bags: filtered.reduce((s, r) => s + (r.reject_bags || 0), 0),
    reject_kg: filtered.reduce((s, r) => s + (r.reject_kg || 0), 0),
    waste_kg: filtered.reduce((s, r) => s + (r.waste_kg || 0), 0),
  }), [filtered]);

  const headers = ['#', 'Date', 'Total KG Processed', 'Export Bags', 'Export KG', 'Reject Bags', 'Reject KG', 'Waste KG', 'Reject %', 'Waste %', 'Registrar'];
  const csvRows = filtered.map((r, i) => [i+1, fmtDate(r.date), fmt(r.total_kg_processed), r.export_bags??'—', fmt(r.export_kg), r.reject_bags??'—', fmt(r.reject_kg), fmt(r.waste_kg), pct(r.reject_pct), pct(r.waste_pct), r.registrar_name||'—']);
  const totalsRow = ['', 'TOTAL', fmt(totals.total_kg_processed), totals.export_bags, fmt(totals.export_kg), totals.reject_bags, fmt(totals.reject_kg), fmt(totals.waste_kg), '', '', ''];

  return (
    <div>
      <div className="flex flex-wrap gap-3 items-end bg-muted/30 border border-border rounded-xl p-4 mb-5">
        <div className="space-y-1">
          <Label className="text-xs font-medium">From Date</Label>
          <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-8 w-36" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium">To Date</Label>
          <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-8 w-36" />
        </div>
        <Button variant="outline" size="sm" onClick={() => { setFromDate(''); setToDate(''); }}>Clear</Button>
      </div>
      <ExportBar onPDF={() => exportPDF('Output Export Report', headers, csvRows, totalsRow)} onXLSX={() => exportXLSX('Output_Export_Report', 'Output Export Report', headers, csvRows, totalsRow)} />
      <ReportTable headers={headers} rows={csvRows} totalsRow={totalsRow} />
    </div>
  );
}

// ── Shared UI components ──────────────────────────────────────────────────────
function ExportBar({ onPDF, onXLSX }) {
  return (
    <div className="flex gap-2 mb-4">
      <Button size="sm" variant="outline" onClick={onPDF} className="gap-1.5">
        <FileText className="w-3.5 h-3.5" /> Export PDF
      </Button>
      <Button size="sm" variant="outline" onClick={onXLSX} className="gap-1.5">
        <FileSpreadsheet className="w-3.5 h-3.5" /> Export Excel (.xlsx)
      </Button>
    </div>
  );
}

function TotalsRow({ cols }) {
  return (
    <TableRow className="bg-muted/40 font-bold border-t-2 border-border">
      {cols.map((v, i) => (
        <TableCell key={i} className={`font-bold ${i === 0 ? '' : 'text-right'}`}>
          {v == null ? '' : typeof v === 'number' ? fmt(v) : v}
        </TableCell>
      ))}
    </TableRow>
  );
}

function ReportTable({ headers, rows, totalsRow }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              {headers.map(h => <TableHead key={h} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{h}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={headers.length} className="text-center py-10 text-muted-foreground">No data for selected filters.</TableCell></TableRow>
            ) : <>
              {rows.map((row, i) => (
                <TableRow key={i} className="hover:bg-muted/20">
                  {row.map((cell, j) => (
                    <TableCell key={j} className={`whitespace-nowrap ${j > 1 ? 'text-right' : ''}`}>{cell}</TableCell>
                  ))}
                </TableRow>
              ))}
              {totalsRow && (
                <TableRow className="bg-muted/40 font-bold border-t-2 border-border">
                  {totalsRow.map((v, j) => (
                    <TableCell key={j} className={`font-bold whitespace-nowrap ${j > 1 ? 'text-right' : ''}`}>{v}</TableCell>
                  ))}
                </TableRow>
              )}
            </>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ── Report: Export Contracts ──────────────────────────────────────────────────
function ExportContractsReport({ contracts }) {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const STATUS_COLOR = {
    'Pending': 'text-gray-600',
    'In Progress': 'text-orange-600',
    'Shipped': 'text-blue-600',
    'Completed': 'text-green-700',
  };

  const [contractSearch, setContractSearch] = useState('');

  const filtered = useMemo(() => {
    const q = contractSearch.toLowerCase();
    return contracts
      .filter(c => inRange(c.export_date, fromDate, toDate) &&
        (!contractSearch || c.contract_no?.toLowerCase().includes(q) || c.destination_country?.toLowerCase().includes(q) || c.commodity?.toLowerCase().includes(q)))
      .sort((a, b) => (a.export_date || '') > (b.export_date || '') ? 1 : -1);
  }, [contracts, fromDate, toDate, contractSearch]);

  const totals = useMemo(() => ({
    total_export_value_usd: filtered.reduce((s, c) => s + (c.total_export_value_usd || 0), 0),
    total_expenses_etb: filtered.reduce((s, c) => s + (c.total_expenses_etb || 0), 0),
    export_total_sales_price_etb: filtered.reduce((s, c) => s + (c.export_total_sales_price_etb || 0), 0),
    total_reject_sales_etb: filtered.reduce((s, c) => s + (c.total_reject_sales_etb || 0), 0),
    grand_total_sales_etb: filtered.reduce((s, c) => s + (c.grand_total_sales_etb || 0), 0),
    total_profit_etb: filtered.reduce((s, c) => s + (c.total_profit_etb || 0), 0),
    profit_usd: filtered.reduce((s, c) => s + (c.profit_usd || 0), 0),
  }), [filtered]);

  const headers = ['#', 'Contract No', 'Destination', 'Commodity', 'Export Date', 'Total USD', 'USD Rate', 'Total Expenses ETB', 'Export Sales ETB', 'Reject Sales ETB', 'Grand Total Sales ETB', 'Total Profit ETB', 'Profit USD', 'Status'];
  const csvRows = filtered.map((c, i) => [
    i + 1, c.contract_no, c.destination_country, c.commodity, fmtDate(c.export_date),
    fmt(c.total_export_value_usd), fmt(c.usd_rate_etb, 4),
    fmt(c.total_expenses_etb), fmt(c.export_total_sales_price_etb),
    fmt(c.total_reject_sales_etb), fmt(c.grand_total_sales_etb),
    fmt(c.total_profit_etb), fmt(c.profit_usd), c.status || '—'
  ]);
  const totalsRow = ['', '', '', '', 'TOTAL',
    fmt(totals.total_export_value_usd), '',
    fmt(totals.total_expenses_etb), fmt(totals.export_total_sales_price_etb),
    fmt(totals.total_reject_sales_etb), fmt(totals.grand_total_sales_etb),
    fmt(totals.total_profit_etb), fmt(totals.profit_usd), ''
  ];

  return (
    <div>
      <div className="flex flex-wrap gap-3 items-end bg-muted/30 border border-border rounded-xl p-4 mb-5">
        <div className="space-y-1">
          <Label className="text-xs font-medium">From Date</Label>
          <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-8 w-36" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium">To Date</Label>
          <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-8 w-36" />
        </div>
        <Button variant="outline" size="sm" onClick={() => { setFromDate(''); setToDate(''); setContractSearch(''); }}>Clear</Button>
        <div className="space-y-1">
          <Label className="text-xs font-medium">Search Contract</Label>
          <Input placeholder="Contract No, destination..." value={contractSearch} onChange={e => setContractSearch(e.target.value)} className="h-8 w-48" />
        </div>
      </div>
      <ExportBar onPDF={() => exportPDF('Export Contracts Report', headers, csvRows, totalsRow)} onXLSX={() => exportXLSX('Export_Contracts_Report', 'Export Contracts Report', headers, csvRows, totalsRow)} />
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                {headers.map(h => <TableHead key={h} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{h}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={headers.length} className="text-center py-10 text-muted-foreground">No export contracts for selected filters.</TableCell></TableRow>
              ) : <>
                {filtered.map((c, i) => (
                  <TableRow key={c.id} className="hover:bg-muted/20">
                    <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                    <TableCell className="font-mono text-xs font-semibold text-primary whitespace-nowrap">{c.contract_no}</TableCell>
                    <TableCell className="whitespace-nowrap">{c.destination_country}</TableCell>
                    <TableCell className="whitespace-nowrap">{c.commodity}</TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDate(c.export_date)}</TableCell>
                    <TableCell className="text-right">{fmt(c.total_export_value_usd)}</TableCell>
                    <TableCell className="text-right">{fmt(c.usd_rate_etb, 4)}</TableCell>
                    <TableCell className="text-right">{fmt(c.total_expenses_etb)}</TableCell>
                    <TableCell className="text-right">{fmt(c.export_total_sales_price_etb)}</TableCell>
                    <TableCell className="text-right">{fmt(c.total_reject_sales_etb)}</TableCell>
                    <TableCell className="text-right font-medium">{fmt(c.grand_total_sales_etb)}</TableCell>
                    <TableCell className={`text-right font-bold ${(c.total_profit_etb || 0) >= 0 ? 'text-green-700' : 'text-destructive'}`}>{fmt(c.total_profit_etb)}</TableCell>
                    <TableCell className={`text-right font-semibold ${(c.profit_usd || 0) >= 0 ? 'text-green-700' : 'text-destructive'}`}>{fmt(c.profit_usd)}</TableCell>
                    <TableCell className={`whitespace-nowrap text-xs font-semibold ${STATUS_COLOR[c.status] || ''}`}>{c.status || '—'}</TableCell>
                  </TableRow>
                ))}
                <TotalsRow cols={[null, '', '', '', 'TOTAL',
                  totals.total_export_value_usd, null,
                  totals.total_expenses_etb, totals.export_total_sales_price_etb,
                  totals.total_reject_sales_etb, totals.grand_total_sales_etb,
                  totals.total_profit_etb, totals.profit_usd, null
                ]} />
              </>}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Reports() {
  const { data: purchases = [] } = useQuery({ queryKey: ['purchase-records'], queryFn: () => base44.entities.PurchaseRecord.list('-created_date', 1000) });
  const { data: receipts = [] } = useQuery({ queryKey: ['warehouse-receipts'], queryFn: () => base44.entities.WarehouseReceipt.list('-created_date', 1000) });
  const { data: sampleLogs = [] } = useQuery({ queryKey: ['sample-logs'], queryFn: () => base44.entities.SampleLog.list('-created_date', 1000) });
  const { data: processingLogs = [] } = useQuery({ queryKey: ['processing-logs'], queryFn: () => base44.entities.ProcessingLog.list('-created_date', 1000) });
  const { data: outputReports = [] } = useQuery({ queryKey: ['output-reports'], queryFn: () => base44.entities.OutputReport.list('-date', 1000) });
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: () => base44.entities.Supplier.list() });
  const { data: exportContracts = [] } = useQuery({ queryKey: ['export-contracts'], queryFn: () => base44.entities.ExportContract.list('-export_date', 1000) });

  return (
    <RoleGuard allowedRoles={['admin']}>
      <div>
        <PageHeader title="Reports" description="Generate and export operational reports" />
        <Tabs defaultValue="purchase">
          <TabsList className="flex-wrap h-auto gap-1 mb-6">
            <TabsTrigger value="purchase">Purchase Summary</TabsTrigger>
            <TabsTrigger value="warehouse">Warehouse Stock</TabsTrigger>
            <TabsTrigger value="balance">Supplier Balance</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="processing">Processing</TabsTrigger>
            <TabsTrigger value="output">Output / Export</TabsTrigger>
            <TabsTrigger value="export-contracts">Export Contracts</TabsTrigger>
          </TabsList>
          <TabsContent value="purchase">
            <PurchaseSummaryReport purchases={purchases} suppliers={suppliers} receipts={receipts} />
          </TabsContent>
          <TabsContent value="warehouse">
            <WarehouseStockReport receipts={receipts} sampleLogs={sampleLogs} processingLogs={processingLogs} purchases={purchases} suppliers={suppliers} />
          </TabsContent>
          <TabsContent value="balance">
            <SupplierBalanceReport purchases={purchases} suppliers={suppliers} />
          </TabsContent>
          <TabsContent value="payments">
            <PaymentsReport purchases={purchases} suppliers={suppliers} />
          </TabsContent>
          <TabsContent value="processing">
            <ProcessingReport processingLogs={processingLogs} suppliers={suppliers} />
          </TabsContent>
          <TabsContent value="output">
            <OutputReportView outputReports={outputReports} />
          </TabsContent>
          <TabsContent value="export-contracts">
            <ExportContractsReport contracts={exportContracts} />
          </TabsContent>
        </Tabs>
      </div>
    </RoleGuard>
  );
}
