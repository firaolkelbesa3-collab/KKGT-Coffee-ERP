import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO, isToday, isYesterday, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { Search, Download, FileSpreadsheet, SlidersHorizontal, PlusCircle, Pencil, Archive, RotateCcw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { exportHistoryPDF, exportHistoryExcel } from '@/lib/warehouseHistoryExport';

const PAGE_SIZE = 20;

function fmtTs(iso) { try { return format(parseISO(iso), 'd MMM yyyy — h:mm a'); } catch { return iso || '—'; } }
function fmtTime(iso) { try { return format(parseISO(iso), 'h:mm a'); } catch { return ''; } }
function fmtDateKey(iso) {
  try {
    const d = parseISO(iso);
    if (isToday(d)) return 'TODAY — ' + format(d, 'd MMM yyyy');
    if (isYesterday(d)) return 'YESTERDAY — ' + format(d, 'd MMM yyyy');
    return format(d, 'EEEE, d MMM yyyy').toUpperCase();
  } catch { return iso?.slice(0, 10) || '—'; }
}
function fmtVal(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number') return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return String(v);
}

const ACTION_CFG = {
  Created:  { Icon: PlusCircle,  color: 'text-green-600' },
  Edited:   { Icon: Pencil,      color: 'text-blue-600' },
  Archived: { Icon: Archive,     color: 'text-slate-500' },
  Restored: { Icon: RotateCcw,   color: 'text-emerald-600' },
};

const QUICK = [
  { label: 'Today',      from: () => format(new Date(), 'yyyy-MM-dd'), to: () => format(new Date(), 'yyyy-MM-dd') },
  { label: 'This Week',  from: () => format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'), to: () => format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd') },
  { label: 'This Month', from: () => format(startOfMonth(new Date()), 'yyyy-MM-dd'), to: () => format(endOfMonth(new Date()), 'yyyy-MM-dd') },
  { label: 'All Time',   from: () => null, to: () => null },
];

function SummaryCards({ history }) {
  const totalChanges = history.length;
  const now = new Date();
  const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const editsThisWeek = history.filter(h => h.action_type === 'Edited' && (h.action_at || '') >= weekStart).length;

  const userCounts = {};
  history.forEach(h => { userCounts[h.user_name || h.user_email] = (userCounts[h.user_name || h.user_email] || 0) + 1; });
  const topUser = Object.entries(userCounts).sort((a, b) => b[1] - a[1])[0];

  const latest = [...history].sort((a, b) => (b.action_at || '').localeCompare(a.action_at || ''))[0];
  let lastLabel = '—';
  if (latest?.action_at) {
    const diffMs = now - parseISO(latest.action_at);
    const mins = Math.floor(diffMs / 60000);
    lastLabel = mins < 1 ? 'just now' : mins < 60 ? `${mins} min ago` : `${Math.floor(mins/60)}h ago`;
  }

  const cards = [
    { label: 'Total Changes', value: totalChanges },
    { label: 'Edits This Week', value: editsThisWeek },
    { label: 'Most Active User', value: topUser ? `${topUser[0].split(' ')[0]} (${topUser[1]})` : '—' },
    { label: 'Last Change', value: lastLabel },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
      {cards.map(c => (
        <div key={c.label} className="bg-card border border-border rounded-xl p-3">
          <div className="text-xs text-muted-foreground mb-1">{c.label}</div>
          <div className="text-xl font-bold text-foreground">{c.value}</div>
        </div>
      ))}
    </div>
  );
}

