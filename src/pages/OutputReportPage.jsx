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
import { Plus, Pencil, Trash2, Search, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { format } from 'date-fns';
import RoleGuard from '@/components/RoleGuard';
import { InlineWarningList } from '@/components/notifications/InlineWarning';
import { getOutputWarnings } from '@/lib/formWarnings';
import NumberInput from '@/components/shared/NumberInput';
import { computeStockPools } from '@/lib/stockPools';
import TablePagination from '@/components/shared/TablePagination';
import ExportBar from '@/components/shared/ExportBar';
import { exportPDF, exportXLSX } from '@/lib/exportUtils';
import ArchiveDialog from '@/components/shared/ArchiveDialog';
import ArchivedRecordsSection from '@/components/shared/ArchivedRecordsSection';
import { archiveRecord } from '@/lib/archiveService';
import { logActivity, diffRecords } from '@/lib/activityLogger';
import { notifyOutputReport } from '@/lib/notificationService';

// PAGE_SIZE replaced by dynamic pageSize state

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
  buyer_name: '', inspection_ref: '', rejection_reason: '',
  start_date: '', end_date: '', supplier_name: '', coffee_type: '', total_kg_processed: '',
  export_bags: '', reject_bags: '', registrar_name: '', remark: '',
  additional_pool1_kg: '',
};

function dateDurationDays(start, end) {
  if (!start || !end) return 0;
  const ms = new Date(end) - new Date(start);
  return Math.max(0, Math.round(ms / 86400000)) + 1;
}

function formatDateRange(start, end) {
  const fmtD = d => { try { return format(new Date(d), 'd MMM yyyy'); } catch { return d || '—'; } };
  if (!start && !end) return '—';
  if (start === end || !end) return fmtD(start || end);
  return `${fmtD(start)} → ${fmtD(end)}`;
}

// Resolve start/end from a record (handles legacy single-date records)
function getRecordDates(r) {
  const start = r.start_date || r.date || '';
  const end = r.end_date || r.date || '';
  return { start, end };
}

