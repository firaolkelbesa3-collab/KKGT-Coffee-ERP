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
import { Plus, Pencil, Trash2, Search, AlertTriangle, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import FilterPanel, { FilterButton } from '@/components/shared/FilterPanel';
import { format } from 'date-fns';
import RoleGuard from '@/components/RoleGuard';
import { InlineWarningList } from '@/components/notifications/InlineWarning';
import { getProcessingWarnings } from '@/lib/formWarnings';
import { notifyLowStock } from '@/lib/notificationService';
import AvailabilityBox from '@/components/processing/AvailabilityBox';
import NumberInput from '@/components/shared/NumberInput';
import RichArchiveDialog from '@/components/shared/RichArchiveDialog';
import ArchivedRecordsSection from '@/components/shared/ArchivedRecordsSection';
import { archiveRecord } from '@/lib/archiveService';
import { computeAvailabilityBySupplier } from '@/lib/availabilityUtils';
import { logActivity, diffRecords } from '@/lib/activityLogger';
import TablePagination from '@/components/shared/TablePagination';
import { BAG_WEIGHT_KG } from '@/lib/constants';
import ProcessingSummaryBar from '@/components/processing/ProcessingSummaryBar';
import ActiveFilters from '@/components/shared/ActiveFilters';
import ExportBar from '@/components/shared/ExportBar';
import { exportPDF, exportXLSX } from '@/lib/exportUtils';

function fmt(n, d = 2) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function SortIcon({ col, sortKey, sortDir }) {
  if (sortKey !== col) return <ChevronsUpDown className="inline w-3 h-3 ml-1 opacity-30" />;
  return sortDir === 'asc' ? <ChevronUp className="inline w-3 h-3 ml-1" /> : <ChevronDown className="inline w-3 h-3 ml-1" />;
}

const EMPTY = {
  entry_type: 'Standard',
  entry_mode: 'By Bags', // Feature 5
  buyer_name: '', inspection_ref: '',
  date: '', supplier_name: '', coffee_type: '', bags_sent: '', actual_weighed_kg: '', batch_no: '', remark: '',
};

function ProcessingFormDialog({ open, onOpenChange, initialData, suppliers, availabilityBySupplier, inspections, onSubmit, isSubmitting }) {
  const [form, setForm] = useState(EMPTY);

  const supplierMap = useMemo(() => {
    const m = {};
    suppliers.forEach(s => { m[s.supplier_name] = s; });
    return m;
  }, [suppliers]);

  // Resolve a stored supplier_name to the exact canonical name in Master Data
  const resolveSupplierName = (savedName) => {
    if (!savedName) return '';
    // 1. Exact match
    if (supplierMap[savedName]) return savedName;
    // 2. Case-insensitive + trimmed match
    const trimmedLower = savedName.trim().toLowerCase();
    const match = Object.keys(supplierMap).find(n => n.trim().toLowerCase() === trimmedLower);
    return match || savedName.trim(); // fallback to trimmed version
  };

  useEffect(() => {
    if (open) {
      if (initialData) {
        const resolvedName = resolveSupplierName(initialData.supplier_name || '');
        const coffee_type = initialData.coffee_type || supplierMap[resolvedName]?.coffee_type || '';
        setForm({
          entry_type: initialData.entry_type || 'Standard',
          entry_mode: initialData.entry_mode || 'By Bags',
          buyer_name: initialData.buyer_name || '',
          inspection_ref: initialData.inspection_ref || '',
          date: initialData.date || '',
          supplier_name: resolvedName,
          coffee_type,
          bags_sent: initialData.bags_sent ?? '',
          actual_weighed_kg: initialData.actual_weighed_kg ?? initialData.kg_sent ?? '',
          batch_no: initialData.batch_no || '',
          remark: initialData.remark || '',
        });
      } else {
        setForm({ ...EMPTY, date: new Date().toISOString().slice(0, 10) });
      }
    }
  }, [open, initialData, supplierMap]);

  const isRecleaning = form.entry_type === 'Recleaning';
  const isByKg = form.entry_mode === 'By KG'; // Feature 5

  // Buyers + failed inspections from BuyerInspection list (for Recleaning)
  const failedInspections = useMemo(() => (inspections || []).filter(i => i.result === 'Failed'), [inspections]);
  const buyersList = useMemo(() => Array.from(new Set(failedInspections.map(i => i.buyer_name).filter(Boolean))).sort(), [failedInspections]);
  const inspectionsForBuyer = useMemo(
    () => failedInspections.filter(i => !form.buyer_name || i.buyer_name === form.buyer_name),
    [failedInspections, form.buyer_name]
  );
  const linkedInspection = useMemo(
    () => failedInspections.find(i => i.id === form.inspection_ref),
    [failedInspections, form.inspection_ref]
  );

  // When inspection_ref changes (Recleaning), auto-fill coffee_type + actual_weighed_kg
  useEffect(() => {
    if (!isRecleaning || !linkedInspection) return;
    setForm(p => ({
      ...p,
      coffee_type: linkedInspection.coffee_type || p.coffee_type,
      actual_weighed_kg: p.actual_weighed_kg === '' ? (linkedInspection.kg_rejected ?? '') : p.actual_weighed_kg,
    }));
     
  }, [form.inspection_ref, isRecleaning]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSupplierChange = (v) => {
    const coffeeType = supplierMap[v]?.coffee_type || '';
    setForm(p => ({ ...p, supplier_name: v, coffee_type: coffeeType }));
  };

  const bags = parseFloat(form.bags_sent) || 0;
  const assumedKg = bags * BAG_WEIGHT_KG;
  const actualKg = parseFloat(form.actual_weighed_kg) || 0;
  const variance = actualKg > 0 && bags > 0 ? actualKg - assumedKg : null;

  // Availability breakdown (live). Default to zeros if supplier has no records yet —
  // we always want to render the box so the user sees the breakdown for every supplier.
  // When editing, add back this entry's own KG so the user isn't counted against themselves.
  const avail = form.supplier_name
    ? (availabilityBySupplier?.[form.supplier_name] ?? { received: 0, samples: 0, processed: 0 })
    : null;
  const ownPrevKg = initialData ? Number(initialData.actual_weighed_kg ?? initialData.kg_sent ?? 0) : 0;
  const availableKg = avail ? Math.max(0, (avail.received - avail.samples - avail.processed) + ownPrevKg) : 0;

  // For Recleaning the stock check uses the rejected KG of the linked inspection,
  // minus any KG already processed against this same inspection (excluding this row).
  const recleaningAvailableKg = isRecleaning && linkedInspection
    ? Math.max(0, (linkedInspection.kg_rejected || 0))
    : 0;

  // ----- HARD BLOCK ERRORS (prevent save) -----
  const errors = [];
  if (isRecleaning) {
    if (!form.buyer_name) errors.push({ severity: 'error', message: 'Buyer Name is required for Recleaning' });
    if (!form.inspection_ref) errors.push({ severity: 'error', message: 'Inspection Reference is required for Recleaning' });
    if (form.actual_weighed_kg === '' || actualKg <= 0) {
      errors.push({ severity: 'error', message: 'KG to Reprocess must be greater than 0' });
    }
    if (actualKg > 0 && linkedInspection && actualKg > recleaningAvailableKg) {
      errors.push({
        severity: 'error',
        message: `Cannot save — ${actualKg.toLocaleString(undefined, { maximumFractionDigits: 2 })} KG exceeds rejected KG (${recleaningAvailableKg.toLocaleString(undefined, { maximumFractionDigits: 2 })} KG) on inspection.`,
      });
    }
  } else if (form.supplier_name) {
    // Standard mode: existing checks. By Bags requires bags + actual KG; By KG only requires KG.
    if (!isByKg) {
      if (form.bags_sent === '' || bags <= 0) {
        errors.push({ severity: 'error', message: 'Bags Sent cannot be zero' });
      }
    }
    if (form.actual_weighed_kg === '' || actualKg <= 0) {
      errors.push({ severity: 'error', message: isByKg ? 'Actual KG to Process cannot be zero' : 'Actual Weighed KG cannot be zero' });
    }
    if (actualKg > 0 && actualKg > availableKg) {
      errors.push({
        severity: 'error',
        message: `Cannot save — ${isByKg ? 'Actual KG' : 'Actual Weighed KG'} (${actualKg.toLocaleString(undefined, { maximumFractionDigits: 2 })} KG) exceeds available stock (${availableKg.toLocaleString(undefined, { maximumFractionDigits: 2 })} KG) for ${form.supplier_name}.`,
      });
    }
  }

  // ----- WARNINGS (can still save) -----
  const warnings = useMemo(() => {
    if (isRecleaning) return []; // simpler validation for recleaning
    const w = [...getProcessingWarnings(form, availableKg)];
    if (bags > 0 && actualKg > 0 && assumedKg > 0) {
      const pctBelow = ((assumedKg - actualKg) / assumedKg) * 100;
      if (pctBelow > 10) {
        w.push({ severity: 'warning', message: `Actual weight is ${pctBelow.toFixed(1)}% below assumed — verify scale reading` });
      }
    }
    if (form.supplier_name && actualKg > 0 && actualKg <= availableKg) {
      const after = availableKg - actualKg;
      if (after < 100) {
        w.push({ severity: 'warning', message: `After this entry ${form.supplier_name} will have only ${after.toLocaleString(undefined, { maximumFractionDigits: 2 })} KG remaining` });
      }
    }
    return w;
  }, [form, availableKg, bags, actualKg, assumedKg, isRecleaning]);

  const hasBlockingErrors = errors.length > 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (hasBlockingErrors) return;
    // Fix 9: Auto-trim name fields on save
    if (form.supplier_name) form.supplier_name = form.supplier_name.trim();
    const data = {
      entry_type: form.entry_type,
      entry_mode: isRecleaning ? null : form.entry_mode, // recleaning has its own quantity model
      date: form.date,
      coffee_type: form.coffee_type || null,
      actual_weighed_kg: form.actual_weighed_kg !== '' ? parseFloat(form.actual_weighed_kg) : null,
      batch_no: form.batch_no || null,
      remark: form.remark || null,
    };
    if (isRecleaning) {
      data.buyer_name = form.buyer_name;
      data.inspection_ref = form.inspection_ref;
      data.supplier_name = null;
      data.bags_sent = null;
      data.kg_sent = null;
      data.batch_variance_kg = null;
    } else if (isByKg) {
      // Feature 5: By-KG entry — store equivalent bags as reference, no bag rounding.
      data.supplier_name = form.supplier_name;
      data.bags_sent = actualKg > 0 ? actualKg / BAG_WEIGHT_KG : null;
      data.kg_sent = null;            // No assumed-KG line in By-KG mode
      data.batch_variance_kg = null;  // No variance — exact KG was entered
      data.buyer_name = null;
      data.inspection_ref = null;
    } else {
      // By Bags (default — existing behavior unchanged)
      data.supplier_name = form.supplier_name;
      data.bags_sent = form.bags_sent !== '' ? parseFloat(form.bags_sent) : null;
      data.kg_sent = bags > 0 ? assumedKg : null;
      data.batch_variance_kg = variance;
      data.buyer_name = null;
      data.inspection_ref = null;
    }
    onSubmit(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display">{initialData ? 'Edit Processing Log' : 'New Processing Log Entry'}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type toggle */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Type *</Label>
            <div className="flex gap-2">
              {['Standard', 'Recleaning'].map(t => (
                <button key={t} type="button" onClick={() => set('entry_type', t)}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold border transition-all ${form.entry_type === t ? (t === 'Recleaning' ? 'bg-amber-600 text-white border-amber-600' : 'bg-primary text-primary-foreground border-primary') : 'bg-background border-border text-muted-foreground hover:border-primary/50'}`}>
                  {t}
                </button>
              ))}
            </div>
            {isRecleaning && (
              <p className="text-[11px] text-amber-700">Recleaning does NOT deduct from fresh warehouse stock. Available KG comes from the linked failed inspection.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Date *</Label>
            <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} required />
          </div>

          {isRecleaning ? (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Buyer Name *</Label>
                <Select value={form.buyer_name} onValueChange={v => { set('buyer_name', v); set('inspection_ref', ''); }}>
                  <SelectTrigger><SelectValue placeholder="Select buyer from failed inspections..." /></SelectTrigger>
                  <SelectContent>{buyersList.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                </Select>
                {buyersList.length === 0 && <p className="text-xs text-muted-foreground italic">No failed inspections yet.</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Inspection Reference *</Label>
                <Select value={form.inspection_ref} onValueChange={v => set('inspection_ref', v)} disabled={!form.buyer_name}>
                  <SelectTrigger><SelectValue placeholder="Select failed inspection..." /></SelectTrigger>
                  <SelectContent>
                    {inspectionsForBuyer.map(i => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.inspection_date} — {i.coffee_type} — {Number(i.kg_rejected || 0).toLocaleString()} KG rejected
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {linkedInspection && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1 text-xs">
                  <p><span className="font-semibold">Coffee Type:</span> {linkedInspection.coffee_type}</p>
                  <p><span className="font-semibold">Rejection Reason:</span> {linkedInspection.rejection_reason || '—'}</p>
                  <p><span className="font-semibold">Available (rejected) KG:</span> <span className="font-bold text-amber-800">{recleaningAvailableKg.toLocaleString()}</span></p>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Supplier Name *</Label>
                <Select value={form.supplier_name} onValueChange={handleSupplierChange}>
                  <SelectTrigger><SelectValue placeholder="Select supplier..." /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map(s => <SelectItem key={s.id} value={s.supplier_name}>{s.supplier_name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {form.supplier_name && !supplierMap[form.supplier_name] && (
                  <p className="text-[11px] text-amber-700">⚠ "{form.supplier_name}" not found in Master Data — please re-select the correct supplier.</p>
                )}
              </div>
              {form.supplier_name && avail && (
                <AvailabilityBox
                  supplierName={form.supplier_name}
                  receivedKg={avail.received}
                  samplesKg={avail.samples}
                  processedKg={avail.processed - ownPrevKg}
                  availableKg={availableKg}
                  actualKg={actualKg}
                />
              )}
            </>
          )}
          {form.coffee_type && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Coffee Type (from Master Data)</Label>
              <Input value={form.coffee_type} readOnly className="bg-muted font-medium" />
            </div>
          )}
          {!isRecleaning && (
            <>
              {/* Feature 5: Entry Mode toggle */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Entry Mode *</Label>
                <div className="flex gap-2">
                  {['By Bags', 'By KG'].map(m => (
                    <button key={m} type="button" onClick={() => set('entry_mode', m)}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold border transition-all ${form.entry_mode === m ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border text-muted-foreground hover:border-primary/50'}`}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {isByKg ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Actual KG to Process *</Label>
                    <NumberInput decimals={2} value={form.actual_weighed_kg} onChange={v => set('actual_weighed_kg', v)} placeholder="0.00" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">Equivalent Bags (KG ÷ 85)</Label>
                    <Input value={actualKg > 0 ? fmt(actualKg / 85, 2) : '—'} readOnly className="bg-muted" />
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Bags Sent</Label>
                      <NumberInput decimals={0} value={form.bags_sent} onChange={v => set('bags_sent', v)} placeholder="0" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">Assumed KG (Bags × 85)</Label>
                      <Input value={bags > 0 ? fmt(assumedKg, 0) : '—'} readOnly className="bg-muted" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Actual Weighed KG *</Label>
                    <NumberInput decimals={2} value={form.actual_weighed_kg} onChange={v => set('actual_weighed_kg', v)} placeholder="0.00" required />
                  </div>
                  {variance !== null && (
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium ${variance < 0 ? 'bg-destructive/10 border-destructive/30 text-destructive' : 'bg-green-50 border-green-200 text-green-700'}`}>
                      {variance < 0 && <AlertTriangle className="w-4 h-4" />}
                      Batch Variance: {variance >= 0 ? '+' : ''}{fmt(variance)} KG
                    </div>
                  )}
                </>
              )}
            </>
          )}
          {isRecleaning && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">KG to Reprocess *</Label>
              <NumberInput decimals={2} value={form.actual_weighed_kg} onChange={v => set('actual_weighed_kg', v)} placeholder="0.00" required />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Batch No</Label>
            <Input value={form.batch_no} onChange={e => set('batch_no', e.target.value)} placeholder="e.g. B001" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Remark</Label>
            <Textarea value={form.remark} onChange={e => set('remark', e.target.value)} rows={2} placeholder="Optional..." />
          </div>
          {errors.length > 0 && <InlineWarningList warnings={errors} />}
          {warnings.length > 0 && <InlineWarningList warnings={warnings} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              type="submit"
              disabled={isSubmitting || !form.date || hasBlockingErrors || (!isRecleaning && !form.supplier_name) || (isRecleaning && (!form.buyer_name || !form.inspection_ref))}
            >
              {isSubmitting ? 'Saving...' : initialData ? 'Update' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function ProcessingLogPage() {
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [sortKey, setSortKey] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState({ date: { from: '', to: '' }, supplier: 'all', mode: 'all', batchNo: '' });
  const queryClient = useQueryClient();

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['processing-logs'],
    queryFn: () => base44.entities.ProcessingLog.list('-created_date', 500),
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list(),
  });
  const { data: receipts = [] } = useQuery({
    queryKey: ['warehouse-receipts'],
    queryFn: () => base44.entities.WarehouseReceipt.list('-created_date', 500),
  });
  const { data: sampleLogs = [] } = useQuery({
    queryKey: ['sample-logs'],
    queryFn: () => base44.entities.SampleLog.list(),
  });
  const { data: inspections = [] } = useQuery({
    queryKey: ['buyer-inspections'],
    queryFn: () => base44.entities.BuyerInspection.list(),
  });
  const { data: purchases = [] } = useQuery({
    queryKey: ['purchase-records'],
    queryFn: () => base44.entities.PurchaseRecord.list('-created_date', 500),
  });

  // Full availability breakdown per supplier — uses shared canonical formula.
  const availabilityBySupplier = useMemo(() => {
    const raw = computeAvailabilityBySupplier({ receipts, purchases, sampleLogs, processingLogs: logs });
    // Reshape to { received, samples, processed } for backwards-compat with the form
    const map = {};
    Object.entries(raw).forEach(([name, v]) => {
      map[name] = { received: v.netCoffeeKg, samples: v.samplesKg, processed: v.processedKg };
    });
    return map;
  }, [receipts, sampleLogs, logs, purchases]);

  const remainingBySupplier = useMemo(() => {
    const map = {};
    Object.entries(availabilityBySupplier).forEach(([name, a]) => {
      map[name] = Math.max(0, a.received - a.samples - a.processed);
    });
    return map;
  }, [availabilityBySupplier]);

  // Refresh all caches that depend on processing data so available KG updates across the app.
  const refreshStockCaches = async () => {
    await queryClient.refetchQueries({ queryKey: ['processing-logs'] });
    queryClient.invalidateQueries({ queryKey: ['warehouse-receipts'] });
    queryClient.invalidateQueries({ queryKey: ['sample-logs'] });
    queryClient.invalidateQueries({ queryKey: ['output-reports'] });
  };

  const createMutation = useMutation({
    mutationFn: data => base44.entities.ProcessingLog.create(data),
    onSuccess: async (log) => {
      await refreshStockCaches();
      setDialogOpen(false);
      logActivity({ action_type: 'Created', screen_name: 'Processing Log', entity_type: 'ProcessingLog', entity_id: log.id, record_description: `Processing ${log.date} — ${log.supplier_name || log.buyer_name || ''}` });
      if (log.supplier_name) {
        const bagKg = (log.bags_sent || 0) * BAG_WEIGHT_KG;
        const currentRemaining = remainingBySupplier[log.supplier_name] || 0;
        const afterRemaining = Math.max(0, currentRemaining - bagKg);
        if (afterRemaining < 500) {
          notifyLowStock(log.supplier_name, afterRemaining).catch(() => {});
        }
      }
    },
  });
  const updateMutation = useMutation({
    mutationFn: async ({ id, data, previous }) => {
      const updated = await base44.entities.ProcessingLog.update(id, data);
      return { updated, previous };
    },
    onSuccess: async ({ updated, previous }) => {
      await refreshStockCaches();
      setDialogOpen(false);
      setEditRecord(null);
      logActivity({ action_type: 'Edited', screen_name: 'Processing Log', entity_type: 'ProcessingLog', entity_id: updated.id, record_description: `Processing ${updated.date} — ${updated.supplier_name || updated.buyer_name || ''}`, changes: diffRecords(previous, updated) });
    },
  });
  const archiveMutation = useMutation({
    mutationFn: ({ record, reason }) => archiveRecord({
      entityName: 'ProcessingLog',
      record,
      screen_name: 'Processing Log',
      description: `Processing ${record.date} — ${record.supplier_name || record.buyer_name || ''}`,
      reason,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processing-logs'] });
      queryClient.invalidateQueries({ queryKey: ['activity-log'] });
      setArchiveTarget(null);
    },
  });

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
    setPage(1);
  };

  // Build supplier->coffee_type lookup for rows that may have been saved without coffee_type
  const supplierMap = useMemo(() => {
    const m = {};
    suppliers.forEach(s => { m[s.supplier_name] = s; });
    return m;
  }, [suppliers]);

  const filterActiveCount = [
    filters.date?.from || filters.date?.to,
    filters.supplier !== 'all',
    filters.mode !== 'all',
    filters.batchNo,
  ].filter(Boolean).length;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const fd = filters.date?.from || '';
    const td = filters.date?.to || '';
    const list = logs.filter(l => {
      if (l.archived) return false;
      if (search && !l.supplier_name?.toLowerCase().includes(q) && !l.batch_no?.toLowerCase().includes(q)) return false;
      if (fd && (l.date || '') < fd) return false;
      if (td && (l.date || '') > td) return false;
      if (filters.supplier !== 'all' && l.supplier_name !== filters.supplier) return false;
      if (filters.mode !== 'all' && l.entry_mode !== filters.mode) return false;
      if (filters.batchNo && !(l.batch_no || '').toLowerCase().includes(filters.batchNo.toLowerCase())) return false;
      return true;
    });
    return [...list].sort((a, b) => {
      let va = a[sortKey] ?? ''; let vb = b[sortKey] ?? '';
      if (typeof va === 'number' && typeof vb === 'number') return sortDir === 'asc' ? va - vb : vb - va;
      return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
  }, [logs, search, filters, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const COLS = [
    { label: '#', key: null },
    { label: 'Date', key: 'date' },
    { label: 'Type', key: 'entry_type' },
    { label: 'Supplier / Buyer', key: 'supplier_name' },
    { label: 'Coffee Type', key: 'coffee_type' },
    { label: 'Bags', key: 'bags_sent' },
    { label: 'Assumed KG', key: 'kg_sent' },
    { label: 'Actual KG', key: 'actual_weighed_kg' },
    { label: 'Variance KG', key: 'batch_variance_kg' },
    { label: 'Batch No', key: 'batch_no' },
    { label: 'Remark', key: null },
    { label: 'Actions', key: null },
  ];

  return (
    <RoleGuard allowedRoles={['admin', 'warehouse_keeper']}>
      <div>
        <PageHeader title="Processing Log" description="Track daily coffee processing dispatch to factory">
          <Button onClick={() => { setEditRecord(null); setDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-1" /> New Entry
          </Button>
        </PageHeader>
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="relative max-w-xs flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search by supplier or batch..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <FilterButton onClick={() => setFilterOpen(true)} activeCount={filterActiveCount} />
        </div>
        <FilterPanel
          open={filterOpen}
          onClose={() => setFilterOpen(false)}
          fields={[
            { key: 'date', label: 'Date', type: 'date' },
            { key: 'supplier', label: 'Supplier', type: 'select', options: suppliers.map(s => ({ value: s.supplier_name, label: s.supplier_name })), placeholder: 'All Suppliers' },
            { key: 'mode', label: 'Mode', type: 'select', options: [{ value: 'By Bags', label: 'By Bags' }, { value: 'By KG', label: 'By KG' }], placeholder: 'All Modes' },
            { key: 'batchNo', label: 'Batch No', type: 'text', placeholder: 'Search batch...' },
          ]}
          values={filters}
          onApply={v => { setFilters(v); setPage(1); }}
          onReset={() => { setFilters({ date: { from: '', to: '' }, supplier: 'all', mode: 'all', batchNo: '' }); setPage(1); }}
        />
        <ActiveFilters
          filters={[
            { label: 'Search', value: search || '', onRemove: () => { setSearch(''); setPage(1); } },
            { label: 'Date', value: filters.date.from || filters.date.to ? `${filters.date.from || '…'} → ${filters.date.to || '…'}` : '', onRemove: () => { setFilters(f => ({ ...f, date: { from: '', to: '' } })); setPage(1); } },
            { label: 'Supplier', value: filters.supplier !== 'all' ? filters.supplier : '', onRemove: () => { setFilters(f => ({ ...f, supplier: 'all' })); setPage(1); } },
            { label: 'Mode', value: filters.mode !== 'all' ? filters.mode : '', onRemove: () => { setFilters(f => ({ ...f, mode: 'all' })); setPage(1); } },
            { label: 'Batch', value: filters.batchNo || '', onRemove: () => { setFilters(f => ({ ...f, batchNo: '' })); setPage(1); } },
          ]}
          onClearAll={() => { setSearch(''); setFilters({ date: { from: '', to: '' }, supplier: 'all', mode: 'all', batchNo: '' }); setPage(1); }}
        />
        <ExportBar
          onPDF={() => {
            const exportHeaders = ['#', 'Date', 'Type', 'Supplier / Buyer', 'Coffee Type', 'Bags', 'Assumed KG', 'Actual KG', 'Variance KG', 'Batch No', 'Remark'];
            const exportRows = filtered.map((r, i) => {
              const actualKg = r.actual_weighed_kg ?? r.kg_sent ?? 0;
              const assumedKg = r.kg_sent ?? ((r.bags_sent || 0) * BAG_WEIGHT_KG);
              const variance = r.batch_variance_kg ?? (actualKg > 0 && assumedKg > 0 ? actualKg - assumedKg : null);
              return [i+1, r.date || '—', r.entry_type || 'Standard', r.supplier_name || r.buyer_name || '—', r.coffee_type || supplierMap[r.supplier_name]?.coffee_type || '—', r.bags_sent != null ? r.bags_sent : '—', assumedKg > 0 ? assumedKg.toFixed(0) : '—', actualKg.toFixed(2), variance != null ? (variance >= 0 ? '+' : '') + variance.toFixed(2) : '—', r.batch_no || '—', r.remark || '—'];
            });
            const totalActual = filtered.reduce((s, r) => s + (r.actual_weighed_kg ?? r.kg_sent ?? 0), 0);
            exportPDF('Processing Log', exportHeaders, exportRows, ['', 'TOTAL', '', '', '', '', '', totalActual.toFixed(2), '', '', '']);
          }}
          onXLSX={() => {
            const exportHeaders = ['#', 'Date', 'Type', 'Supplier / Buyer', 'Coffee Type', 'Bags', 'Assumed KG', 'Actual KG', 'Variance KG', 'Batch No', 'Remark'];
            const exportRows = filtered.map((r, i) => {
              const actualKg = r.actual_weighed_kg ?? r.kg_sent ?? 0;
              const assumedKg = r.kg_sent ?? ((r.bags_sent || 0) * BAG_WEIGHT_KG);
              const variance = r.batch_variance_kg ?? (actualKg > 0 && assumedKg > 0 ? actualKg - assumedKg : null);
              return [i+1, r.date || '—', r.entry_type || 'Standard', r.supplier_name || r.buyer_name || '—', r.coffee_type || supplierMap[r.supplier_name]?.coffee_type || '—', r.bags_sent ?? '—', assumedKg > 0 ? assumedKg : '—', actualKg, variance ?? '—', r.batch_no || '—', r.remark || '—'];
            });
            const totalActual = filtered.reduce((s, r) => s + (r.actual_weighed_kg ?? r.kg_sent ?? 0), 0);
            exportXLSX('Processing_Log', 'Processing Log', exportHeaders, exportRows, ['', 'TOTAL', '', '', '', '', '', totalActual, '', '', '']);
          }}
        />
        <ProcessingSummaryBar entries={filtered} />
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
                  <TableRow><TableCell colSpan={COLS.length} className="text-center py-12 text-muted-foreground">{search ? 'No entries match.' : 'No processing log entries yet.'}</TableCell></TableRow>
                ) : paginated.map((r, i) => {
                  const actualKg = r.actual_weighed_kg ?? r.kg_sent ?? 0;
                  const assumedKg = r.kg_sent ?? ((r.bags_sent || 0) * BAG_WEIGHT_KG);
                  const variance = r.batch_variance_kg ?? (actualKg > 0 && assumedKg > 0 ? actualKg - assumedKg : null);
                  return (
                    <TableRow key={r.id} className={`hover:bg-muted/30 ${r.entry_type === 'Recleaning' ? 'bg-amber-50/40' : ''}`}>
                      <TableCell className="text-muted-foreground text-xs">{(page - 1) * pageSize + i + 1}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{r.date ? format(new Date(r.date), 'MMM d, yyyy') : '—'}</TableCell>
                      <TableCell>
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${r.entry_type === 'Recleaning' ? 'bg-amber-100 text-amber-700' : 'bg-muted text-muted-foreground'}`}>
                          {r.entry_type || 'Standard'}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium whitespace-nowrap">{r.supplier_name || r.buyer_name || '—'}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{r.coffee_type || supplierMap[r.supplier_name]?.coffee_type || '—'}</TableCell>
                      <TableCell className="text-right">{r.bags_sent != null ? fmt(r.bags_sent, 0) : '—'}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{assumedKg > 0 ? fmt(assumedKg, 0) : '—'}</TableCell>
                      <TableCell className="text-right font-semibold">{fmt(actualKg)}</TableCell>
                      <TableCell className={`text-right font-medium ${variance != null && variance < 0 ? 'text-destructive' : variance != null && variance > 0 ? 'text-green-600' : ''}`}>
                        {variance != null ? `${variance >= 0 ? '+' : ''}${fmt(variance)}` : '—'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{r.batch_no || '—'}</TableCell>
                      <TableCell className="max-w-[120px] truncate text-muted-foreground">{r.remark || '—'}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => { setEditRecord(r); setDialogOpen(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setArchiveTarget(r)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
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

        <ProcessingFormDialog
          open={dialogOpen}
          onOpenChange={v => { setDialogOpen(v); if (!v) setEditRecord(null); }}
          initialData={editRecord}
          suppliers={suppliers}
          availabilityBySupplier={availabilityBySupplier}
          inspections={inspections}
          onSubmit={data => { if (editRecord) updateMutation.mutate({ id: editRecord.id, data, previous: editRecord }); else createMutation.mutate(data); }}
          isSubmitting={createMutation.isPending || updateMutation.isPending}
        />

        <RichArchiveDialog
          open={!!archiveTarget}
          onOpenChange={v => { if (!v) setArchiveTarget(null); }}
          title="Archive Processing Entry?"
          requireConfirm={false}
          mainRecord={archiveTarget ? { label: `Processing entry — ${archiveTarget.supplier_name || archiveTarget.buyer_name || ''}`, ref: archiveTarget.date ? `Date: ${archiveTarget.date}  |  KG: ${Number(archiveTarget.actual_weighed_kg ?? archiveTarget.kg_sent ?? 0).toLocaleString()}` : undefined } : null}
          linkedRecords={[]}
          impacts={[`Available KG for ${archiveTarget?.supplier_name || 'supplier'}`, 'Remaining KG in Stock Report', 'Processing total on Dashboard']}
          isPending={archiveMutation.isPending}
          onConfirm={(reason) => archiveMutation.mutate({ record: archiveTarget, reason })}
        />

        <ArchivedRecordsSection
          entityName="ProcessingLog"
          screenName="Processing Log"
          queryKey={['processing-logs']}
          onExtraInvalidate={(qc) => {
            qc.invalidateQueries({ queryKey: ['warehouse-receipts'] });
            qc.invalidateQueries({ queryKey: ['output-reports'] });
          }}
          describeRecord={(r) => `Processing ${r.date} — ${r.supplier_name || r.buyer_name || ''}`}
          columns={[
            { label: 'Date', render: (r) => r.date || '—' },
            { label: 'Type', render: (r) => r.entry_type || 'Standard' },
            { label: 'Supplier / Buyer', render: (r) => r.supplier_name || r.buyer_name || '—' },
            { label: 'Actual KG', render: (r) => fmt(r.actual_weighed_kg ?? r.kg_sent ?? 0) },
          ]}
        />
      </div>
    </RoleGuard>
  );
}