function FeedItem({ entry, onViewReceipt }) {
  const changes = useMemo(() => { try { return JSON.parse(entry.changes || '[]'); } catch { return []; } }, [entry.changes]);
  const kgImpact = useMemo(() => { try { return entry.kg_impact ? JSON.parse(entry.kg_impact) : null; } catch { return null; } }, [entry.kg_impact]);
  const cfg = ACTION_CFG[entry.action_type] || ACTION_CFG.Edited;
  const { Icon } = cfg;

  return (
    <div className="flex gap-3 py-3 border-b border-border last:border-0">
      <div className="mt-0.5 flex-shrink-0">
        <Icon className={`w-4 h-4 ${cfg.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground mb-0.5">{fmtTime(entry.action_at)}</div>
        <div className="text-sm">
          <span className="font-semibold">{entry.user_name || entry.user_email}</span>{' '}
          <span className={`font-medium ${cfg.color}`}>{entry.action_type?.toLowerCase()}d</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {entry.coffee_code && <span className="font-mono font-medium text-[#126433]">{entry.coffee_code}</span>}
          {entry.supplier_name && <span> — {entry.supplier_name}</span>}
        </div>
        {changes.length > 0 && (
          <div className="mt-1.5 space-y-0.5">
            {changes.slice(0, 4).map((c, i) => (
              <div key={i} className="text-xs text-slate-600">
                <span className="font-medium">{c.label || c.field}:</span>{' '}
                {entry.action_type === 'Created' ? (
                  <span className="text-green-700">{fmtVal(c.new_value)}</span>
                ) : (
                  <>
                    <span className="text-red-600">{fmtVal(c.old_value)}</span>
                    <span className="mx-1 text-slate-400">→</span>
                    <span className="text-green-700">{fmtVal(c.new_value)}</span>
                    {c.field === 'warehouse_received_net_kg' && c.old_value != null && c.new_value != null && (
                      <span className={`ml-1 font-medium ${(c.new_value - c.old_value) > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ({(c.new_value - c.old_value) > 0 ? '+' : ''}{(c.new_value - c.old_value).toLocaleString()} KG)
                      </span>
                    )}
                  </>
                )}
              </div>
            ))}
            {changes.length > 4 && <div className="text-xs text-muted-foreground">+{changes.length - 4} more changes</div>}
          </div>
        )}
        {kgImpact && (
          <div className="mt-1.5 flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            <AlertTriangle className="w-3 h-3" />
            KG changed {fmtVal(kgImpact.old_kg)} → {fmtVal(kgImpact.new_kg)} ({kgImpact.diff > 0 ? '+' : ''}{fmtVal(kgImpact.diff)} KG)
          </div>
        )}
        {entry.reason && <div className="text-xs text-muted-foreground italic mt-0.5">Reason: {entry.reason}</div>}
      </div>
      <div className="flex-shrink-0">
        <Button size="sm" variant="outline" className="text-xs h-7 px-2" onClick={() => onViewReceipt?.(entry.receipt_id)}>
          View Receipt
        </Button>
      </div>
    </div>
  );
}

