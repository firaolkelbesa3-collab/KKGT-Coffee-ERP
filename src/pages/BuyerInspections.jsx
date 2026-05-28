import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Pencil, Trash2, Search, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import RoleGuard from '@/components/RoleGuard';
import { computeStockPools } from '@/lib/stockPools';
import TablePagination from '@/components/shared/TablePagination';
import { base44 } from '@/api/supabaseClient';

// PAGE_SIZE replaced by dynamic pageSize state
const REJECTION_REASONS = ['Too Much Moisture', 'Grade Too Low', 'Defects', 'Smell/Taste Issue', 'Other'];
const ACTIONS = ['Reprocess', 'Sell Locally', 'Hold in Warehouse'];

function fmt(n, d = 0) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

const EMPTY = {
  inspection_date: '', buyer_name: '', coffee_type: '',
  kg_to_inspect: '', sample_kg_taken: '',
  result: 'Pending',
  kg_approved: '', linked_contract_id: '', linked_contract_no: '',
  rejection_reason: '', kg_rejected: '', action_taken: '',
  notes: '',
};

function ResultBadge({ result }) {
  if (result === 'Passed') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700"><CheckCircle2 className="w-3 h-3" /> Passed</span>;
  if (result === 'Failed') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700"><XCircle className="w-3 h-3" /> Failed</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700"><Clock className="w-3 h-3" /> Pending</span>;
}

