import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle2, ChevronDown, ChevronRight, User, Building2 } from 'lucide-react';
import { format } from 'date-fns';
import SupplierDetailPanel from './SupplierDetailPanel';

export const REJECT_BAG_PRICE = 153;
const LOSS_PCT = 1;

function fmt(n, d = 0) {
  if (n == null || isNaN(n)) return '0';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function buildSummaryRow({ key, received, used, returns, payments }) {
  const lossAllowance = Math.ceil(received * (LOSS_PCT / 100));
  const netToReturn = received - lossAllowance - used;
  const cashEarned = used * REJECT_BAG_PRICE;
  const totalPaid = payments.reduce((s, p) => s + (Number(p.amount_etb) || 0), 0);
  const totalReturned = returns.reduce((s, r) => s + (Number(r.bags_returned) || 0), 0);
  const cashRemaining = Math.max(0, cashEarned - totalPaid);
  const bagsRemainingToReturn = Math.max(0, netToReturn - totalReturned);
  const bagsFullyReturned = netToReturn <= 0 || totalReturned >= netToReturn;
  const cashFullyPaid = cashEarned <= 0 || totalPaid >= cashEarned;
  const cashPartiallyPaid = totalPaid > 0 && !cashFullyPaid;
  const pending = !bagsFullyReturned || (cashEarned > 0 && !cashFullyPaid);
  return {
    key, received, used, lossAllowance, lossPercent: LOSS_PCT, netToReturn,
    cashEarned, totalPaid, totalReturned, cashRemaining, bagsRemainingToReturn,
    bagsFullyReturned, cashFullyPaid, cashPartiallyPaid, pending,
    latestPayment: payments[0] || null,
    latestReturn: returns[0] || null,
    returns, payments,
  };
}

export function useSupplierBagSummary() {
  const { data: bagReceipts = [], isLoading: l1 } = useQuery({ queryKey: ['bag-receipts'], queryFn: () => base44.entities.BagReceipt.list('-date', 500) });
  const { data: usages = [], isLoading: l2 } = useQuery({ queryKey: ['reject-bag-usages'], queryFn: () => base44.entities.RejectBagUsage.list('-date', 500) });
  const { data: payments = [], isLoading: l3 } = useQuery({ queryKey: ['supplier-bag-payments'], queryFn: () => base44.entities.SupplierBagPayment.list('-payment_date', 500) });
  const { data: returns = [], isLoading: l4 } = useQuery({ queryKey: ['supplier-bag-returns'], queryFn: () => base44.entities.SupplierBagReturn.list('-return_date', 500) });
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers-for-bagledger'], queryFn: () => base44.entities.Supplier.list('supplier_name', 500) });

  // Build agent-level summary from receipt_mode='agent' receipts and reject_mode='agent' usages
  const agentSummary = useMemo(() => {
    const receiptMap = {};
    bagReceipts.filter(r => !r.archived && (r.receipt_mode === 'agent' || (!r.receipt_mode && r.agent_name && !r.supplier_name))).forEach(r => {
      const k = r.agent_name || '—';
      if (!receiptMap[k]) receiptMap[k] = { received: 0, supplierBreakdown: {} };
      receiptMap[k].received += Number(r.bags_received) || 0;
      // Track which suppliers contribute under this agent
      const sn = r.supplier_name;
      if (sn) receiptMap[k].supplierBreakdown[sn] = (receiptMap[k].supplierBreakdown[sn] || 0) + (Number(r.bags_received) || 0);
    });

    const usageMap = {};
    usages.filter(u => u.reject_mode === 'agent' || (!u.reject_mode && u.agent_name && !u.supplier_name)).forEach(u => {
      const k = u.agent_name || '—';
      usageMap[k] = (usageMap[k] || 0) + (Number(u.bags_used) || 0);
    });

    const paymentsByAgent = {};
    payments.filter(p => p.agent_name).forEach(p => {
      const k = p.agent_name;
      if (!paymentsByAgent[k]) paymentsByAgent[k] = [];
      paymentsByAgent[k].push(p);
    });

    const returnsByAgent = {};
    returns.filter(r => r.agent_name).forEach(r => {
      const k = r.agent_name;
      if (!returnsByAgent[k]) returnsByAgent[k] = [];
      returnsByAgent[k].push(r);
    });

    const allKeys = new Set([...Object.keys(receiptMap), ...Object.keys(usageMap)]);
    return [...allKeys].map(k => ({
      ...buildSummaryRow({
        key: k,
        received: receiptMap[k]?.received || 0,
        used: usageMap[k] || 0,
        returns: returnsByAgent[k] || [],
        payments: paymentsByAgent[k] || [],
      }),
      agentName: k,
      supplierBreakdown: receiptMap[k]?.supplierBreakdown || {},
      // needed for SupplierDetailPanel compatibility
      supplier: k,
    })).sort((a, b) => a.key.localeCompare(b.key));
  }, [bagReceipts, usages, payments, returns]);

  // Build supplier-level summary from receipt_mode='supplier' receipts and reject_mode='supplier' usages
  const supplierSummary = useMemo(() => {
    const receiptMap = {};
    bagReceipts.filter(r => !r.archived && (r.receipt_mode === 'supplier' || (!r.receipt_mode && r.supplier_name && !r.agent_name))).forEach(r => {
      const k = r.supplier_name || '—';
      if (!receiptMap[k]) receiptMap[k] = { received: 0, agentRef: r.agent_name || '' };
      receiptMap[k].received += Number(r.bags_received) || 0;
      if (r.agent_name && !receiptMap[k].agentRef) receiptMap[k].agentRef = r.agent_name;
    });

    const usageMap = {};
    usages.filter(u => u.reject_mode === 'supplier' || (!u.reject_mode && u.supplier_name && !u.agent_name)).forEach(u => {
      const k = u.supplier_name || '—';
      usageMap[k] = (usageMap[k] || 0) + (Number(u.bags_used) || 0);
    });

    // Legacy: existing SupplierBagReturn/Payment with supplier_name (no agent_name) go to supplier level
    const paymentsBySupplier = {};
    payments.filter(p => p.supplier_name && !p.agent_name).forEach(p => {
      const k = p.supplier_name;
      if (!paymentsBySupplier[k]) paymentsBySupplier[k] = [];
      paymentsBySupplier[k].push(p);
    });

    const returnsBySupplier = {};
    returns.filter(r => r.supplier_name && !r.agent_name).forEach(r => {
      const k = r.supplier_name;
      if (!returnsBySupplier[k]) returnsBySupplier[k] = [];
      returnsBySupplier[k].push(r);
    });

    // Enrich with agent reference from master data
    const agentBySupplier = {};
    suppliers.forEach(s => { if (s.supplier_name) agentBySupplier[s.supplier_name] = s.agent || ''; });

    const allKeys = new Set([...Object.keys(receiptMap), ...Object.keys(usageMap)]);
    return [...allKeys].map(k => ({
      ...buildSummaryRow({
        key: k,
        received: receiptMap[k]?.received || 0,
        used: usageMap[k] || 0,
        returns: returnsBySupplier[k] || [],
        payments: paymentsBySupplier[k] || [],
      }),
      supplierName: k,
      agentRef: receiptMap[k]?.agentRef || agentBySupplier[k] || '—',
      supplier: k,
    })).sort((a, b) => a.key.localeCompare(b.key));
  }, [bagReceipts, usages, payments, returns, suppliers]);

  const agentTotals = useMemo(() => ({
    totalNetToReturn: agentSummary.reduce((s, r) => s + r.netToReturn, 0),
    totalCashRemaining: agentSummary.reduce((s, r) => s + r.cashRemaining, 0),
  }), [agentSummary]);

  const supplierTotals = useMemo(() => ({
    totalNetToReturn: supplierSummary.reduce((s, r) => s + r.netToReturn, 0),
    totalCashRemaining: supplierSummary.reduce((s, r) => s + r.cashRemaining, 0),
  }), [supplierSummary]);

  // Legacy combined summary for PDF export
  const summary = useMemo(() => [...agentSummary, ...supplierSummary], [agentSummary, supplierSummary]);
  const totals = useMemo(() => ({
    totalNetToReturn: agentTotals.totalNetToReturn + supplierTotals.totalNetToReturn,
    totalCashEarned: summary.reduce((s, r) => s + r.cashEarned, 0),
    totalCashPaid: summary.reduce((s, r) => s + r.totalPaid, 0),
    totalCashRemaining: agentTotals.totalCashRemaining + supplierTotals.totalCashRemaining,
  }), [summary, agentTotals, supplierTotals]);

  return { summary, totals, agentSummary, supplierSummary, agentTotals, supplierTotals, isLoading: l1 || l2 || l3 || l4 };
}

function StatusPills({ row }) {
  return (
    <div className="flex flex-col gap-1">
      {row.bagsFullyReturned && row.netToReturn > 0 ? (
        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium w-fit">
          <CheckCircle2 className="w-3 h-3" /> Bags settled
        </span>
      ) : row.netToReturn > 0 ? (
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium w-fit">
          {row.totalReturned > 0 ? `${fmt(row.bagsRemainingToReturn)} left` : 'Return pending'}
        </span>
      ) : null}
      {row.cashFullyPaid ? (
        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium w-fit">
          <CheckCircle2 className="w-3 h-3" /> Fully paid
        </span>
      ) : row.cashPartiallyPaid ? (
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium w-fit">Partial</span>
      ) : row.cashEarned > 0 ? (
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium w-fit">Cash pending</span>
      ) : null}
    </div>
  );
}

function SummaryTable({ rows, isLoading, colLabel, onRowClick, expandedKeys, onToggleExpand, showExpand }) {
  if (isLoading) return (
    <div>{Array(3).fill(0).map((_, i) => <div key={i} className="h-10 bg-muted/40 rounded mb-1 animate-pulse" />)}</div>
  );
  if (rows.length === 0) return <p className="text-center py-8 text-muted-foreground text-sm">No data yet.</p>;
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            {showExpand && <TableHead className="w-8" />}
            <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{colLabel}</TableHead>
            {colLabel === 'Agent' && <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Suppliers</TableHead>}
            {colLabel === 'Supplier' && <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Agent (ref)</TableHead>}
            <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Received</TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Loss 1%</TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Used</TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Net to Return</TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Cash ETB</TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Paid ETB</TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(row => {
            const expanded = expandedKeys?.has(row.key);
            const supplierBreakdown = row.supplierBreakdown || {};
            const breakdownEntries = Object.entries(supplierBreakdown);
            return (
              <React.Fragment key={row.key}>
                <TableRow
                  className={`cursor-pointer ${row.pending ? 'bg-orange-50/60 hover:bg-orange-100/60' : 'hover:bg-muted/30'}`}
                  onClick={() => onRowClick(row)}
                >
                  {showExpand && (
                    <TableCell onClick={e => { e.stopPropagation(); onToggleExpand(row.key); }}>
                      {breakdownEntries.length > 0
                        ? (expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />)
                        : null}
                    </TableCell>
                  )}
                  <TableCell className="font-medium">{row.key}</TableCell>
                  {colLabel === 'Agent' && (
                    <TableCell className="text-xs text-muted-foreground">
                      {breakdownEntries.length > 0 ? `${breakdownEntries.length} supplier(s)` : '—'}
                    </TableCell>
                  )}
                  {colLabel === 'Supplier' && (
                    <TableCell className="text-sm text-muted-foreground">{row.agentRef || '—'}</TableCell>
                  )}
                  <TableCell className="text-right">{fmt(row.received)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{fmt(row.lossAllowance)}</TableCell>
                  <TableCell className="text-right">{fmt(row.used)}</TableCell>
                  <TableCell className={`text-right font-bold ${row.netToReturn < 0 ? 'text-destructive' : 'text-primary'}`}>{fmt(row.netToReturn)}</TableCell>
                  <TableCell className="text-right font-semibold text-secondary">{fmt(row.cashEarned, 2)}</TableCell>
                  <TableCell className="text-right">
                    <div className={`font-semibold ${row.cashFullyPaid ? 'text-green-700' : row.cashPartiallyPaid ? 'text-orange-600' : 'text-muted-foreground'}`}>
                      {fmt(row.totalPaid, 2)}
                    </div>
                    {row.latestPayment?.payment_date && (
                      <div className="text-[10px] text-muted-foreground">{format(new Date(row.latestPayment.payment_date), 'd MMM yyyy')}</div>
                    )}
                  </TableCell>
                  <TableCell><StatusPills row={row} /></TableCell>
                </TableRow>
                {/* Expanded agent: show supplier breakdown */}
                {expanded && breakdownEntries.map(([sName, bags]) => (
                  <TableRow key={`${row.key}-${sName}`} className="bg-muted/20 text-muted-foreground">
                    <TableCell />
                    <TableCell className="pl-6 text-xs text-muted-foreground">↳ {sName}</TableCell>
                    <TableCell />
                    <TableCell className="text-right text-xs">{fmt(bags)}</TableCell>
                    <TableCell /><TableCell /><TableCell /><TableCell /><TableCell /><TableCell />
                  </TableRow>
                ))}
              </React.Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default function SupplierBagSummary({ agentSummary, supplierSummary, isLoading }) {
  const [panelRow, setPanelRow] = useState(null);
  const [expandedAgents, setExpandedAgents] = useState(new Set());

  const toggleExpand = (key) => {
    setExpandedAgents(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* Section A — Agent Level */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border bg-gradient-to-r from-green-50 to-transparent flex items-center gap-3">
          <div className="rounded-lg bg-green-100 p-2"><User className="w-5 h-5 text-green-700" /></div>
          <div>
            <h3 className="font-display font-semibold text-foreground">Section A — Agent Level Summary</h3>
            <p className="text-xs text-muted-foreground">Bag receipts added with "By Agent" mode</p>
          </div>
        </div>
        <SummaryTable
          rows={agentSummary}
          isLoading={isLoading}
          colLabel="Agent"
          onRowClick={row => setPanelRow({ ...row, _level: 'agent' })}
          expandedKeys={expandedAgents}
          onToggleExpand={toggleExpand}
          showExpand
        />
      </div>

      {/* Section B — Supplier Level */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border bg-gradient-to-r from-orange-50 to-transparent flex items-center gap-3">
          <div className="rounded-lg bg-orange-100 p-2"><Building2 className="w-5 h-5 text-orange-600" /></div>
          <div>
            <h3 className="font-display font-semibold text-foreground">Section B — Supplier Level Summary</h3>
            <p className="text-xs text-muted-foreground">Bag receipts added with "By Supplier" mode</p>
          </div>
        </div>
        <SummaryTable
          rows={supplierSummary}
          isLoading={isLoading}
          colLabel="Supplier"
          onRowClick={row => setPanelRow({ ...row, _level: 'supplier' })}
          expandedKeys={null}
          showExpand={false}
        />
      </div>

      <SupplierDetailPanel
        open={!!panelRow}
        onOpenChange={v => !v && setPanelRow(null)}
        row={panelRow}
      />
    </div>
  );
}