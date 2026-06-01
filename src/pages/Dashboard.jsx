import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import {
  ShieldOff, Warehouse, Package, Coins, AlertCircle,
  RefreshCw, TrendingUp, Users, Factory, BarChart3, ClipboardCheck,
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { calcTotalPaid, calcPaymentStatus } from '@/lib/paymentUtils';
import { Skeleton } from '@/components/ui/skeleton';
import SupplierBalancesTable from '@/components/dashboard/SupplierBalancesTable';
import RecentActivity from '@/components/dashboard/RecentActivity';
import BalanceDateFilter, { filterByDateRange } from '@/components/dashboard/BalanceDateFilter';
import { computeStockPools } from '@/lib/stockPools';
import { computeAvailabilityBySupplier } from '@/lib/availabilityUtils';

function fmt(n, d = 0) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, unit, sub, icon: Icon, accentColor = '#126433', highlight = false }) {
  return (
    <div
      className="bg-white rounded-2xl border border-border shadow-sm flex flex-col justify-between p-5 relative overflow-hidden min-w-0"
      style={{
        minHeight: 140,
        borderLeft: `4px solid ${accentColor}`,
        background: highlight ? 'hsl(28 100% 98%)' : 'white',
      }}
    >
      <div className="flex items-start justify-between gap-2 min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground leading-tight min-w-0">{label}</p>
        {Icon && (
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: highlight ? '#f0672118' : '#12643318' }}>
            <Icon className="w-4 h-4" style={{ color: accentColor }} />
          </div>
        )}
      </div>
      <div className="min-w-0 overflow-hidden">
        <div className="flex flex-col mt-2">
          <span
            className="text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight break-words min-w-0"
            style={{ color: highlight ? '#f06721' : '#126433' }}
          >
            {value}
          </span>
          {unit && <span className="text-xs text-muted-foreground font-medium mt-0.5">{unit}</span>}
        </div>
        {sub && <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">{sub}</p>}
      </div>
    </div>
  );
}

// ── Section Heading ───────────────────────────────────────────────────────────
function SectionHeading({ children, color = '#126433' }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-1 h-5 rounded-full flex-shrink-0" style={{ background: color }} />
      <p className="text-xs font-bold uppercase tracking-widest" style={{ color }}>{children}</p>
    </div>
  );
}