export default function WarehouseHistoryTab({ suppliers, onViewReceipt }) {
  const [search, setSearch] = useState('');
  const [quickLabel, setQuickLabel] = useState('All Time');
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterAction, setFilterAction] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterField, setFilterField] = useState('');
  const [page, setPage] = useState(1);

  const { data: history = [], isLoading } = useQuery({
    queryKey: ['wh-history-all'],
    queryFn: () => base44.entities.WarehouseReceiptHistory.list('-action_at', 1000),
    staleTime: 30000,
  });

  const handleQuick = (q) => {
    setQuickLabel(q.label);
    setDateFrom(q.from());
    setDateTo(q.to());
    setPage(1);
  };

  const allUsers = useMemo(() => [...new Set(history.map(h => h.user_name || h.user_email).filter(Boolean))].sort(), [history]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return history.filter(h => {
      if (q && !h.supplier_name?.toLowerCase().includes(q) && !h.coffee_code?.toLowerCase().includes(q) && !(h.user_name || '').toLowerCase().includes(q) && !(h.grn_code || '').toLowerCase().includes(q)) return false;
      if (dateFrom && (h.action_at || '') < dateFrom) return false;
      if (dateTo && (h.action_at || '') > dateTo + 'T99') return false;
      if (filterAction && h.action_type !== filterAction) return false;
      if (filterSupplier && h.supplier_name !== filterSupplier) return false;
      if (filterUser && (h.user_name || h.user_email) !== filterUser) return false;
      if (filterField) {
        try { const changes = JSON.parse(h.changes || '[]'); if (!changes.some(c => c.field === filterField)) return false; } catch { return false; }
      }
      return true;
    });
  }, [history, search, dateFrom, dateTo, filterAction, filterSupplier, filterUser, filterField]);

  // Group by day
  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach(h => {
      const day = (h.action_at || '').slice(0, 10);
      if (!map[day]) map[day] = [];
      map[day].push(h);
    });
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  // Flatten for pagination
  const allItems = useMemo(() => filtered.slice().sort((a, b) => (b.action_at || '').localeCompare(a.action_at || '')), [filtered]);
  const totalPages = Math.max(1, Math.ceil(allItems.length / PAGE_SIZE));
  const paged = allItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Re-group paged items
  const pagedGrouped = useMemo(() => {
    const map = {};
    paged.forEach(h => {
      const day = (h.action_at || '').slice(0, 10);
      if (!map[day]) map[day] = [];
      map[day].push(h);
    });
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
  }, [paged]);

  const activeFilterCount = [filterAction, filterSupplier, filterUser, filterField].filter(Boolean).length;

  return (
    <div>
      <SummaryCards history={history} />

      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {QUICK.map(q => (
          <Button
            key={q.label}
            size="sm"
            variant={quickLabel === q.label ? 'default' : 'outline'}
            className={`text-xs h-7 ${quickLabel === q.label ? 'bg-[#126433] hover:bg-[#0e5229] text-white' : ''}`}
            onClick={() => handleQuick(q)}
          >
            {q.label}
          </Button>
        ))}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input className="pl-8 h-7 text-sm" placeholder="Search supplier, code, user…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Button variant="outline" size="sm" className="h-7 gap-1.5" onClick={() => setFilterOpen(v => !v)}>
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </Button>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 border-orange-300 text-orange-600" onClick={() => exportHistoryExcel(filtered)}>
          <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
        </Button>
        <Button size="sm" className="h-7 gap-1.5" style={{ backgroundColor: '#126433' }} onClick={() => exportHistoryPDF(filtered)}>
          <Download className="w-3.5 h-3.5" /> PDF
        </Button>
      </div>

      {/* Filter Panel */}
      {filterOpen && (
        <div className="bg-card border border-border rounded-xl p-4 mb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Action</label>
            <Select value={filterAction || '__all__'} onValueChange={v => { setFilterAction(v === '__all__' ? '' : v); setPage(1); }}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Actions</SelectItem>
                {['Created','Edited','Archived','Restored'].map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Supplier</label>
            <Select value={filterSupplier || '__all__'} onValueChange={v => { setFilterSupplier(v === '__all__' ? '' : v); setPage(1); }}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Suppliers</SelectItem>
                {suppliers.map(s => <SelectItem key={s.id} value={s.supplier_name}>{s.supplier_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">User</label>
            <Select value={filterUser || '__all__'} onValueChange={v => { setFilterUser(v === '__all__' ? '' : v); setPage(1); }}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Users</SelectItem>
                {allUsers.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Field Changed</label>
            <Select value={filterField || '__all__'} onValueChange={v => { setFilterField(v === '__all__' ? '' : v); setPage(1); }}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Any Field</SelectItem>
                {[
                  { key: 'warehouse_received_net_kg', label: 'Warehouse KG' },
                  { key: 'grn_code', label: 'GRN Code' },
                  { key: 'bags_received', label: 'Bags Received' },
                  { key: 'dispatch_no', label: 'Dispatch No' },
                  { key: 'received_date', label: 'Received Date' },
                  { key: 'remark', label: 'Remark' },
                ].map(f => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-full flex gap-2">
            <Button size="sm" variant="outline" className="text-xs h-7 text-red-600 border-red-200" onClick={() => { setFilterAction(''); setFilterSupplier(''); setFilterUser(''); setFilterField(''); setPage(1); }}>
              Reset Filters
            </Button>
          </div>
        </div>
      )}

      {/* History Feed */}
      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : paged.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">No history entries found.</div>
      ) : (
        pagedGrouped.map(([day, items]) => (
          <div key={day} className="mb-6">
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2 pb-1 border-b border-border">
              {fmtDateKey(day + 'T12:00:00')}
            </div>
            <div className="bg-card border border-border rounded-xl overflow-hidden px-4">
              {items.map(h => <FeedItem key={h.id} entry={h} onViewReceipt={onViewReceipt} />)}
            </div>
          </div>
        ))
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
        <span>Page {page} of {totalPages} ({filtered.length} changes)</span>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
      </div>
    </div>
  );
}