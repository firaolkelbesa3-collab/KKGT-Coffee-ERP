import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/shared/PageHeader';
import { Input } from '@/components/ui/input';
import { Search, RefreshCw } from 'lucide-react';
import FilterPanel, { FilterButton } from '@/components/shared/FilterPanel';
import RoleGuard from '@/components/RoleGuard';
import { format } from 'date-fns';
import { computeStockPools } from '@/lib/stockPools';
import CoffeePoolsCard from '@/components/stock/CoffeePoolsCard';
import { base44 } from '@/api/supabaseClient';

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
      <div className="px-5 py-4" style={{ backgroundColor: '#126433' }}>
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

// ── Supplier Card (existing) ──────────────────────────────────────────────────
function SupplierCard({ c }) {
  const pct = c.received > 0 ? Math.min(100, (c.remainingDisplay / c.received) * 100) : 0;
  const colorClass = c.remaining <= 0 ? 'text-muted-foreground' : c.remaining < 500 ? 'text-red-600' : c.remaining < 5000 ? 'text-amber-600' : 'text-green-700';
  return (
    <div className="bg-card rounded-xl border border-border p-4 space-y-3 hover:shadow-md transition-shadow">
      <div>
        <p className="font-semibold text-sm text-foreground capitalize">{c.name}</p>
        <p className="text-xs text-muted-foreground">{c.coffeeType}</p>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`text-3xl font-bold leading-tight ${colorClass}`}>{fmt(c.remainingDisplay)}</span>
        <span className="text-sm text-muted-foreground">KG remaining</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${c.remaining < 0 ? 'bg-destructive' : c.remaining < 500 ? 'bg-red-500' : c.remaining < 5000 ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div className="flex justify-between"><span className="text-muted-foreground">Received KG</span><span className="font-medium">{fmt(c.received)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Samples KG</span><span className="font-medium text-blue-600">{fmt(c.samples)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Processing KG</span><span className="font-medium text-primary">{fmt(c.actualProc)}</span></div>
        <div className="flex justify-between items-center"><span className="text-muted-foreground">Warehouse Waste</span><span className={`font-medium ${c.wasteNegative ? 'text-amber-600' : 'text-muted-foreground'}`}>{c.wasteNegative ? '⚠️ ' : ''}{fmt(c.waste)}</span></div>
        <div className="flex justify-between col-span-2 border-t border-border/50 pt-1 mt-1"><span className="text-muted-foreground font-medium">Remaining KG</span><span className={`font-bold ${colorClass}`}>{fmt(c.remainingDisplay)}</span></div>
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
    suppliers.forEach(s => { m[s.supplier_name] = s; });
    return m;
  }, [suppliers]);

  // ── Per-supplier cards (Tab 2) ─────────────────────────────────────────────
  const supplierCards = useMemo(() => {
    // Archived records must never feed into stock calculations
    const notArchived = (x) => x?.archived !== true;
    const activeReceipts = receipts.filter(notArchived);
    const activeSampleLogs = sampleLogs.filter(notArchived);
    const activeProcessingLogs = processingLogs.filter(notArchived);

    // Build lot-level received map: { supplier_name -> [{ receivedKg }] }
    // Each receipt = one lot. We need per-lot data to correctly compute waste.
    const lotsBySupplier = {}; // supplier_name -> [{ receivedKg }]
    activeReceipts.forEach(r => {
      if (!r.supplier_name) return;
      if (!lotsBySupplier[r.supplier_name]) lotsBySupplier[r.supplier_name] = [];
      lotsBySupplier[r.supplier_name].push({ receivedKg: r.warehouse_received_net_kg || 0 });
    });

    // Aggregate maps
    const samplesMap = {}, procMap = {}, lastActivityMap = {};
    activeSampleLogs.forEach(s => { if (s.supplier_name) samplesMap[s.supplier_name] = (samplesMap[s.supplier_name] || 0) + (s.sample_kg || 0); });
    activeProcessingLogs.forEach(p => { if (p.supplier_name) { const kg = p.actual_weighed_kg ?? p.kg_sent ?? 0; procMap[p.supplier_name] = (procMap[p.supplier_name] || 0) + kg; } });
    const updateActivity = (name, dateStr) => { if (name && dateStr && (!lastActivityMap[name] || dateStr > lastActivityMap[name])) lastActivityMap[name] = dateStr; };
    activeReceipts.forEach(r => updateActivity(r.supplier_name, r.received_date));
    activeSampleLogs.forEach(s => updateActivity(s.supplier_name, s.sample_date));
    activeProcessingLogs.forEach(p => updateActivity(p.supplier_name, p.date));

    const allNames = new Set([...Object.keys(lotsBySupplier), ...Object.keys(samplesMap), ...Object.keys(procMap)]);
    return Array.from(allNames).map(name => {
      const lots = lotsBySupplier[name] || [];
      const received = lots.reduce((s, l) => s + l.receivedKg, 0);
      const samples = samplesMap[name] || 0;
      const actualProc = procMap[name] || 0;

      // Waste: only for lots where processing has started (actualProc > 0)
      // We distribute processing proportionally — but since we only know total proc per supplier,
      // waste = received - samples - proc only when proc > 0, else 0
      const waste = actualProc > 0 ? Math.max(0, received - samples - actualProc) : 0;
      const wasteNegative = actualProc > 0 && (received - samples - actualProc) < 0;

      // Remaining = all received minus samples minus processing (unprocessed lots still in warehouse)
      const remaining = received - samples - actualProc;

      return {
        name,
        coffeeType: supplierMap[name]?.coffee_type || '—',
        received, samples, actualProc,
        waste, wasteNegative,
        remaining,
        remainingDisplay: Math.max(0, remaining),
        lastActivity: lastActivityMap[name] || null,
      };
    }).filter(c => c.received > 0).sort((a, b) => b.remaining - a.remaining);
  }, [receipts, sampleLogs, processingLogs, supplierMap]);

  // ── Per-coffee-type aggregation (Tab 1) ────────────────────────────────────
  const coffeeTypeCards = useMemo(() => {
    const map = {};
    supplierCards.forEach(c => {
      const ct = c.coffeeType;
      if (!map[ct]) map[ct] = { coffeeType: ct, supplierCount: 0, receivedKg: 0, processedKg: 0, samplesKg: 0, remainingKg: 0, exportedKg: 0, exportBags: 0, rejectedKg: 0, rejectBags: 0, wasteKg: 0 };
      map[ct].supplierCount++;
      map[ct].receivedKg += c.received;
      map[ct].processedKg += c.actualProc;
      map[ct].samplesKg += c.samples;
      map[ct].remainingKg += c.remaining;
    });
    // Aggregate waste from supplier cards (already uses correct formula: only when proc > 0)
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
    totalRemaining: supplierCards.reduce((s, c) => s + Math.max(0, c.remaining), 0),
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
    if (!filters.showZero) cards = cards.filter(c => c.remaining > 0);
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
              style={activeTab === tab.id ? { backgroundColor: '#126433' } : {}}
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
