import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/shared/PageHeader';
import { Input } from '@/components/ui/input';
import { Search, RefreshCw, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { exportXLSX } from '@/lib/exportUtils';
import FilterPanel, { FilterButton } from '@/components/shared/FilterPanel';
import RoleGuard from '@/components/RoleGuard';
import { format } from 'date-fns';
import { computeStockPools } from '@/lib/stockPools';
import { computeAvailabilityBySupplier } from '@/lib/availabilityUtils';
import CoffeePoolsCard from '@/components/stock/CoffeePoolsCard';

function fmt(n, d = 0) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

// ── Coffee Type Card ──────────────────────────────────────────────────────────
function CoffeeTypeCard({ data, lastRefresh }) {
  const { coffeeType, supplierCount, receivedKg, processedKg, samplesKg, remainingKg, exportedKg, exportBags, rejectedKg, rejectBags, wasteKg } = data;

  const processedPct = receivedKg > 0 ? Math.min(100, (processedKg / receivedKg) * 100) : 0;
  const exportPct = processedKg > 0 ? (exportedKg / processedKg) * 100 : 0;
  const rejectPct = processedKg > 0 ? (rejectedKg / processedKg) * 100 : 0;

  const barColor = processedPct >= 95 ? '#ef4444' : processedPct >= 80 ? '#f59e0b' : '#22c55e';

  const rejectColor = rejectPct > 20 ? 'text-red-600 font-bold' : rejectPct >= 10 ? 'text-amber-600 font-semibold' : 'text-green-700 font-semibold';
  const wasteColor = wasteKg < 0 ? 'text-red-600 font-bold' : wasteKg > 500 ? 'text-amber-600 font-semibold' : 'text-green-700 font-semibold';
  const wastePrefix = wasteKg < 0 ? '⚠️ ' : wasteKg > 500 ? '⚠️ ' : '';

  return (
    <div className="rounded-xl border border-border overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="px-5 py-4" style={{ backgroundColor: '#6F4E37' }}>
        <p className="text-white font-bold text-lg leading-tight">{coffeeType}</p>
        <p className="text-white/70 text-xs mt-0.5">{supplierCount} supplier{supplierCount !== 1 ? 's' : ''}</p>
      </div>

      {/* KPI row */}
      <div className="bg-card px-5 pt-4 pb-3">
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: 'RECEIVED', value: fmt(receivedKg), color: 'text-foreground' },
            { label: 'PROCESSED', value: fmt(processedKg), color: 'text-blue-700' },
            { label: 'REMAINING', value: fmt(Math.max(0, remainingKg)), color: remainingKg < 0 ? 'text-red-600' : remainingKg < 5000 ? 'text-amber-600' : 'text-green-700' },
          ].map(kpi => (
            <div key={kpi.label} className="text-center">
              <p className={`text-xl sm:text-2xl font-bold leading-tight ${kpi.color}`}>{kpi.value}</p>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mt-1">{kpi.label}</p>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="h-2.5 rounded-full bg-muted overflow-hidden mb-1.5">
          <div className="h-full rounded-full transition-all" style={{ width: `${processedPct}%`, backgroundColor: barColor }} />
        </div>
        <p className="text-[11px] text-muted-foreground">{fmt(processedPct, 1)}% of received stock processed</p>

        {/* Divider */}
        <div className="border-t border-border my-3" />

        {/* Output summary */}
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Processing Output</p>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Exported</span>
            <span className="text-green-700 font-semibold">{fmt(exportedKg)} KG ({fmt(exportBags, 0)} bags) — {fmt(exportPct, 1)}%</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Rejected</span>
            <span className={rejectColor}>{fmt(rejectedKg)} KG ({fmt(rejectBags, 0)} bags) — {fmt(rejectPct, 1)}%</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Waste</span>
            <span className={wasteColor}>{wastePrefix}{fmt(wasteKg)} KG</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-muted/30 px-5 py-2 border-t border-border">
        <p className="text-[11px] text-muted-foreground">Last updated: {format(lastRefresh, 'HH:mm:ss')}</p>
      </div>
    </div>
  );
}

// ── Supplier Card ─────────────────────────────────────────────────────────────
function SupplierCard({ c }) {
  const pct = c.received > 0 ? Math.min(100, (c.remainingDisplay / c.received) * 100) : 0;
  const colorClass = c.remainingDisplay === 0 ? 'text-muted-foreground' : c.remainingDisplay < 500 ? 'text-red-600' : c.remainingDisplay < 5000 ? 'text-amber-600' : 'text-green-700';
  const procExceedsReceived = c.actualProc > (c.received - c.samples);
  return (
    <div className={`bg-card rounded-xl border p-4 space-y-3 hover:shadow-md transition-shadow ${c.remainingNegative ? 'border-red-300' : 'border-border'}`}>
      <div>
        <p className="font-semibold text-sm text-foreground capitalize">{c.name}</p>
        <p className="text-xs text-muted-foreground">{c.coffeeType}</p>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`text-3xl font-bold leading-tight ${colorClass}`}>{fmt(c.remainingDisplay)}</span>
        <span className="text-sm text-muted-foreground">KG remaining</span>
        {c.remainingNegative && <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">CAPPED</span>}
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${c.remainingDisplay === 0 ? 'bg-muted-foreground/30' : c.remainingDisplay < 500 ? 'bg-red-500' : c.remainingDisplay < 5000 ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div className="flex justify-between"><span className="text-muted-foreground">Dispatch KG</span><span className="font-medium">{c.dispatchKg > 0 ? fmt(c.dispatchKg) : '—'}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Received KG</span><span className="font-medium">{fmt(c.received)}</span></div>
        {c.shrinkage != null && (
          <div className="flex justify-between col-span-2">
            <span className="text-muted-foreground">Shrinkage KG</span>
            <span className={`font-medium ${c.shrinkage < 0 ? 'text-red-600' : 'text-green-700'}`}>
              {c.shrinkage < 0 ? '▲ ' : '▼ '}{fmt(Math.abs(c.shrinkage))}
            </span>
          </div>
        )}
        {c.netCoffeeKg !== c.received && (
          <div className="flex justify-between col-span-2">
            <span className="text-muted-foreground">Net Coffee KG</span>
            <span className="font-medium text-foreground">{fmt(c.netCoffeeKg)}</span>
          </div>
        )}
        <div className="flex justify-between"><span className="text-muted-foreground">Samples KG</span><span className="font-medium text-blue-600">{fmt(c.samples)}</span></div>
        <div className="flex justify-between items-center">
          <span className={`text-muted-foreground ${procExceedsReceived ? 'text-red-500 font-semibold' : ''}`}>Processing KG</span>
          <span className={`font-medium ${procExceedsReceived ? 'text-red-600' : 'text-primary'}`}>
            {procExceedsReceived ? '⚠️ ' : ''}{fmt(c.actualProc)}
          </span>
        </div>
        <div className="flex justify-between col-span-2 border-t border-border/50 pt-1 mt-1">
          <span className="text-muted-foreground font-medium">Remaining KG</span>
          <span className={`font-bold ${colorClass}`}>{fmt(c.remainingDisplay)}</span>
        </div>
      </div>
      {c.lastActivity && <p className="text-[11px] text-muted-foreground border-t border-border/40 pt-2">Last activity: {c.lastActivity}</p>}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function StockReport() {
  const [activeTab, setActiveTab] = useState('by-coffee-type');
  const [search, setSearch] = useState('');
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState({ supplier: 'all', coffeeType: 'all', showZero: false });

  const { data: purchases = [] } = useQuery({ queryKey: ['purchase-records'], queryFn: () => base44.entities.PurchaseRecord.list('-created_date', 500) });
  const { data: receipts = [], refetch: refetchReceipts } = useQuery({ queryKey: ['warehouse-receipts'], queryFn: () => base44.entities.WarehouseReceipt.list('-created_date', 500) });
  const { data: sampleLogs = [], refetch: refetchSamples } = useQuery({ queryKey: ['sample-logs'], queryFn: () => base44.entities.SampleLog.list() });
  const { data: processingLogs = [], refetch: refetchProcessing } = useQuery({ queryKey: ['processing-logs'], queryFn: () => base44.entities.ProcessingLog.list('-created_date', 500) });
  const { data: outputReports = [], refetch: refetchOutput } = useQuery({ queryKey: ['output-reports'], queryFn: () => base44.entities.OutputReport.list('-created_date', 500) });
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: () => base44.entities.Supplier.list() });
  const { data: contracts = [] } = useQuery({ queryKey: ['export-contracts'], queryFn: () => base44.entities.ExportContract.list() });
  const { data: inspections = [] } = useQuery({ queryKey: ['buyer-inspections'], queryFn: () => base44.entities.BuyerInspection.list() });

  // Two-pool breakdown per coffee type (Fresh + Recleaned)
  const { breakdown: poolBreakdown } = useMemo(
    () => computeStockPools({ outputReports, contracts, inspections, sampleLogs }),
    [outputReports, contracts, inspections, sampleLogs]
  );
  const poolCoffeeTypes = useMemo(() => Object.keys(poolBreakdown).sort(), [poolBreakdown]);
  // Per-type buyer reference (first failed inspection buyer per coffee type)
  const buyerByType = useMemo(() => {
    const map = {};
    inspections.forEach(i => {
      if (i.coffee_type && i.buyer_name && !map[i.coffee_type]) map[i.coffee_type] = i.buyer_name;
    });
    return map;
  }, [inspections]);

  useEffect(() => {
    const interval = setInterval(() => {
      refetchReceipts(); refetchSamples(); refetchProcessing(); refetchOutput();
      setLastRefresh(new Date());
    }, 30000);
    return () => clearInterval(interval);
  }, [refetchReceipts, refetchSamples, refetchProcessing, refetchOutput]);

  const supplierMap = useMemo(() => {
    const m = {};
    suppliers.forEach(s => {
      if (s.supplier_name) {
        m[s.supplier_name] = s;
        m[s.supplier_name.toLowerCase().trim()] = s;
      }
    });
    return m;
  }, [suppliers]);

  // ── Per-supplier cards (Tab 2) ─────────────────────────────────────────────
  const supplierCards = useMemo(() => {
    const notArchived = (x) => x?.archived !== true;

    // Build set of active purchase IDs/codes to exclude orphaned receipts
    const activePurchaseCodes = new Set();
    const activePurchaseIds = new Set();
    purchases.filter(notArchived).forEach(p => {
      if (p.coffee_code) activePurchaseCodes.add(p.coffee_code);
      if (p.id) activePurchaseIds.add(p.id);
    });

    // Only receipts that are not archived AND whose linked purchase is active
    const activeReceipts = receipts.filter(r => {
      if (r?.archived) return false;
      // If receipt has no purchase link, include it (manual receipt)
      if (!r.coffee_code && !r.purchase_record_id) return true;
      // Otherwise must have an active linked purchase
      return (r.purchase_record_id && activePurchaseIds.has(r.purchase_record_id))
        || (r.coffee_code && activePurchaseCodes.has(r.coffee_code));
    });

    const activeSampleLogs = sampleLogs.filter(notArchived);
    const activeProcessingLogs = processingLogs.filter(notArchived);

    // Use canonical availability utility for consistent numbers across the whole app
    const availMap = computeAvailabilityBySupplier({
      receipts: activeReceipts,
      purchases,
      sampleLogs: activeSampleLogs,
      processingLogs: activeProcessingLogs,
    });

    // Fix 1: Received KG = sum of warehouse_received_net_kg per supplier (deduplicated, one row per receipt)
    // Fix 2: Dispatch KG comes ONLY from net_dispatch_weight_kg stored on the WarehouseReceipt itself
    const grossReceivedMap = {};
    const dispatchMap = {};
    const seenReceiptIds = new Set();
    activeReceipts.forEach(r => {
      if (!r.supplier_name) return;
      if (seenReceiptIds.has(r.id)) return; // deduplicate — count each receipt exactly once
      seenReceiptIds.add(r.id);
      grossReceivedMap[r.supplier_name] = (grossReceivedMap[r.supplier_name] || 0) + (r.warehouse_received_net_kg || 0);
      // Fix 2: only add dispatch KG if it's explicitly stored on the receipt record
      if (r.net_dispatch_weight_kg != null && r.net_dispatch_weight_kg > 0) {
        dispatchMap[r.supplier_name] = (dispatchMap[r.supplier_name] || 0) + r.net_dispatch_weight_kg;
      }
    });

    // Last activity
    const lastActivityMap = {};
    const updateActivity = (name, dateStr) => {
      if (name && dateStr && (!lastActivityMap[name] || dateStr > lastActivityMap[name])) lastActivityMap[name] = dateStr;
    };
    activeReceipts.forEach(r => updateActivity(r.supplier_name, r.received_date));
    activeSampleLogs.forEach(s => updateActivity(s.supplier_name, s.sample_date));
    activeProcessingLogs.forEach(p => updateActivity(p.supplier_name, p.date));

    const purchaseCoffeeTypeMap = {};
    purchases.filter(p => p.supplier_name && p.coffee_type && p.archived !== true).forEach(p => {
      const key = p.supplier_name.toLowerCase().trim();
      if (!purchaseCoffeeTypeMap[key]) purchaseCoffeeTypeMap[key] = p.coffee_type;
    });

    // Fix 4: Build the full supplier list from ALL active receipts, not just those in availMap
    // availMap may miss suppliers whose receipts have no purchase link match — include them too
    const allSupplierNames = new Set([
      ...Object.keys(availMap),
      ...Object.keys(grossReceivedMap),
    ]);

    return Array.from(allSupplierNames).map(name => {
      const v = availMap[name] || { netCoffeeKg: grossReceivedMap[name] || 0, samplesKg: 0, processedKg: 0, availableKg: grossReceivedMap[name] || 0 };
      const received = grossReceivedMap[name] || 0;
      const dispatchKg = dispatchMap[name] || 0;
      // Shrinkage: dispatch vs received — only show if dispatch was actually recorded
      const shrinkage = dispatchKg > 0 ? received - dispatchKg : null;
      // Fix 3: Use netCoffeeKg (already bag-tare deducted) for waste calculation
      const waste = v.processedKg > 0 ? Math.max(0, v.netCoffeeKg - v.samplesKg - v.processedKg) : 0;
      return {
        name,
        coffeeType: (supplierMap[name] ?? supplierMap[(name || '').toLowerCase().trim()])?.coffee_type
          || purchaseCoffeeTypeMap[(name || '').toLowerCase().trim()]
          || '—',
        received,                       // gross received KG (for display)
        netCoffeeKg: v.netCoffeeKg,     // after bag tare deduction
        dispatchKg, shrinkage,
        samples: v.samplesKg,
        // Fix 5: processedKg already uses actual_weighed_kg ?? kg_sent via availabilityUtils
        actualProc: v.processedKg,
        actualProcCapped: v.processedKg,
        waste,
        wasteNegative: v.processedKg > 0 && (v.netCoffeeKg - v.samplesKg - v.processedKg) < 0,
        remaining: v.availableKg,
        remainingDisplay: v.availableKg, // Fix 3: already bag-tare deducted via availabilityUtils
        remainingNegative: false,
        lastActivity: lastActivityMap[name] || null,
      };
      // Fix 4: include ALL suppliers with at least one receipt (received > 0 OR in availMap)
    }).filter(c => (grossReceivedMap[c.name] || 0) > 0 || (availMap[c.name]?.netCoffeeKg || 0) > 0)
      .sort((a, b) => b.remaining - a.remaining);
  }, [receipts, purchases, sampleLogs, processingLogs, supplierMap]);

  // ── Per-coffee-type aggregation (Tab 1) ────────────────────────────────────
  const coffeeTypeCards = useMemo(() => {
    const map = {};
    supplierCards.forEach(c => {
      const ct = c.coffeeType;
      if (!map[ct]) map[ct] = { coffeeType: ct, supplierCount: 0, receivedKg: 0, processedKg: 0, samplesKg: 0, remainingKg: 0, exportedKg: 0, exportBags: 0, rejectedKg: 0, rejectBags: 0, wasteKg: 0 };
      map[ct].supplierCount++;
      map[ct].receivedKg += c.received;
      map[ct].processedKg += c.actualProcCapped; // use capped value for balance
      map[ct].samplesKg += c.samples;
      map[ct].remainingKg += c.remainingDisplay; // already Math.max(0, ...)
    });
    supplierCards.forEach(c => {
      const ct = c.coffeeType;
      if (map[ct]) map[ct].wasteKg += c.waste;
    });
    // Merge output report data for export/reject figures (archived excluded)
    outputReports.filter(r => r?.archived !== true).forEach(r => {
      const ct = r.coffee_type || 'Unknown';
      if (!map[ct]) map[ct] = { coffeeType: ct, supplierCount: 0, receivedKg: 0, processedKg: 0, samplesKg: 0, remainingKg: 0, exportedKg: 0, exportBags: 0, rejectedKg: 0, rejectBags: 0, wasteKg: 0 };
      map[ct].exportedKg += r.export_kg || 0;
      map[ct].exportBags += r.export_bags || 0;
      map[ct].rejectedKg += r.reject_kg || 0;
      map[ct].rejectBags += r.reject_bags || 0;
    });
    return Object.values(map).filter(c => c.receivedKg > 0).sort((a, b) => b.receivedKg - a.receivedKg);
  }, [supplierCards, outputReports]);

  // ── Summary bar ────────────────────────────────────────────────────────────
  const summary = useMemo(() => ({
    totalReceived: supplierCards.reduce((s, c) => s + c.received, 0),
    totalRemaining: supplierCards.reduce((s, c) => s + c.remainingDisplay, 0),
    totalWaste: supplierCards.reduce((s, c) => s + c.waste, 0),
    coffeeTypesCount: coffeeTypeCards.length,
  }), [supplierCards, coffeeTypeCards]);

  // ── Waste alerts ──────────────────────────────────────────────────────────
  const wasteAlerts = useMemo(() => {
    const alerts = [];
    let allGood = true;
    coffeeTypeCards.forEach(c => {
      const waste = c.wasteKg; // waste only counted for lots where processing has started
      if (waste < 0) {
        allGood = false;
        alerts.push({ type: 'error', msg: `🔴 DATA ALERT — ${c.coffeeType}: Processed KG exceeds received KG by ${fmt(Math.abs(waste))} KG. Please verify records.` });
      } else if (waste > 2000) {
        allGood = false;
        alerts.push({ type: 'error', msg: `⚠️ HIGH WAREHOUSE WASTE — ${c.coffeeType}: ${fmt(waste)} KG unaccounted. Check storage conditions.` });
      } else if (waste >= 500) {
        allGood = false;
        alerts.push({ type: 'warning', msg: `⚠️ WAREHOUSE WASTE — ${c.coffeeType}: ${fmt(waste)} KG variance between received and processed+samples.` });
      }
    });
    if (allGood && coffeeTypeCards.length > 0) {
      alerts.push({ type: 'success', msg: '✅ All stock accounts balanced — waste within normal range.' });
    }
    return alerts;
  }, [coffeeTypeCards]);

  const stockCoffeeTypeOpts = useMemo(() =>
    [...new Set(supplierCards.map(c => c.coffeeType).filter(Boolean))].sort().map(t => ({ value: t, label: t })),
    [supplierCards]
  );
  const stockSupplierOpts = useMemo(() =>
    supplierCards.map(c => ({ value: c.name, label: c.name })),
    [supplierCards]
  );
  const stockFilterActiveCount = [
    filters.supplier !== 'all',
    filters.coffeeType !== 'all',
    filters.showZero,
  ].filter(Boolean).length;

  // ── Filtered supplier cards ────────────────────────────────────────────────
  const filteredSuppliers = useMemo(() => {
    let cards = supplierCards;
    if (search) {
      const q = search.toLowerCase();
      cards = cards.filter(c => c.name.toLowerCase().includes(q) || c.coffeeType.toLowerCase().includes(q));
    }
    if (filters.supplier !== 'all') cards = cards.filter(c => c.name === filters.supplier);
    if (filters.coffeeType !== 'all') cards = cards.filter(c => c.coffeeType === filters.coffeeType);
    if (!filters.showZero) cards = cards.filter(c => c.remainingDisplay > 0);
    return cards;
  }, [supplierCards, search, filters]);

  const tabs = [
    { id: 'by-coffee-type', label: 'By Coffee Type' },
    { id: 'by-supplier', label: 'By Supplier' },
  ];

  return (
    <RoleGuard allowedRoles={['admin', 'warehouse_keeper', 'export_manager', 'final_registrar']}>
      <div className="space-y-5 pb-6">
        <PageHeader title="Stock Report" description="Live warehouse inventory">
          <div className="flex items-center gap-3 flex-wrap">
            <FilterButton onClick={() => setFilterOpen(true)} activeCount={stockFilterActiveCount} />
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs"
              onClick={() => {
                const headers = ['Supplier', 'Coffee Type', 'Received KG', 'Processed KG', 'Remaining KG', 'Waste KG'];
                const rows = supplierCards.map(c => [c.name, c.coffeeType, c.received, c.actualProc, c.remainingDisplay, c.waste]);
                exportXLSX('Stock_Report_By_Supplier', 'Stock Report — By Supplier', headers, rows, null);
              }}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Export Excel
            </Button>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Auto-refresh 30s · Last: {format(lastRefresh, 'HH:mm:ss')}</span>
            </div>
          </div>
        </PageHeader>
        <FilterPanel
          open={filterOpen}
          onClose={() => setFilterOpen(false)}
          fields={[
            { key: 'supplier', label: 'Supplier', type: 'select', options: stockSupplierOpts, placeholder: 'All Suppliers' },
            { key: 'coffeeType', label: 'Coffee Type', type: 'select', options: stockCoffeeTypeOpts, placeholder: 'All Coffee Types' },
            { key: 'showZero', label: 'Show Zero Stock', type: 'toggle' },
          ]}
          values={filters}
          onApply={v => setFilters(v)}
          onReset={() => setFilters({ supplier: 'all', coffeeType: 'all', showZero: false })}
        />

        {/* Summary bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Received KG', value: fmt(summary.totalReceived), color: 'text-foreground' },
            { label: 'Total Remaining KG', value: fmt(summary.totalRemaining), color: 'text-green-700' },
            { label: 'Total Warehouse Waste KG', value: fmt(summary.totalWaste), color: 'text-amber-600', note: 'Applies to processed lots only' },
            { label: 'Coffee Types Tracked', value: summary.coffeeTypesCount, color: 'text-foreground' },
          ].map(item => (
            <div key={item.label} className="bg-card rounded-xl border border-border px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">{item.label}</p>
              <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
              {item.note && <p className="text-[9px] text-muted-foreground mt-0.5">{item.note}</p>}
            </div>
          ))}
        </div>

        {/* Tab switcher */}
        <div className="flex w-full rounded-xl overflow-hidden border border-border">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${activeTab === tab.id ? 'text-white' : 'bg-card text-muted-foreground hover:text-foreground'}`}
              style={activeTab === tab.id ? { backgroundColor: '#6F4E37' } : {}}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* TAB 1: By Coffee Type */}
        {activeTab === 'by-coffee-type' && (
          <div className="space-y-4">
            {/* Waste alerts */}
            <div className="space-y-2">
              {wasteAlerts.map((alert, i) => (
                <div key={i} className={`px-4 py-2.5 rounded-lg text-sm font-medium border ${alert.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' : alert.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-green-50 border-green-200 text-green-800'}`}>
                  {alert.msg}
                </div>
              ))}
            </div>
            {coffeeTypeCards.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">No warehouse data yet.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {coffeeTypeCards.map(c => <CoffeeTypeCard key={c.coffeeType} data={c} lastRefresh={lastRefresh} />)}
              </div>
            )}

            {/* Two-Pool Stock Breakdown (Fresh vs Recleaned) */}
            {poolCoffeeTypes.length > 0 && (
              <div className="space-y-3 pt-4 border-t border-border">
                <div>
                  <p className="text-sm font-bold text-foreground">Export Stock — Two Pools</p>
                  <p className="text-xs text-muted-foreground">Fresh stock (green) and recleaned stock (amber) tracked separately. Contracts cannot mix pools.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {poolCoffeeTypes.map(ct => (
                    <CoffeePoolsCard
                      key={ct}
                      coffeeType={ct}
                      breakdown={poolBreakdown[ct]}
                      buyerNote={buyerByType[ct]}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: By Supplier */}
        {activeTab === 'by-supplier' && (
          <div className="space-y-4">
            <div className="relative max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search supplier or coffee type..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {filteredSuppliers.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">{search ? 'No suppliers match your search.' : 'No warehouse data yet.'}</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredSuppliers.map(c => <SupplierCard key={c.name} c={c} />)}
              </div>
            )}
          </div>
        )}
      </div>
    </RoleGuard>
  );
}