import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Search, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PORStatusBadge from './PORStatusBadge';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

const fmt = n => typeof n === 'number' ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
const fmtDate = d => { try { return format(parseISO(d), 'd MMM yyyy'); } catch { return d || '—'; } };

const GROUPS = [
  { status: 'Awaiting Receipt', label: '⏳ Awaiting Receipt', headerClass: 'bg-slate-100 text-slate-700 border-slate-200' },
  { status: 'Unpaid',           label: '🔴 Unpaid',           headerClass: 'bg-red-50 text-red-800 border-red-200' },
  { status: 'Partial',          label: '🟡 Partial',          headerClass: 'bg-orange-50 text-orange-800 border-orange-200' },
  { status: 'Paid',             label: '✅ Paid',             headerClass: 'bg-green-50 text-green-800 border-green-200' },
];

const COLUMNS = [
  { key: '_idx',        label: '#',                  sortKey: null },
  { key: 'coffee_code', label: 'Coffee Code',         sortKey: 'coffee_code' },
  { key: 'purchase_date', label: 'Date',              sortKey: 'purchase_date' },
  { key: 'supplier_name', label: 'Supplier',          sortKey: 'supplier_name' },
  { key: 'agent',       label: 'Agent',               sortKey: 'agent' },
  { key: 'region',      label: 'Region',              sortKey: 'region' },
  { key: 'coffee_type', label: 'Coffee Type',         sortKey: 'coffee_type' },
  { key: 'net_dispatch_weight_kg', label: 'Dispatch KG', sortKey: 'net_dispatch_weight_kg' },
  { key: '_wh_kg',      label: 'Warehouse KG',        sortKey: '_wh_kg' },
  { key: 'grand_total_etb', label: 'Grand Total ETB', sortKey: 'grand_total_etb' },
  { key: '_paid',       label: 'Total Paid ETB',      sortKey: '_paid' },
  { key: '_balance',    label: 'Balance ETB',         sortKey: '_balance' },
  { key: '_status',     label: 'Status',              sortKey: '_status' },
  { key: '_days',       label: 'Days',                sortKey: '_days' },
];

function DaysCell({ days }) {
  const color = days <= 7 ? 'text-slate-500' : days <= 14 ? 'text-orange-600 font-semibold' : 'text-red-600 font-bold';
  return <span className={color}>{days}</span>;
}

function RegionBadge({ region }) {
  const c = region === 'Wollega' ? 'bg-green-100 text-green-800' : region === 'Guji' ? 'bg-orange-100 text-orange-800' : 'bg-slate-100 text-slate-700';
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c}`}>{region || '—'}</span>;
}

function GroupSection({ group, rows, onRowClick }) {
  const [collapsed, setCollapsed] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  const totalVal = rows.reduce((s, r) => s + (r.grand_total_etb || 0), 0);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number') return sortDir === 'asc' ? av - bv : bv - av;
      return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
  }, [rows, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paged = sorted.slice((page - 1) * pageSize, page * pageSize);

  const handleSort = (key) => {
    if (!key) return;
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
    setPage(1);
  };

  return (
    <div className="mb-6 border border-border rounded-xl overflow-hidden">
      {/* Group Header */}
      <button
        className={`w-full flex items-center gap-3 px-4 py-3 border-b font-semibold text-sm ${group.headerClass} transition-colors`}
        onClick={() => setCollapsed(v => !v)}
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        <span>{group.label} ({rows.length})</span>
        <span className="ml-auto text-xs font-medium opacity-80">{fmt(totalVal)} ETB</span>
      </button>

      {!collapsed && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border">
                <tr>
                  {COLUMNS.map(col => (
                    <th
                      key={col.key}
                      className={cn('px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap', col.sortKey && 'cursor-pointer hover:text-foreground select-none')}
                      onClick={() => handleSort(col.sortKey)}
                    >
                      {col.label}
                      {sortKey === col.sortKey && <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((row, i) => (
                  <tr
                    key={row.id}
                    className="border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => onRowClick(row)}
                  >
                    <td className="px-3 py-2.5 text-muted-foreground text-xs">{(page - 1) * pageSize + i + 1}</td>
                    <td className="px-3 py-2.5">
                      <span className="text-[#126433] font-mono text-xs font-semibold hover:underline">{row.coffee_code || '—'}</span>
                    </td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap">{fmtDate(row.purchase_date)}</td>
                    <td className="px-3 py-2.5 font-semibold text-sm">{row.supplier_name || '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{row.agent || '—'}</td>
                    <td className="px-3 py-2.5"><RegionBadge region={row.region} /></td>
                    <td className="px-3 py-2.5 text-xs">{row.coffee_type || '—'}</td>
                    <td className="px-3 py-2.5 text-xs font-mono text-right">{typeof row.net_dispatch_weight_kg === 'number' ? row.net_dispatch_weight_kg.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'}</td>
                    <td className="px-3 py-2.5 text-xs font-mono text-right">{row._receipt ? row._receipt.warehouse_received_net_kg?.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'}</td>
                    <td className="px-3 py-2.5 text-xs font-mono text-right">{row.grand_total_etb ? fmt(row.grand_total_etb) : '—'}</td>
                    <td className="px-3 py-2.5 text-xs font-mono text-right text-green-700">{fmt(row._paid)}</td>
                    <td className={cn('px-3 py-2.5 text-xs font-mono text-right font-semibold', row._balance > 0.01 ? 'text-red-600' : 'text-green-700')}>
                      {fmt(row._balance)}
                    </td>
                    <td className="px-3 py-2.5"><PORStatusBadge status={row._status} /></td>
                    <td className="px-3 py-2.5 text-xs text-center"><DaysCell days={row._days} /></td>
                  </tr>
                ))}
                {paged.length === 0 && (
                  <tr><td colSpan={COLUMNS.length} className="px-4 py-6 text-center text-muted-foreground text-sm">No records</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/10 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>Rows per page:</span>
              <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(1); }}>
                <SelectTrigger className="h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{[10,20,50,100].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <span>Page {page} of {totalPages} ({sorted.length} records)</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function PORGroupedTable({ purchases, isLoading, search, onSearchChange, filterCount, onFilterOpen, onRowClick }) {
  const groups = useMemo(() => GROUPS.map(g => ({
    ...g,
    rows: purchases.filter(p => p._status === g.status),
  })), [purchases]);

  if (isLoading) return (
    <div className="space-y-3">
      {[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
    </div>
  );

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9 h-9" placeholder="Search supplier, coffee code, agent…" value={search} onChange={e => onSearchChange(e.target.value)} />
        </div>
        <Button variant="outline" className="gap-2 h-9" onClick={onFilterOpen}>
          <SlidersHorizontal className="w-4 h-4" />
          Filter{filterCount > 0 ? ` (${filterCount})` : ''}
          {filterCount > 0 && <span className="ml-1 bg-[#f06721] text-white text-xs rounded-full px-1.5 py-0.5">{filterCount}</span>}
        </Button>
      </div>
      {groups.map(g => (
        <GroupSection key={g.status} group={g} rows={g.rows} onRowClick={onRowClick} />
      ))}
    </div>
  );
}