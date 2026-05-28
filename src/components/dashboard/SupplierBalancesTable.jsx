import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { calcTotalPaid, calcBalance, calcPaymentStatus } from '@/lib/paymentUtils';
import { ChevronUp, ChevronDown, ChevronsUpDown, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/supabaseClient';

function fmt(n, d = 0) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function SortIcon({ col, sortKey, sortDir }) {
  if (sortKey !== col) return <ChevronsUpDown className="inline w-3 h-3 ml-1 opacity-30" />;
  return sortDir === 'asc'
    ? <ChevronUp className="inline w-3 h-3 ml-1" />
    : <ChevronDown className="inline w-3 h-3 ml-1" />;
}

function StatusBadge({ status }) {
  if (status === 'Paid')
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-800 whitespace-nowrap">Paid ✓</span>;
  if (status === 'Partial')
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 whitespace-nowrap">Partial</span>;
  return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 whitespace-nowrap">Unpaid</span>;
}

function wasteColor(waste, negative) {
  if (negative) return 'text-destructive font-semibold';
  if (waste > 500) return 'text-destructive font-semibold';
  if (waste >= 100) return 'text-amber-600 font-semibold';
  return 'text-green-700 font-semibold';
}

const STATUS_ORDER = { Unpaid: 0, Partial: 1, Paid: 2 };

export default function SupplierBalancesTable({ dateRange }) {
  const queryClient = useQueryClient();
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [sortKey, setSortKey] = useState('__default__');
  const [sortDir, setSortDir] = useState('desc');

  const queryOpts = { staleTime: 60000 };

  const { data: purchaseRecords = [] } = useQuery({ queryKey: ['purchase-records'], queryFn: () => base44.entities.PurchaseRecord.list('-created_date', 500), ...queryOpts });
  const { data: receipts = [] } = useQuery({ queryKey: ['warehouse-receipts'], queryFn: () => base44.entities.WarehouseReceipt.list('-created_date', 500), ...queryOpts });
  const { data: sampleLogs = [] } = useQuery({ queryKey: ['sample-logs'], queryFn: () => base44.entities.SampleLog.list(), ...queryOpts });
  const { data: processingLogs = [] } = useQuery({ queryKey: ['processing-logs'], queryFn: () => base44.entities.ProcessingLog.list(), ...queryOpts });

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['purchase-records'] });
    queryClient.invalidateQueries({ queryKey: ['warehouse-receipts'] });
    queryClient.invalidateQueries({ queryKey: ['sample-logs'] });
    queryClient.invalidateQueries({ queryKey: ['processing-logs'] });
    setLastUpdated(new Date());
  }, [queryClient]);

  const rows = useMemo(() => {
    // Apply optional date range filter on purchase_date
    const inRange = (p) => {
      if (!dateRange || (!dateRange.from && !dateRange.to)) return true;
      const d = p?.purchase_date;
      if (!d) return false;
      const ds = String(d).slice(0, 10);
      if (dateRange.from && ds < dateRange.from) return false;
      if (dateRange.to && ds > dateRange.to) return false;
      return true;
    };

    // Archived records must never be included in supplier balances
    const notArchived = (x) => x?.archived !== true;

    // Group purchases by supplier — only count lots that have a valid Grand Total (> 0)
    const map = {};
    purchaseRecords.filter(notArchived).filter(inRange).forEach(p => {
      if (!p.supplier_name) return;
      const gt = p.grand_total_etb || 0;
      // Skip records with no Grand Total (e.g. incomplete/empty purchase records)
      if (gt <= 0) return;
      if (!map[p.supplier_name]) map[p.supplier_name] = { lots: 0, grandTotal: 0, totalPaid: 0 };
      map[p.supplier_name].lots++;
      map[p.supplier_name].grandTotal += gt;
      map[p.supplier_name].totalPaid += calcTotalPaid(p);
    });

    // Received KG per supplier (from warehouse receipts)
    const receivedMap = {};
    receipts.filter(notArchived).forEach(r => {
      if (r.supplier_name) receivedMap[r.supplier_name] = (receivedMap[r.supplier_name] || 0) + (r.warehouse_received_net_kg || 0);
    });

    // Samples KG per supplier
    const samplesMap = {};
    sampleLogs.filter(notArchived).forEach(s => {
      if (s.supplier_name) samplesMap[s.supplier_name] = (samplesMap[s.supplier_name] || 0) + (s.sample_kg || 0);
    });

    // Actual processing KG per supplier (from ProcessingLog)
    const procMap = {};
    processingLogs.filter(notArchived).forEach(p => {
      if (p.supplier_name) procMap[p.supplier_name] = (procMap[p.supplier_name] || 0) + (p.actual_weighed_kg ?? p.kg_sent ?? 0);
    });

    return Object.entries(map).map(([name, v]) => {
      const received = receivedMap[name] || 0;
      const samples = samplesMap[name] || 0;
      const actualProc = procMap[name] || 0;
      // Waste only applies to suppliers where processing has actually started
      const rawWaste = actualProc > 0 ? received - samples - actualProc : 0;
      const warehouseWaste = Math.max(0, rawWaste);
      const wasteNegative = rawWaste < 0;
      const balanceDisplay = calcBalance(v.grandTotal, v.totalPaid) ?? 0;
      const status = calcPaymentStatus(v.grandTotal, v.totalPaid) ?? 'Unpaid';
      return { name, lots: v.lots, actualProc, warehouseWaste, wasteNegative, balance: balanceDisplay, totalPaid: v.totalPaid, grandTotal: v.grandTotal, status };
    });
  }, [purchaseRecords, receipts, sampleLogs, processingLogs, dateRange]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    if (sortKey === '__default__') {
      return copy.sort((a, b) => {
        const sd = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
        if (sd !== 0) return sd;
        return b.balance - a.balance;
      });
    }
    return copy.sort((a, b) => {
      let va = a[sortKey]; let vb = b[sortKey];
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortDir === 'asc' ? va - vb : vb - va;
    });
  }, [rows, sortKey, sortDir]);

  const totals = useMemo(() => ({
    lots: rows.reduce((s, r) => s + r.lots, 0),
    actualProc: rows.reduce((s, r) => s + r.actualProc, 0),
    warehouseWaste: rows.reduce((s, r) => s + r.warehouseWaste, 0),
    balance: rows.reduce((s, r) => s + r.balance, 0),
    paid: rows.filter(r => r.status === 'Paid').length,
    partial: rows.filter(r => r.status === 'Partial').length,
    unpaid: rows.filter(r => r.status === 'Unpaid').length,
  }), [rows]);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const TH = ({ label, col, right }) => (
    <th
      className={`px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover:text-foreground whitespace-nowrap bg-muted/80 ${right ? 'text-right' : 'text-left'}`}
      onClick={() => handleSort(col)}
    >
      {label}<SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
    </th>
  );

  return (
    <div>
      {/* Last updated */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#126433', letterSpacing: '0.12em' }}>Supplier Balances</p>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">Last updated: {lastUpdated.toLocaleTimeString()}</span>
          <button onClick={refresh} className="p-1 rounded hover:bg-muted transition-colors" title="Refresh now">
            <RefreshCw className="w-3 h-3 text-muted-foreground" />
          </button>
        </div>
      </div>

      <div className="rounded-xl overflow-hidden border border-border/50">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <TH label="Supplier" col="name" />
                <TH label="Lots" col="lots" />
                <TH label="Actual Processing KG" col="actualProc" right />
                <TH label="Warehouse Waste KG" col="warehouseWaste" right />
                <TH label="Balance ETB" col="balance" right />
                <TH label="Status" col="status" />
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10 text-muted-foreground bg-card">No supplier data yet.</td></tr>
              ) : sorted.map((r, i) => (
                <tr key={r.name} className={`border-b border-border/30 last:border-0 hover:brightness-95 transition-all ${i % 2 === 0 ? 'bg-card' : 'bg-muted/20'}`}>
                  <td className="px-3 py-2.5 font-medium capitalize">{r.name}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{r.lots} lot{r.lots !== 1 ? 's' : ''}</td>
                  <td className="px-3 py-2.5 text-right font-medium text-primary">{fmt(r.actualProc)}</td>
                  <td className={`px-3 py-2.5 text-right ${wasteColor(r.warehouseWaste, r.wasteNegative)}`}>
                    {r.wasteNegative ? '⚠️ ' : ''}{fmt(r.warehouseWaste)}
                  </td>
                  <td className={`px-3 py-2.5 text-right font-semibold ${r.balance > 1 ? (r.totalPaid <= 0 ? 'text-destructive' : 'text-amber-600') : 'text-green-700'}`}>
                    {r.balance > 1 ? fmt(r.balance, 2) : '—'}
                  </td>
                  <td className="px-3 py-2.5"><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
            {/* Summary row */}
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/60">
                <td className="px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-foreground">Total</td>
                <td className="px-3 py-2.5 text-xs font-bold text-foreground">{totals.lots} lots</td>
                <td className="px-3 py-2.5 text-right text-xs font-bold text-foreground">{fmt(totals.actualProc)}</td>
                <td className="px-3 py-2.5 text-right text-xs font-bold text-foreground">{fmt(totals.warehouseWaste)}</td>
                <td className="px-3 py-2.5 text-right text-xs font-bold text-amber-600">{totals.balance > 0 ? fmt(totals.balance, 2) : '—'}</td>
                <td className="px-3 py-2.5 text-[10px] text-muted-foreground whitespace-nowrap">
                  <span className="text-green-700 font-semibold">{totals.paid} paid</span>
                  {' · '}
                  <span className="text-amber-600 font-semibold">{totals.partial} partial</span>
                  {' · '}
                  <span className="text-destructive font-semibold">{totals.unpaid} unpaid</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
