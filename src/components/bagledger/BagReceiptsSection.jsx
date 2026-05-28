import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Pencil, Trash2, PackageCheck, Warehouse, User, Building2, Info } from 'lucide-react';
import { format } from 'date-fns';
import NumberInput from '@/components/shared/NumberInput';
import ArchiveDialog from '@/components/shared/ArchiveDialog';
import ArchivedRecordsSection from '@/components/shared/ArchivedRecordsSection';
import { archiveRecord } from '@/lib/archiveService';
import { logActivity, diffRecords } from '@/lib/activityLogger';
import TablePagination from '@/components/shared/TablePagination';
import { base44 } from '@/api/supabaseClient';

function fmt(n, d = 0) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function todayStr() { return new Date().toISOString().slice(0, 10); }

function ModeBadge({ mode }) {
  if (mode === 'agent') return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">
      <User className="w-3 h-3" /> Agent
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-orange-100 text-orange-700">
      <Building2 className="w-3 h-3" /> Supplier
    </span>
  );
}

function BagReceiptFormDialog({ open, onOpenChange, initialData, suppliers, onSubmit, isSubmitting }) {
  const [mode, setMode] = useState('agent');
  const [date, setDate] = useState('');
  const [agentName, setAgentName] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [bagsReceived, setBagsReceived] = useState('');
  const [note, setNote] = useState('');
  const [originalMode, setOriginalMode] = useState('agent');

  const isWarehouseEdit = !!initialData && initialData.source === 'warehouse';

  // Derive unique agents from suppliers list
  const agentList = [...new Set(suppliers.map(s => s.agent).filter(Boolean))].sort();

  // Auto-fill agent when supplier is selected (supplier mode) or from warehouse receipt
  const autoAgent = supplierName
    ? (suppliers.find(s => s.supplier_name === supplierName)?.agent || '')
    : '';

  // For warehouse edit: agent from supplier lookup
  const warehouseAgent = isWarehouseEdit
    ? (initialData.agent_name || suppliers.find(s => s.supplier_name === initialData.supplier_name)?.agent || '')
    : '';

  useEffect(() => {
    if (open) {
      if (initialData) {
        const m = initialData.receipt_mode || 'agent';
        setMode(m);
        setOriginalMode(m);
        setDate(initialData.date || todayStr());
        setAgentName(initialData.agent_name || '');
        setSupplierName(initialData.supplier_name || '');
        setBagsReceived(initialData.bags_received ?? '');
        setNote(initialData.note || '');
      } else {
        setMode('agent');
        setOriginalMode('agent');
        setDate(todayStr());
        setAgentName('');
        setSupplierName('');
        setBagsReceived('');
        setNote('');
      }
    }
  }, [open, initialData]);

  const bags = parseFloat(bagsReceived) || 0;
  const canSubmit = !!date && bags > 0 && (mode === 'agent' ? true : !!supplierName);

  const modeChanged = isWarehouseEdit && mode !== originalMode;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    if (isWarehouseEdit) {
      // Save mode override + bags + note; keep supplier/date locked from source
      const payload = {
        bags_received: bags,
        note: note || null,
        receipt_mode: mode,
        agent_name: mode === 'agent' ? (warehouseAgent || null) : null,
        // supplier_name stays as-is on the record; for supplier mode it's already set
      };
      onSubmit(payload);
    } else if (mode === 'agent') {
      onSubmit({ receipt_mode: 'agent', agent_name: agentName, supplier_name: null, date, bags_received: bags, source: 'manual', note: note || null });
    } else {
      onSubmit({ receipt_mode: 'supplier', supplier_name: supplierName, agent_name: autoAgent || null, date, bags_received: bags, source: 'manual', note: note || null });
    }
  };

  const title = !initialData ? 'New Bag Receipt' : isWarehouseEdit ? 'Edit Bag Receipt (from Warehouse)' : 'Edit Bag Receipt';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {isWarehouseEdit && (
            <p className="text-xs text-muted-foreground bg-muted/40 border border-border rounded px-3 py-2">
              Supplier and Date come from the Warehouse Receipt and cannot be changed here.
            </p>
          )}

          {/* Mode selector — for new manual receipts AND warehouse edits */}
          {(!initialData || isWarehouseEdit) && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Track bags by:</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode('agent')}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${mode === 'agent' ? 'bg-green-600 text-white border-green-600' : 'bg-card border-border text-muted-foreground hover:border-green-400'}`}
                >
                  <User className="w-4 h-4" /> Agent
                </button>
                <button
                  type="button"
                  onClick={() => setMode('supplier')}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${mode === 'supplier' ? 'bg-orange-500 text-white border-orange-500' : 'bg-card border-border text-muted-foreground hover:border-orange-400'}`}
                >
                  <Building2 className="w-4 h-4" /> Supplier
                </button>
              </div>
              {/* Mode switch info message for warehouse edits */}
              {modeChanged && (
                <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
                  <Info className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-amber-700">
                    {mode === 'supplier'
                      ? 'Changing this will move this receipt from the Agent summary to the Supplier summary.'
                      : 'Changing this will move this receipt from the Supplier summary to the Agent summary.'}
                  </p>
                </div>
              )}
              {!modeChanged && (
                <p className="text-[10px] text-muted-foreground">
                  {mode === 'agent' ? 'Bags tracked at agent level. Contributes to Agent Level Summary.' : 'Bags tracked per individual supplier. Contributes to Supplier Level Summary.'}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Date *</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} required disabled={isWarehouseEdit} className={isWarehouseEdit ? 'bg-muted' : ''} />
            </div>

            {/* Agent mode for new manual receipt: show agent dropdown */}
            {!isWarehouseEdit && !initialData && mode === 'agent' && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Agent *</Label>
                <Select value={agentName} onValueChange={setAgentName}>
                  <SelectTrigger><SelectValue placeholder="Select agent..." /></SelectTrigger>
                  <SelectContent>
                    {agentList.length === 0
                      ? <div className="px-3 py-2 text-sm text-muted-foreground">No agents in master data</div>
                      : agentList.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)
                    }
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Supplier mode for new manual receipt: show supplier dropdown */}
            {!isWarehouseEdit && !initialData && mode === 'supplier' && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Supplier *</Label>
                <Select value={supplierName} onValueChange={setSupplierName}>
                  <SelectTrigger><SelectValue placeholder="Select supplier..." /></SelectTrigger>
                  <SelectContent>
                    {suppliers.length === 0
                      ? <div className="px-3 py-2 text-sm text-muted-foreground">No suppliers found</div>
                      : suppliers.map(s => <SelectItem key={s.id} value={s.supplier_name}>{s.supplier_name}</SelectItem>)
                    }
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Warehouse edit: show supplier as read-only always */}
            {isWarehouseEdit && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Supplier</Label>
                <Input value={initialData.supplier_name || ''} disabled className="bg-muted" />
              </div>
            )}
          </div>

          {/* Warehouse edit — agent field depending on mode */}
          {isWarehouseEdit && mode === 'agent' && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Agent Name <span className="text-muted-foreground font-normal">(auto-filled)</span></Label>
              <Input value={warehouseAgent || '—'} readOnly className="bg-muted font-medium" />
              <p className="text-[10px] text-muted-foreground">Auto-filled from supplier's linked agent in Master Data. This receipt contributes to the Agent Level Summary.</p>
            </div>
          )}
          {isWarehouseEdit && mode === 'supplier' && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Agent (reference only)</Label>
              <Input value={warehouseAgent || '—'} readOnly className="bg-muted text-muted-foreground" />
              <p className="text-[10px] text-muted-foreground">This receipt contributes to the Supplier Level Summary instead.</p>
            </div>
          )}

          {/* Agent reference when supplier mode (manual) */}
          {!isWarehouseEdit && mode === 'supplier' && supplierName && autoAgent && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Agent (reference)</Label>
              <Input value={autoAgent} readOnly className="bg-muted text-muted-foreground" />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Bags Received *</Label>
            <NumberInput decimals={0} value={bagsReceived} onChange={setBagsReceived} placeholder="0" required />
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

export default function BagReceiptsSection() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const queryClient = useQueryClient();

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers-for-bagledger'],
    queryFn: () => base44.entities.Supplier.list('supplier_name', 500),
  });

  const { data: rawBagReceipts = [], isLoading } = useQuery({
    queryKey: ['bag-receipts'],
    queryFn: () => base44.entities.BagReceipt.list('-date', 500),
  });
  const bagReceipts = rawBagReceipts.filter(r => !r.archived);

  const createMutation = useMutation({
    mutationFn: data => base44.entities.BagReceipt.create(data),
    onSuccess: (rec) => {
      queryClient.invalidateQueries({ queryKey: ['bag-receipts'] });
      setDialogOpen(false);
      const label = rec.receipt_mode === 'agent' ? rec.agent_name : rec.supplier_name;
      logActivity({ action_type: 'Created', screen_name: 'Bag Ledger', entity_type: 'BagReceipt', entity_id: rec.id, record_description: `Bag receipt ${rec.bags_received} bags — ${label}` });
    },
  });
  const updateMutation = useMutation({
    mutationFn: async ({ id, data, previous }) => {
      const updated = await base44.entities.BagReceipt.update(id, data);
      return { updated, previous };
    },
    onSuccess: ({ updated, previous }) => {
      queryClient.invalidateQueries({ queryKey: ['bag-receipts'] });
      setDialogOpen(false); setEditRecord(null);
      logActivity({ action_type: 'Edited', screen_name: 'Bag Ledger', entity_type: 'BagReceipt', entity_id: updated.id, record_description: `Bag receipt — ${updated.supplier_name || updated.agent_name}`, changes: diffRecords(previous, updated) });
    },
  });
  const archiveMutation = useMutation({
    mutationFn: ({ record, reason }) => archiveRecord({ entityName: 'BagReceipt', record, screen_name: 'Bag Ledger', description: `Bag receipt ${record.bags_received} bags`, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bag-receipts'] });
      queryClient.invalidateQueries({ queryKey: ['activity-log'] });
      setArchiveTarget(null);
    },
  });

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="p-4 flex items-center justify-between border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2"><PackageCheck className="w-5 h-5 text-primary" /></div>
          <div>
            <h3 className="font-display font-semibold text-foreground">Bag Receipts</h3>
            <p className="text-xs text-muted-foreground">All receipts — by agent or by supplier</p>
          </div>
        </div>
        <Button onClick={() => { setEditRecord(null); setDialogOpen(true); }} className="bg-secondary hover:bg-secondary/90 text-secondary-foreground">
          <Plus className="w-4 h-4 mr-1" /> Add Receipt
        </Button>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              {['#', 'Date', 'Mode', 'Agent', 'Supplier', 'Source', 'WH KG', 'Bags', 'Note', 'Actions'].map(h => (
                <TableHead key={h} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array(3).fill(0).map((_, i) => (
                <TableRow key={i}>{Array(10).fill(0).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-14" /></TableCell>)}</TableRow>
              ))
            ) : bagReceipts.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="text-center py-10 text-muted-foreground">No bag receipts yet.</TableCell></TableRow>
            ) : (
              bagReceipts.slice((page - 1) * pageSize, page * pageSize).map((r, i) => {
                const rowNum = (page - 1) * pageSize + i;
                const isWarehouse = r.source === 'warehouse';
                const mode = r.receipt_mode || (r.supplier_name ? 'supplier' : 'agent');
                return (
                  <TableRow key={r.id} className="hover:bg-muted/30">
                    <TableCell className="text-muted-foreground text-xs">{rowNum + 1}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{r.date ? format(new Date(r.date), 'd MMM yyyy') : '—'}</TableCell>
                    <TableCell><ModeBadge mode={mode} /></TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{r.agent_name || '—'}</TableCell>
                    <TableCell className="font-medium whitespace-nowrap">{r.supplier_name || '—'}</TableCell>
                    <TableCell>
                      {isWarehouse ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-primary/10 text-primary">
                          <Warehouse className="w-3 h-3" /> warehouse
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-secondary/15 text-secondary">manual</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{r.warehouse_received_kg ? fmt(r.warehouse_received_kg, 2) : '—'}</TableCell>
                    <TableCell className="text-right font-semibold text-primary">{fmt(r.bags_received)}</TableCell>
                    <TableCell className="whitespace-nowrap max-w-[160px] truncate text-muted-foreground text-xs">{r.note || '—'}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => { setEditRecord(r); setDialogOpen(true); }} title="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setArchiveTarget(r)} title="Archive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
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
        totalPages={Math.max(1, Math.ceil(bagReceipts.length / pageSize))}
        total={bagReceipts.length}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSize={setPageSize}
      />

      <BagReceiptFormDialog
        open={dialogOpen}
        onOpenChange={v => { setDialogOpen(v); if (!v) setEditRecord(null); }}
        initialData={editRecord}
        suppliers={suppliers}
        onSubmit={data => { if (editRecord) updateMutation.mutate({ id: editRecord.id, data, previous: editRecord }); else createMutation.mutate(data); }}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      />

      <ArchiveDialog
        open={!!archiveTarget}
        onOpenChange={v => { if (!v) setArchiveTarget(null); }}
        title="Archive Bag Receipt?"
        description={archiveTarget ? `Archive this bag receipt (${archiveTarget.date})? Summary will recalculate.` : ''}
        isPending={archiveMutation.isPending}
        onConfirm={(reason) => archiveMutation.mutate({ record: archiveTarget, reason })}
      />

      <div className="p-4 border-t border-border">
        <ArchivedRecordsSection
          entityName="BagReceipt"
          screenName="Bag Ledger"
          queryKey={['bag-receipts']}
          describeRecord={(r) => `Bag receipt ${r.bags_received} bags — ${r.supplier_name || r.agent_name}`}
          columns={[
            { label: 'Date', render: (r) => r.date || '—' },
            { label: 'Mode', render: (r) => r.receipt_mode || '—' },
            { label: 'Agent', render: (r) => r.agent_name || '—' },
            { label: 'Supplier', render: (r) => r.supplier_name || '—' },
            { label: 'Bags', render: (r) => fmt(r.bags_received) },
          ]}
        />
      </div>
    </div>
  );
}
