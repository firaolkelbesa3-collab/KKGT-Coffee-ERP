import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, startOfDay, startOfWeek, startOfMonth } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, SlidersHorizontal, FileText, Download, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';

import PageHeader from '@/components/shared/PageHeader';
import TablePagination from '@/components/shared/TablePagination';
import RoleGuard from '@/components/RoleGuard';
import WRRSummaryCards from '@/components/wrr/WRRSummaryCards';
import WRRFilterPanel from '@/components/wrr/WRRFilterPanel';
import WRRDetailPanel from '@/components/wrr/WRRDetailPanel';
import { base44 } from '@/api/supabaseClient';

const fmt = (n) => (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const DEFAULT_FILTERS = { dateFrom: '', dateTo: '', supplier: 'all', grnStatus: 'all', shrinkage: 'all', region: 'all', coffeeType: 'all' };

const SORT_DIRS = { asc: 'asc', desc: 'desc' };

function SortIcon({ col, sortKey, sortDir }) {
  if (sortKey !== col) return <span className="ml-1 opacity-30">↕</span>;
  return <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
}

export default function WarehouseReceiptReport() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [quickRange, setQuickRange] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortKey, setSortKey] = useState('received_date');
  const [sortDir, setSortDir] = useState('desc');
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  // Fetch data
  const { data: receipts = [], isLoading: loadingReceipts, refetch: refetchReceipts } = useQuery({
    queryKey: ['wrr-receipts'],
    queryFn: () => base44.entities.WarehouseReceipt.filter({ archived: false }, '-received_date', 5000),
    staleTime: 60000,
  });

  const { data: purchases = [] } = useQuery({
    queryKey: ['wrr-purchases'],
    queryFn: () => base44.entities.PurchaseRecord.filter({ archived: false }, '-purchase_date', 5000),
    staleTime: 60000,
  });

  const { data: sampleLogs = [] } = useQuery({
    queryKey: ['wrr-samples'],
    queryFn: () => base44.entities.SampleLog.filter({ archived: false }, '-sample_date', 5000),
    staleTime: 60000,
  });

  const { data: processingLogs = [] } = useQuery({
    queryKey: ['wrr-processing'],
    queryFn: () => base44.entities.ProcessingLog.filter({ archived: false }, '-date', 5000),
    staleTime: 60000,
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['wrr-suppliers'],
    queryFn: () => base44.entities.Supplier.list(),
    staleTime: 120000,
  });

  // Auto-refresh every 60s
  useEffect(() => {
    const timer = setInterval(() => {
      refetchReceipts();
      setLastUpdated(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, [refetchReceipts]);

  // Lookup maps
  const purchaseByCode = useMemo(() => {
    const m = {};
    purchases.forEach(p => { if (p.coffee_code) m[p.coffee_code] = p; });
    return m;
  }, [purchases]);

  const sampleKgBySupplier = useMemo(() => {
    const m = {};
    sampleLogs.forEach(s => {
      if (s.supplier_name) m[s.supplier_name] = (m[s.supplier_name] || 0) + (s.sample_kg || 0);
    });
    return m;
  }, [sampleLogs]);

  const processingKgBySupplier = useMemo(() => {
    const m = {};
    processingLogs.forEach(p => {
      if (p.supplier_name) m[p.supplier_name] = (m[p.supplier_name] || 0) + (p.actual_weighed_kg || 0);
    });
    return m;
  }, [processingLogs]);

  const supplierNames = useMemo(() => suppliers.map(s => s.supplier_name).filter(Boolean).sort(), [suppliers]);

  // Quick date range
  const getQuickDates = useCallback((range) => {
    const today = new Date();
    if (range === 'today') return { dateFrom: format(startOfDay(today), 'yyyy-MM-dd'), dateTo: format(today, 'yyyy-MM-dd') };
    if (range === 'week') return { dateFrom: format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'), dateTo: format(today, 'yyyy-MM-dd') };
    if (range === 'month') return { dateFrom: format(startOfMonth(today), 'yyyy-MM-dd'), dateTo: format(today, 'yyyy-MM-dd') };
    return { dateFrom: '', dateTo: '' };
  }, []);

  const handleQuickRange = (range) => {
    setQuickRange(range);
    const { dateFrom, dateTo } = getQuickDates(range);
    setFilters(f => ({ ...f, dateFrom, dateTo }));
    setPage(1);
  };

  // Filter & sort
  const filtered = useMemo(() => {
    let data = receipts;

    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter(r =>
        (r.supplier_name || '').toLowerCase().includes(q) ||
        (r.coffee_code || '').toLowerCase().includes(q) ||
        (r.grn_code || '').toLowerCase().includes(q) ||
        (r.dispatch_no || '').toLowerCase().includes(q)
      );
    }

    if (filters.dateFrom) data = data.filter(r => r.received_date && r.received_date >= filters.dateFrom);
    if (filters.dateTo) data = data.filter(r => r.received_date && r.received_date <= filters.dateTo);
    if (filters.supplier !== 'all') data = data.filter(r => r.supplier_name === filters.supplier);
    if (filters.grnStatus === 'entered') data = data.filter(r => r.grn_code);
    if (filters.grnStatus === 'not_entered') data = data.filter(r => !r.grn_code);
    if (filters.shrinkage !== 'all') {
      data = data.filter(r => {
        const sh = (r.warehouse_received_net_kg || 0) - (r.net_dispatch_weight_kg || 0);
        if (filters.shrinkage === 'positive') return sh > 0;
        if (filters.shrinkage === 'negative') return sh < 0;
        return sh === 0;
      });
    }
    if (filters.region !== 'all') {
      data = data.filter(r => {
        const p = purchaseByCode[r.coffee_code];
        return p?.region === filters.region;
      });
    }
    if (filters.coffeeType !== 'all') {
      data = data.filter(r => {
        const p = purchaseByCode[r.coffee_code];
        return p?.coffee_type === filters.coffeeType;
      });
    }

    // Sort
    data = [...data].sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey];
      if (sortKey === 'shrinkage') {
        av = (a.warehouse_received_net_kg || 0) - (a.net_dispatch_weight_kg || 0);
        bv = (b.warehouse_received_net_kg || 0) - (b.net_dispatch_weight_kg || 0);
      }
      if (sortKey === 'remaining') {
        av = (a.warehouse_received_net_kg || 0) - (sampleKgBySupplier[a.supplier_name] || 0) - (processingKgBySupplier[a.supplier_name] || 0);
        bv = (b.warehouse_received_net_kg || 0) - (sampleKgBySupplier[b.supplier_name] || 0) - (processingKgBySupplier[b.supplier_name] || 0);
      }
      if (av == null) av = '';
      if (bv == null) bv = '';
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });

    return data;
  }, [receipts, search, filters, sortKey, sortDir, purchaseByCode, sampleKgBySupplier, processingKgBySupplier]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const filterActiveCount = Object.entries(filters).filter(([k, v]) => {
    if (k === 'dateFrom' || k === 'dateTo') return !!v;
    return v !== 'all';
  }).length;

  // Minutes since last update
  const minutesAgo = Math.floor((new Date() - lastUpdated) / 60000);

  // --- EXPORT PDF ---
  const handleExportPDF = () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();

    // Cover page
    doc.setFillColor(18, 100, 51);
    doc.rect(0, 0, pageW, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('KKGT IMPORT & EXPORT — ETHIOPIA', pageW / 2, 18, { align: 'center' });
    doc.setFontSize(13);
    doc.text('Warehouse Receipt Report', pageW / 2, 28, { align: 'center' });
    doc.setFillColor(240, 103, 33);
    doc.rect(0, 40, pageW, 8, 'F');
    doc.setFontSize(9);
    doc.text('CONFIDENTIAL', pageW / 2, 45.5, { align: 'center' });

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${format(new Date(), 'd MMM yyyy HH:mm')}`, 20, 58);
    doc.text(`Total Records: ${filtered.length}`, 20, 65);

    // Summary
    const totalRec = receipts.length;
    const totalKg = receipts.reduce((s, r) => s + (r.warehouse_received_net_kg || 0), 0);
    const totalShrink = receipts.reduce((s, r) => s + ((r.warehouse_received_net_kg || 0) - (r.net_dispatch_weight_kg || 0)), 0);
    const grnPend = receipts.filter(r => !r.grn_code).length;

    let y = 78;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(18, 100, 51);
    doc.text('SUMMARY', 20, y); y += 7;
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Total Receipts: ${totalRec}`, 20, y); y += 6;
    doc.text(`Total Received KG: ${fmt(totalKg)} KG`, 20, y); y += 6;
    doc.text(`Total Shrinkage KG: ${totalShrink >= 0 ? '+' : ''}${fmt(totalShrink)} KG`, 20, y); y += 6;
    doc.text(`GRN Pending: ${grnPend}`, 20, y); y += 10;

    // Table
    doc.addPage();
    doc.setFillColor(18, 100, 51);
    doc.rect(0, 0, pageW, 12, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Warehouse Receipt Report — Full Table', pageW / 2, 8, { align: 'center' });

    y = 20;
    const cols = ['#', 'Coffee Code', 'Supplier', 'GRN', 'Date', 'Dispatch KG', 'Received KG', 'Shrinkage', 'Remaining'];
    const colWidths = [8, 38, 30, 20, 22, 24, 24, 22, 22];
    const startX = 10;

    doc.setFillColor(240, 103, 33);
    doc.rect(startX, y - 5, colWidths.reduce((a, b) => a + b, 0), 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    let cx = startX;
    cols.forEach((col, i) => { doc.text(col, cx + 1, y); cx += colWidths[i]; });
    y += 5;

    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    filtered.forEach((r, idx) => {
      if (y > 270) {
        doc.addPage();
        y = 15;
      }
      const sampleKg = sampleKgBySupplier[r.supplier_name] || 0;
      const procKg = processingKgBySupplier[r.supplier_name] || 0;
      const shrink = (r.warehouse_received_net_kg || 0) - (r.net_dispatch_weight_kg || 0);
      const remaining = (r.warehouse_received_net_kg || 0) - sampleKg - procKg;
      const rowData = [
        String(idx + 1),
        r.coffee_code || '—',
        r.supplier_name || '—',
        r.grn_code || '—',
        r.received_date ? format(new Date(r.received_date), 'dd/MM/yy') : '—',
        fmt(r.net_dispatch_weight_kg),
        fmt(r.warehouse_received_net_kg),
        `${shrink >= 0 ? '+' : ''}${fmt(shrink)}`,
        fmt(remaining),
      ];
      if (idx % 2 === 0) { doc.setFillColor(248, 248, 248); doc.rect(startX, y - 4, colWidths.reduce((a, b) => a + b, 0), 6, 'F'); }
      cx = startX;
      rowData.forEach((val, i) => { doc.text(val, cx + 1, y); cx += colWidths[i]; });
      y += 6;
    });

    // Totals row
    doc.setFillColor(240, 103, 33);
    doc.rect(startX, y - 4, colWidths.reduce((a, b) => a + b, 0), 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    const totalReceivedAll = filtered.reduce((s, r) => s + (r.warehouse_received_net_kg || 0), 0);
    const totalShrinkAll = filtered.reduce((s, r) => s + ((r.warehouse_received_net_kg || 0) - (r.net_dispatch_weight_kg || 0)), 0);
    const totalBags = filtered.reduce((s, r) => s + (r.bags_received || 0), 0);
    doc.text('TOTAL', startX + 1, y);
    doc.text(fmt(totalReceivedAll), startX + colWidths.slice(0, 6).reduce((a, b) => a + b, 0) + 1, y);
    doc.text(`${totalShrinkAll >= 0 ? '+' : ''}${fmt(totalShrinkAll)}`, startX + colWidths.slice(0, 7).reduce((a, b) => a + b, 0) + 1, y);

    // Watermark on last page
    doc.setTextColor(220, 220, 220);
    doc.setFontSize(50);
    doc.setFont('helvetica', 'bold');
    doc.text('CONFIDENTIAL', pageW / 2, 150, { align: 'center', angle: 45 });

    const dateStr = format(new Date(), 'dd-MM-yyyy');
    doc.save(`KKGT-Warehouse-Receipt-Report-${dateStr}.pdf`);
  };

  // --- EXPORT EXCEL ---
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Single sheet with all columns + totals row
    const allRows = filtered.map((r, idx) => {
      const sampleKg = sampleKgBySupplier[r.supplier_name] || 0;
      const procKg = processingKgBySupplier[r.supplier_name] || 0;
      const shrink = (r.warehouse_received_net_kg || 0) - (r.net_dispatch_weight_kg || 0);
      const remaining = (r.warehouse_received_net_kg || 0) - sampleKg - procKg;
      return {
        '#': idx + 1,
        'Coffee Code': r.coffee_code || '',
        'Supplier': r.supplier_name || '',
        'GRN Code': r.grn_code || '',
        'Dispatch No': r.dispatch_no || '',
        'Received Date': r.received_date ? format(new Date(r.received_date), 'd MMM yyyy') : '',
        'Dispatch KG (REF)': r.net_dispatch_weight_kg || 0,
        'Received KG': r.warehouse_received_net_kg || 0,
        'Shrinkage KG': shrink,
        'Samples KG': sampleKg,
        'Processing KG': procKg,
        'Remaining KG': remaining,
        'Bags Received': r.bags_received || 0,
        'Remark': r.remark || '',
      };
    });

    // Totals row
    const totDispatch = filtered.reduce((s, r) => s + (r.net_dispatch_weight_kg || 0), 0);
    const totReceived = filtered.reduce((s, r) => s + (r.warehouse_received_net_kg || 0), 0);
    const totShrink = filtered.reduce((s, r) => s + ((r.warehouse_received_net_kg || 0) - (r.net_dispatch_weight_kg || 0)), 0);
    const totSamples = filtered.reduce((s, r) => s + (sampleKgBySupplier[r.supplier_name] || 0), 0);
    const totProcessing = filtered.reduce((s, r) => s + (processingKgBySupplier[r.supplier_name] || 0), 0);
    const totRemaining = filtered.reduce((s, r) => s + ((r.warehouse_received_net_kg || 0) - (sampleKgBySupplier[r.supplier_name] || 0) - (processingKgBySupplier[r.supplier_name] || 0)), 0);
    const totBags = filtered.reduce((s, r) => s + (r.bags_received || 0), 0);
    allRows.push({
      '#': 'TOTAL',
      'Coffee Code': '',
      'Supplier': '',
      'GRN Code': '',
      'Dispatch No': '',
      'Received Date': '',
      'Dispatch KG (REF)': totDispatch,
      'Received KG': totReceived,
      'Shrinkage KG': totShrink,
      'Samples KG': totSamples,
      'Processing KG': totProcessing,
      'Remaining KG': totRemaining,
      'Bags Received': totBags,
      'Remark': '',
    });

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(allRows), 'Warehouse Receipts');
    const dateStr = format(new Date(), 'dd-MM-yyyy');
    XLSX.writeFile(wb, `KKGT-Warehouse-Report-${dateStr}.xlsx`);
  };

  const COLS = [
    { label: '#', key: null },
    { label: 'Coffee Code', key: 'coffee_code' },
    { label: 'Supplier', key: 'supplier_name' },
    { label: 'GRN Code', key: 'grn_code' },
    { label: 'Dispatch No', key: 'dispatch_no' },
    { label: 'Received Date', key: 'received_date' },
    { label: 'Dispatch KG (REF)', key: 'net_dispatch_weight_kg' },
    { label: 'Received KG ✓', key: 'warehouse_received_net_kg' },
    { label: 'Shrinkage KG', key: 'shrinkage' },
    { label: 'Samples KG', key: null },
    { label: 'Processing KG', key: null },
    { label: 'Remaining KG', key: 'remaining' },
    { label: 'Bags', key: 'bags_received' },
    { label: 'Remark', key: null },
  ];

  return (
    <RoleGuard allowedRoles={['admin', 'supervisor', 'purchaser']}>
      <div className="p-6">
        <PageHeader
          title="Warehouse Receipt Report"
          description="Complete history of all warehouse receipts and KG records"
        >
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <RefreshCw className="w-3 h-3" />
            Last updated: {minutesAgo === 0 ? 'just now' : `${minutesAgo} min ago`}
          </span>
          <Button
            size="sm"
            className="gap-1.5 text-xs"
            style={{ background: '#f06721' }}
            onClick={handleExportExcel}
          >
            <Download className="w-3.5 h-3.5" /> Export Excel
          </Button>
          <Button
            size="sm"
            className="gap-1.5 text-xs"
            style={{ background: '#126433' }}
            onClick={handleExportPDF}
          >
            <FileText className="w-3.5 h-3.5" /> Export PDF
          </Button>
        </PageHeader>

        {/* Summary Cards */}
        <div className="mb-6">
          <WRRSummaryCards receipts={receipts} loading={loadingReceipts} />
        </div>

        {/* Quick Date Range */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {[
            { key: 'today', label: 'Today' },
            { key: 'week', label: 'This Week' },
            { key: 'month', label: 'This Month' },
            { key: 'all', label: 'All Time' },
          ].map(r => (
            <button
              key={r.key}
              onClick={() => handleQuickRange(r.key)}
              className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                quickRange === r.key
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:border-primary hover:text-primary'
              }`}
            >
              {r.label}
            </button>
          ))}
          <span className="text-muted-foreground text-xs">|</span>
          <Input
            type="date"
            className="h-7 text-xs w-32"
            value={filters.dateFrom}
            onChange={e => { setFilters(f => ({ ...f, dateFrom: e.target.value })); setQuickRange(''); setPage(1); }}
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            className="h-7 text-xs w-32"
            value={filters.dateTo}
            onChange={e => { setFilters(f => ({ ...f, dateTo: e.target.value })); setQuickRange(''); setPage(1); }}
          />
        </div>

        {/* Search + Filter Button */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              className="pl-9 h-8 text-sm"
              placeholder="Search supplier, coffee code, GRN, dispatch..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <button
            onClick={() => setFilterOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary transition-colors relative"
            style={filterActiveCount > 0 ? { borderColor: '#f06721', color: '#f06721' } : {}}
          >
            <SlidersHorizontal className="w-4 h-4" /> Filters
            {filterActiveCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-white text-[10px] flex items-center justify-center font-bold" style={{ background: '#f06721' }}>
                {filterActiveCount}
              </span>
            )}
          </button>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden mb-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  {COLS.map(col => (
                    <TableHead
                      key={col.label}
                      className={`text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap ${col.key ? 'cursor-pointer hover:text-foreground select-none' : ''}`}
                      onClick={() => col.key && handleSort(col.key)}
                    >
                      {col.label}{col.key && <SortIcon col={col.key} sortKey={sortKey} sortDir={sortDir} />}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingReceipts ? (
                  Array(5).fill(0).map((_, i) => (
                    <TableRow key={i}>
                      {COLS.map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>)}
                    </TableRow>
                  ))
                ) : paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={COLS.length} className="text-center py-12 text-muted-foreground">
                      {search || filterActiveCount > 0 ? 'No receipts match your filters.' : 'No warehouse receipts found.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((r, i) => {
                    const sKg = sampleKgBySupplier[r.supplier_name] || 0;
                    const pKg = processingKgBySupplier[r.supplier_name] || 0;
                    const shrink = (r.warehouse_received_net_kg || 0) - (r.net_dispatch_weight_kg || 0);
                    const remaining = (r.warehouse_received_net_kg || 0) - sKg - pKg;
                    return (
                      <TableRow
                        key={r.id}
                        className="hover:bg-muted/30 cursor-pointer"
                        onClick={() => setSelectedReceipt(r)}
                      >
                        <TableCell className="text-muted-foreground text-xs">{(page - 1) * pageSize + i + 1}</TableCell>
                        <TableCell className="font-mono text-xs font-medium text-[#126433] whitespace-nowrap">{r.coffee_code || '—'}</TableCell>
                        <TableCell className="font-medium whitespace-nowrap">{r.supplier_name || '—'}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {r.grn_code
                            ? <span>{r.grn_code}</span>
                            : <span className="text-orange-500 font-medium">⚠ Not entered</span>
                          }
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground text-xs">{r.dispatch_no || '—'}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {r.received_date ? format(new Date(r.received_date), 'd MMM yyyy') : '—'}
                        </TableCell>
                        <TableCell className="text-right text-xs">{fmt(r.net_dispatch_weight_kg)}</TableCell>
                        <TableCell className="text-right font-bold text-xs">{fmt(r.warehouse_received_net_kg)}</TableCell>
                        <TableCell className={`text-right text-xs font-medium ${shrink < 0 ? 'text-destructive' : shrink > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                          {shrink === 0 ? '—' : `${shrink >= 0 ? '+' : ''}${fmt(shrink)}`}
                        </TableCell>
                        <TableCell className="text-right text-xs">{fmt(sKg)}</TableCell>
                        <TableCell className="text-right text-xs">{fmt(pKg)}</TableCell>
                        <TableCell className={`text-right font-bold text-xs ${remaining <= 0 ? 'text-destructive' : remaining < 500 ? 'text-orange-500' : 'text-green-600'}`}>
                          {fmt(remaining)}
                        </TableCell>
                        <TableCell className="text-right text-xs">{r.bags_received ?? '—'}</TableCell>
                        <TableCell className="max-w-[100px] truncate text-muted-foreground text-xs">{r.remark || '—'}</TableCell>
                      </TableRow>
                    );
                  })
                )}
                {/* Totals row — always visible at bottom of table */}
                {!loadingReceipts && filtered.length > 0 && (() => {
                  const totDispatch = filtered.reduce((s, r) => s + (r.net_dispatch_weight_kg || 0), 0);
                  const totReceived = filtered.reduce((s, r) => s + (r.warehouse_received_net_kg || 0), 0);
                  const totShrink = filtered.reduce((s, r) => s + ((r.warehouse_received_net_kg || 0) - (r.net_dispatch_weight_kg || 0)), 0);
                  const totSamples = filtered.reduce((s, r) => s + (sampleKgBySupplier[r.supplier_name] || 0), 0);
                  const totProcessing = filtered.reduce((s, r) => s + (processingKgBySupplier[r.supplier_name] || 0), 0);
                  const totRemaining = filtered.reduce((s, r) => s + ((r.warehouse_received_net_kg || 0) - (sampleKgBySupplier[r.supplier_name] || 0) - (processingKgBySupplier[r.supplier_name] || 0)), 0);
                  const totBags = filtered.reduce((s, r) => s + (r.bags_received || 0), 0);
                  return (
                    <TableRow className="font-bold text-xs border-t-2 border-border" style={{ background: '#f06721', color: '#fff' }}>
                      <TableCell colSpan={6} className="font-bold text-white text-xs">TOTALS ({filtered.length} records)</TableCell>
                      <TableCell className="text-right text-white">{fmt(totDispatch)}</TableCell>
                      <TableCell className="text-right text-white">{fmt(totReceived)}</TableCell>
                      <TableCell className="text-right text-white">{totShrink >= 0 ? '+' : ''}{fmt(totShrink)}</TableCell>
                      <TableCell className="text-right text-white">{fmt(totSamples)}</TableCell>
                      <TableCell className="text-right text-white">{fmt(totProcessing)}</TableCell>
                      <TableCell className="text-right text-white">{fmt(totRemaining)}</TableCell>
                      <TableCell className="text-right text-white">{totBags}</TableCell>
                      <TableCell className="text-white">—</TableCell>
                    </TableRow>
                  );
                })()}
              </TableBody>
            </Table>
          </div>
        </div>

        <TablePagination
          page={page}
          totalPages={totalPages}
          total={filtered.length}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSize={(s) => { setPageSize(s); setPage(1); }}
        />

        {/* Filter Panel */}
        <WRRFilterPanel
          open={filterOpen}
          onClose={() => setFilterOpen(false)}
          values={filters}
          onApply={(v) => { setFilters(v); setPage(1); }}
          onReset={() => { setFilters(DEFAULT_FILTERS); setQuickRange('all'); setPage(1); }}
          suppliers={supplierNames}
        />

        {/* Detail Panel */}
        {selectedReceipt && (
          <WRRDetailPanel
            receipt={selectedReceipt}
            purchase={purchaseByCode[selectedReceipt.coffee_code]}
            sampleKg={sampleKgBySupplier[selectedReceipt.supplier_name] || 0}
            processingKg={processingKgBySupplier[selectedReceipt.supplier_name] || 0}
            onClose={() => setSelectedReceipt(null)}
            onEdit={() => { setSelectedReceipt(null); navigate('/warehouse-receipt'); }}
          />
        )}
      </div>
    </RoleGuard>
  );
}
