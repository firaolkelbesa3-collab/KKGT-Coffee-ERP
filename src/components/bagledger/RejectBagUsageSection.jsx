import React, { useState, useEffect } from 'react';
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
import { Plus, Pencil, Trash2, Recycle, User, Building2 } from 'lucide-react';
import { format } from 'date-fns';
import NumberInput from '@/components/shared/NumberInput';
import TablePagination from '@/components/shared/TablePagination';

export const REJECT_BAG_PRICE = 153;

function fmt(n, d = 0) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function todayStr() { return new Date().toISOString().slice(0, 10); }

function FormDialog({ open, onOpenChange, initialData, suppliers, onSubmit, isSubmitting }) {
  const [mode, setMode] = useState('agent');
  const [date, setDate] = useState('');
  const [agentName, setAgentName] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [bagsUsed, setBagsUsed] = useState('');
  const [note, setNote] = useState('');

  const agentList = [...new Set(suppliers.map(s => s.agent).filter(Boolean))].sort();

  useEffect(() => {
    if (open) {
      if (initialData) {
        setMode(initialData.reject_mode || 'agent');
        setDate(initialData.date || todayStr());
        setAgentName(initialData.agent_name || '');
        setSupplierName(initialData.supplier_name || '');
        setBagsUsed(initialData.bags_used ?? '');
        setNote(initialData.note || '');
      } else {
        setMode('agent');
        setDate(todayStr());
        setAgentName('');
        setSupplierName('');
        setBagsUsed('');
        setNote('');
      }
    }
  }, [open, initialData]);

  const bags = parseFloat(bagsUsed) || 0;
  const amount = bags * REJECT_BAG_PRICE;
  const canSubmit = !!date && bags > 0 && (mode === 'agent' ? !!agentName : !!supplierName);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    if (mode === 'agent') {
      onSubmit({ reject_mode: 'agent', agent_name: agentName, supplier_name: null, date, bags_used: bags, amount_etb: amount, note: note || null });
    } else {
      onSubmit({ reject_mode: 'supplier', supplier_name: supplierName, agent_name: null, date, bags_used: bags, amount_etb: amount, note: note || null });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">{initialData ? 'Edit Reject Bag Usage' : 'New Reject Bag Usage'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Mode selector — only for new entries */}
          {!initialData && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Usage Mode</Label>
              <div className="flex gap-2">
                <button type="button"
                  onClick={() => { setMode('agent'); setSupplierName(''); }}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${mode === 'agent' ? 'bg-green-600 text-white border-green-600' : 'bg-card border-border text-muted-foreground hover:border-green-400'}`}
                >
                  <User className="w-4 h-4" /> By Agent
                </button>
                <button type="button"
                  onClick={() => { setMode('supplier'); setAgentName(''); }}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${mode === 'supplier' ? 'bg-orange-500 text-white border-orange-500' : 'bg-card border-border text-muted-foreground hover:border-orange-400'}`}
                >
                  <Building2 className="w-4 h-4" /> By Supplier
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground">Must match how the original bag receipt was added.</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Date *</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
            {mode === 'agent' ? (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Agent *</Label>
                <Select value={agentName} onValueChange={setAgentName}>
                  <SelectTrigger><SelectValue placeholder="Select agent..." /></SelectTrigger>
                  <SelectContent>
                    {agentList.length === 0 ? <div className="px-3 py-2 text-sm text-muted-foreground">No agents found</div> : agentList.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Supplier *</Label>
                <Select value={supplierName} onValueChange={setSupplierName}>
                  <SelectTrigger><SelectValue placeholder="Select supplier..." /></SelectTrigger>
                  <SelectContent>
                    {suppliers.length === 0 ? <div className="px-3 py-2 text-sm text-muted-foreground">No suppliers found</div> : suppliers.map(s => <SelectItem key={s.id} value={s.supplier_name}>{s.supplier_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Bags Used *</Label>
              <NumberInput decimals={0} value={bagsUsed} onChange={setBagsUsed} placeholder="0" required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Amount ETB (auto)</Label>
              <Input value={fmt(amount, 2)} readOnly className="bg-muted font-semibold text-secondary" />
              <p className="text-[10px] text-muted-foreground">{bags} × {REJECT_BAG_PRICE} ETB</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Note</Label>
            <Textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Optional..." />
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

export default function RejectBagUsageSection() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const queryClient = useQueryClient();

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers-for-bagledger'],
    queryFn: () => base44.entities.Supplier.list('supplier_name', 500),
  });

  const { data: usages = [], isLoading } = useQuery({
    queryKey: ['reject-bag-usages'],
    queryFn: () => base44.entities.RejectBagUsage.list('-date', 500),
  });

  const createMutation = useMutation({
    mutationFn: data => base44.entities.RejectBagUsage.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['reject-bag-usages'] }); setDialogOpen(false); },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.RejectBagUsage.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['reject-bag-usages'] }); setDialogOpen(false); setEditRecord(null); },
  });
  const deleteMutation = useMutation({
    mutationFn: id => base44.entities.RejectBagUsage.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['reject-bag-usages'] }); setDeleteTarget(null); },
  });

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="p-4 flex items-center justify-between border-b border-border bg-gradient-to-r from-secondary/10 to-transparent">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-secondary/15 p-2"><Recycle className="w-5 h-5 text-secondary" /></div>
          <div>
            <h3 className="font-display font-semibold text-foreground">Reject Bag Usage</h3>
            <p className="text-xs text-muted-foreground">Bags used for reject — {REJECT_BAG_PRICE} ETB per bag</p>
          </div>
        </div>
        <Button onClick={() => { setEditRecord(null); setDialogOpen(true); }} className="bg-secondary hover:bg-secondary/90 text-secondary-foreground">
          <Plus className="w-4 h-4 mr-1" /> Add Usage
        </Button>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              {['#', 'Date', 'Mode', 'Agent', 'Supplier', 'Bags Used', 'Amount ETB', 'Note', 'Actions'].map(h => (
                <TableHead key={h} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array(3).fill(0).map((_, i) => (
                <TableRow key={i}>{Array(9).fill(0).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-14" /></TableCell>)}</TableRow>
              ))
            ) : usages.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">No reject bag usage entries yet.</TableCell></TableRow>
            ) : (
              usages.slice((page - 1) * pageSize, page * pageSize).map((r, i) => {
                const rowNum = (page - 1) * pageSize + i;
                const mode = r.reject_mode || 'supplier';
                return (
                  <TableRow key={r.id} className="hover:bg-muted/30">
                    <TableCell className="text-muted-foreground text-xs">{rowNum + 1}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{r.date ? format(new Date(r.date), 'd MMM yyyy') : '—'}</TableCell>
                    <TableCell>
                      {mode === 'agent'
                        ? <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700"><User className="w-3 h-3" /> Agent</span>
                        : <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-orange-100 text-orange-700"><Building2 className="w-3 h-3" /> Supplier</span>
                      }
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{r.agent_name || '—'}</TableCell>
                    <TableCell className="font-medium whitespace-nowrap">{r.supplier_name || '—'}</TableCell>
                    <TableCell className="text-right">{fmt(r.bags_used)}</TableCell>
                    <TableCell className="text-right font-semibold text-secondary">{fmt(r.amount_etb, 2)}</TableCell>
                    <TableCell className="whitespace-nowrap max-w-[160px] truncate text-muted-foreground text-xs">{r.note || '—'}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => { setEditRecord(r); setDialogOpen(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(r)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <TablePagination
        page={page}
        totalPages={Math.max(1, Math.ceil(usages.length / pageSize))}
        total={usages.length}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSize={setPageSize}
      />

      <FormDialog
        open={dialogOpen}
        onOpenChange={v => { setDialogOpen(v); if (!v) setEditRecord(null); }}
        initialData={editRecord}
        suppliers={suppliers}
        onSubmit={data => { if (editRecord) updateMutation.mutate({ id: editRecord.id, data }); else createMutation.mutate(data); }}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Usage?</AlertDialogTitle>
            <AlertDialogDescription>Delete this reject bag usage entry ({deleteTarget?.date})?</AlertDialogDescription>
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