import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Wallet, Percent, FileSpreadsheet,
  FileText, Coffee, Ship, Scale,
} from 'lucide-react';
import { base44 } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { exportReportPDF, exportReportXLSX } from '@/lib/reportEngine';

// ── Brand palette ──────────────────────────────────────────────────────────
const COFFEE = '#6F4E37';
const AMBER = '#C8873E';
const LEAF = '#5E8C3A';
const RED = '#C0392B';

// ── helpers ─────────────────────────────────────────────────────────────────
function num(v) {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}
function fmtEtb(n) {
  return num(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
}
function fmtUsd(n) {
  return num(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
}
function fmtPct(n) {
  return `${num(n).toFixed(1)}%`;
}

// Ethiopian coffee export season runs Oct 1 → Sep 30. A contract dated
// Nov 2024 or Mar 2025 both belong to season "2024/25".
function seasonOf(dateStr) {
  if (!dateStr) return 'Unknown';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'Unknown';
  const y = d.getFullYear();
  const m = d.getMonth(); // 0=Jan
  const startYear = m >= 9 ? y : y - 1; // Oct(9)+ → this year starts the season
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`;
}

// Revenue per contract — prefer the explicit revenue field, fall back sensibly.
function revenueOf(c) {
  return num(c.grand_total_revenue_etb) || num(c.total_export_value_etb);
}
function costOf(c) {
  return num(c.total_costs_etb);
}
function profitOf(c) {
  // Prefer stored profit; otherwise derive from revenue − cost.
  if (c.profit_etb !== null && c.profit_etb !== undefined && c.profit_etb !== '') return num(c.profit_etb);
  return revenueOf(c) - costOf(c);
}
function marginOf(c) {
  const rev = revenueOf(c);
  if (!rev) return 0;
  return (profitOf(c) / rev) * 100;
}

// ── small presentational pieces ───────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, tone = 'coffee' }) {
  const tones = {
    coffee: 'from-[#6F4E37] to-[#8B6F47]',
    amber: 'from-[#C8873E] to-[#E0A458]',
    leaf: 'from-[#5E8C3A] to-[#7BAE4E]',
    red: 'from-[#C0392B] to-[#E05B4D]',
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

function ChartCard({ title, icon: Icon, children, action }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-primary" />}
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

const chartTooltip = {
  contentStyle: { borderRadius: 12, border: '1px solid #e7ddd2', fontSize: 12 },
  formatter: (v) => fmtEtb(v),
};

// ── main page ─────────────────────────────────────────────────────────────────
export default function ProfitLoss() {
  const [season, setSeason] = useState('all');
  const [exporting, setExporting] = useState(false);

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ['export-contracts', 'pnl'],
    queryFn: () => base44.entities.ExportContract.list('-contract_date', 1000),
  });

  // Active (non-archived) contracts only.
  const active = useMemo(() => contracts.filter(c => !c.archived), [contracts]);

  const seasons = useMemo(() => {
    const set = new Set(active.map(c => seasonOf(c.contract_date)));
    return Array.from(set).sort().reverse();
  }, [active]);

  const filtered = useMemo(
    () => (season === 'all' ? active : active.filter(c => seasonOf(c.contract_date) === season)),
    [active, season],
  );

  // KPI roll-up over the filtered set.
  const totals = useMemo(() => {
    let revenue = 0, cost = 0, profit = 0, usd = 0;
    filtered.forEach(c => {
      revenue += revenueOf(c);
      cost += costOf(c);
      profit += profitOf(c);
      usd += num(c.total_export_value_usd);
    });
    const margin = revenue ? (profit / revenue) * 100 : 0;
    const profitable = filtered.filter(c => profitOf(c) > 0).length;
    return { revenue, cost, profit, usd, margin, count: filtered.length, profitable };
  }, [filtered]);

  // Per-season aggregation (always over all data, for the trend charts).
  const bySeason = useMemo(() => {
    const map = new Map();
    active.forEach(c => {
      const s = seasonOf(c.contract_date);
      if (!map.has(s)) map.set(s, { season: s, revenue: 0, cost: 0, profit: 0, count: 0 });
      const row = map.get(s);
      row.revenue += revenueOf(c);
      row.cost += costOf(c);
      row.profit += profitOf(c);
      row.count += 1;
    });
    return Array.from(map.values())
      .map(r => ({ ...r, margin: r.revenue ? (r.profit / r.revenue) * 100 : 0 }))
      .sort((a, b) => a.season.localeCompare(b.season));
  }, [active]);

  // Per-buyer aggregation over the filtered set.
  const byBuyer = useMemo(() => {
    const map = new Map();
    filtered.forEach(c => {
      const b = c.buyer_name || '—';
      if (!map.has(b)) map.set(b, { buyer: b, profit: 0, revenue: 0 });
      const row = map.get(b);
      row.profit += profitOf(c);
      row.revenue += revenueOf(c);
    });
    return Array.from(map.values()).sort((a, b) => b.profit - a.profit).slice(0, 8);
  }, [filtered]);

  // Per-contract table rows, sorted by profit.
  const contractRows = useMemo(
    () => [...filtered].sort((a, b) => profitOf(b) - profitOf(a)),
    [filtered],
  );

  // ── report exports (branded engine) ─────────────────────────────────────────
  const reportTitle = `Profit & Loss — ${season === 'all' ? 'All Seasons' : `Season ${season}`}`;
  const headers = ['Contract No', 'Date', 'Buyer', 'Destination', 'Coffee', 'Export KG',
    'Revenue (ETB)', 'Costs (ETB)', 'Profit (ETB)', 'Margin %'];
  const buildRows = () => contractRows.map(c => [
    c.contract_no || '—',
    c.contract_date || '—',
    c.buyer_name || '—',
    c.destination_country || '—',
    c.coffee_type || '—',
    num(c.export_kg),
    revenueOf(c),
    costOf(c),
    profitOf(c),
    Number(marginOf(c).toFixed(1)),
  ]);

  const handlePDF = () => {
    exportReportPDF({
      title: reportTitle,
      subtitle: `${totals.count} contracts · Net profit ETB ${fmtEtb(totals.profit)} · Margin ${fmtPct(totals.margin)}`,
      headers,
      rows: buildRows(),
      autoTotals: true,
      filename: `profit-loss-${season === 'all' ? 'all-seasons' : season.replace('/', '-')}`,
    });
  };
  const handleXLSX = async () => {
    setExporting(true);
    try {
      await exportReportXLSX({
        title: reportTitle,
        subtitle: `${totals.count} contracts · Net profit ETB ${fmtEtb(totals.profit)} · Margin ${fmtPct(totals.margin)}`,
        headers,
        rows: buildRows(),
        autoTotals: true,
        filename: `profit-loss-${season === 'all' ? 'all-seasons' : season.replace('/', '-')}`,
      });
    } finally {
      setExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  const profitTone = totals.profit >= 0 ? 'leaf' : 'red';

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Wallet className="w-6 h-6 text-primary" /> Profit &amp; Loss
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Margin analysis per export contract and per coffee season.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={season} onValueChange={setSeason}>
            <SelectTrigger className="w-[170px] h-9">
              <SelectValue placeholder="Season" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Seasons</SelectItem>
              {seasons.map(s => <SelectItem key={s} value={s}>Season {s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-9 gap-1.5 press" onClick={handlePDF} disabled={!filtered.length}>
            <FileText className="w-4 h-4" /> PDF
          </Button>
          <Button variant="outline" size="sm" className="h-9 gap-1.5 press" onClick={handleXLSX} disabled={!filtered.length || exporting}>
            <FileSpreadsheet className="w-4 h-4" /> {exporting ? 'Exporting…' : 'Excel'}
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card py-16 text-center">
          <Ship className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">No export contracts found</p>
          <p className="text-xs text-muted-foreground mt-1">
            {season === 'all' ? 'Create export contracts to see profit analysis.' : `No contracts in season ${season}.`}
          </p>
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard icon={Ship} tone="coffee" label="Total Revenue" value={`ETB ${fmtEtb(totals.revenue)}`} sub={`$${fmtUsd(totals.usd)} export value`} />
            <KpiCard icon={Scale} tone="amber" label="Total Costs" value={`ETB ${fmtEtb(totals.cost)}`} sub={`${totals.count} contracts`} />
            <KpiCard icon={totals.profit >= 0 ? TrendingUp : TrendingDown} tone={profitTone} label="Net Profit" value={`ETB ${fmtEtb(totals.profit)}`} sub={`${totals.profitable}/${totals.count} profitable`} />
            <KpiCard icon={Percent} tone={totals.margin >= 0 ? 'leaf' : 'red'} label="Avg Margin" value={fmtPct(totals.margin)} sub="Profit ÷ revenue" />
          </div>

          {/* Charts row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Revenue vs Costs by Season" icon={Coffee}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={bySeason} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee3d6" />
                  <XAxis dataKey="season" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip {...chartTooltip} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="revenue" name="Revenue" fill={COFFEE} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="cost" name="Costs" fill={AMBER} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Net Profit by Season" icon={TrendingUp}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={bySeason} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee3d6" />
                  <XAxis dataKey="season" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip {...chartTooltip} />
                  <Bar dataKey="profit" name="Profit" radius={[4, 4, 0, 0]}>
                    {bySeason.map((r, i) => <Cell key={i} fill={r.profit >= 0 ? LEAF : RED} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Charts row 2 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Margin Trend by Season" icon={Percent}>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={bySeason} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee3d6" />
                  <XAxis dataKey="season" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v.toFixed(0)}%`} />
                  <Tooltip contentStyle={chartTooltip.contentStyle} formatter={(v) => `${num(v).toFixed(1)}%`} />
                  <Line type="monotone" dataKey="margin" name="Margin %" stroke={COFFEE} strokeWidth={2.5} dot={{ r: 4, fill: AMBER }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Top Buyers by Profit" icon={Ship}>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={byBuyer} layout="vertical" margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee3d6" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="buyer" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip {...chartTooltip} />
                  <Bar dataKey="profit" name="Profit" radius={[0, 4, 4, 0]}>
                    {byBuyer.map((r, i) => <Cell key={i} fill={r.profit >= 0 ? COFFEE : RED} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Per-contract table */}
          <ChartCard title={`Contract Detail (${contractRows.length})`} icon={FileText}>
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full text-sm min-w-[820px]">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 px-3 font-semibold">Contract</th>
                    <th className="py-2 px-3 font-semibold">Season</th>
                    <th className="py-2 px-3 font-semibold">Buyer</th>
                    <th className="py-2 px-3 font-semibold text-right">Export KG</th>
                    <th className="py-2 px-3 font-semibold text-right">Revenue</th>
                    <th className="py-2 px-3 font-semibold text-right">Costs</th>
                    <th className="py-2 px-3 font-semibold text-right">Profit</th>
                    <th className="py-2 px-3 font-semibold text-right">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {contractRows.map(c => {
                    const profit = profitOf(c);
                    const margin = marginOf(c);
                    return (
                      <tr key={c.id} className="border-b border-border/60 hover:bg-muted/30">
                        <td className="py-2 px-3 font-medium text-foreground">{c.contract_no || '—'}</td>
                        <td className="py-2 px-3 text-muted-foreground">{seasonOf(c.contract_date)}</td>
                        <td className="py-2 px-3 text-muted-foreground truncate max-w-[160px]">{c.buyer_name || '—'}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{fmtEtb(c.export_kg)}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{fmtEtb(revenueOf(c))}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{fmtEtb(costOf(c))}</td>
                        <td className={`py-2 px-3 text-right tabular-nums font-semibold ${profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmtEtb(profit)}</td>
                        <td className={`py-2 px-3 text-right tabular-nums ${margin >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmtPct(margin)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/40 font-bold">
                    <td className="py-2.5 px-3" colSpan={4}>Total · {totals.count} contracts</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{fmtEtb(totals.revenue)}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{fmtEtb(totals.cost)}</td>
                    <td className={`py-2.5 px-3 text-right tabular-nums ${totals.profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmtEtb(totals.profit)}</td>
                    <td className={`py-2.5 px-3 text-right tabular-nums ${totals.margin >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmtPct(totals.margin)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </ChartCard>
        </>
      )}
    </div>
  );
}
