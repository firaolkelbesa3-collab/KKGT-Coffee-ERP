import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { calcTotalPaid, calcPaymentStatus } from '@/lib/paymentUtils';
import { Skeleton } from '@/components/ui/skeleton';
import SupplierBalancesTable from '@/components/dashboard/SupplierBalancesTable';
import RecentActivity from '@/components/dashboard/RecentActivity';
import BalanceDateFilter, { filterByDateRange } from '@/components/dashboard/BalanceDateFilter';
import { computeStockPools } from '@/lib/stockPools';

function fmt(n, d = 0) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function KpiCard({ label, value, unit, sub, accentLeft, amberValue }) {
  return (
    <div
      className="bg-muted/60 rounded-xl px-4 py-3 flex flex-col gap-0.5 relative overflow-hidden"
      style={accentLeft ? { borderLeft: '3px solid #f06721' } : {}}
    >
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
      <div className="flex items-baseline gap-1.5 min-w-0">
        <span className={`text-xl sm:text-2xl font-bold leading-tight truncate min-w-0 ${amberValue ? 'text-amber-600' : 'text-foreground'}`}>{value}</span>
        {unit && <span className="text-xs text-muted-foreground font-medium flex-shrink-0">{unit}</span>}
      </div>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{sub}</p>}
    </div>
  );
}

