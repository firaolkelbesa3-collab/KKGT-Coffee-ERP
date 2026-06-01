import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Pencil, Trash2, Search, AlertTriangle, CheckCircle2, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import RoleGuard from '@/components/RoleGuard';
import { computeStockPools } from '@/lib/stockPools';
import NumberInput from '@/components/shared/NumberInput';
import TablePagination from '@/components/shared/TablePagination';
import RichArchiveDialog from '@/components/shared/RichArchiveDialog';
import ArchivedRecordsSection from '@/components/shared/ArchivedRecordsSection';
import { archiveRecord } from '@/lib/archiveService';
import { computeAvailabilityBySupplier } from '@/lib/availabilityUtils';
import { logActivity, diffRecords } from '@/lib/activityLogger';

// PAGE_SIZE replaced by dynamic pageSize state

function fmt(n, d = 2) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function nowStr() { return new Date().toISOString().slice(0, 16); }

function SortIcon({ col, sortKey, sortDir }) {
  if (sortKey !== col) return <ChevronsUpDown className="inline w-3 h-3 ml-1 opacity-30" />;
  return sortDir === 'asc' ? <ChevronUp className="inline w-3 h-3 ml-1" /> : <ChevronDown className="inline w-3 h-3 ml-1" />;
}

function StockBadge({ available }) {
  if (available == null) return null;
  if (available <= 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive">
        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
        <span className="font-semibold text-sm">⛔ NO STOCK — DO NOT ENTER</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/10 border border-accent/30 text-accent">
      <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
      <span className="font-semibold text-sm">✅ OK TO ENTER — Available: {fmt(available)} KG</span>
    </div>
  );
}

const EMPTY = {
  sample_type: 'Warehouse',
  sample_datetime: '', supplier_name: '', coffee_type: '', buyer_name: '', inspection_ref: '',
  export_contract_id: '', export_contract_no: '', warehouse_receipt_id: '',
  sample_kg: '', company_recipient: '', keeper_name: '', remark: '',
};

// Feature 4: type badge styling
const TYPE_BADGE_STYLES = {
  'Warehouse': 'bg-blue-100 text-blue-700',
  'Export Inspection': 'bg-blue-100 text-blue-700',
  'Export': 'bg-green-100 text-green-700',
  'Arrival': 'bg-amber-100 text-amber-700',
};