function InspectionFormDialog({ open, onOpenChange, initialData, coffeeTypes, contracts, freshStock, onSubmit, isSubmitting }) {
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (open) {
      setForm(initialData ? { ...EMPTY, ...initialData } : { ...EMPTY, inspection_date: new Date().toISOString().slice(0, 10) });
    }
  }, [open, initialData]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const kgToInspect = parseFloat(form.kg_to_inspect) || 0;
  const sampleKg = parseFloat(form.sample_kg_taken) || 0;
  const availableFresh = form.coffee_type ? (freshStock[form.coffee_type] || 0) : 0;
  // When editing, add back this inspection's own sample so the user isn't counted against themselves
  const ownPrevSample = initialData ? Number(initialData.sample_kg_taken || 0) : 0;
  const availableForCheck = availableFresh + ownPrevSample;
  const sampleExceedsStock = sampleKg > availableForCheck && sampleKg > 0;

  // Auto-fill kg_approved / kg_rejected from kg_to_inspect when result changes
  useEffect(() => {
    if (form.result === 'Passed' && form.kg_approved === '') {
      setForm(p => ({ ...p, kg_approved: p.kg_to_inspect }));
    }
    if (form.result === 'Failed' && form.kg_rejected === '') {
      setForm(p => ({ ...p, kg_rejected: p.kg_to_inspect }));
    }
  }, [form.result]);

  const handleContractChange = (id) => {
    if (id === '__new__') {
      set('linked_contract_id', '__new__');
      set('linked_contract_no', 'Create new contract');
      return;
    }
    const c = contracts.find(c => c.id === id);
    setForm(p => ({ ...p, linked_contract_id: id, linked_contract_no: c?.contract_no || '' }));
  };

  const errors = [];
  if (kgToInspect <= 0) errors.push('KG to Inspect must be greater than 0');
  if (sampleKg <= 0) errors.push('Sample KG Taken must be greater than 0');
  if (sampleExceedsStock) errors.push(`Sample (${fmt(sampleKg)} KG) exceeds available Fresh stock (${fmt(availableForCheck)} KG) for ${form.coffee_type}`);
  if (form.result === 'Failed' && !form.rejection_reason) errors.push('Rejection Reason is required for Failed result');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (errors.length) return;
    const data = {
      inspection_date: form.inspection_date,
      buyer_name: form.buyer_name,
      coffee_type: form.coffee_type,
      kg_to_inspect: kgToInspect,
      sample_kg_taken: sampleKg,
      result: form.result,
      notes: form.notes || null,
    };
    if (form.result === 'Passed') {
      data.kg_approved = parseFloat(form.kg_approved) || null;
      // Only persist real contract ids — skip "__new__" placeholder
      data.linked_contract_id = (form.linked_contract_id && form.linked_contract_id !== '__new__') ? form.linked_contract_id : null;
      data.linked_contract_no = form.linked_contract_no || null;
      data.rejection_reason = null;
      data.kg_rejected = null;
      data.action_taken = null;
    } else if (form.result === 'Failed') {
      data.rejection_reason = form.rejection_reason;
      data.kg_rejected = parseFloat(form.kg_rejected) || null;
      data.action_taken = form.action_taken || null;
      data.kg_approved = null;
      data.linked_contract_id = null;
      data.linked_contract_no = null;
    }
    onSubmit(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display">{initialData ? 'Edit Inspection' : 'New Buyer Inspection'}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Date *</Label>
              <Input type="date" value={form.inspection_date} onChange={e => set('inspection_date', e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Buyer Name *</Label>
              <Input value={form.buyer_name} onChange={e => set('buyer_name', e.target.value)} placeholder="Buyer who sent inspector" required />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Coffee Type *</Label>
            <Select value={form.coffee_type} onValueChange={v => set('coffee_type', v)}>
              <SelectTrigger><SelectValue placeholder="Select coffee type..." /></SelectTrigger>
              <SelectContent>{coffeeTypes.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
            {form.coffee_type && (
              <p className="text-xs text-muted-foreground mt-1">
                Available Fresh Stock: <span className={`font-semibold ${availableForCheck > 0 ? 'text-green-700' : 'text-destructive'}`}>{fmt(availableForCheck)} KG</span>
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">KG to Inspect *</Label>
              <Input type="number" step="any" min="0" value={form.kg_to_inspect} onChange={e => set('kg_to_inspect', e.target.value)} placeholder="0" required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Sample KG Taken *</Label>
              <Input type="number" step="any" min="0" value={form.sample_kg_taken} onChange={e => set('sample_kg_taken', e.target.value)} placeholder="0" required />
              <p className="text-[11px] text-muted-foreground">Deducted from total {form.coffee_type || 'coffee type'} stock</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium">Inspection Result *</Label>
            <div className="flex gap-2">
              {['Pending', 'Passed', 'Failed'].map(r => (
                <button key={r} type="button" onClick={() => set('result', r)}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold border transition-all ${form.result === r ? (r === 'Passed' ? 'bg-green-600 text-white border-green-600' : r === 'Failed' ? 'bg-red-600 text-white border-red-600' : 'bg-amber-500 text-white border-amber-500') : 'bg-background border-border text-muted-foreground hover:border-primary/50'}`}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          {form.result === 'Passed' && (
            <div className="space-y-4 rounded-lg border border-green-200 bg-green-50/50 p-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">KG Approved for Export</Label>
                <Input type="number" step="any" value={form.kg_approved} onChange={e => set('kg_approved', e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Link to Export Contract</Label>
                <Select value={form.linked_contract_id} onValueChange={handleContractChange}>
                  <SelectTrigger><SelectValue placeholder="Select contract or create new..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__new__">+ Create new contract</SelectItem>
                    {contracts.map(c => <SelectItem key={c.id} value={c.id}>{c.contract_no} — {c.coffee_type} → {c.destination_country}</SelectItem>)}
                  </SelectContent>
                </Select>
                {form.linked_contract_id === '__new__' && (
                  <p className="text-xs text-amber-700">Save this inspection first, then create the contract from the Export Contracts page.</p>
                )}
              </div>
            </div>
          )}

          {form.result === 'Failed' && (
            <div className="space-y-4 rounded-lg border border-red-200 bg-red-50/50 p-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Rejection Reason *</Label>
                <Select value={form.rejection_reason} onValueChange={v => set('rejection_reason', v)}>
                  <SelectTrigger><SelectValue placeholder="Select reason..." /></SelectTrigger>
                  <SelectContent>{REJECTION_REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">KG Rejected</Label>
                <Input type="number" step="any" value={form.kg_rejected} onChange={e => set('kg_rejected', e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Action</Label>
                <Select value={form.action_taken} onValueChange={v => set('action_taken', v)}>
                  <SelectTrigger><SelectValue placeholder="Select action..." /></SelectTrigger>
                  <SelectContent>{ACTIONS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                </Select>
                {form.action_taken === 'Reprocess' && (
                  <p className="text-[11px] text-amber-700">A Recleaning entry will be auto-created in Processing Log linked to this inspection.</p>
                )}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Notes</Label>
            <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} placeholder="Optional..." />
          </div>

          {errors.length > 0 && (
            <div className="space-y-1">
              {errors.map((err, i) => <p key={i} className="text-xs font-medium text-destructive">⛔ {err}</p>)}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting || errors.length > 0}>
              {isSubmitting ? 'Saving...' : initialData ? 'Update' : 'Save Inspection'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function BuyerInspections() {
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [confirmMsg, setConfirmMsg] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const queryClient = useQueryClient();

  const { data: inspections = [], isLoading } = useQuery({
    queryKey: ['buyer-inspections'],
    queryFn: () => base44.entities.BuyerInspection.list('-inspection_date', 500),
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list(),
  });
  const { data: contracts = [] } = useQuery({
    queryKey: ['export-contracts'],
    queryFn: () => base44.entities.ExportContract.list('-contract_date', 500),
  });
  const { data: outputReports = [] } = useQuery({
    queryKey: ['output-reports'],
    queryFn: () => base44.entities.OutputReport.list('-created_date', 500),
  });
  const { data: sampleLogs = [] } = useQuery({
    queryKey: ['sample-logs'],
    queryFn: () => base44.entities.SampleLog.list(),
  });

  const coffeeTypes = useMemo(() => {
    const types = new Set(suppliers.map(s => s.coffee_type).filter(Boolean));
    return Array.from(types).sort();
  }, [suppliers]);

  const { fresh: freshStock } = useMemo(
    () => computeStockPools({ outputReports, contracts, inspections, sampleLogs }),
    [outputReports, contracts, inspections, sampleLogs]
  );

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const created = await base44.entities.BuyerInspection.create(data);
      // Auto-create Recleaning ProcessingLog entry when Failed + Reprocess
      if (created.result === 'Failed' && created.action_taken === 'Reprocess') {
        await base44.entities.ProcessingLog.create({
          entry_type: 'Recleaning',
          buyer_name: created.buyer_name,
          inspection_ref: created.id,
          date: created.inspection_date,
          coffee_type: created.coffee_type,
          actual_weighed_kg: created.kg_rejected || 0,
          remark: `Auto-created from failed buyer inspection — ${created.rejection_reason || ''}`,
        });
      }
      return created;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['buyer-inspections'] });
      queryClient.invalidateQueries({ queryKey: ['processing-logs'] });
      setDialogOpen(false);
      setConfirmMsg(`Inspection recorded. Sample of ${fmt(created.sample_kg_taken)} KG deducted from ${created.coffee_type} stock. Available stock updated.`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.BuyerInspection.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buyer-inspections'] });
      setDialogOpen(false);
      setEditRecord(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: id => base44.entities.BuyerInspection.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buyer-inspections'] });
      setDeleteTarget(null);
    },
  });

  const contractByIdNo = useMemo(() => {
    const map = {};
    contracts.forEach(c => { map[c.id] = c.contract_no; });
    return map;
  }, [contracts]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return inspections.filter(i =>
      !search ||
      i.buyer_name?.toLowerCase().includes(q) ||
      i.coffee_type?.toLowerCase().includes(q) ||
      i.result?.toLowerCase().includes(q)
    );
  }, [inspections, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const COLS = ['#', 'Date', 'Buyer Name', 'Coffee Type', 'KG Inspected', 'Sample KG', 'Result', 'Action Taken', 'Linked Contract', 'Actions'];

  return (
    <RoleGuard allowedRoles={['admin']}>
      <div>
        <PageHeader title="Buyer Inspections" description="Track buyer inspector visits and pass/fail outcomes">
          <Button onClick={() => { setEditRecord(null); setDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-1" /> New Inspection
          </Button>
        </PageHeader>

        <div className="relative mb-4 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by buyer, coffee type, result..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  {COLS.map(c => <TableHead key={c} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{c}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? Array(3).fill(0).map((_, i) => (
                  <TableRow key={i}>{COLS.map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>)}</TableRow>
                )) : paginated.length === 0 ? (
                  <TableRow><TableCell colSpan={COLS.length} className="text-center py-12 text-muted-foreground">{search ? 'No inspections match.' : 'No buyer inspections yet.'}</TableCell></TableRow>
                ) : paginated.map((r, i) => (
                  <TableRow key={r.id} className="hover:bg-muted/30">
                    <TableCell className="text-muted-foreground text-xs">{(page - 1) * pageSize + i + 1}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{r.inspection_date ? format(new Date(r.inspection_date), 'MMM d, yyyy') : '—'}</TableCell>
                    <TableCell className="font-medium whitespace-nowrap">{r.buyer_name}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{r.coffee_type}</TableCell>
                    <TableCell className="text-right">{fmt(r.kg_to_inspect)}</TableCell>
                    <TableCell className="text-right text-blue-600 font-medium">{fmt(r.sample_kg_taken)}</TableCell>
                    <TableCell><ResultBadge result={r.result} /></TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{r.action_taken || (r.result === 'Passed' ? 'Approved for export' : '—')}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs font-mono text-primary">
                      {r.linked_contract_no || (r.linked_contract_id && contractByIdNo[r.linked_contract_id]) || '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => { setEditRecord(r); setDialogOpen(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(r)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <TablePagination
          page={page}
          totalPages={totalPages}
          total={filtered.length}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSize={setPageSize}
        />

        <InspectionFormDialog
          open={dialogOpen}
          onOpenChange={v => { setDialogOpen(v); if (!v) setEditRecord(null); }}
          initialData={editRecord}
          coffeeTypes={coffeeTypes}
          contracts={contracts}
          freshStock={freshStock}
          onSubmit={data => { if (editRecord) updateMutation.mutate({ id: editRecord.id, data }); else createMutation.mutate(data); }}
          isSubmitting={createMutation.isPending || updateMutation.isPending}
        />

        <AlertDialog open={!!confirmMsg} onOpenChange={v => !v && setConfirmMsg(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Inspection Saved</AlertDialogTitle>
              <AlertDialogDescription>{confirmMsg}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction onClick={() => setConfirmMsg(null)}>OK</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Inspection?</AlertDialogTitle>
              <AlertDialogDescription>Delete inspection for <strong>{deleteTarget?.buyer_name}</strong> on {deleteTarget?.inspection_date}?</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deleteMutation.mutate(deleteTarget.id)}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </RoleGuard>
  );
}