export default function Dashboard() {
  const [activeView, setActiveView] = useState('supplier'); // 'supplier' | 'export'
  const [balanceRange, setBalanceRange] = useState({ from: null, to: null });
  const location = useLocation();
  const accessDenied = location.state?.accessDenied;

  const { data: purchaseRecords = [], isLoading: l1 } = useQuery({
    queryKey: ['purchase-records'],
    queryFn: () => base44.entities.PurchaseRecord.list('-created_date', 500),
    staleTime: 60000,
  });
  const { data: receipts = [], isLoading: l2 } = useQuery({
    queryKey: ['warehouse-receipts'],
    queryFn: () => base44.entities.WarehouseReceipt.list('-created_date', 500),
    staleTime: 60000,
  });
  const { data: sampleLogs = [], isLoading: l3 } = useQuery({
    queryKey: ['sample-logs'],
    queryFn: () => base44.entities.SampleLog.list(),
    staleTime: 60000,
  });
  const { data: processingLogs = [], isLoading: l4 } = useQuery({
    queryKey: ['processing-logs'],
    queryFn: () => base44.entities.ProcessingLog.list(),
    staleTime: 60000,
  });
  const { data: outputReports = [], isLoading: l5 } = useQuery({
    queryKey: ['output-reports'],
    queryFn: () => base44.entities.OutputReport.list(),
    staleTime: 60000,
  });
  const { data: suppliers = [], isLoading: l6 } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list(),
    staleTime: 60000,
  });
  const { data: exportContracts = [], isLoading: l7 } = useQuery({
    queryKey: ['export-contracts'],
    queryFn: () => base44.entities.ExportContract.list('-export_date', 500),
    staleTime: 60000,
  });
  const { data: inspections = [], isLoading: l8 } = useQuery({
    queryKey: ['buyer-inspections'],
    queryFn: () => base44.entities.BuyerInspection.list(),
    staleTime: 60000,
  });

  const isLoading = l1 || l2 || l3 || l4 || l5 || l6 || l7 || l8;

  // Apply Balance date filter to purchase records (used for Balance Owed KPI, Payment Progress, and supplier table)
  const filteredPurchaseRecords = useMemo(
    () => filterByDateRange(purchaseRecords, balanceRange, 'purchase_date'),
    [purchaseRecords, balanceRange]
  );

  // Two-pool computation for dashboard KPIs
  const stockPools = useMemo(
    () => computeStockPools({ outputReports, contracts: exportContracts, inspections, sampleLogs }),
    [outputReports, exportContracts, inspections, sampleLogs]
  );
  const totalRecleanedKg = useMemo(
    () => Object.values(stockPools.recleaned).reduce((s, v) => s + (v || 0), 0),
    [stockPools]
  );
  const pendingInspections = useMemo(
    () => inspections.filter(i => (i.result || 'Pending') === 'Pending').length,
    [inspections]
  );
  const totalInspectionSampleKg = useMemo(
    () => inspections.reduce((s, i) => s + (i.sample_kg_taken || 0), 0),
    [inspections]
  );
  const passRate = useMemo(() => {
    const decided = inspections.filter(i => i.result === 'Passed' || i.result === 'Failed');
    if (decided.length === 0) return 0;
    const passed = decided.filter(i => i.result === 'Passed').length;
    return (passed / decided.length) * 100;
  }, [inspections]);

  // "Confirmed" = has a linked warehouse receipt (regardless of GRN status)
  const confirmedCodes = useMemo(() => {
    const s = new Set();
    receipts.forEach(r => { if (r.coffee_code) s.add(r.coffee_code); });
    return s;
  }, [receipts]);

  const kpis = useMemo(() => {
    // Archived records are excluded from all KPI calculations
    const notArchived = (x) => x?.archived !== true;
    const activePurchases = purchaseRecords.filter(notArchived);
    const activeFilteredPurchases = filteredPurchaseRecords.filter(notArchived);
    // Only count warehouse receipts whose linked purchase is also active (non-archived)
    const activePurchaseCodes = new Set(activePurchases.map(p => p.coffee_code).filter(Boolean));
    const activeReceipts = receipts
      .filter(notArchived)
      .filter(r => !r.coffee_code || activePurchaseCodes.has(r.coffee_code));
    const activeSamples = sampleLogs.filter(notArchived);
    const activeProcessing = processingLogs.filter(notArchived);

    // Date-filtered subset used for Balance Owed, Grand Total (shown alongside) and Payment Progress
    const confirmedPurchasesFiltered = activeFilteredPurchases.filter(p => confirmedCodes.has(p.coffee_code));
    const grandTotalEtb = confirmedPurchasesFiltered.reduce((s, p) => s + (p.grand_total_etb || 0), 0);
    const totalPaidEtb = confirmedPurchasesFiltered.reduce((s, p) => s + calcTotalPaid(p), 0);
    const balanceOwedEtb = Math.max(0, grandTotalEtb - totalPaidEtb);

    // Unfiltered confirmed purchases — used for stats that should stay all-time (supplier counts, etc.)
    const confirmedPurchases = activePurchases.filter(p => confirmedCodes.has(p.coffee_code));

    const warehouseReceivedKg = activeReceipts.reduce((s, r) => s + (r.warehouse_received_net_kg || 0), 0);
    const totalSamplesKg = activeSamples.reduce((s, l) => s + (l.sample_kg || 0), 0);
    const totalProcessingKg = activeProcessing.reduce((s, p) => s + (p.actual_weighed_kg ?? p.kg_sent ?? 0), 0);
    // Remaining = all received minus samples minus processing (unprocessed lots still count as remaining stock)
    const warehouseRemainingKg = warehouseReceivedKg - totalSamplesKg - totalProcessingKg;

    const activeOutputReports = outputReports.filter(notArchived);
    const totalKgProcessed = activeOutputReports.reduce((s, r) => s + (r.total_kg_processed || 0), 0);
    const totalRejectKg = activeOutputReports.reduce((s, r) => s + (r.reject_kg || 0), 0);
    const overallRejectPct = totalKgProcessed > 0 ? (totalRejectKg / totalKgProcessed) * 100 : 0;

    // Supplier payment counts — grouped by supplier name
    const supplierStatusMap = {};
    confirmedPurchases.forEach(p => {
      if (!p.supplier_name || !p.grand_total_etb) return;
      const k = p.supplier_name;
      if (!supplierStatusMap[k]) supplierStatusMap[k] = { grandTotal: 0, paid: 0 };
      supplierStatusMap[k].grandTotal += p.grand_total_etb || 0;
      supplierStatusMap[k].paid += calcTotalPaid(p);
    });
    let fullyPaidCount = 0;
    let partiallyPaidCount = 0;
    Object.values(supplierStatusMap).forEach(({ grandTotal, paid }) => {
      const status = calcPaymentStatus(grandTotal, paid);
      if (status === 'Paid') fullyPaidCount++;
      else if (status === 'Partial') partiallyPaidCount++;
    });

    // Export profit from completed contracts
    const completedContracts = exportContracts.filter(c => c.status === 'Completed');
    const exportProfitEtb = completedContracts.reduce((s, c) => s + (c.total_profit_etb ?? c.profit_etb ?? 0), 0);

    // Unique suppliers count
    const uniqueSupplierNames = new Set(activePurchases.map(p => p.supplier_name).filter(Boolean));
    const suppliersCount = uniqueSupplierNames.size;

    const payPct = grandTotalEtb > 0 ? Math.min(100, (totalPaidEtb / grandTotalEtb) * 100) : 0;

    return {
      warehouseReceivedKg, warehouseRemainingKg, grandTotalEtb, balanceOwedEtb, totalPaidEtb,
      totalProcessingKg, exportProfitEtb, suppliersCount, fullyPaidCount, partiallyPaidCount,
      payPct, overallRejectPct,
    };
  }, [purchaseRecords, filteredPurchaseRecords, confirmedCodes, receipts, sampleLogs, processingLogs, outputReports, exportContracts]);

  // Export profitability summary
  const exportSummary = useMemo(() => {
    const activeContracts = exportContracts.filter(c => c?.archived !== true);
    const activeOutputs = outputReports.filter(r => r?.archived !== true);
    const totalContracts = activeContracts.length;
    const totalUsd = activeContracts.reduce((s, c) => s + (c.total_export_value_usd || 0), 0);
    const totalEtb = activeContracts.reduce((s, c) => s + (c.total_export_value_etb || c.export_total_sales_price_etb || 0), 0);
    const totalProfitEtb = activeContracts.reduce((s, c) => s + (c.profit_etb ?? c.total_profit_etb ?? 0), 0);
    const totalOutstandingUsd = activeContracts.reduce((s, c) => s + Math.max(0, (c.total_export_value_usd || 0) - (c.total_received_usd || 0)), 0);
    const avgProfit = totalContracts > 0 ? totalProfitEtb / totalContracts : 0;

    // KG per coffee type
    const kgByCoffeeType = {};
    activeContracts.forEach(c => {
      const ct = c.coffee_type || c.commodity;
      if (ct) kgByCoffeeType[ct] = (kgByCoffeeType[ct] || 0) + (c.export_kg || 0);
    });

    // Available stock per coffee type
    const outputKg = {};
    activeOutputs.forEach(r => {
      const ct = r.coffee_type;
      if (ct) outputKg[ct] = (outputKg[ct] || 0) + (r.export_kg || 0);
    });
    const contractKg = {};
    activeContracts.forEach(c => {
      const ct = c.coffee_type || c.commodity;
      if (ct) contractKg[ct] = (contractKg[ct] || 0) + (c.export_kg || 0);
    });
    const availableStock = {};
    const allTypes = new Set([...Object.keys(outputKg), ...Object.keys(contractKg)]);
    allTypes.forEach(ct => { availableStock[ct] = Math.max(0, (outputKg[ct] || 0) - (contractKg[ct] || 0)); });

    return { totalContracts, totalUsd, totalEtb, totalProfitEtb, avgProfit, totalOutstandingUsd, kgByCoffeeType, availableStock };
  }, [exportContracts, outputReports]);

  const SectionLabel = ({ children }) => (
    <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: '#126433', letterSpacing: '0.12em' }}>
      {children}
    </p>
  );

  return (
    <div className="space-y-7 pb-6">
        {accessDenied && (
          <div className="flex items-center gap-3 bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3 text-destructive text-sm font-medium">
            <ShieldOff className="h-4 w-4 flex-shrink-0" />
            You do not have access to that screen.
          </div>
        )}
        {/* Header + view toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">Dashboard</h1>
            <p className="text-xs text-muted-foreground mt-0.5">KKGT Supply Chain Overview</p>
          </div>
          <div className="flex gap-1 bg-muted/60 p-1 rounded-lg w-fit">
            <button
              onClick={() => setActiveView('supplier')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${activeView === 'supplier' ? 'bg-white shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Supplier View
            </button>
            <button
              onClick={() => setActiveView('export')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${activeView === 'export' ? 'bg-white shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Export View
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array(7).fill(0).map((_, i) => (
              <div key={i} className="bg-muted/60 rounded-xl px-4 py-3 space-y-2">
                <Skeleton className="h-2 w-16" />
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-2 w-20" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Balance date filter — affects Balance Owed, Payment Progress, and Supplier Balances table */}
            <BalanceDateFilter
              from={balanceRange.from || ''}
              to={balanceRange.to || ''}
              onChange={({ from, to }) => setBalanceRange({ from: from || null, to: to || null })}
            />

            {/* Row 1: 4 KPI cards */}
            <div>
              <SectionLabel>Stock & Financials</SectionLabel>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard
                  label="Warehouse Received"
                  value={fmt(kpis.warehouseReceivedKg)}
                  unit="KG"
                  sub="Total received at warehouse"
                />
                <KpiCard
                   label="Remaining Stock"
                   value={fmt(Math.max(0, kpis.warehouseRemainingKg))}
                   unit="KG"
                   sub={`${fmt(Math.max(0, kpis.warehouseRemainingKg))} KG remaining in warehouse`}
                 />
                <KpiCard
                  label="Grand Total"
                  value={fmt(kpis.grandTotalEtb)}
                  unit="ETB"
                  sub="Confirmed warehouse purchases"
                />
                <KpiCard
                  label="Balance Owed"
                  value={fmt(kpis.balanceOwedEtb)}
                  unit="ETB"
                  sub="Outstanding payments"
                  accentLeft
                  amberValue={kpis.balanceOwedEtb > 0}
                />
                <KpiCard
                  label="Recleaned Stock"
                  value={fmt(totalRecleanedKg)}
                  unit="KG"
                  sub="Pool 2 — across all coffee types"
                  amberValue={true}
                />
                <KpiCard
                  label="Pending Inspections"
                  value={pendingInspections}
                  sub="Inspections with no result yet"
                  amberValue={pendingInspections > 0}
                />
              </div>
            </div>

            {/* Row 2: 3 KPI cards */}
            <div>
              <SectionLabel>Operations</SectionLabel>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <KpiCard
                  label="KG Sent to Processing"
                  value={fmt(kpis.totalProcessingKg)}
                  unit="KG"
                  sub="Cumulative processing input"
                />
                <KpiCard
                  label="Export Profit (Completed)"
                  value={fmt(kpis.exportProfitEtb)}
                  unit="ETB"
                  sub="Profit from completed contracts"
                />
                <KpiCard
                  label="Suppliers"
                  value={kpis.suppliersCount}
                  sub={`${kpis.fullyPaidCount} fully paid · ${kpis.partiallyPaidCount} partial`}
                />
              </div>
            </div>

            {/* Payment progress bar */}
            <div>
              <SectionLabel>Payment Progress</SectionLabel>
              <div className="bg-muted/60 rounded-xl px-4 py-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{fmt(kpis.totalPaidEtb)} ETB</span> paid of {fmt(kpis.grandTotalEtb)} ETB total
                  </span>
                  <span className="text-xs font-bold" style={{ color: '#126433' }}>{kpis.payPct.toFixed(1)}% of total paid</span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${kpis.payPct}%`, backgroundColor: '#126433' }}
                  />
                </div>
                <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground">
                  <span>ETB 0</span>
                  <span className={kpis.balanceOwedEtb > 0 ? 'text-amber-600 font-semibold' : 'text-green-700 font-semibold'}>
                    {kpis.balanceOwedEtb > 0 ? `${fmt(kpis.balanceOwedEtb)} ETB remaining` : 'Fully settled ✓'}
                  </span>
                </div>
              </div>
            </div>

            {/* View-specific sections */}
            {activeView === 'supplier' && (
              <SupplierBalancesTable dateRange={balanceRange} />
            )}

            {activeView === 'export' && (
              <div className="space-y-4">
                <SectionLabel>Export Profitability</SectionLabel>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <KpiCard label="Total Contracts" value={exportSummary.totalContracts} sub="All export contracts" />
                  <KpiCard label="Total Export Value USD" value={`$${fmt(exportSummary.totalUsd)}`} sub="USD across all contracts" />
                  <KpiCard label="Total Export Value ETB" value={fmt(exportSummary.totalEtb)} unit="ETB" sub="ETB at contract rates" />
                  <KpiCard label="Total Profit ETB" value={fmt(exportSummary.totalProfitEtb)} unit="ETB" sub="Cumulative ETB profit" accentLeft />
                  <KpiCard label="Outstanding USD" value={`$${fmt(exportSummary.totalOutstandingUsd)}`} sub="Unpaid export receivables" amberValue={exportSummary.totalOutstandingUsd > 0} />
                  <KpiCard label="Avg Profit / Contract" value={fmt(exportSummary.avgProfit)} unit="ETB" sub="Average per contract" />
                </div>

                {/* Exported KG per coffee type */}
                {Object.keys(exportSummary.kgByCoffeeType).length > 0 && (
                  <div className="bg-muted/60 rounded-xl px-4 py-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: '#126433' }}>Exported KG by Coffee Type</p>
                    <div className="space-y-2">
                      {Object.entries(exportSummary.kgByCoffeeType).map(([ct, kg]) => (
                        <div key={ct} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{ct}</span>
                          <span className="font-semibold">{fmt(kg, 0)} KG</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Available stock */}
                {Object.keys(exportSummary.availableStock).length > 0 && (
                  <div className="bg-muted/60 rounded-xl px-4 py-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: '#126433' }}>Available Stock (Ready to Export)</p>
                    <div className="space-y-2">
                      {Object.entries(exportSummary.availableStock).map(([ct, kg]) => (
                        <div key={ct} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{ct}</span>
                          <span className={`font-semibold ${kg > 0 ? 'text-green-700' : 'text-muted-foreground'}`}>{fmt(kg, 0)} KG {kg === 0 ? '(fully exported)' : ''}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Buyer Inspection KPIs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <KpiCard
                    label="Total Inspection Sample KG"
                    value={fmt(totalInspectionSampleKg)}
                    unit="KG"
                    sub="Deducted this season across all coffee types"
                  />
                  <KpiCard
                    label="Inspection Pass Rate"
                    value={`${passRate.toFixed(1)}%`}
                    sub={`${inspections.filter(i => i.result === 'Passed').length} passed / ${inspections.filter(i => i.result === 'Passed' || i.result === 'Failed').length} decided`}
                  />
                </div>

                <div className="bg-muted/60 rounded-xl px-4 py-3">
                  <SectionLabel>Overall Reject Rate</SectionLabel>
                  <div className="flex items-baseline gap-2">
                    <span className={`text-2xl font-bold ${kpis.overallRejectPct === 0 ? 'text-green-700' : 'text-destructive'}`}>
                      {kpis.overallRejectPct.toFixed(1)}%
                    </span>
                    <span className="text-xs text-muted-foreground">of total processed KG</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">{kpis.overallRejectPct === 0 ? 'No rejects recorded' : 'Lower is better'}</p>
                </div>
              </div>
            )}
          </>
        )}

        {/* Recent Activity feed — visible to all admins */}
        <RecentActivity />
      </div>
  );
}