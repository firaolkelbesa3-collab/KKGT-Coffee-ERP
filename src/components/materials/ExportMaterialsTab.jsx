import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Pencil, Trash2, FileDown, FileSpreadsheet, Package, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { format } from 'date-fns';
import NumberInput from '@/components/shared/NumberInput';
import { exportMaterialsPDF, exportMaterialsExcel, fmt } from '@/lib/materialsExport';
import TablePagination from '@/components/shared/TablePagination';

const ITEM_TYPES = ['Bag', 'Craft', 'Plaster', 'Green Pro'];
const BAG_SIZES = ['30kg', '50kg', '60kg'];

function todayStr() { return new Date().toISOString().slice(0, 10); }

function itemKey(r) {
  if (r.item_type === 'Bag') return `Bag ${r.bag_size || ''}`.trim();
  return r.item_type || '';
}

const EMPTY = {
  date: '', item_type: '', bag_size: '', entry_type: 'Purchase',
  quantity: '', unit_cost_etb: '', note: '',
};

function ExportMaterialFormDialog({ open, onOpenChange, initialData, onSubmit, isSubmitting, balanceByItemKey }) {
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (open) {
      setForm(initialData ? {
        date: initialData.date || todayStr(),
        item_type: initialData.item_type || '',
        bag_size: initialData.bag_size || '',
        entry_type: initialData.entry_type || 'Purchase',
        quantity: initialData.quantity ?? '',
        unit_cost_etb: initialData.unit_cost_etb ?? '',
        note: initialData.note || '',
      } : { ...EMPTY, date: todayStr() });
    }
  }, [open, initialData]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const qty = parseFloat(form.quantity) || 0;
  const unit = parseFloat(form.unit_cost_etb) || 0;
  const total = qty * unit;
  const isPurchase = form.entry_type === 'Purchase';
  const isBag = form.item_type === 'Bag';

  // Available stock for the selected item (when entering a Usage / Stock OUT).
  // When editing an existing Usage entry, add its own quantity back so the user can keep or reduce it.
  const currentItemKey = isBag ? `Bag ${form.bag_size || ''}`.trim() : (form.item_type || '');
  const rawBalance = balanceByItemKey?.[currentItemKey] || 0;
  const ownQty = (initialData && initialData.entry_type === 'Usage') ? (Number(initialData.quantity) || 0) : 0;
  const availableStock = rawBalance + ownQty;
  const isUsage = form.entry_type === 'Usage';
  const showStock = isUsage && !!form.item_type && (!isBag || !!form.bag_size);
  const exceedsStock = isUsage && qty > availableStock;

  const canSubmit = !!form.date && !!form.item_type && qty > 0
    && (!isBag || !!form.bag_size)
    && (!isPurchase || unit > 0)
    && !exceedsStock;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      category: 'export',
      date: form.date,
      item_type: form.item_type,
      bag_size: isBag ? form.bag_size : null,
      entry_type: form.entry_type,
      quantity: qty,
      unit_cost_etb: isPurchase ? unit : null,
      total_cost_etb: isPurchase ? total : null,
      note: form.note || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">{initialData ? 'Edit Export Material Entry' : 'New Export Material Entry'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Date *</Label>
              <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Entry Type *</Label>
              <Select value={form.entry_type} onValueChange={v => set('entry_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Purchase">Purchase (Stock IN)</SelectItem>
                  <SelectItem value="Usage">Usage (Stock OUT)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Item Type *</Label>
              <Select value={form.item_type} onValueChange={v => { set('item_type', v); if (v !== 'Bag') set('bag_size', ''); }}>
                <SelectTrigger><SelectValue placeholder="Select item..." /></SelectTrigger>
                <SelectContent>
                  {ITEM_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {isBag && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Bag Size *</Label>
                <Select value={form.bag_size} onValueChange={v => set('bag_size', v)}>
                  <SelectTrigger><SelectValue placeholder="Select size..." /></SelectTrigger>
                  <SelectContent>
                    {BAG_SIZES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Quantity *</Label>
              <NumberInput decimals={2} value={form.quantity} onChange={v => set('quantity', v)} placeholder="0" required />
              {showStock && (
                <p className={`text-[11px] ${exceedsStock ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                  {exceedsStock
                    ? `Not enough stock. Available: ${fmt(availableStock, 0)}`
                    : `Available stock: ${fmt(availableStock, 0)}`}
                </p>
              )}
            </div>
            {isPurchase && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Unit Cost ETB *</Label>
                <NumberInput decimals={2} value={form.unit_cost_etb} onChange={v => set('unit_cost_etb', v)} placeholder="0.00" required />
              </div>
            )}
          </div>

          {isPurchase && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Total Cost ETB (auto)</Label>
              <Input value={fmt(total)} readOnly className="bg-muted font-semibold" />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Note</Label>
            <Textarea value={form.note} onChange={e => set('note', e.target.value)} rows={2} placeholder="Optional..." />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting || !canSubmit}>
              {isSubmitting ? 'Saving...' : initialData ? 'Update' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function ExportMaterialsTab() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const queryClient = useQueryClient();

  const { data: allEntries = [], isLoading } = useQuery({
    queryKey: ['material-register-entries'],
    queryFn: () => base44.entities.MaterialRegisterEntry.list('-date', 1000),
  });

  const entries = useMemo(
    () => allEntries.filter(e => e.category === 'export'),
    [allEntries]
  );

  const createMutation = useMutation({
    mutationFn: data => base44.entities.MaterialRegisterEntry.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['material-register-entries'] }); setDialogOpen(false); },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.MaterialRegisterEntry.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['material-register-entries'] }); setDialogOpen(false); setEditRecord(null); },
  });
  const deleteMutation = useMutation({
    mutationFn: id => base44.entities.MaterialRegisterEntry.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['material-register-entries'] }); setDeleteTarget(null); },
  });

  // Date-filtered for table display
  const filtered = useMemo(() => entries.filter(e => {
    if (fromDate && e.date < fromDate) return false;
    if (toDate && e.date > toDate) return false;
    return true;
  }), [entries, fromDate, toDate]);

  // Build per-item summary from ALL entries (balance is lifetime, not filtered)
  const itemKeys = useMemo(() => {
    const set = new Set();
    ITEM_TYPES.forEach(t => {
      if (t === 'Bag') BAG_SIZES.forEach(s => set.add(`Bag ${s}`));
      else set.add(t);
    });
    entries.forEach(e => set.add(itemKey(e)));
    return Array.from(set);
  }, [entries]);

  const summaryByItem = useMemo(() => {
    const map = {};
    itemKeys.forEach(k => { map[k] = { purchased: 0, used: 0, totalCost: 0 }; });
    entries.forEach(e => {
      const k = itemKey(e);
      if (!map[k]) map[k] = { purchased: 0, used: 0, totalCost: 0 };
      const q = Number(e.quantity) || 0;
      if (e.entry_type === 'Purchase') {
        map[k].purchased += q;
        map[k].totalCost += Number(e.total_cost_etb) || 0;
      } else if (e.entry_type === 'Usage') {
        map[k].used += q;
      }
    });
    return map;
  }, [entries, itemKeys]);

  const totalExportCost = useMemo(
    () => entries.reduce((s, e) => s + (e.entry_type === 'Purchase' ? (Number(e.total_cost_etb) || 0) : 0), 0),
    [entries]
  );

  // Compute "Balance After" per row chronologically (oldest first)
  const balanceAfterMap = useMemo(() => {
    const sorted = [...entries].sort((a, b) => {
      const da = a.date || ''; const db = b.date || '';
      if (da !== db) return da.localeCompare(db);
      return (a.created_date || '').localeCompare(b.created_date || '');
    });
    const running = {};
    const result = {};
    sorted.forEach(e => {
      const k = itemKey(e);
      if (running[k] == null) running[k] = 0;
      const q = Number(e.quantity) || 0;
      if (e.entry_type === 'Purchase') running[k] += q;
      else if (e.entry_type === 'Usage') running[k] -= q;
      result[e.id] = running[k];
    });
    return result;
  }, [entries]);

  const summaryItemsToShow = itemKeys.filter(k =>
    summaryByItem[k] && (summaryByItem[k].purchased > 0 || summaryByItem[k].used > 0)
  );

  const buildExportRows = () => filtered.map((r, i) => [
    i + 1,
    r.date ? format(new Date(r.date), 'd MMM yyyy') : '',
    itemKey(r),
    r.entry_type || '',
    fmt(r.quantity),
    r.entry_type === 'Purchase' ? fmt(r.unit_cost_etb) : '',
    r.entry_type === 'Purchase' ? fmt(r.total_cost_etb) : '',
    fmt(balanceAfterMap[r.id] || 0),
    r.note || '',
  ]);
  const exportHeaders = ['#', 'Date', 'Item', 'Type', 'Quantity', 'Unit Cost', 'Total Cost', 'Balance After', 'Note'];

  const handlePDF = () => exportMaterialsPDF({
    title: 'Export Materials Register',
    summary: [
      `Total Purchase Cost: ${fmt(totalExportCost)} ETB`,
      `Entries: ${filtered.length}`,
    ],
    headers: exportHeaders,
    rows: buildExportRows(),
  });

  const handleExcel = () => exportMaterialsExcel({
    title: 'Export Materials Register',
    sheetName: 'Export Materials',
    headers: exportHeaders,
    rows: buildExportRows(),
  });

  return (
    <div>
      {/* Top action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <Label className="text-xs font-medium text-muted-foreground">From</Label>
            <Input type="date" className="w-[160px]" value={fromDate} onChange={e => setFromDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs font-medium text-muted-foreground">To</Label>
            <Input type="date" className="w-[160px]" value={toDate} onChange={e => setToDate(e.target.value)} />
          </div>
          {(fromDate || toDate) && (
            <Button variant="outline" size="sm" onClick={() => { setFromDate(''); setToDate(''); }}>Clear</Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handlePDF}><FileDown className="w-4 h-4 mr-1" /> PDF</Button>
          <Button variant="outline" size="sm" onClick={handleExcel}><FileSpreadsheet className="w-4 h-4 mr-1" /> Excel</Button>
          <Button onClick={() => { setEditRecord(null); setDialogOpen(true); }} className="bg-secondary hover:bg-secondary/90 text-secondary-foreground">
            <Plus className="w-4 h-4 mr-1" /> New Entry
          </Button>
        </div>
      </div>

      {/* Total cost card */}
      <div className="rounded-xl border border-border bg-gradient-to-br from-primary/5 to-secondary/5 p-4 mb-5 flex items-center gap-4">
        <div className="rounded-lg bg-primary/10 p-3">
          <Package className="w-6 h-6 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Export Materials Cost</p>
          <p className="text-2xl font-bold text-primary">{fmt(totalExportCost)} <span className="text-base text-muted-foreground">ETB</span></p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Total Entries</p>
          <p className="text-lg font-semibold">{entries.length}</p>
        </div>
      </div>

      {/* Per-item balance cards */}
      {summaryItemsToShow.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-6">
          {summaryItemsToShow.map(k => {
            const s = summaryByItem[k];
            const balance = s.purchased - s.used;
            return (
              <div key={k} className="rounded-xl border border-border bg-card p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-foreground">{k}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${balance > 0 ? 'bg-primary/10 text-primary' : balance < 0 ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>
                    {fmt(balance, 0)} left
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <ArrowDownCircle className="w-3.5 h-3.5 text-primary" />
                    <div>
                      <p className="text-muted-foreground text-[10px]">Purchased</p>
                      <p className="font-semibold">{fmt(s.purchased, 0)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <ArrowUpCircle className="w-3.5 h-3.5 text-secondary" />
                    <div>
                      <p className="text-muted-foreground text-[10px]">Used</p>
                      <p className="font-semibold">{fmt(s.used, 0)}</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">#</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Date</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Item</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Type</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Quantity</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Unit Cost</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Total Cost</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Balance After</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Note</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array(4).fill(0).map((_, i) => (
                  <TableRow key={i}>{Array(10).fill(0).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-14" /></TableCell>)}</TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                    {entries.length === 0 ? 'No export material entries yet.' : 'No entries match the date filter.'}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.slice((page - 1) * pageSize, page * pageSize).map((r, i) => (
                  <TableRow key={r.id} className="hover:bg-muted/30">
                    <TableCell className="text-muted-foreground text-xs">{(page - 1) * pageSize + i + 1}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{r.date ? format(new Date(r.date), 'd MMM yyyy') : '—'}</TableCell>
                    <TableCell className="font-medium whitespace-nowrap">{itemKey(r)}</TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.entry_type === 'Purchase' ? 'bg-primary/10 text-primary' : 'bg-secondary/15 text-secondary'}`}>
                        {r.entry_type}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">{fmt(r.quantity, 0)}</TableCell>
                    <TableCell className="text-right">{r.entry_type === 'Purchase' ? fmt(r.unit_cost_etb) : '—'}</TableCell>
                    <TableCell className="text-right font-semibold">{r.entry_type === 'Purchase' ? fmt(r.total_cost_etb) : '—'}</TableCell>
                    <TableCell className="text-right font-medium">{fmt(balanceAfterMap[r.id] || 0, 0)}</TableCell>
                    <TableCell className="whitespace-nowrap max-w-[180px] truncate text-muted-foreground">{r.note || '—'}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => { setEditRecord(r); setDialogOpen(true); }}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(r)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <TablePagination
        page={page}
        totalPages={Math.max(1, Math.ceil(filtered.length / pageSize))}
        total={filtered.length}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSize={setPageSize}
      />

      <ExportMaterialFormDialog
        open={dialogOpen}
        onOpenChange={v => { setDialogOpen(v); if (!v) setEditRecord(null); }}
        initialData={editRecord}
        balanceByItemKey={Object.fromEntries(Object.entries(summaryByItem).map(([k, s]) => [k, (s.purchased || 0) - (s.used || 0)]))}
        onSubmit={data => { if (editRecord) updateMutation.mutate({ id: editRecord.id, data }); else createMutation.mutate(data); }}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Entry?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete <strong>{deleteTarget?.entry_type}</strong> entry for <strong>{deleteTarget && itemKey(deleteTarget)}</strong> ({deleteTarget?.date})?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deleteMutation.mutate(deleteTarget.id)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}