function SampleFormDialog({ open, onOpenChange, initialData, suppliers, coffeeTypes, availableBySupplier, freshStockByType, contracts, receipts, onSubmit, isSubmitting }) {
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (open) {
      setForm(initialData ? {
        sample_type: initialData.sample_type || 'Warehouse',
        sample_datetime: initialData.sample_datetime || nowStr(),
        supplier_name: initialData.supplier_name || '',
        coffee_type: initialData.coffee_type || '',
        buyer_name: initialData.buyer_name || '',
        inspection_ref: initialData.inspection_ref || '',
        export_contract_id: initialData.export_contract_id || '',
        export_contract_no: initialData.export_contract_no || '',
        warehouse_receipt_id: initialData.warehouse_receipt_id || '',
        sample_kg: initialData.sample_kg ?? '',
        company_recipient: initialData.company_recipient || '',
        keeper_name: initialData.keeper_name || '',
        remark: initialData.remark || '',
      } : { ...EMPTY, sample_datetime: nowStr() });
    }
  }, [open, initialData]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const isExportInspection = form.sample_type === 'Export Inspection';
  const isExport = form.sample_type === 'Export';   // Feature 4
  const isArrival = form.sample_type === 'Arrival'; // Feature 4

  // Stock available depends on type:
  //   Warehouse → supplier remaining KG
  //   Export Inspection / Export → coffee type Fresh stock pool
  //   Arrival → linked Warehouse Receipt's received KG (minus prior Arrival-type samples)
  let available = null;
  if (isArrival) {
    if (form.warehouse_receipt_id) {
      const receipt = receipts.find(r => r.id === form.warehouse_receipt_id);
      available = receipt ? Number(receipt.warehouse_received_net_kg || 0) : null;
    }
  } else if (isExportInspection || isExport) {
    available = form.coffee_type ? (freshStockByType[form.coffee_type] ?? null) : null;
  } else {
    available = form.supplier_name
      ? (form.supplier_name in availableBySupplier ? availableBySupplier[form.supplier_name] : undefined)
      : null;
    // undefined means supplier has no warehouse receipt at all
  }
  const sampleKg = parseFloat(form.sample_kg) || 0;
  const kgIsZeroOrEmpty = form.sample_kg === '' || sampleKg <= 0;
  const availableNum = (available !== null && available !== undefined) ? available : null;
  const exceedsStock = availableNum != null && sampleKg > availableNum && sampleKg > 0;
  const missingTypeField = isExportInspection
    ? !form.coffee_type
    : isExport
      ? !form.coffee_type
      : isArrival
        ? false  // receipt link is OPTIONAL per spec
        : !form.supplier_name;
  const isBlocked = kgIsZeroOrEmpty || exceedsStock || missingTypeField;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isBlocked) return;
    const data = {
      sample_type: form.sample_type,
      sample_datetime: form.sample_datetime,
      sample_kg: form.sample_kg !== '' ? parseFloat(form.sample_kg) : null,
      company_recipient: form.company_recipient || null,
      keeper_name: form.keeper_name || null,
      remark: form.remark || null,
      supplier_name: null,
      coffee_type: null,
      buyer_name: null,
      inspection_ref: null,
      export_contract_id: null,
      export_contract_no: null,
      warehouse_receipt_id: null,
    };
    data.sample_date = form.sample_datetime ? form.sample_datetime.slice(0, 10) : null;
    if (isExportInspection) {
      data.coffee_type = form.coffee_type;
      data.buyer_name = form.buyer_name || null;
      data.inspection_ref = form.inspection_ref || null;
    } else if (isExport) {
      data.coffee_type = form.coffee_type;
      if (form.export_contract_id) {
        const c = contracts.find(x => x.id === form.export_contract_id);
        data.export_contract_id = form.export_contract_id;
        data.export_contract_no = c?.contract_no || form.export_contract_no || null;
      }
    } else if (isArrival) {
      if (form.warehouse_receipt_id) {
        const r = receipts.find(x => x.id === form.warehouse_receipt_id);
        data.warehouse_receipt_id = form.warehouse_receipt_id;
        data.supplier_name = r?.supplier_name || null;
        data.coffee_type = r?.coffee_type || null;
      }
    } else {
      // Warehouse (default existing behavior)
      data.supplier_name = form.supplier_name;
    }
    onSubmit(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display">{initialData ? 'Edit Sample Log' : 'New Sample Log Entry'}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Feature 4: Sample Type — 3 main types (Warehouse default + Export + Arrival); Export Inspection kept for backward compat if record already has it */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Type *</Label>
            <div className="grid grid-cols-2 gap-2">
              {['Warehouse', 'Export'].map(t => (
                <button key={t} type="button" onClick={() => set('sample_type', t)}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-all ${form.sample_type === t ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border text-muted-foreground hover:border-primary/50'}`}>
                  {t}
                </button>
              ))}
            </div>
            {form.sample_type === 'Export Inspection' && (
              <p className="text-[11px] text-blue-700">Legacy: "Export Inspection" type retained on this record.</p>
            )}
            <p className="text-[11px] text-muted-foreground">
              {isExport
                ? 'Deducted from total coffee type available stock.'
                : isArrival
                  ? 'Deducted from the linked warehouse receipt\'s received KG.'
                  : isExportInspection
                    ? 'Deducted from total coffee type stock pool (Fresh).'
                    : 'Deducted from supplier remaining KG.'}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Date & Time</Label>
            <Input type="datetime-local" value={form.sample_datetime} onChange={e => set('sample_datetime', e.target.value)} />
          </div>

          {(isExportInspection || isExport) ? (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Coffee Type *</Label>
                <Select value={form.coffee_type} onValueChange={v => set('coffee_type', v)}>
                  <SelectTrigger><SelectValue placeholder="Select coffee type..." /></SelectTrigger>
                  <SelectContent>{coffeeTypes.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {isExport && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Link to Export Contract <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Select value={form.export_contract_id} onValueChange={v => set('export_contract_id', v)}>
                    <SelectTrigger><SelectValue placeholder="Select contract..." /></SelectTrigger>
                    <SelectContent>{contracts.map(c => <SelectItem key={c.id} value={c.id}>{c.contract_no} — {c.coffee_type || c.commodity}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              {isExportInspection && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Buyer Name</Label>
                    <Input value={form.buyer_name} onChange={e => set('buyer_name', e.target.value)} placeholder="Buyer..." />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Inspection Reference</Label>
                    <Input value={form.inspection_ref} onChange={e => set('inspection_ref', e.target.value)} placeholder="Inspection ID..." />
                  </div>
                </div>
              )}
            </>
          ) : isArrival ? (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Link to Warehouse Receipt <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Select value={form.warehouse_receipt_id} onValueChange={v => set('warehouse_receipt_id', v)}>
                <SelectTrigger><SelectValue placeholder="Select warehouse receipt..." /></SelectTrigger>
                <SelectContent>
                  {receipts.map(r => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.grn_code || r.coffee_code || r.id} — {r.supplier_name} ({fmt(r.warehouse_received_net_kg, 0)} KG)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Supplier Name *</Label>
              <Select value={form.supplier_name} onValueChange={v => set('supplier_name', v)}>
                <SelectTrigger><SelectValue placeholder="Select supplier..." /></SelectTrigger>
                <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.supplier_name}>{s.supplier_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}

          {(form.supplier_name || form.coffee_type || form.warehouse_receipt_id) && <StockBadge available={availableNum} />}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              Available KG ({isExport ? 'Coffee type fresh pool' : isArrival ? 'from linked receipt' : isExportInspection ? 'Fresh stock pool' : 'from Warehouse'})
            </Label>
            <Input
              value={
                available === undefined
                  ? 'No warehouse receipt found'
                  : available != null
                    ? fmt(available)
                    : '—'
              }
              readOnly
              className={`font-medium ${available === undefined ? 'bg-amber-50 text-amber-700 italic' : 'bg-muted'}`}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Sample KG Taken *</Label>
            <NumberInput decimals={2} value={form.sample_kg} onChange={v => set('sample_kg', v)} placeholder="0.00" required />
            {kgIsZeroOrEmpty && <p className="text-xs text-destructive">Sample KG Taken is required and must be greater than 0</p>}
          </div>
          {exceedsStock && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-destructive/10 border border-destructive/40 text-destructive">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span className="font-semibold text-sm">⛔ BLOCKED: You entered {fmt(sampleKg)} KG but only {fmt(availableNum)} KG is available for this supplier. Please correct before saving.</span>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Company Recipient</Label>
            <Input value={form.company_recipient} onChange={e => set('company_recipient', e.target.value)} placeholder="Company name..." />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Keeper Name</Label>
            <Input value={form.keeper_name} onChange={e => set('keeper_name', e.target.value)} placeholder="Name..." />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Remark</Label>
            <Textarea value={form.remark} onChange={e => set('remark', e.target.value)} rows={2} placeholder="Optional..." />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting || isBlocked}>{isSubmitting ? 'Saving...' : initialData ? 'Update' : 'Save'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function SampleLogPage() {
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [sortKey, setSortKey] = useState('sample_date');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const queryClient = useQueryClient();

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['sample-logs'],
    queryFn: () => base44.entities.SampleLog.list('-created_date', 500),
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list(),
  });
  const { data: receipts = [] } = useQuery({
    queryKey: ['warehouse-receipts'],
    queryFn: () => base44.entities.WarehouseReceipt.list('-created_date', 500),
  });
  const { data: processingLogs = [] } = useQuery({
    queryKey: ['processing-logs'],
    queryFn: () => base44.entities.ProcessingLog.list(),
  });
  const { data: outputReports = [] } = useQuery({
    queryKey: ['output-reports'],
    queryFn: () => base44.entities.OutputReport.list(),
  });
  const { data: purchases = [] } = useQuery({
    queryKey: ['purchase-records'],
    queryFn: () => base44.entities.PurchaseRecord.list('-created_date', 500),
  });
  const { data: contracts = [] } = useQuery({
    queryKey: ['export-contracts'],
    queryFn: () => base44.entities.ExportContract.list(),
  });
  const { data: inspections = [] } = useQuery({
    queryKey: ['buyer-inspections'],
    queryFn: () => base44.entities.BuyerInspection.list(),
  });

  const coffeeTypes = useMemo(() => {
    const t = new Set(suppliers.map(s => s.coffee_type).filter(Boolean));
    return Array.from(t).sort();
  }, [suppliers]);

  const { fresh: freshStockByType } = useMemo(
    () => computeStockPools({ outputReports, contracts, inspections, sampleLogs: logs }),
    [outputReports, contracts, inspections, logs]
  );

  const availableBySupplier = useMemo(() => {
    const raw = computeAvailabilityBySupplier({ receipts, purchases, sampleLogs: logs, processingLogs });
    // Return flat map: supplierName -> availableKg
    const result = {};
    Object.entries(raw).forEach(([name, v]) => { result[name] = v.availableKg; });
    return result;
  }, [receipts, logs, processingLogs]);

  const createMutation = useMutation({
    mutationFn: data => base44.entities.SampleLog.create(data),
    onSuccess: (rec) => {
      queryClient.invalidateQueries({ queryKey: ['sample-logs'] });
      queryClient.invalidateQueries({ queryKey: ['warehouse-receipts'] });
      setDialogOpen(false);
      logActivity({ action_type: 'Created', screen_name: 'Sample Log', entity_type: 'SampleLog', entity_id: rec.id, record_description: `Sample ${rec.sample_kg}kg — ${rec.supplier_name || rec.coffee_type || ''}` });
    },
  });
  const updateMutation = useMutation({
    mutationFn: async ({ id, data, previous }) => {
      const updated = await base44.entities.SampleLog.update(id, data);
      return { updated, previous };
    },
    onSuccess: ({ updated, previous }) => {
      queryClient.invalidateQueries({ queryKey: ['sample-logs'] });
      setDialogOpen(false);
      setEditRecord(null);
      logActivity({ action_type: 'Edited', screen_name: 'Sample Log', entity_type: 'SampleLog', entity_id: updated.id, record_description: `Sample ${updated.sample_kg}kg — ${updated.supplier_name || updated.coffee_type || ''}`, changes: diffRecords(previous, updated) });
    },
  });
  const archiveMutation = useMutation({
    mutationFn: ({ record, reason }) => archiveRecord({
      entityName: 'SampleLog',
      record,
      screen_name: 'Sample Log',
      description: `Sample ${record.sample_kg}kg — ${record.supplier_name || record.coffee_type || ''}`,
      reason,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sample-logs'] });
      queryClient.invalidateQueries({ queryKey: ['activity-log'] });
      setArchiveTarget(null);
    },
  });

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
    setPage(1);
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const list = logs.filter(l => !l.archived && (!search || l.supplier_name?.toLowerCase().includes(q)));
    return [...list].sort((a, b) => {
      let va = a[sortKey] ?? ''; let vb = b[sortKey] ?? '';
      if (typeof va === 'number' && typeof vb === 'number') return sortDir === 'asc' ? va - vb : vb - va;
      return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
  }, [logs, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const COLS = [
    { label: '#', key: null },
    { label: 'Date & Time', key: 'sample_date' },
    { label: 'Type', key: 'sample_type' },
    { label: 'Supplier / Coffee Type', key: 'supplier_name' },
    { label: 'Sample KG', key: 'sample_kg' },
    { label: 'Available KG', key: null },
    { label: 'Company Recipient', key: 'company_recipient' },
    { label: 'Keeper Name', key: 'keeper_name' },
    { label: 'Remark', key: null },
    { label: 'Actions', key: null },
  ];

  return (
    <RoleGuard allowedRoles={['admin', 'warehouse_keeper']}>
    <div>
      <PageHeader title="Sample Log" description="Track coffee samples taken from warehouse">
        <Button onClick={() => { setEditRecord(null); setDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-1" /> New Entry
        </Button>
      </PageHeader>
      <div className="relative mb-4 max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search by supplier..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
      </div>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                {COLS.map(col => (
                  <TableHead
                    key={col.label}
                    className={`text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap ${col.key ? 'cursor-pointer hover:text-foreground select-none' : ''}`}
                    onClick={() => col.key && handleSort(col.key)}
                    title={col.label}
                  >
                    {col.label}{col.key && <SortIcon col={col.key} sortKey={sortKey} sortDir={sortDir} />}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? Array(4).fill(0).map((_, i) => (
                <TableRow key={i}>{COLS.map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>)}</TableRow>
              )) : paginated.length === 0 ? (
                <TableRow><TableCell colSpan={COLS.length} className="text-center py-12 text-muted-foreground">{search ? 'No entries match.' : 'No sample log entries yet.'}</TableCell></TableRow>
              ) : paginated.map((r, i) => {
                const isIncomplete = !r.sample_kg || r.sample_kg <= 0;
                return (
                <TableRow key={r.id} className={`hover:bg-muted/30 ${isIncomplete ? 'bg-amber-50/60' : ''}`}>
                  <TableCell className="text-muted-foreground text-xs">{(page - 1) * pageSize + i + 1}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{r.sample_datetime ? r.sample_datetime.replace('T', ' ').slice(0, 16) : (r.sample_date || '—')}</TableCell>
                  <TableCell>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${TYPE_BADGE_STYLES[r.sample_type] || 'bg-blue-100 text-blue-700'}`}>
                      {r.sample_type || 'Warehouse'}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium whitespace-nowrap">{r.supplier_name || r.coffee_type || '—'}{r.sample_type === 'Export Inspection' && r.buyer_name && <span className="block text-[10px] text-muted-foreground">Buyer: {r.buyer_name}</span>}</TableCell>
                  <TableCell className="text-right font-semibold">
                    {isIncomplete ? (
                      <span className="inline-flex items-center gap-1 text-amber-700 text-xs font-semibold">
                        <AlertTriangle className="w-3 h-3" /> ⚠️ Incomplete entry — KG not recorded
                      </span>
                    ) : fmt(r.sample_kg)}
                  </TableCell>
                  <TableCell className="text-right">{r.supplier_name && availableBySupplier[r.supplier_name] != null ? fmt(availableBySupplier[r.supplier_name]) : '—'}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.company_recipient || '—'}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.keeper_name || '—'}</TableCell>
                  <TableCell className="max-w-[120px] truncate text-muted-foreground">{r.remark || '—'}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => { setEditRecord(r); setDialogOpen(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setArchiveTarget(r)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              );})}  
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

      <SampleFormDialog
        open={dialogOpen}
        onOpenChange={v => { setDialogOpen(v); if (!v) setEditRecord(null); }}
        initialData={editRecord}
        suppliers={suppliers}
        coffeeTypes={coffeeTypes}
        availableBySupplier={availableBySupplier}
        freshStockByType={freshStockByType}
        contracts={contracts}
        receipts={receipts}
        onSubmit={data => { if (editRecord) updateMutation.mutate({ id: editRecord.id, data, previous: editRecord }); else createMutation.mutate(data); }}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      />

      <RichArchiveDialog
        open={!!archiveTarget}
        onOpenChange={v => { if (!v) setArchiveTarget(null); }}
        title="Archive Sample Log Entry?"
        requireConfirm={false}
        mainRecord={archiveTarget ? { label: `Sample — ${archiveTarget.supplier_name || archiveTarget.coffee_type || ''}`, ref: `${archiveTarget.sample_kg} KG sampled` } : null}
        linkedRecords={[]}
        impacts={['Available KG for supplier in Stock Report', 'Dashboard KPIs']}
        isPending={archiveMutation.isPending}
        onConfirm={(reason) => archiveMutation.mutate({ record: archiveTarget, reason })}
      />

      <ArchivedRecordsSection
        entityName="SampleLog"
        screenName="Sample Log"
        queryKey={['sample-logs']}
        describeRecord={(r) => `Sample ${r.sample_kg}kg — ${r.supplier_name || r.coffee_type || ''}`}
        columns={[
          { label: 'Date', render: (r) => r.sample_date || '—' },
          { label: 'Type', render: (r) => r.sample_type || 'Warehouse' },
          { label: 'Supplier / Coffee', render: (r) => r.supplier_name || r.coffee_type || '—' },
          { label: 'KG', render: (r) => fmt(r.sample_kg) },
        ]}
      />
    </div>
    </RoleGuard>
  );
}