function OutputFormDialog({ open, onOpenChange, initialData, suppliers, processingLogs, inspections, onSubmit, isSubmitting, pool1ByCoffeeType }) {
  // Build a lookup: supplier_name -> coffee_type from Master Data
  const supplierCoffeeTypeMap = useMemo(() => {
    const map = {};
    suppliers.forEach(s => { if (s.supplier_name && s.coffee_type) map[s.supplier_name] = s.coffee_type; });
    return map;
  }, [suppliers]);

  // Derive unique coffee types directly from ProcessingLog entries (read coffee_type field directly)
  const coffeeTypes = useMemo(() => {
    const types = new Set();
    processingLogs.forEach(p => {
      if (!p.archived && p.entry_type !== 'Recleaning' && p.coffee_type) {
        types.add(p.coffee_type);
      }
    });
    // Also include from supplier map as fallback for any entries missing coffee_type on the log
    suppliers.forEach(s => { if (s.coffee_type) types.add(s.coffee_type); });
    return Array.from(types).sort();
  }, [processingLogs, suppliers]);

  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (open) {
      if (initialData) {
        const { start, end } = getRecordDates(initialData);
        setForm({
          entry_type: initialData.entry_type || 'Standard',
          buyer_name: initialData.buyer_name || '',
          inspection_ref: initialData.inspection_ref || '',
          rejection_reason: initialData.rejection_reason || '',
          start_date: start,
          end_date: end,
          supplier_name: initialData.supplier_name || '',
          coffee_type: initialData.coffee_type || '',
          total_kg_processed: initialData.total_kg_processed ?? '',
          export_bags: initialData.export_bags ?? '',
          reject_bags: initialData.reject_bags ?? '',
          registrar_name: initialData.registrar_name || '',
          remark: initialData.remark || '',
          additional_pool1_kg: initialData.additional_pool1_kg ?? '',
        });
      } else {
        const today = new Date().toISOString().slice(0, 10);
        setForm({ ...EMPTY, start_date: today, end_date: today });
      }
    }
  }, [open, initialData]);

  const isRecleaned = form.entry_type === 'Recleaned';
  // Recleaning processing logs available to pick (have entry_type === 'Recleaning')
  const recleaningLogs = useMemo(() => processingLogs.filter(p => p.entry_type === 'Recleaning'), [processingLogs]);
  const recleaningBuyers = useMemo(() => Array.from(new Set(recleaningLogs.map(p => p.buyer_name).filter(Boolean))).sort(), [recleaningLogs]);
  const inspectionsForBuyer = useMemo(
    () => (inspections || []).filter(i => i.result === 'Failed' && (!form.buyer_name || i.buyer_name === form.buyer_name)),
    [inspections, form.buyer_name]
  );
  const linkedInspection = useMemo(
    () => (inspections || []).find(i => i.id === form.inspection_ref),
    [inspections, form.inspection_ref]
  );
  // Auto-fill from linked inspection when Recleaned + inspection chosen
  useEffect(() => {
    if (!isRecleaned || !linkedInspection) return;
    setForm(p => ({
      ...p,
      coffee_type: linkedInspection.coffee_type || p.coffee_type,
      rejection_reason: linkedInspection.rejection_reason || p.rejection_reason,
    }));
     
  }, [form.inspection_ref, isRecleaned]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Auto-fill total_kg_processed.
  //   Standard → sum Standard ProcessingLog KG for date range + coffee type (read directly from log, include null coffee_type).
  //   Recleaned → sum Recleaning ProcessingLog KG for date + buyer + inspection_ref.
  const endDate = form.end_date || form.start_date;

  // Build a set of supplier names whose coffee_type is explicitly "Natural Guji"
  // so we can exclude them from null-coffee_type matches on other types.
  const naturalGujiSuppliers = useMemo(() => {
    const s = new Set();
    suppliers.forEach(sup => { if (sup.coffee_type === 'Natural Guji' && sup.supplier_name) s.add(sup.supplier_name); });
    // Also include processing log entries that explicitly have coffee_type = Natural Guji
    processingLogs.forEach(p => { if (p.coffee_type === 'Natural Guji' && p.supplier_name) s.add(p.supplier_name); });
    return s;
  }, [suppliers, processingLogs]);

  const matchingStandardLogs = useMemo(() => {
    if (!form.start_date || !form.coffee_type || isRecleaned) return [];
    return processingLogs.filter(p => {
      if (p.archived || p.entry_type === 'Recleaning') return false;
      if (p.date < form.start_date || p.date > endDate) return false;
      // Exact match on coffee_type — always include
      if (p.coffee_type === form.coffee_type) return true;
      // Null coffee_type (legacy entries):
      //   - Never include in Natural Guji (they belong to other types)
      if (form.coffee_type === 'Natural Guji') return false;
      //   - For all other types: include null entries ONLY if the supplier is NOT a Natural Guji supplier
      if (p.coffee_type == null && !naturalGujiSuppliers.has(p.supplier_name)) return true;
      return false;
    });
  }, [form.coffee_type, form.start_date, endDate, isRecleaned, processingLogs, naturalGujiSuppliers]);

  const autoFilledKg = useMemo(() => {
    if (!form.start_date) return null;
    if (isRecleaned) {
      if (!form.inspection_ref) return null;
      return recleaningLogs
        .filter(p => p.date >= form.start_date && p.date <= endDate && p.inspection_ref === form.inspection_ref)
        .reduce((sum, p) => sum + (p.actual_weighed_kg ?? p.kg_sent ?? 0), 0);
    }
    if (!form.coffee_type) return null;
    return matchingStandardLogs.reduce((sum, p) => sum + (p.actual_weighed_kg ?? p.kg_sent ?? 0), 0);
  }, [form.coffee_type, form.start_date, endDate, form.inspection_ref, isRecleaned, matchingStandardLogs, recleaningLogs]);

  // Per-date breakdown for the Standard auto-fill
  const autoFillBreakdown = useMemo(() => {
    if (isRecleaned || !form.start_date || !form.coffee_type || matchingStandardLogs.length === 0) return [];
    const byDate = {};
    matchingStandardLogs.forEach(p => {
      if (!byDate[p.date]) byDate[p.date] = { kg: 0, count: 0 };
      byDate[p.date].kg += (p.actual_weighed_kg ?? p.kg_sent ?? 0);
      byDate[p.date].count += 1;
    });
    return Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b));
  }, [isRecleaned, form.start_date, form.coffee_type, matchingStandardLogs]);

  useEffect(() => {
    if (autoFilledKg !== null) set('total_kg_processed', String(autoFilledKg));
  }, [autoFilledKg]);

  const pool2Kg = parseFloat(form.total_kg_processed) || 0; // Recleaned KG from Pool 2
  const additionalPool1Kg = isRecleaned ? (parseFloat(form.additional_pool1_kg) || 0) : 0;
  const totalKg = isRecleaned ? pool2Kg + additionalPool1Kg : pool2Kg;
  const exportBags = parseFloat(form.export_bags) || 0;
  const rejectBags = parseFloat(form.reject_bags) || 0;
  const exportKg = exportBags * 60;
  const rejectKg = rejectBags * 85;
  const wasteKg = totalKg > 0 ? totalKg - exportKg - rejectKg : 0;
  const rejectPct = totalKg > 0 ? (rejectKg / totalKg) * 100 : 0;
  const wastePct = totalKg > 0 ? (wasteKg / totalKg) * 100 : 0;

  // Pool 1 availability for selected coffee type (excluding the current record being edited)
  const coffeeTypeForPool1 = form.coffee_type || linkedInspection?.coffee_type || '';
  const pool1Available = (pool1ByCoffeeType?.[coffeeTypeForPool1] ?? null);
  // When editing, add back what was previously used so the available reflects current state
  const editingPrevPool1 = initialData?.additional_pool1_kg || 0;
  const pool1AvailableAdjusted = pool1Available !== null ? pool1Available + editingPrevPool1 : null;

  // Validation errors
  const pool1Error = isRecleaned && additionalPool1Kg > 0 && pool1AvailableAdjusted !== null && additionalPool1Kg > pool1AvailableAdjusted
    ? `Not enough fresh stock in Pool 1. Available: ${(pool1AvailableAdjusted).toLocaleString('en-US', { maximumFractionDigits: 2 })} KG`
    : null;
  const balanceError = totalKg > 0 && Math.abs(exportKg + rejectKg + wasteKg - totalKg) > 0.01
    ? 'Export KG + Reject KG + Waste KG must equal Total KG Processed'
    : null;

  const wasteError = wasteKg < -0.01
    ? `Export + Reject KG exceeds total processed KG by ${Math.abs(Math.round(wasteKg)).toLocaleString()} KG — reduce bag count`
    : null;

  const formWarnings = useMemo(() => getOutputWarnings(form), [form]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (pool1Error || balanceError) return;
    const data = {
      entry_type: form.entry_type,
      start_date: form.start_date,
      end_date: form.end_date,
      date: form.start_date, // keep legacy field in sync
      coffee_type: form.coffee_type || (linkedInspection?.coffee_type) || null,
      total_kg_processed: totalKg || null,
      export_bags: exportBags || null,
      export_kg: exportKg || null,
      reject_bags: rejectBags || null,
      reject_kg: rejectKg || null,
      waste_kg: wasteKg,
      reject_pct: rejectPct,
      waste_pct: wastePct,
      registrar_name: form.registrar_name || null,
      remark: form.remark || null,
      export_status: form.export_status || 'Available for Export',
      additional_pool1_kg: isRecleaned ? (additionalPool1Kg || 0) : 0,
    };
    if (isRecleaned) {
      data.buyer_name = form.buyer_name;
      data.inspection_ref = form.inspection_ref;
      data.rejection_reason = form.rejection_reason || null;
      data.supplier_name = null;
    } else {
      data.supplier_name = form.supplier_name || null;
      data.buyer_name = null;
      data.inspection_ref = null;
      data.rejection_reason = null;
    }
    onSubmit(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display">{initialData ? 'Edit Output Report' : 'New Output Report'}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type toggle */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Type *</Label>
            <div className="flex gap-2">
              <button type="button" onClick={() => set('entry_type', 'Standard')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold border transition-all ${form.entry_type === 'Standard' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border text-muted-foreground hover:border-primary/50'}`}>
                Standard Output
              </button>
              <button type="button" onClick={() => set('entry_type', 'Recleaned')}
                disabled={recleaningLogs.length === 0}
                title={recleaningLogs.length === 0 ? 'No recleaning processing entries available' : ''}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${form.entry_type === 'Recleaned' ? 'bg-amber-600 text-white border-amber-600' : 'bg-background border-border text-muted-foreground hover:border-primary/50'}`}>
                Recleaned Output
              </button>
            </div>
            {isRecleaned && <p className="text-[11px] text-amber-700">Goes into Pool 2 (Recleaned Stock), not Pool 1 (Fresh Stock).</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Start Date *</Label>
              <Input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">End Date *</Label>
              <Input type="date" value={form.end_date} min={form.start_date || undefined} onChange={e => set('end_date', e.target.value)} required />
            </div>
          </div>
          {!isRecleaned && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Coffee Type *</Label>
              <Select value={form.coffee_type} onValueChange={v => set('coffee_type', v)}>
                <SelectTrigger><SelectValue placeholder="Choose coffee type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__placeholder__" disabled>Choose coffee type</SelectItem>
                  {coffeeTypes.map(ct => <SelectItem key={ct} value={ct}>{ct}</SelectItem>)}
                </SelectContent>
              </Select>
              {coffeeTypes.length === 0 && <p className="text-xs text-muted-foreground italic">No processing log entries found. Add processing logs first.</p>}
            </div>
          )}

          {isRecleaned && (
            <div className="space-y-4 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Buyer *</Label>
                  <Select value={form.buyer_name} onValueChange={v => { set('buyer_name', v); set('inspection_ref', ''); }}>
                    <SelectTrigger><SelectValue placeholder="Select buyer..." /></SelectTrigger>
                    <SelectContent>{recleaningBuyers.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Inspection Reference *</Label>
                  <Select value={form.inspection_ref} onValueChange={v => set('inspection_ref', v)} disabled={!form.buyer_name}>
                    <SelectTrigger><SelectValue placeholder="Select failed inspection..." /></SelectTrigger>
                    <SelectContent>
                      {inspectionsForBuyer.map(i => (
                        <SelectItem key={i.id} value={i.id}>{i.inspection_date} — {i.coffee_type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {linkedInspection && (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <p><span className="font-semibold">Coffee Type:</span> {linkedInspection.coffee_type}</p>
                  <p><span className="font-semibold">Original Rejection:</span> {linkedInspection.rejection_reason || '—'}</p>
                </div>
              )}
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">{isRecleaned ? 'Pool 2 (Recleaned KG) — Auto-filled' : 'Total KG Processed (Auto-filled)'}</Label>
            <Input
              type="number"
              step="any"
              value={form.total_kg_processed}
              readOnly
              className="bg-muted font-semibold"
              placeholder="Select date and coffee type..."
            />
            {form.coffee_type && form.start_date && autoFilledKg === 0 && (
              <p className="text-xs text-destructive italic">No processing found for this date range and coffee type.</p>
            )}
            {!isRecleaned && autoFillBreakdown.length > 0 && (
              <div className="rounded-md border border-border bg-muted/30 p-2.5 text-xs space-y-1">
                <p className="font-semibold text-muted-foreground">Auto-filled from {matchingStandardLogs.length} processing {matchingStandardLogs.length === 1 ? 'entry' : 'entries'}:</p>
                {autoFillBreakdown.map(([date, { kg, count }]) => (
                  <div key={date} className="flex justify-between text-muted-foreground">
                    <span>{(() => { try { return new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return date; } })()}:</span>
                    <span className="font-medium text-foreground">{kg.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} KG <span className="text-muted-foreground font-normal">({count} {count === 1 ? 'entry' : 'entries'})</span></span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-border pt-1 font-semibold text-foreground">
                  <span>Total:</span>
                  <span>{(autoFilledKg ?? 0).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} KG</span>
                </div>
              </div>
            )}
          </div>

          {isRecleaned && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Additional KG from Standard Pool (Pool 1)</Label>
              <NumberInput
                decimals={2}
                value={form.additional_pool1_kg}
                onChange={v => set('additional_pool1_kg', v)}
                placeholder="0"
                min={0}
              />
              <p className="text-[11px] text-muted-foreground">Add KG from fresh stock to supplement this recleaned batch</p>
              {pool1AvailableAdjusted !== null && (
                <p className={`text-[11px] font-medium ${pool1Error ? 'text-destructive' : 'text-muted-foreground'}`}>
                  Pool 1 available ({coffeeTypeForPool1 || 'selected type'}): {pool1AvailableAdjusted.toLocaleString('en-US', { maximumFractionDigits: 2 })} KG
                </p>
              )}
              {pool1Error && <p className="text-xs font-semibold text-destructive">{pool1Error}</p>}
            </div>
          )}

          {isRecleaned && (pool2Kg > 0 || additionalPool1Kg > 0) && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs font-mono space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Pool 2 (Recleaned):</span><span className="font-semibold">{fmt(pool2Kg, 0)} KG</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Pool 1 (Standard):</span><span className="font-semibold">+ {fmt(additionalPool1Kg, 0)} KG</span></div>
              <div className="border-t border-amber-300 pt-1 flex justify-between font-bold">
                <span>Total Input:</span><span>{fmt(totalKg, 0)} KG</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Export Bags</Label>
              <NumberInput decimals={0} value={form.export_bags} onChange={v => set('export_bags', v)} placeholder="0" />
              {exportBags > 0 && <p className="text-xs text-muted-foreground">= {fmt(exportKg, 0)} KG (×60)</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Reject Bags</Label>
              <NumberInput decimals={0} value={form.reject_bags} onChange={v => set('reject_bags', v)} placeholder="0" />
              {rejectBags > 0 && <p className="text-xs text-muted-foreground">= {fmt(rejectKg, 0)} KG (×85)</p>}
            </div>
          </div>
          {totalKg > 0 && (
            <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-muted/50 text-sm">
              <div className="text-center">
                <div className="font-semibold text-primary">{fmt(exportKg, 0)}</div>
                <div className="text-xs text-muted-foreground">Export KG</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-secondary">{fmt(rejectKg, 0)}</div>
                <div className="text-xs text-muted-foreground">Reject KG</div>
              </div>
              <div className={`text-center ${wasteKg < 0 ? 'text-destructive' : ''}`}>
                <div className="font-semibold">{fmt(wasteKg, 0)}</div>
                <div className="text-xs text-muted-foreground">Waste KG ({fmt(wastePct, 1)}%)</div>
              </div>
            </div>
          )}
          {balanceError && <p className="text-xs font-semibold text-destructive">{balanceError}</p>}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Registrar Name</Label>
            <Input value={form.registrar_name} onChange={e => set('registrar_name', e.target.value)} placeholder="Name..." />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Remark</Label>
            <Textarea value={form.remark} onChange={e => set('remark', e.target.value)} rows={2} placeholder="Optional..." />
          </div>
          {wasteError && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-300 bg-red-50 text-red-700 text-sm font-medium">
              <span>⊘</span> {wasteError}
            </div>
          )}
          {formWarnings.length > 0 && <InlineWarningList warnings={formWarnings} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              type="submit"
              disabled={isSubmitting || !form.start_date || !form.end_date || (!isRecleaned && !form.coffee_type) || (isRecleaned && (!form.buyer_name || !form.inspection_ref)) || !!pool1Error || !!balanceError || !!wasteError}
            >
              {isSubmitting ? 'Saving...' : initialData ? 'Update' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function OutputReportPage() {
  const [search, setSearch] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [sortKey, setSortKey] = useState('start_date');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (dialogOpen) {
      queryClient.refetchQueries({ queryKey: ['processing-logs'] });
    }
  }, [dialogOpen]);

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['output-reports'],
    queryFn: () => base44.entities.OutputReport.list('-created_date', 500),
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list(),
  });
  const { data: processingLogs = [] } = useQuery({
    queryKey: ['processing-logs'],
    queryFn: () => base44.entities.ProcessingLog.list('-date', 2000),
    staleTime: 0,
    refetchOnMount: true,
  });
  const { data: inspections = [] } = useQuery({
    queryKey: ['buyer-inspections'],
    queryFn: () => base44.entities.BuyerInspection.list(),
  });
  const { data: contracts = [] } = useQuery({
    queryKey: ['export-contracts'],
    queryFn: () => base44.entities.ExportContract.list(),
  });
  const { data: sampleLogs = [] } = useQuery({
    queryKey: ['sample-logs'],
    queryFn: () => base44.entities.SampleLog.list(),
  });

  // Compute live Pool 1 availability per coffee type for form validation
  const pool1ByCoffeeType = useMemo(() => {
    const { fresh } = computeStockPools({ outputReports: reports, contracts, inspections, sampleLogs });
    return fresh;
  }, [reports, contracts, inspections, sampleLogs]);

  const createMutation = useMutation({
    mutationFn: data => base44.entities.OutputReport.create(data),
    onSuccess: (rec) => {
      queryClient.invalidateQueries({ queryKey: ['output-reports'] });
      setDialogOpen(false);
      logActivity({ action_type: 'Created', screen_name: 'Output Report', entity_type: 'OutputReport', entity_id: rec.id, record_description: `Output ${rec.start_date || rec.date} — ${rec.supplier_name || rec.buyer_name || rec.coffee_type || ''}` });
      notifyOutputReport(rec).catch(() => {});
    },
  });
  const updateMutation = useMutation({
    mutationFn: async ({ id, data, previous }) => {
      const updated = await base44.entities.OutputReport.update(id, data);
      return { updated, previous };
    },
    onSuccess: ({ updated, previous }) => {
      queryClient.invalidateQueries({ queryKey: ['output-reports'] });
      setDialogOpen(false);
      setEditRecord(null);
      logActivity({ action_type: 'Edited', screen_name: 'Output Report', entity_type: 'OutputReport', entity_id: updated.id, record_description: `Output ${updated.start_date || updated.date} — ${updated.supplier_name || updated.buyer_name || updated.coffee_type || ''}`, changes: diffRecords(previous, updated) });
    },
  });
  const archiveMutation = useMutation({
    mutationFn: ({ record, reason }) => archiveRecord({
      entityName: 'OutputReport',
      record,
      screen_name: 'Output Report',
      description: `Output ${record.start_date || record.date} — ${record.supplier_name || record.buyer_name || record.coffee_type || ''}`,
      reason,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['output-reports'] });
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
    const list = reports.filter(r => {
      if (r.archived) return false;
      if (search && !r.supplier_name?.toLowerCase().includes(q) && !r.coffee_type?.toLowerCase().includes(q)) return false;
      // Date range overlap: entry overlaps [filterFrom, filterTo] if entry.start <= filterTo AND entry.end >= filterFrom
      const { start, end } = getRecordDates(r);
      if (filterFrom && end && end < filterFrom) return false;
      if (filterTo && start && start > filterTo) return false;
      return true;
    });
    return [...list].sort((a, b) => {
      let va = a[sortKey] ?? (sortKey === 'start_date' ? (a.date ?? '') : '');
      let vb = b[sortKey] ?? (sortKey === 'start_date' ? (b.date ?? '') : '');
      if (typeof va === 'number' && typeof vb === 'number') return sortDir === 'asc' ? va - vb : vb - va;
      return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
  }, [reports, search, filterFrom, filterTo, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const COLS = [
    { label: '#', key: null },
    { label: 'Processing Period', key: 'start_date' },
    { label: 'Duration', key: null },
    { label: 'Type', key: 'entry_type' },
    { label: 'Supplier / Buyer', key: 'supplier_name' },
    { label: 'Coffee Type', key: 'coffee_type' },
    { label: 'Total KG', key: 'total_kg_processed' },
    { label: 'Add. Pool 1 KG', key: 'additional_pool1_kg' },
    { label: 'Export Bags', key: 'export_bags' },
    { label: 'Export KG', key: 'export_kg' },
    { label: 'Reject Bags', key: 'reject_bags' },
    { label: 'Reject KG', key: 'reject_kg' },
    { label: 'Waste KG', key: 'waste_kg' },
    { label: 'Waste %', key: 'waste_pct' },
    { label: 'Status', key: 'export_status' },
    { label: 'Registrar', key: 'registrar_name' },
    { label: 'Actions', key: null },
  ];

  return (
    <RoleGuard allowedRoles={['admin', 'warehouse_keeper', 'final_registrar']}>
      <div>
        <PageHeader title="Output Report" description="Daily processing output by supplier and coffee type">
          <Button onClick={() => { setEditRecord(null); setDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-1" /> New Report
          </Button>
        </PageHeader>
        <div className="flex flex-wrap gap-3 mb-4 items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9 w-60" placeholder="Search by supplier or type..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">From</Label>
            <Input type="date" value={filterFrom} onChange={e => { setFilterFrom(e.target.value); setPage(1); }} className="h-9 w-38 text-sm" />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">To</Label>
            <Input type="date" value={filterTo} onChange={e => { setFilterTo(e.target.value); setPage(1); }} className="h-9 w-38 text-sm" />
          </div>
          {(filterFrom || filterTo) && (
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => { setFilterFrom(''); setFilterTo(''); setPage(1); }}>Clear dates</Button>
          )}
        </div>
        <ExportBar
          onPDF={() => {
            const exportHeaders = ['#', 'Period', 'Type', 'Supplier / Buyer', 'Coffee Type', 'Total KG', 'Export Bags', 'Export KG', 'Reject Bags', 'Reject KG', 'Waste KG', 'Waste %'];
            const exportRows = filtered.map((r, i) => {
              const { start, end } = getRecordDates(r);
              return [i+1, formatDateRange(start, end), r.entry_type || 'Standard', r.supplier_name || r.buyer_name || '—', r.coffee_type || '—', r.total_kg_processed != null ? r.total_kg_processed : '—', r.export_bags ?? '—', r.export_kg != null ? r.export_kg : '—', r.reject_bags ?? '—', r.reject_kg != null ? r.reject_kg : '—', r.waste_kg != null ? r.waste_kg : '—', r.waste_pct != null ? `${Number(r.waste_pct).toFixed(1)}%` : '—'];
            });
            const totals = ['', 'TOTAL', '', '', '', filtered.reduce((s, r) => s + (r.total_kg_processed || 0), 0).toFixed(2), filtered.reduce((s, r) => s + (r.export_bags || 0), 0), filtered.reduce((s, r) => s + (r.export_kg || 0), 0).toFixed(2), filtered.reduce((s, r) => s + (r.reject_bags || 0), 0), filtered.reduce((s, r) => s + (r.reject_kg || 0), 0).toFixed(2), filtered.reduce((s, r) => s + (r.waste_kg || 0), 0).toFixed(2), ''];
            exportPDF('Output Report', exportHeaders, exportRows, totals);
          }}
          onXLSX={() => {
            const exportHeaders = ['#', 'Period', 'Type', 'Supplier / Buyer', 'Coffee Type', 'Total KG', 'Export Bags', 'Export KG', 'Reject Bags', 'Reject KG', 'Waste KG', 'Waste %'];
            const exportRows = filtered.map((r, i) => {
              const { start, end } = getRecordDates(r);
              return [i+1, formatDateRange(start, end), r.entry_type || 'Standard', r.supplier_name || r.buyer_name || '—', r.coffee_type || '—', r.total_kg_processed ?? 0, r.export_bags ?? 0, r.export_kg ?? 0, r.reject_bags ?? 0, r.reject_kg ?? 0, r.waste_kg ?? 0, r.waste_pct != null ? `${Number(r.waste_pct).toFixed(1)}%` : '—'];
            });
            const totals = ['', 'TOTAL', '', '', '', filtered.reduce((s, r) => s + (r.total_kg_processed || 0), 0), filtered.reduce((s, r) => s + (r.export_bags || 0), 0), filtered.reduce((s, r) => s + (r.export_kg || 0), 0), filtered.reduce((s, r) => s + (r.reject_bags || 0), 0), filtered.reduce((s, r) => s + (r.reject_kg || 0), 0), filtered.reduce((s, r) => s + (r.waste_kg || 0), 0), ''];
            exportXLSX('Output_Report', 'Output Report', exportHeaders, exportRows, totals);
          }}
        />
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
                  <TableRow><TableCell colSpan={COLS.length} className="text-center py-12 text-muted-foreground">{search ? 'No entries match.' : 'No output reports yet.'}</TableCell></TableRow>
                ) : paginated.map((r, i) => (
                  <TableRow key={r.id} className={`hover:bg-muted/30 ${r.entry_type === 'Recleaned' ? 'bg-amber-50/40' : ''}`}>
                    <TableCell className="text-muted-foreground text-xs">{(page - 1) * pageSize + i + 1}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm font-medium">
                      {(() => { const { start, end } = getRecordDates(r); return formatDateRange(start, end); })()}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {(() => { const { start, end } = getRecordDates(r); const d = dateDurationDays(start, end); return d > 0 ? `${d} ${d === 1 ? 'day' : 'days'}` : '—'; })()}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${r.entry_type === 'Recleaned' ? 'bg-amber-100 text-amber-700' : 'bg-muted text-muted-foreground'}`}>
                        {r.entry_type || 'Standard'}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium whitespace-nowrap">{r.supplier_name || r.buyer_name || '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{r.coffee_type || '—'}</TableCell>
                    <TableCell className="text-right font-semibold">{fmt(r.total_kg_processed)}</TableCell>
                    <TableCell className="text-right">
                      {r.entry_type === 'Recleaned' && r.additional_pool1_kg > 0
                        ? <span className="text-blue-700 font-medium">{fmt(r.additional_pool1_kg)}</span>
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right">{r.export_bags != null ? fmt(r.export_bags, 0) : '—'}</TableCell>
                    <TableCell className="text-right">{fmt(r.export_kg)}</TableCell>
                    <TableCell className="text-right">{r.reject_bags != null ? fmt(r.reject_bags, 0) : '—'}</TableCell>
                    <TableCell className="text-right">{fmt(r.reject_kg)}</TableCell>
                    <TableCell className={`text-right font-medium ${r.waste_kg != null && r.waste_kg < 0 ? 'text-destructive' : ''}`}>{fmt(r.waste_kg)}</TableCell>
                    <TableCell className="text-right">{r.waste_pct != null ? `${fmt(r.waste_pct, 1)}%` : '—'}</TableCell>
                    <TableCell>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${(r.export_status || 'Available for Export') === 'Exported' ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-700'}`}>
                        {r.export_status || 'Available for Export'}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{r.registrar_name || '—'}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => { setEditRecord(r); setDialogOpen(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setArchiveTarget(r)}><Trash2 className="w-3.5 h-3.5" /></Button>
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

        <OutputFormDialog
          open={dialogOpen}
          onOpenChange={v => { setDialogOpen(v); if (!v) setEditRecord(null); }}
          initialData={editRecord}
          suppliers={suppliers}
          processingLogs={processingLogs}
          inspections={inspections}
          pool1ByCoffeeType={pool1ByCoffeeType}
          onSubmit={data => { if (editRecord) updateMutation.mutate({ id: editRecord.id, data, previous: editRecord }); else createMutation.mutate(data); }}
          isSubmitting={createMutation.isPending || updateMutation.isPending}
        />

        <ArchiveDialog
          open={!!archiveTarget}
          onOpenChange={v => { if (!v) setArchiveTarget(null); }}
          title="Archive Output Report?"
          description={archiveTarget ? `Archive output report for ${archiveTarget.supplier_name || archiveTarget.buyer_name || ''} (${archiveTarget.start_date || archiveTarget.date})?` : ''}
          isPending={archiveMutation.isPending}
          onConfirm={(reason) => archiveMutation.mutate({ record: archiveTarget, reason })}
        />

        <ArchivedRecordsSection
          entityName="OutputReport"
          screenName="Output Report"
          queryKey={['output-reports']}
          describeRecord={(r) => `Output ${r.start_date || r.date} — ${r.supplier_name || r.buyer_name || r.coffee_type || ''}`}
          columns={[
            { label: 'Period', render: (r) => { const { start, end } = getRecordDates(r); return formatDateRange(start, end); } },
            { label: 'Type', render: (r) => r.entry_type || 'Standard' },
            { label: 'Supplier / Buyer', render: (r) => r.supplier_name || r.buyer_name || '—' },
            { label: 'Coffee Type', render: (r) => r.coffee_type || '—' },
            { label: 'Total KG', render: (r) => fmt(r.total_kg_processed) },
          ]}
        />
      </div>
    </RoleGuard>
  );
}