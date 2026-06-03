import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/supabaseClient';
import { computeCosting, costForContract, seasonOf } from '@/lib/costing';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Coins, TrendingUp, Package, Percent, Recycle, Layers, ChevronDown, ChevronRight, Info,
} from 'lucide-react';

const fmt = (n, d = 0) => n == null || isNaN(n) ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

function KpiCard({ icon: Icon, label, value, sub, tone = 'coffee' }) {
  const tones = {
    coffee: 'from-[#126333] to-[#1C8347]',
    amber: 'from-[#EB6C25] to-[#F0894A]',
    leaf: 'from-[#2E9D5B] to-[#46B673]',
    blue: 'from-[#2563eb] to-[#3b82f6]',
  };
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${tones[tone]} flex items-center justify-center text-white flex-shrink-0`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
          <p className="text-xl font-bold text-foreground tabular-nums truncate">{value}</p>
          {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

export default function CostingDashboard() {
  const [season, setSeason] = useState('all');
  const [expanded, setExpanded] = useState({});

  const { data: purchases = [], isLoading: l1 } = useQuery({ queryKey: ['purchase_records'], queryFn: () => base44.entities.PurchaseRecord.list('-created_date', 5000) });
  const { data: processingLogs = [], isLoading: l2 } = useQuery({ queryKey: ['processing_logs'], queryFn: () => base44.entities.ProcessingLog.list('-date', 5000) });
  const { data: outputReports = [], isLoading: l3 } = useQuery({ queryKey: ['output_reports'], queryFn: () => base44.entities.OutputReport.list('-end_date', 5000) });
  const { data: contracts = [], isLoading: l4 } = useQuery({ queryKey: ['export_contracts'], queryFn: () => base44.entities.ExportContract.list('-contract_date', 5000) });

  const loading = l1 || l2 || l3 || l4;

  const costing = useMemo(
    () => computeCosting({ purchases, processingLogs, outputReports, contracts }),
    [purchases, processingLogs, outputReports, contracts]
  );

  const seasons = useMemo(() => {
    const s = new Set(costing.list.map(c => c.season));
    return Array.from(s).sort().reverse();
  }, [costing]);

  const rows = useMemo(
    () => costing.list.filter(c => season === 'all' || c.season === season),
    [costing, season]
  );

  // Unprocessed stock value: raw purchased − raw processed, valued at supplier cost.
  const unprocessed = useMemo(() => {
    let purchasedKg = 0, purchasedCost = 0, processedKg = 0;
    purchases.forEach(p => {
      if (p.archived) return;
      if (season !== 'all' && seasonOf(p.purchase_date) !== season) return;
      purchasedKg += Number(p.warehouse_received_net_kg || p.net_dispatch_weight_kg || 0);
      purchasedCost += Number(p.grand_total_etb || 0);
    });
    rows.forEach(r => { processedKg += r.processedKg; });
    const remainingKg = Math.max(0, purchasedKg - processedKg);
    const avgCost = purchasedKg > 0 ? purchasedCost / purchasedKg : 0;
    return { remainingKg, value: remainingKg * avgCost, purchasedCost };
  }, [purchases, rows, season]);

  const totals = useMemo(() => {
    let processedCost = 0, exportKg = 0, netCost = 0;
    rows.forEach(r => { processedCost += r.processedCost; exportKg += r.exportKg; netCost += (r.netCost || 0); });
    return { processedCost, exportKg, avgCostPerExportKg: exportKg > 0 ? netCost / exportKg : null };
  }, [rows]);

  const contractRows = useMemo(() => {
    return contracts
      .filter(c => !c.archived && (season === 'all' || seasonOf(c.contract_date || c.export_date) === season))
      .map(c => ({ c, costing: costForContract(c, costing) }))
      .sort((a, b) => (b.costing.cogs || 0) - (a.costing.cogs || 0));
  }, [contracts, costing, season]);

  if (loading) {
    return (
      <div className="p-4 sm:p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1400px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Coins className="w-6 h-6 text-primary" /> Costing &amp; Margin
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Supplier + Season weighted-average cost of green coffee, rolled into export contracts.
          </p>
        </div>
        <Select value={season} onValueChange={setSeason}>
          <SelectTrigger className="w-[170px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Seasons</SelectItem>
            {seasons.map(s => <SelectItem key={s} value={s}>Season {s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={Coins} tone="coffee" label="Processed Coffee Cost" value={`ETB ${fmt(totals.processedCost)}`} sub="Raw cost of what was processed" />
        <KpiCard icon={TrendingUp} tone="amber" label="Avg Cost / Export KG" value={totals.avgCostPerExportKg != null ? `ETB ${fmt(totals.avgCostPerExportKg, 2)}` : '—'} sub="Net of reject credit" />
        <KpiCard icon={Package} tone="blue" label="Unprocessed Stock" value={`${fmt(unprocessed.remainingKg)} KG`} sub={`≈ ETB ${fmt(unprocessed.value)} tied up`} />
        <KpiCard icon={Layers} tone="leaf" label="Cost Buckets" value={`${rows.length}`} sub="Coffee type × season" />
      </div>

      {/* Cost per type+season */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Layers className="w-4 h-4 text-primary" /> Cost per Coffee Type &amp; Season</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">Click a row to see which suppliers contributed and at what cost.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-2 px-3 font-semibold">Coffee Type · Season</th>
                <th className="py-2 px-3 font-semibold text-right">Processed KG</th>
                <th className="py-2 px-3 font-semibold text-right">Raw Cost/KG</th>
                <th className="py-2 px-3 font-semibold text-right">Yield %</th>
                <th className="py-2 px-3 font-semibold text-right">Reject Price/KG</th>
                <th className="py-2 px-3 font-semibold text-right">Cost / Export KG</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={6} className="py-10 text-center text-muted-foreground">No processed coffee yet for this season.</td></tr>
              ) : rows.map(r => {
                const k = `${r.type}__${r.season}`;
                const open = expanded[k];
                return (
                  <React.Fragment key={k}>
                    <tr className="border-b border-border/60 hover:bg-muted/30 cursor-pointer" onClick={() => setExpanded(e => ({ ...e, [k]: !e[k] }))}>
                      <td className="py-2.5 px-3 font-medium text-foreground flex items-center gap-1.5">
                        {open ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                        {r.type} <span className="text-muted-foreground font-normal">· {r.season}</span>
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{fmt(r.processedKg)}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{fmt(r.rawCostPerKg, 2)}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{r.yieldPct != null ? `${fmt(r.yieldPct, 1)}%` : '—'}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">
                        {r.rejectDerived ? fmt(r.rejectPricePerKg, 2) : <span className="text-amber-600 text-xs">not yet</span>}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-bold text-primary">{r.costPerExportKg != null ? fmt(r.costPerExportKg, 2) : '—'}</td>
                    </tr>
                    {open && (
                      <tr className="bg-muted/20">
                        <td colSpan={6} className="px-3 py-2">
                          <div className="text-[11px] text-muted-foreground mb-1.5 flex items-center gap-1"><Info className="w-3 h-3" /> Suppliers processed into this pool:</div>
                          <div className="flex flex-wrap gap-1.5">
                            {r.suppliers.map(s => (
                              <span key={s.name} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-border bg-card text-xs">
                                <span className="font-medium">{s.name}</span>
                                <span className="text-muted-foreground">· {fmt(s.kg)} KG @ {fmt(s.costPerKg, 0)}/kg</span>
                              </span>
                            ))}
                          </div>
                          <div className="mt-2 text-[11px] text-muted-foreground grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <span>Processed cost: <strong className="text-foreground">{fmt(r.processedCost)}</strong></span>
                            <span>Reject credit: <strong className="text-foreground">{fmt(r.rejectCredit)}</strong></span>
                            <span>Net cost: <strong className="text-foreground">{fmt(r.netCost)}</strong></span>
                            <span>÷ Export {fmt(r.exportKg)} KG = <strong className="text-primary">{fmt(r.costPerExportKg, 2)}/kg</strong></span>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-contract true cost & margin */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary" /> Contract True Cost &amp; Margin</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">COGS computed from the costing engine (Supplier+Season WAC).</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-2 px-3 font-semibold">Contract</th>
                <th className="py-2 px-3 font-semibold">Type · Season</th>
                <th className="py-2 px-3 font-semibold text-right">Export KG</th>
                <th className="py-2 px-3 font-semibold text-right">Cost/KG</th>
                <th className="py-2 px-3 font-semibold text-right">COGS (computed)</th>
                <th className="py-2 px-3 font-semibold text-right">Revenue</th>
                <th className="py-2 px-3 font-semibold text-right">True Margin</th>
              </tr>
            </thead>
            <tbody>
              {contractRows.map(({ c, costing: cc }) => {
                const revenue = Number(c.grand_total_revenue_etb) || (Number(c.total_export_value_etb) || 0) + (Number(c.total_reject_sales_etb) || 0);
                const exportCosts = (Number(c.total_costs_etb) || 0);
                // True margin = revenue − (computed COGS + the non-coffee export costs).
                // Export costs already include a purchase-cost line, so to avoid double
                // counting we show computed COGS standalone vs recorded for transparency.
                const trueMargin = cc.available ? revenue - cc.cogs - 0 : null;
                return (
                  <tr key={c.id} className="border-b border-border/60 hover:bg-muted/30">
                    <td className="py-2 px-3 font-medium text-foreground">{c.contract_no || '—'}</td>
                    <td className="py-2 px-3 text-muted-foreground text-xs">{cc.type} · {cc.season}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{fmt(c.export_kg)}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{cc.costPerExportKg != null ? fmt(cc.costPerExportKg, 2) : <span className="text-amber-600 text-xs">no data</span>}</td>
                    <td className="py-2 px-3 text-right tabular-nums font-semibold">{cc.cogs != null ? fmt(cc.cogs) : '—'}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{fmt(revenue)}</td>
                    <td className={`py-2 px-3 text-right tabular-nums font-bold ${trueMargin == null ? 'text-muted-foreground' : trueMargin >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {trueMargin != null ? fmt(trueMargin) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 border-t border-border bg-muted/20 text-[11px] text-muted-foreground flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>"True Margin" = Revenue − computed coffee cost (COGS). Add your export costs (freight, bags, customs) for net profit — those live on the contract's Cost Breakdown.</span>
        </div>
      </div>
    </div>
  );
}
