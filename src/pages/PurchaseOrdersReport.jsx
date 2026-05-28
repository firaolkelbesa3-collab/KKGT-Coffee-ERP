import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRole } from '@/lib/useRole';
import { Navigate } from 'react-router-dom';
import { differenceInDays, parseISO } from 'date-fns';
import { Download, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/shared/PageHeader';
import PORDateFilter from '@/components/por/PORDateFilter';
import PORSummaryCards from '@/components/por/PORSummaryCards';
import PORFilterPanel from '@/components/por/PORFilterPanel';
import PORGroupedTable from '@/components/por/PORGroupedTable';
import PORDetailPanel from '@/components/por/PORDetailPanel';
import { exportPORPDF, exportPORExcel } from '@/lib/porExport';
import { base44 } from '@/api/supabaseClient';

const fmt = n => typeof n === 'number' ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

function getBalance(purchase) {
  let paid = 0;
  if (purchase.payment_history) {
    try {
      const ph = JSON.parse(purchase.payment_history);
      if (Array.isArray(ph)) ph.forEach(p => { paid += p.amount_etb || 0; });
    } catch {}
  }
  const grand = purchase.grand_total_etb || 0;
  return { paid, balance: grand - paid };
}

function getPaymentStatus(purchase) {
  const { paid, balance } = getBalance(purchase);
  const grand = purchase.grand_total_etb || 0;
  if (!grand) return 'Awaiting Receipt';
  if (paid === 0) return 'Unpaid';
  if (balance < -0.01) return 'Overpaid';
  if (balance < 0.01) return 'Paid';
  return 'Partial';
}

export { getBalance, getPaymentStatus, fmt };

export default function PurchaseOrdersReport() {
  const { role, isAdmin } = useRole();
  const queryClient = useQueryClient();
  const isPurchaser = role === 'purchaser';
  const canView = isAdmin || isPurchaser;

  const [dateRange, setDateRange] = useState({ from: null, to: null });
  const [search, setSearch] = useState('');
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [advFilters, setAdvFilters] = useState({});
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['por-purchases'] });
      queryClient.invalidateQueries({ queryKey: ['por-receipts'] });
      setLastUpdated(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, [queryClient]);

  const { data: purchases = [], isLoading: loadingP } = useQuery({
    queryKey: ['por-purchases'],
    queryFn: () => base44.entities.PurchaseRecord.list('-purchase_date', 2000),
  });
  const { data: receipts = [], isLoading: loadingR } = useQuery({
    queryKey: ['por-receipts'],
    queryFn: () => base44.entities.WarehouseReceipt.list('-received_date', 2000),
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list(),
  });
  const { data: processingLogs = [] } = useQuery({
    queryKey: ['por-processing'],
    queryFn: () => base44.entities.ProcessingLog.list('-date', 2000),
  });

  const isLoading = loadingP || loadingR;

  // Build enriched purchase list
  const enriched = useMemo(() => {
    const receiptMap = {};
    receipts.filter(r => !r.archived).forEach(r => {
      if (!receiptMap[r.purchase_record_id]) receiptMap[r.purchase_record_id] = r;
    });

    return purchases
      .filter(p => !p.archived)
      .map(p => {
        const receipt = receiptMap[p.id] || null;
        const { paid, balance } = getBalance(p);
        const payStatus = receipt
          ? (paid === 0 ? 'Unpaid' : balance < -0.01 ? 'Overpaid' : balance < 0.01 ? 'Paid' : 'Partial')
          : 'Awaiting Receipt';
        const days = p.purchase_date ? differenceInDays(new Date(), parseISO(p.purchase_date)) : 0;
        return { ...p, _receipt: receipt, _paid: paid, _balance: balance, _status: payStatus, _days: days };
      });
  }, [purchases, receipts]);

  // Date filter
  const dateFiltered = useMemo(() => {
    if (!dateRange.from && !dateRange.to) return enriched;
    return enriched.filter(p => {
      const d = p.purchase_date;
      if (!d) return false;
      if (dateRange.from && d < dateRange.from) return false;
      if (dateRange.to && d > dateRange.to) return false;
      return true;
    });
  }, [enriched, dateRange]);

  // Search + advanced filter
  const filtered = useMemo(() => {
    let list = dateFiltered;
    const q = search.toLowerCase();
    if (q) list = list.filter(p =>
      (p.supplier_name || '').toLowerCase().includes(q) ||
      (p.coffee_code || '').toLowerCase().includes(q) ||
      (p.agent || '').toLowerCase().includes(q)
    );
    if (advFilters.supplier) list = list.filter(p => p.supplier_name === advFilters.supplier);
    if (advFilters.region) list = list.filter(p => p.region === advFilters.region);
    if (advFilters.statuses && advFilters.statuses.length > 0) list = list.filter(p => advFilters.statuses.includes(p._status));
    if (advFilters.coffeeType) list = list.filter(p => p.coffee_type === advFilters.coffeeType);
    if (advFilters.dayRange) {
      const [min, max] = advFilters.dayRange;
      list = list.filter(p => p._days >= min && (max == null || p._days <= max));
    }
    if (advFilters.minBalance != null) list = list.filter(p => p._balance >= advFilters.minBalance);
    if (advFilters.maxBalance != null) list = list.filter(p => p._balance <= advFilters.maxBalance);
    return list;
  }, [dateFiltered, search, advFilters]);

  // Summary
  const summary = useMemo(() => {
    const all = dateFiltered;
    const totalPOs = all.length;
    const totalValue = all.reduce((s, p) => s + (p.grand_total_etb || 0), 0);
    const paid = all.filter(p => p._status === 'Paid');
    const partial = all.filter(p => p._status === 'Partial');
    const unpaid = all.filter(p => p._status === 'Unpaid');
    const awaiting = all.filter(p => p._status === 'Awaiting Receipt');
    return {
      totalPOs, totalValue,
      paidCount: paid.length, paidAmt: paid.reduce((s, p) => s + p._paid, 0),
      partialCount: partial.length, partialBalance: partial.reduce((s, p) => s + p._balance, 0),
      unpaidCount: unpaid.length, unpaidAmt: unpaid.reduce((s, p) => s + (p.grand_total_etb || 0), 0),
      awaitingCount: awaiting.length,
    };
  }, [dateFiltered]);

  const activeFilterCount = useMemo(() => {
    let c = 0;
    if (advFilters.supplier) c++;
    if (advFilters.region) c++;
    if (advFilters.statuses?.length) c++;
    if (advFilters.coffeeType) c++;
    if (advFilters.dayRange) c++;
    if (advFilters.minBalance != null || advFilters.maxBalance != null) c++;
    return c;
  }, [advFilters]);

  const minutesAgo = Math.floor((new Date() - lastUpdated) / 60000);
  const lastUpdatedLabel = minutesAgo === 0 ? 'just now' : `${minutesAgo} minute${minutesAgo > 1 ? 's' : ''} ago`;

  if (!canView) return <Navigate to="/" replace />;

  return (
    <div>
      <PageHeader
        title="Purchase Orders Report"
        description={`Complete overview of all coffee purchases and payment status · Last updated: ${lastUpdatedLabel}`}
      >
        <Button
          variant="outline"
          onClick={() => exportPORExcel({ filtered, summary, dateRange })}
          className="gap-2 border-orange-500 text-orange-600 hover:bg-orange-50"
        >
          <FileSpreadsheet className="w-4 h-4" /> Export Excel
        </Button>
        <Button
          onClick={() => exportPORPDF({ filtered, summary, dateRange })}
          className="gap-2"
          style={{ backgroundColor: '#126433' }}
        >
          <Download className="w-4 h-4" /> Export PDF
        </Button>
      </PageHeader>

      <PORDateFilter dateRange={dateRange} onChange={setDateRange} />

      <PORSummaryCards summary={summary} isLoading={isLoading} />

      <PORGroupedTable
        purchases={filtered}
        isLoading={isLoading}
        search={search}
        onSearchChange={setSearch}
        filterCount={activeFilterCount}
        onFilterOpen={() => setFilterPanelOpen(true)}
        onRowClick={setSelectedPurchase}
        processingLogs={processingLogs}
      />

      <PORFilterPanel
        open={filterPanelOpen}
        onClose={() => setFilterPanelOpen(false)}
        suppliers={suppliers}
        filters={advFilters}
        onApply={f => { setAdvFilters(f); setFilterPanelOpen(false); }}
        onReset={() => { setAdvFilters({}); setFilterPanelOpen(false); }}
      />

      {selectedPurchase && (
        <PORDetailPanel
          purchase={selectedPurchase}
          onClose={() => setSelectedPurchase(null)}
          processingLogs={processingLogs}
        />
      )}
    </div>
  );
}
