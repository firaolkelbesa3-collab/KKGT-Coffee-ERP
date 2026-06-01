import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format, startOfDay, startOfWeek, startOfMonth } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, SlidersHorizontal, FileText, Download, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { exportPDF as exportPDFReport, exportXLSX as exportXLSXReport } from '@/lib/exportUtils';

import PageHeader from '@/components/shared/PageHeader';
import TablePagination from '@/components/shared/TablePagination';
import RoleGuard from '@/components/RoleGuard';
import WRRSummaryCards from '@/components/wrr/WRRSummaryCards';
import WRRFilterPanel from '@/components/wrr/WRRFilterPanel';
import WRRDetailPanel from '@/components/wrr/WRRDetailPanel';

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

  // Build flat headers + rows for the shared report engine.
  const WRR_HEADERS = ['#', 'Coffee Code', 'Supplier', 'GRN Code', 'Dispatch No', 'Received Date',
    'Dispatch KG', 'Received KG', 'Shrinkage KG', 'Samples KG', 'Processing KG', 'Remaining KG', 'Bags', 'Remark'];
  const buildWRRRows = () => filtered.map((r, idx) => {
    const sampleKg = sampleKgBySupplier[r.supplier_name] || 0;
    const procKg = processingKgBySupplier[r.supplier_name] || 0;
    const shrink = (r.warehouse_received_net_kg || 0) - (r.net_dispatch_weight_kg || 0);
    const remaining = (r.warehouse_received_net_kg || 0) - sampleKg - procKg;
    return [
      idx + 1,
      r.coffee_code || '',
      r.supplier_name || '',
      r.grn_code || '',
      r.dispatch_no || '',
      r.received_date ? format(new Date(r.received_date), 'd MMM yyyy') : '',
      r.net_dispatch_weight_kg || 0,
      r.warehouse_received_net_kg || 0,
      shrink,
      sampleKg,
      procKg,
      remaining,
      r.bags_received || 0,
      r.remark || '',
    ];
  });
  const handleExportPDF = () => exportPDFReport('Warehouse Receipt Report', WRR_HEADERS, buildWRRRows(), true);
  const handleExportExcel = () => exportXLSXReport('warehouse-receipt-report', 'Warehouse Receipt Report', WRR_HEADERS, buildWRRRows(), true);

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
            style={{ background: '#C8873E' }}
            onClick={handleExportExcel}
          >
            <Download className="w-3.5 h-3.5" /> Export Excel
          </Button>
          <Button
            size="sm"
            className="gap-1.5 text-xs"
            style={{ background: '#6F4E37' }}
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
            style={filterActiveCount > 0 ? { borderColor: '#C8873E', color: '#C8873E' } : {}}
          >
            <SlidersHorizontal className="w-4 h-4" /> Filters
            {filterActiveCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-white text-[10px] flex items-center justify-center font-bold" style={{ background: '#C8873E' }}>
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
                        <TableCell className="font-mono text-xs font-medium text-[#6F4E37] whitespace-nowrap">{r.coffee_code || '—'}</TableCell>
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
                    <TableRow className="font-bold text-xs border-t-2 border-border" style={{ background: '#C8873E', color: '#fff' }}>
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