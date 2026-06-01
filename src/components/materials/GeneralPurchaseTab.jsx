import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Pencil, Trash2, FileDown, FileSpreadsheet, ShoppingBag } from 'lucide-react';
import { format } from 'date-fns';
import NumberInput from '@/components/shared/NumberInput';
import { exportMaterialsPDF, exportMaterialsExcel, fmt } from '@/lib/materialsExport';
import TablePagination from '@/components/shared/TablePagination';

function todayStr() { return new Date().toISOString().slice(0, 10); }

const EMPTY = {
  date: '', item_name: '', quantity: '', unit_cost_etb: '', purpose: '', note: '',
};

function GeneralFormDialog({ open, onOpenChange, initialData, onSubmit, isSubmitting }) {
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (open) {
      setForm(initialData ? {
        date: initialData.date || todayStr(),
        item_name: initialData.item_name || '',
        quantity: initialData.quantity ?? '',
        unit_cost_etb: initialData.unit_cost_etb ?? '',
        purpose: initialData.purpose || '',
        note: initialData.note || '',
      } : { ...EMPTY, date: todayStr() });
    }
  }, [open, initialData]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const qty = parseFloat(form.quantity) || 0;
  const unit = parseFloat(form.unit_cost_etb) || 0;
  const total = qty * unit;

  const canSubmit = !!form.date && !!form.item_name.trim() && qty > 0 && unit > 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      category: 'general',
      date: form.date,
      item_name: form.item_name.trim(),
      quantity: qty,
      unit_cost_etb: unit,
      total_cost_etb: total,
      purpose: form.purpose || null,
      note: form.note || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">{initialData ? 'Edit General Purchase' : 'New General Purchase'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Date *</Label>
              <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Item Name *</Label>
              <Input value={form.item_name} onChange={e => set('item_name', e.target.value)} placeholder="e.g. Stationery" required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Quantity *</Label>
              <NumberInput decimals={2} value={form.quantity} onChange={v => set('quantity', v)} placeholder="0" required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Unit Cost ETB *</Label>
              <NumberInput decimals={2} value={form.unit_cost_etb} onChange={v => set('unit_cost_etb', v)} placeholder="0.00" required />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Total Cost ETB (auto)</Label>
            <Input value={fmt(total)} readOnly className="bg-muted font-semibold" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Purpose</Label>
            <Input value={form.purpose} onChange={e => set('purpose', e.target.value)} placeholder="Optional..." />
          </div>

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

export default function GeneralPurchaseTab() {
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

  // Backwards-compat: treat entries without a category as 'general'
  const entries = useMemo(
    () => allEntries.filter(e => !e.category || e.category === 'general'),
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

  const filtered = useMemo(() => entries.filter(e => {
    if (fromDate && e.date < fromDate) return false;
    if (toDate && e.date > toDate) return false;
    return true;
  }), [entries, fromDate, toDate]);

  const totalCost = useMemo(
    () => filtered.reduce((sum, e) => sum + (Number(e.total_cost_etb) || 0), 0),
    [filtered]
  );

  const headers = ['#', 'Date', 'Item Name', 'Quantity', 'Unit Cost', 'Total Cost', 'Purpose', 'Note'];
  const buildRows = () => filtered.map((r, i) => [
    i + 1,
    r.date ? format(new Date(r.date), 'd MMM yyyy') : '',
    r.item_name || '',
    fmt(r.quantity),
    fmt(r.unit_cost_etb),
    fmt(r.total_cost_etb),
    r.purpose || '',
    r.note || '',
  ]);

  const handlePDF = () => exportMaterialsPDF({
    title: 'General Purchase Register',
    summary: [`Total Cost: ${fmt(totalCost)} ETB`, `Entries: ${filtered.length}`],
    headers,
    rows: buildRows(),
  });
  const handleExcel = () => exportMaterialsExcel({
    title: 'General Purchase Register',
    sheetName: 'General Purchase',
    headers,
    rows: buildRows(),
  });

  return (
    <div>
      {/* Top bar */}
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
          <ShoppingBag className="w-6 h-6 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Total General Purchase Cost</p>
          <p className="text-2xl font-bold text-primary">{fmt(totalCost)} <span className="text-base text-muted-foreground">ETB</span></p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Entries</p>
          <p className="text-lg font-semibold">{filtered.length}</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">#</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Date</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Item Name</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Quantity</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Unit Cost ETB</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Total Cost ETB</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Purpose</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Note</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array(4).fill(0).map((_, i) => (
                  <TableRow key={i}>{Array(9).fill(0).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>)}</TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                    {entries.length === 0 ? 'No general purchases yet.' : 'No entries match the date filter.'}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.slice((page - 1) * pageSize, page * pageSize).map((r, i) => (
                  <TableRow key={r.id} className="hover:bg-muted/30">
                    <TableCell className="text-muted-foreground text-xs">{(page - 1) * pageSize + i + 1}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{r.date ? format(new Date(r.date), 'd MMM yyyy') : '—'}</TableCell>
                    <TableCell className="font-medium whitespace-nowrap">{r.item_name}</TableCell>
                    <TableCell className="text-right">{fmt(r.quantity)}</TableCell>
                    <TableCell className="text-right">{fmt(r.unit_cost_etb)}</TableCell>
                    <TableCell className="text-right font-semibold">{fmt(r.total_cost_etb)}</TableCell>
                    <TableCell className="whitespace-nowrap max-w-[180px] truncate text-muted-foreground">{r.purpose || '—'}</TableCell>
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

      <GeneralFormDialog
        open={dialogOpen}
        onOpenChange={v => { setDialogOpen(v); if (!v) setEditRecord(null); }}
        initialData={editRecord}
        onSubmit={data => { if (editRecord) updateMutation.mutate({ id: editRecord.id, data }); else createMutation.mutate(data); }}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Entry?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete entry for <strong>{deleteTarget?.item_name}</strong> ({deleteTarget?.date})?
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