// ── Live Clock ────────────────────────────────────────────────────────────────
function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="tabular-nums">
      {now.toLocaleDateString('en-GB', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
      {' · '}
      {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </span>
  );
}

export default function Dashboard() {
  const [activeView, setActiveView] = useState('supplier');
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

  const filteredPurchaseRecords = useMemo(
    () => filterByDateRange(purchaseRecords, balanceRange, 'purchase_date'),
    [purchaseRecords, balanceRange]
  );

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
    return (decided.filter(i => i.result === 'Passed').length / decided.length) * 100;
  }, [inspections]);

  const confirmedCodes = useMemo(() => {
    const s = new Set();
    receipts.forEach(r => { if (r.coffee_code) s.add(r.coffee_code); });
    return s;
  }, [receipts]);

  const kpis = useMemo(() => {
    const notArchived = (x) => x?.archived !== true;
    const activePurchases = purchaseRecords.filter(notArchived);
    const activeFilteredPurchases = filteredPurchaseRecords.filter(notArchived);
    const activePurchaseCodes = new Set(activePurchases.map(p => p.coffee_code).filter(Boolean));
    const activeReceipts = receipts
      .filter(notArchived)
      .filter(r => !r.coffee_code || activePurchaseCodes.has(r.coffee_code));
    const activeSamples = sampleLogs.filter(notArchived);
    const activeProcessing = processingLogs.filter(notArchived);

    const confirmedPurchasesFiltered = activeFilteredPurchases.filter(p => confirmedCodes.has(p.coffee_code));
    const grandTotalEtb = confirmedPurchasesFiltered.reduce((s, p) => s + (p.grand_total_etb || 0), 0);
    const totalPaidEtb = confirmedPurchasesFiltered.reduce((s, p) => s + calcTotalPaid(p), 0);
    const balanceOwedEtb = Math.max(0, grandTotalEtb - totalPaidEtb);

    const confirmedPurchases = activePurchases.filter(p => confirmedCodes.has(p.coffee_code));
    const warehouseReceivedKg = activeReceipts.reduce((s, r) => s + (r.warehouse_received_net_kg || 0), 0);

    const availMap = computeAvailabilityBySupplier({
      receipts: activeReceipts,
      purchases: activePurchases,
      sampleLogs: activeSamples,
      processingLogs: activeProcessing,
    });
    const warehouseRemainingKg = Object.values(availMap).reduce((total, v) => total + v.availableKg, 0);
    const totalProcessingKg = activeProcessing.reduce((s, p) => s + (p.actual_weighed_kg ?? p.kg_sent ?? 0), 0);

    const activeOutputReports = outputReports.filter(notArchived);
    const totalKgProcessed = activeOutputReports.reduce((s, r) => s + (r.total_kg_processed || 0), 0);
    const totalRejectKg = activeOutputReports.reduce((s, r) => s + (r.reject_kg || 0), 0);
    const overallRejectPct = totalKgProcessed > 0 ? (totalRejectKg / totalKgProcessed) * 100 : 0;

    const supplierStatusMap = {};
    confirmedPurchases.forEach(p => {
      if (!p.supplier_name || !p.grand_total_etb) return;
      const k = p.supplier_name;
      if (!supplierStatusMap[k]) supplierStatusMap[k] = { grandTotal: 0, paid: 0 };
      supplierStatusMap[k].grandTotal += p.grand_total_etb || 0;
      supplierStatusMap[k].paid += calcTotalPaid(p);
    });
    let fullyPaidCount = 0, partiallyPaidCount = 0;
    Object.values(supplierStatusMap).forEach(({ grandTotal, paid }) => {
      const status = calcPaymentStatus(grandTotal, paid);
      if (status === 'Paid') fullyPaidCount++;
      else if (status === 'Partial') partiallyPaidCount++;
    });

    const completedContracts = exportContracts.filter(c => c.status === 'Completed');
    const exportProfitEtb = completedContracts.reduce((s, c) => s + (c.total_profit_etb ?? c.profit_etb ?? 0), 0);
    const uniqueSupplierNames = new Set(confirmedPurchases.map(p => p.supplier_name).filter(Boolean));
    const suppliersCount = uniqueSupplierNames.size;
    const payPct = grandTotalEtb > 0 ? Math.min(100, (totalPaidEtb / grandTotalEtb) * 100) : 0;

    return {
      warehouseReceivedKg, warehouseRemainingKg, grandTotalEtb, balanceOwedEtb, totalPaidEtb,
      totalProcessingKg, exportProfitEtb, suppliersCount, fullyPaidCount, partiallyPaidCount,
      payPct, overallRejectPct,
    };
  }, [purchaseRecords, filteredPurchaseRecords, confirmedCodes, receipts, sampleLogs, processingLogs, outputReports, exportContracts]);

  const exportSummary = useMemo(() => {
    const activeContracts = exportContracts.filter(c => c?.archived !== true);
    const activeOutputs = outputReports.filter(r => r?.archived !== true);
    const totalContracts = activeContracts.length;
    const totalUsd = activeContracts.reduce((s, c) => s + (c.total_export_value_usd || 0), 0);
    const totalEtb = activeContracts.reduce((s, c) => s + (c.total_export_value_etb || c.export_total_sales_price_etb || 0), 0);
    const totalProfitEtb = activeContracts.reduce((s, c) => s + (c.profit_etb ?? c.total_profit_etb ?? 0), 0);
    const totalOutstandingUsd = activeContracts.reduce((s, c) => s + Math.max(0, (c.total_export_value_usd || 0) - (c.total_received_usd || 0)), 0);
    const avgProfit = totalContracts > 0 ? totalProfitEtb / totalContracts : 0;
    const kgByCoffeeType = {};
    activeContracts.forEach(c => {
      const ct = c.coffee_type || c.commodity;
      if (ct) kgByCoffeeType[ct] = (kgByCoffeeType[ct] || 0) + (c.export_kg || 0);
    });
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

  return (
    <div className="space-y-6 pb-8">
      {accessDenied && (
        <div className="flex items-center gap-3 bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3 text-destructive text-sm font-medium">
          <ShieldOff className="h-4 w-4 flex-shrink-0" />
          You do not have access to that screen.
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground tracking-tight">
            Supply Chain Dashboard
          </h1>
          <p className="text-xs text-muted-foreground mt-1 font-medium">
            <LiveClock />
          </p>
        </div>
        {/* Segmented control */}
        <div
          className="flex rounded-xl overflow-hidden border border-border shadow-sm w-fit flex-shrink-0"
          style={{ background: '#f4f4f4' }}
        >
          {['supplier', 'export'].map(v => (
            <button
              key={v}
              onClick={() => setActiveView(v)}
              className="px-4 py-2 text-xs font-bold uppercase tracking-wide transition-all duration-150"
              style={activeView === v
                ? { background: '#126433', color: 'white' }
                : { background: 'transparent', color: '#888' }
              }
            >
              {v === 'supplier' ? 'Supplier View' : 'Export View'}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array(7).fill(0).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-border shadow-sm p-5 space-y-3" style={{ minHeight: 140 }}>
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-8 w-28" />
              <Skeleton className="h-2.5 w-16" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Balance date filter */}
          <BalanceDateFilter
            from={balanceRange.from || ''}
            to={balanceRange.to || ''}
            onChange={({ from, to }) => setBalanceRange({ from: from || null, to: to || null })}
          />

          {/* ── Stock & Financials ── */}
          <div>
            <SectionHeading color="#126433">Stock &amp; Financials</SectionHeading>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 min-w-0">
              <KpiCard
                label="Warehouse Received"
                value={fmt(kpis.warehouseReceivedKg)}
                unit="KG"
                sub="Total received at warehouse"
                icon={Warehouse}
                accentColor="#126433"
              />
              <KpiCard
                label="Remaining Stock"
                value={fmt(Math.max(0, kpis.warehouseRemainingKg))}
                unit="KG"
                sub="Available in warehouse"
                icon={Package}
                accentColor="#126433"
              />
              <KpiCard
                label="Grand Total"
                value={fmt(kpis.grandTotalEtb)}
                unit="ETB"
                sub="Confirmed warehouse purchases"
                icon={Coins}
                accentColor="#126433"
              />
              <KpiCard
                label="Balance Owed"
                value={fmt(kpis.balanceOwedEtb)}
                unit="ETB"
                sub="Outstanding payments"
                icon={AlertCircle}
                accentColor="#f06721"
                highlight={kpis.balanceOwedEtb > 0}
              />
            </div>
            {/* Second row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 min-w-0">
              <KpiCard
                label="Recleaned Stock"
                value={fmt(totalRecleanedKg)}
                unit="KG"
                sub="Pool 2 — across all coffee types"
                icon={RefreshCw}
                accentColor="#f06721"
              />
              <KpiCard
                label="Pending Inspections"
                value={pendingInspections}
                sub="Inspections with no result yet"
                icon={ClipboardCheck}
                accentColor={pendingInspections > 0 ? '#f06721' : '#126433'}
                highlight={pendingInspections > 0}
              />
            </div>
          </div>

          {/* ── Operations ── */}
          <div>
            <SectionHeading color="#126433">Operations</SectionHeading>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 min-w-0">
              <KpiCard
                label="KG Sent to Processing"
                value={fmt(kpis.totalProcessingKg)}
                unit="KG"
                sub="Cumulative processing input"
                icon={Factory}
                accentColor="#126433"
              />
              <KpiCard
                label="Export Profit (Completed)"
                value={fmt(kpis.exportProfitEtb)}
                unit="ETB"
                sub="Profit from completed contracts"
                icon={TrendingUp}
                accentColor="#126433"
              />
              <KpiCard
                label="Suppliers"
                value={kpis.suppliersCount}
                sub={`${kpis.fullyPaidCount} fully paid · ${kpis.partiallyPaidCount} partial`}
                icon={Users}
                accentColor="#126433"
              />
            </div>
          </div>

          {/* ── Payment Progress ── */}
          <div>
            <SectionHeading color="#126433">Payment Progress</SectionHeading>
            <div className="bg-white rounded-2xl border border-border shadow-sm p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-0.5">Total Paid</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold" style={{ color: '#126433' }}>{fmt(kpis.totalPaidEtb)}</span>
                    <span className="text-sm text-muted-foreground font-medium">ETB</span>
                    <span className="text-sm text-muted-foreground">of {fmt(kpis.grandTotalEtb)} ETB</span>
                  </div>
                </div>
                <div
                  className="px-4 py-2 rounded-xl font-bold text-lg flex-shrink-0"
                  style={{ background: '#12643318', color: '#126433' }}
                >
                  {kpis.payPct.toFixed(1)}%
                </div>
              </div>
              <div className="w-full h-4 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${kpis.payPct}%`, background: 'linear-gradient(90deg, #126433, #1a8a47)' }}
                />
              </div>
              <div className="flex justify-between mt-2 text-xs">
                <span className="text-muted-foreground">ETB 0</span>
                <span className={`font-semibold ${kpis.balanceOwedEtb > 0 ? '' : 'text-green-700'}`}
                  style={kpis.balanceOwedEtb > 0 ? { color: '#f06721' } : {}}>
                  {kpis.balanceOwedEtb > 0 ? `${fmt(kpis.balanceOwedEtb)} ETB remaining` : '✓ Fully settled'}
                </span>
              </div>
            </div>
          </div>

          {/* ── View-specific ── */}
          {activeView === 'supplier' && (
            <div>
              <SectionHeading color="#126433">Supplier Balances</SectionHeading>
              <SupplierBalancesTable dateRange={balanceRange} />
            </div>
          )}

          {activeView === 'export' && (
            <div className="space-y-6">
              <div>
                <SectionHeading color="#126433">Export Profitability</SectionHeading>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <KpiCard label="Total Contracts" value={exportSummary.totalContracts} sub="All export contracts" icon={BarChart3} accentColor="#126433" />
                  <KpiCard label="Total Export Value USD" value={`$${fmt(exportSummary.totalUsd)}`} sub="USD across all contracts" icon={TrendingUp} accentColor="#126433" />
                  <KpiCard label="Total Export Value ETB" value={fmt(exportSummary.totalEtb)} unit="ETB" sub="ETB at contract rates" icon={Coins} accentColor="#126433" />
                  <KpiCard label="Total Profit ETB" value={fmt(exportSummary.totalProfitEtb)} unit="ETB" sub="Cumulative ETB profit" icon={TrendingUp} accentColor="#126433" />
                  <KpiCard label="Outstanding USD" value={`$${fmt(exportSummary.totalOutstandingUsd)}`} sub="Unpaid export receivables" icon={AlertCircle} accentColor="#f06721" highlight={exportSummary.totalOutstandingUsd > 0} />
                  <KpiCard label="Avg Profit / Contract" value={fmt(exportSummary.avgProfit)} unit="ETB" sub="Average per contract" icon={BarChart3} accentColor="#126433" />
                </div>
              </div>

              {Object.keys(exportSummary.kgByCoffeeType).length > 0 && (
                <div className="bg-white rounded-2xl border border-border shadow-sm p-5">
                  <SectionHeading color="#126433">Exported KG by Coffee Type</SectionHeading>
                  <div className="space-y-2.5">
                    {Object.entries(exportSummary.kgByCoffeeType).map(([ct, kg]) => (
                      <div key={ct} className="flex items-center justify-between text-sm py-1 border-b border-border/40 last:border-0">
                        <span className="text-muted-foreground">{ct}</span>
                        <span className="font-semibold text-foreground">{fmt(kg, 0)} KG</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {Object.keys(exportSummary.availableStock).length > 0 && (
                <div className="bg-white rounded-2xl border border-border shadow-sm p-5">
                  <SectionHeading color="#126433">Available Stock (Ready to Export)</SectionHeading>
                  <div className="space-y-2.5">
                    {Object.entries(exportSummary.availableStock).map(([ct, kg]) => (
                      <div key={ct} className="flex items-center justify-between text-sm py-1 border-b border-border/40 last:border-0">
                        <span className="text-muted-foreground">{ct}</span>
                        <span className={`font-semibold ${kg > 0 ? '' : 'text-muted-foreground'}`}
                          style={kg > 0 ? { color: '#126433' } : {}}>
                          {fmt(kg, 0)} KG {kg === 0 ? '(fully exported)' : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <KpiCard
                  label="Total Inspection Sample KG"
                  value={fmt(totalInspectionSampleKg)}
                  unit="KG"
                  sub="Deducted this season across all coffee types"
                  icon={ClipboardCheck}
                  accentColor="#126433"
                />
                <KpiCard
                  label="Inspection Pass Rate"
                  value={`${passRate.toFixed(1)}%`}
                  sub={`${inspections.filter(i => i.result === 'Passed').length} passed / ${inspections.filter(i => i.result === 'Passed' || i.result === 'Failed').length} decided`}
                  icon={ClipboardCheck}
                  accentColor={passRate >= 80 ? '#126433' : '#f06721'}
                />
              </div>

              <div className="bg-white rounded-2xl border border-border shadow-sm p-5">
                <SectionHeading color="#126433">Overall Reject Rate</SectionHeading>
                <div className="flex items-baseline gap-2">
                  <span className="font-bold" style={{ fontSize: '2rem', color: kpis.overallRejectPct === 0 ? '#126433' : '#ef4444' }}>
                    {kpis.overallRejectPct.toFixed(1)}%
                  </span>
                  <span className="text-sm text-muted-foreground">of total processed KG</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{kpis.overallRejectPct === 0 ? 'No rejects recorded' : 'Lower is better'}</p>
              </div>
            </div>
          )}
        </>
      )}

      <RecentActivity />
    </div>
  );
}