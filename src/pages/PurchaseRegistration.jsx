import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Pencil, Trash2, Search, ChevronUp, ChevronDown, ChevronsUpDown, AlertTriangle, Paperclip } from 'lucide-react';
import { format } from 'date-fns';
import RoleGuard from '@/components/RoleGuard';
import { useRole } from '@/lib/useRole';
import PaymentHistoryPanel, { parsePayments, PaymentStatusBadge } from '@/components/purchases/PaymentHistoryPanel';
import { calcTotalPaid, calcBalance, calcPaymentStatus } from '@/lib/paymentUtils';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import PurchaseAttachmentsPanel from '@/components/attachments/PurchaseAttachmentsPanel';
import RichArchiveDialog from '@/components/shared/RichArchiveDialog';
import ArchivedRecordsSection from '@/components/shared/ArchivedRecordsSection';
import { archivePurchaseWithCascade, countPurchaseCascade } from '@/lib/archiveService';
import { logActivity, diffRecords } from '@/lib/activityLogger';
import { InlineWarningList } from '@/components/notifications/InlineWarning';
import { getPurchaseWarnings } from '@/lib/formWarnings';
import { notifyNewPurchase } from '@/lib/notificationService';
import NumberInput from '@/components/shared/NumberInput';
import TablePagination from '@/components/shared/TablePagination';
import { useDuplicateCheck } from '@/hooks/useDuplicateCheck';
import DuplicateWarningBanner from '@/components/purchases/DuplicateWarningBanner';
import DuplicateConfirmDialog from '@/components/purchases/DuplicateConfirmDialog';
import DuplicateReport from '@/components/purchases/DuplicateReport';

function fmt(n, decimals = 2) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

const FERESULA = 17;

// Parse additional_costs JSON field
function parseCosts(record) {
  if (!record) return [{ name: 'Transport', amount: 0 }];
  // Migrate from old other_cost_etb if no additional_costs field
  if (record.additional_costs) {
    try { return JSON.parse(record.additional_costs); } catch { /* fall through */ }
  }
  // Legacy: return transport=0 as default
  return [{ name: 'Transport', amount: record.other_cost_etb ?? 0 }];
}

function totalAdditionalCosts(costs) {
  return costs.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
}

function calcFromDispatch(form, costs) {
  const kg = parseFloat(form.net_dispatch_weight_kg) || 0;
  const unitPrice = parseFloat(form.unit_price_etb_per_feresula) || 0;
  const commPct = parseFloat(form.commission_percent) || 0;
  const otherCost = totalAdditionalCosts(costs);
  const net_feresula = kg / FERESULA;
  const total_purchase_price = unitPrice * net_feresula;
  const commission_etb = unitPrice * net_feresula * commPct / 100;
  const total_purchase_price_etb = total_purchase_price * (1 + commPct / 100) + otherCost;
  return { net_feresula, total_purchase_price, commission_etb, total_purchase_price_etb, otherCost };
}

function calcGrandTotal(warehouseKg, unitPrice, commPct, otherCost, totalPaid) {
  if (!warehouseKg) return null;
  const feresula = warehouseKg / FERESULA;
  const purchasePrice = unitPrice * feresula;
  const commission = unitPrice * feresula * commPct / 100;
  const grand_total_etb = purchasePrice + otherCost + commission;
  const balance_etb = grand_total_etb - totalPaid;
  return { grand_total_etb, balance_etb, feresula };
}

function generateCoffeeCode(region, allRecords) {
  const year = new Date().getFullYear();
  const regionCode = (region || 'XX').substring(0, 10).replace(/\s+/g, '');
  const seq = (allRecords.length + 1).toString().padStart(3, '0');
  return `KKGT/${regionCode}/${seq}/${year}`;
}

function SortIcon({ col, sortKey, sortDir }) {
  if (sortKey !== col) return <ChevronsUpDown className="inline w-3 h-3 ml-1 opacity-30" />;
  return sortDir === 'asc' ? <ChevronUp className="inline w-3 h-3 ml-1" /> : <ChevronDown className="inline w-3 h-3 ml-1" />;
}

// ─── Additional Costs Editor ──────────────────────────────────────────────────
function AdditionalCostsEditor({ costs, onChange }) {
  const set = (i, field, val) => {
    const next = costs.map((c, idx) => idx === i ? { ...c, [field]: val } : c);
    onChange(next);
  };
  const add = () => onChange([...costs, { name: '', amount: 0 }]);
  const remove = (i) => onChange(costs.filter((_, idx) => idx !== i));
  const total = totalAdditionalCosts(costs);

  return (
    <div className="space-y-2">
      <Label className="text-xs font-semibold uppercase tracking-wide">Additional Costs (ETB)</Label>
      <div className="space-y-2">
        {costs.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            {i === 0 ? (
              <div className="flex-1 flex items-center h-9 px-3 rounded-md border border-input bg-muted text-sm font-medium text-muted-foreground select-none">
                Transport
              </div>
            ) : (
              <Input
                className="flex-1"
                placeholder="e.g. Tax, Cleaning, Commission"
                value={c.name}
                onChange={e => set(i, 'name', e.target.value)}
              />
            )}
            <NumberInput
              decimals={2}
              className="w-36 text-right"
              placeholder="0.00"
              value={c.amount === 0 && i === 0 ? '' : c.amount}
              onChange={v => set(i, 'amount', v)}
            />
            {i === 0 ? (
              <div className="w-8" />
            ) : (
              <Button type="button" size="icon" variant="ghost" className="text-destructive hover:text-destructive w-8 h-8 flex-shrink-0" onClick={() => remove(i)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between pt-1">
        <Button type="button" size="sm" variant="outline" className="text-primary border-primary/30 hover:bg-primary/5 h-7 text-xs gap-1" onClick={add}>
          <Plus className="w-3 h-3" /> Add Cost
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Total Additional Costs:</span>
          <span className="text-sm font-bold text-foreground">{fmt(total)} ETB</span>
        </div>
      </div>
    </div>
  );
}

// ─── Purchase Form Dialog ─────────────────────────────────────────────────────
const EMPTY_FORM = {
  coffee_code: '', purchase_date: '', supplier_name: '', agent: '', region: '',
  coffee_type: '', net_dispatch_weight_kg: '',
  unit_price_etb_per_feresula: '', commission_percent: '', remark: '',
};

function PurchaseFormDialog({ open, onOpenChange, initialData, suppliers, allRecords, receipts, onSubmit, isSubmitting }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [payments, setPayments] = useState([]);
  const [costs, setCosts] = useState([{ name: 'Transport', amount: 0 }]);
  const [supplierError, setSupplierError] = useState('');
  const [dupConfirmOpen, setDupConfirmOpen] = useState(false);
  const [pendingSubmitData, setPendingSubmitData] = useState(null);

  const { exactMatch, nearMatch, codeConflict } = useDuplicateCheck({
    supplierName: form.supplier_name,
    purchaseDate: form.purchase_date,
    coffeeCode: form.coffee_code,
    allPurchases: allRecords,
    currentId: initialData?.id ?? null,
  });

  useEffect(() => {
    if (open) {
      setSupplierError('');
      if (initialData) {
        setForm({
          coffee_code: initialData.coffee_code || '',
          purchase_date: initialData.purchase_date || '',
          supplier_name: initialData.supplier_name || '',
          agent: initialData.agent || '',
          region: initialData.region || '',
          coffee_type: initialData.coffee_type || '',
          net_dispatch_weight_kg: initialData.net_dispatch_weight_kg ?? '',
          unit_price_etb_per_feresula: initialData.unit_price_etb_per_feresula ?? '',
          commission_percent: initialData.commission_percent ?? '',
          remark: initialData.remark || '',
        });
        setPayments(parsePayments(initialData));
        setCosts(parseCosts(initialData));
      } else {
        setForm(EMPTY_FORM);
        setPayments([]);
        setCosts([{ name: 'Transport', amount: 0 }]);
      }
    }
  }, [open, initialData]);

  const handleSupplierChange = (supplierName) => {
    const supplier = suppliers.find(s => s.supplier_name === supplierName);
    const region = supplier?.region || '';
    const code = initialData ? form.coffee_code : generateCoffeeCode(region, allRecords);
    if (supplier) {
      const missing = [];
      if (!supplier.region) missing.push('Region');
      if (!supplier.agent) missing.push('Agent');
      if (!supplier.coffee_type) missing.push('Coffee Type');
      if (missing.length > 0) {
        setSupplierError(`⛔ Cannot register purchase — supplier profile incomplete. Missing: ${missing.join(', ')}. Go to Master Data to complete this supplier's profile.`);
      } else {
        setSupplierError('');
      }
    } else {
      setSupplierError('');
    }
    setForm(prev => ({
      ...prev,
      supplier_name: supplierName,
      agent: supplier?.agent || '',
      region,
      coffee_type: supplier?.coffee_type || '',
      coffee_code: code,
    }));
  };

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));
  const totalPaidEtb = payments.reduce((s, p) => s + (parseFloat(p.amount_etb) || 0), 0);
  const formWarnings = useMemo(() => getPurchaseWarnings({ ...form, additional_costs: JSON.stringify(costs) }, allRecords), [form, costs, allRecords]);
  const dispatch = calcFromDispatch(form, costs);
  const totalCosts = totalAdditionalCosts(costs);

  const warehouseReceipt = useMemo(() => {
    if (!form.coffee_code) return null;
    return receipts.find(r => r.coffee_code === form.coffee_code) || null;
  }, [receipts, form.coffee_code]);

  const warehouseKg = warehouseReceipt?.warehouse_received_net_kg || null;
  // Commission is ONLY calculated from Warehouse Received KG (never from dispatch).
  // Formula: (Warehouse Received KG / 17) × Unit Price × Commission%
  const warehouseCommissionEtb = warehouseKg
    ? (warehouseKg / FERESULA) * (parseFloat(form.unit_price_etb_per_feresula) || 0) * (parseFloat(form.commission_percent) || 0) / 100
    : null;
  const grandCalc = calcGrandTotal(
    warehouseKg,
    parseFloat(form.unit_price_etb_per_feresula) || 0,
    parseFloat(form.commission_percent) || 0,
    totalCosts,
    totalPaidEtb,
  );
  const dispatchGrandTotal = calcGrandTotal(
    parseFloat(form.net_dispatch_weight_kg) || 0,
    parseFloat(form.unit_price_etb_per_feresula) || 0,
    parseFloat(form.commission_percent) || 0,
    totalCosts,
    totalPaidEtb,
  );

  const buildData = () => {
    const numFields = ['net_dispatch_weight_kg', 'unit_price_etb_per_feresula', 'commission_percent'];
    const data = { ...form };
    if (data.supplier_name) data.supplier_name = data.supplier_name.trim();
    if (data.agent) data.agent = data.agent.trim();
    if (data.region) data.region = data.region.trim();
    if (data.coffee_type) data.coffee_type = data.coffee_type.trim();
    numFields.forEach(f => { data[f] = data[f] !== '' ? parseFloat(data[f]) : null; });
    const grandTotal = grandCalc ? grandCalc.grand_total_etb : (dispatchGrandTotal?.grand_total_etb ?? null);
    const rawBalance = grandTotal != null ? grandTotal - totalPaidEtb : null;
    const balance = rawBalance != null ? (Math.abs(rawBalance) <= 1 ? 0 : rawBalance) : null;
    Object.assign(data, {
      net_feresula: dispatch.net_feresula,
      total_purchase_price: dispatch.total_purchase_price,
      commission_etb: warehouseCommissionEtb,
      other_cost_etb: totalCosts,
      additional_costs: JSON.stringify(costs),
      grand_total_etb: grandTotal,
      balance_etb: balance,
      payment_history: JSON.stringify(payments),
      total_paid_etb: totalPaidEtb,
    });
    return data;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (supplierError) return;
    const data = buildData();
    // Block on code conflict
    if (!initialData && codeConflict) {
      setPendingSubmitData(data);
      setDupConfirmOpen(true);
      return;
    }
    // Warn on exact duplicate for new records
    if (!initialData && exactMatch) {
      setPendingSubmitData(data);
      setDupConfirmOpen(true);
      return;
    }
    onSubmit(data);
  };

  const ReadOnlyField = ({ label, value, note, highlight }) => (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}{note && <span className="ml-1 text-[10px] italic">{note}</span>}</Label>
      <Input value={value} readOnly className={`font-medium ${highlight ? 'bg-primary/10 text-primary' : 'bg-muted'}`} />
    </div>
  );

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Coffee Code</Label>
          <Input value={form.coffee_code} readOnly className="bg-muted font-mono text-sm" placeholder="Auto-generated" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Purchase Date *</Label>
          <Input type="date" value={form.purchase_date} onChange={e => set('purchase_date', e.target.value)} required />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Supplier Name *</Label>
        <Select value={form.supplier_name} onValueChange={handleSupplierChange}>
          <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
          <SelectContent>
            {suppliers.map(s => <SelectItem key={s.id} value={s.supplier_name}>{s.supplier_name}</SelectItem>)}
          </SelectContent>
        </Select>
        {supplierError && (
          <div className="flex items-start gap-2 mt-2 p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-800">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span className="text-xs font-medium">{supplierError}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5"><Label className="text-xs font-medium">Agent</Label><Input value={form.agent} onChange={e => set('agent', e.target.value)} placeholder="Auto-filled" /></div>
        <div className="space-y-1.5"><Label className="text-xs font-medium">Region</Label><Input value={form.region} onChange={e => set('region', e.target.value)} placeholder="Auto-filled" /></div>
        <div className="space-y-1.5"><Label className="text-xs font-medium">Coffee Type</Label><Input value={form.coffee_type} onChange={e => set('coffee_type', e.target.value)} placeholder="Auto-filled" /></div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Net Dispatch Weight (KG)</Label>
          <NumberInput decimals={2} value={form.net_dispatch_weight_kg} onChange={v => set('net_dispatch_weight_kg', v)} placeholder="0.00" />
        </div>
        <ReadOnlyField label="Net Feresula (÷17)" value={fmt(dispatch.net_feresula, 4)} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Unit Price (ETB/Feresula)</Label>
          <NumberInput decimals={2} value={form.unit_price_etb_per_feresula} onChange={v => set('unit_price_etb_per_feresula', v)} placeholder="0.00" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Commission (%)</Label>
          <NumberInput decimals={2} suffix="%" value={form.commission_percent} onChange={v => set('commission_percent', v)} placeholder="0.00" />
          {(() => {
            const commVal = parseFloat(form.commission_percent);
            const hasAgent = !!form.agent;
            const isZeroComm = form.commission_percent === '' || commVal === 0 || isNaN(commVal);
            if (hasAgent && isZeroComm) {
              return (
                <div className="flex items-start gap-2 mt-1 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span className="text-xs">Agent is linked — are you sure commission is 0%?</span>
                </div>
              );
            }
            return null;
          })()}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">
          Commission ETB (calculated)
          <span className="ml-1 text-[10px] italic">(Warehouse KG ÷ 17) × Unit Price × Comm%</span>
        </Label>
        <Input
          value={warehouseCommissionEtb != null ? fmt(warehouseCommissionEtb) : '— Pending Warehouse Receipt'}
          readOnly
          className={`font-medium ${warehouseCommissionEtb != null ? 'bg-primary/10 text-primary' : 'bg-amber-50 text-amber-700 italic'}`}
        />
        {warehouseCommissionEtb == null && (
          <p className="text-[10px] text-amber-700">Commission will calculate once warehouse receipt is recorded.</p>
        )}
      </div>

      {/* Dynamic Additional Costs */}
      <div className="rounded-lg border border-border bg-muted/20 p-4">
        <AdditionalCostsEditor costs={costs} onChange={setCosts} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-muted/50 border border-border rounded-lg p-4 space-y-1.5">
          <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Total Purchase Price ETB</p>
          <p className="text-[10px] text-muted-foreground">(Dispatch KG ÷ 17) × Unit Price × (1 + Comm%) + Additional Costs</p>
          <Input value={fmt(dispatch.total_purchase_price_etb)} readOnly className="bg-muted font-bold text-base" />
        </div>
        <div className={`rounded-lg p-4 space-y-1.5 border ${grandCalc ? 'bg-primary/5 border-primary/20' : 'bg-amber-50 border-amber-200'}`}>
          <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Grand Total ETB</p>
          <p className="text-[10px] text-muted-foreground">(Warehouse KG ÷ 17) × Unit Price × (1 + Comm%) + Additional Costs</p>
          <Input
            value={grandCalc ? fmt(grandCalc.grand_total_etb) : (dispatchGrandTotal ? `≈ ${fmt(dispatchGrandTotal.grand_total_etb)} (Dispatch estimate)` : '— Enter unit price')}
            readOnly
            className={`font-bold text-base ${grandCalc ? 'bg-primary/10 text-primary' : 'bg-amber-50 text-amber-800 italic'}`}
          />
          {!warehouseKg && <p className="text-[10px] text-amber-700">⚠️ Pending Warehouse Receipt — showing dispatch estimate</p>}
          {warehouseKg && <p className="text-[10px] text-primary">Warehouse KG: {fmt(warehouseKg, 2)}</p>}
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <PaymentHistoryPanel
          payments={payments}
          onChange={setPayments}
          grandTotalEtb={grandCalc ? grandCalc.grand_total_etb : (dispatchGrandTotal?.grand_total_etb ?? null)}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Remark</Label>
        <Textarea value={form.remark} onChange={e => set('remark', e.target.value)} rows={2} placeholder="Optional notes..." />
      </div>

      {/* Duplicate warning — only show for new purchases */}
      {!initialData && (
        <DuplicateWarningBanner exactMatch={exactMatch} nearMatch={!exactMatch ? nearMatch : null} />
      )}

      {formWarnings.length > 0 && (
        <div className="pt-1">
          <InlineWarningList warnings={formWarnings} />
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button type="submit" disabled={isSubmitting || !!supplierError}>
          {isSubmitting ? 'Saving...' : initialData ? 'Update' : 'Create Purchase'}
        </Button>
      </DialogFooter>

      {/* Duplicate / code-conflict confirmation */}
      <DuplicateConfirmDialog
        open={dupConfirmOpen}
        onOpenChange={setDupConfirmOpen}
        duplicate={codeConflict ? null : exactMatch}
        codeConflict={codeConflict}
        onConfirmSave={() => {
          if (pendingSubmitData) onSubmit(pendingSubmitData, exactMatch);
          setDupConfirmOpen(false);
        }}
      />
    </form>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">{initialData ? 'Edit Purchase' : 'New Purchase'}</DialogTitle>
        </DialogHeader>
        {initialData ? (
          <Tabs defaultValue="details" className="w-full">
            <TabsList className="w-full mb-4">
              <TabsTrigger value="details" className="flex-1">Purchase Details</TabsTrigger>
              <TabsTrigger value="attachments" className="flex-1 gap-1.5">
                <Paperclip className="w-3.5 h-3.5" /> Attachments
              </TabsTrigger>
            </TabsList>
            <TabsContent value="details">{formContent}</TabsContent>
            <TabsContent value="attachments"><PurchaseAttachmentsPanel purchase={initialData} /></TabsContent>
          </Tabs>
        ) : formContent}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PurchaseRegistration() {
  const { role: userRole } = useRole();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [autoOpenedFromUrl, setAutoOpenedFromUrl] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveCascade, setArchiveCascade] = useState(null);
  const [sortKey, setSortKey] = useState('purchase_date');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const queryClient = useQueryClient();

  const { data: purchases = [], isLoading } = useQuery({
    queryKey: ['purchase-records'],
    queryFn: () => base44.entities.PurchaseRecord.list('-created_date', 500),
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list(),
  });
  const { data: receipts = [] } = useQuery({
    queryKey: ['warehouse-receipts'],
    queryFn: () => base44.entities.WarehouseReceipt.list('-created_date', 500),
  });
  const { data: allPurchaseAttachments = [] } = useQuery({
    queryKey: ['attachments-purchase-all'],
    queryFn: () => base44.entities.Attachment.filter({ entity_type: 'purchase_record' }),
  });

  // Auto-open editor when URL contains ?edit=<id> (used from Reports detail panel)
  useEffect(() => {
    if (autoOpenedFromUrl) return;
    const urlParams = new URLSearchParams(window.location.search);
    const editId = urlParams.get('edit');
    if (editId && purchases.length > 0) {
      const target = purchases.find(p => p.id === editId);
      if (target) {
        setEditRecord(target);
        setDialogOpen(true);
        setAutoOpenedFromUrl(true);
        // Clean URL
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, [purchases, autoOpenedFromUrl]);

  const [pendingDuplicateOf, setPendingDuplicateOf] = useState(null);

  const createMutation = useMutation({
    mutationFn: data => base44.entities.PurchaseRecord.create(data),
    onSuccess: (record) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-records'] });
      setDialogOpen(false);
      notifyNewPurchase(record).catch(() => {});
      logActivity({
        action_type: 'Created',
        screen_name: 'Purchase Registration',
        entity_type: 'PurchaseRecord',
        entity_id: record.id,
        record_description: `Purchase ${record.coffee_code || record.id} — ${record.supplier_name || ''}`,
      });
      // Log duplicate confirmation if applicable
      if (pendingDuplicateOf) {
        logActivity({
          action_type: 'Edited',
          screen_name: 'Purchase Registration',
          entity_type: 'PurchaseRecord',
          entity_id: record.id,
          record_description: `Duplicate Confirmed — ${record.supplier_name || ''} on ${record.purchase_date || ''}`,
          reason: `User confirmed duplicate purchase for ${record.supplier_name} on ${record.purchase_date} (existing: ${pendingDuplicateOf.coffee_code})`,
        });
        setPendingDuplicateOf(null);
      }
    },
  });
  const updateMutation = useMutation({
    mutationFn: async ({ id, data, previous }) => {
      const updated = await base44.entities.PurchaseRecord.update(id, data);
      return { updated, previous };
    },
    onSuccess: ({ updated, previous }) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-records'] });
      setDialogOpen(false);
      setEditRecord(null);
      logActivity({
        action_type: 'Edited',
        screen_name: 'Purchase Registration',
        entity_type: 'PurchaseRecord',
        entity_id: updated.id,
        record_description: `Purchase ${updated.coffee_code || updated.id} — ${updated.supplier_name || ''}`,
        changes: diffRecords(previous, updated),
      });
    },
  });
  const archiveMutation = useMutation({
    mutationFn: ({ purchase, reason }) => archivePurchaseWithCascade({ purchase, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-records'] });
      queryClient.invalidateQueries({ queryKey: ['warehouse-receipts'] });
      queryClient.invalidateQueries({ queryKey: ['processing-logs'] });
      queryClient.invalidateQueries({ queryKey: ['sample-logs'] });
      queryClient.invalidateQueries({ queryKey: ['activity-log'] });
      setArchiveTarget(null);
      setArchiveCascade(null);
    },
  });

  const attachCountByPurchaseId = useMemo(() => {
    const map = {};
    allPurchaseAttachments.forEach(a => { map[a.entity_id] = (map[a.entity_id] || 0) + 1; });
    return map;
  }, [allPurchaseAttachments]);

  const receiptByCoffeeCode = useMemo(() => {
    const map = {};
    receipts.forEach(r => { if (r.coffee_code) map[r.coffee_code] = r; });
    return map;
  }, [receipts]);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
    setPage(1);
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const list = purchases.filter(p =>
      !p.archived && (
        !search ||
        p.supplier_name?.toLowerCase().includes(q) ||
        p.coffee_code?.toLowerCase().includes(q) ||
        p.purchase_date?.includes(q)
      )
    );
    return [...list].sort((a, b) => {
      let va = a[sortKey] ?? '';
      let vb = b[sortKey] ?? '';
      if (typeof va === 'number' && typeof vb === 'number') return sortDir === 'asc' ? va - vb : vb - va;
      return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
  }, [purchases, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const COLS = [
    { label: '#', key: null },
    { label: 'Coffee Code', key: 'coffee_code' },
    { label: 'Date', key: 'purchase_date' },
    { label: 'Supplier', key: 'supplier_name' },
    { label: 'Agent', key: 'agent' },
    { label: 'Region', key: 'region' },
    { label: 'Coffee Type', key: 'coffee_type' },
    { label: 'Dispatch KG', key: 'net_dispatch_weight_kg' },
    { label: 'Net Feresula', key: 'net_feresula' },
    { label: 'Unit Price', key: 'unit_price_etb_per_feresula' },
    { label: 'Comm%', key: 'commission_percent' },
    { label: 'Addl. Costs ETB', key: 'other_cost_etb' },
    { label: 'Grand Total ETB', key: 'grand_total_etb' },
    { label: 'Total Paid ETB', key: 'total_paid_etb' },
    { label: 'Balance ETB', key: 'balance_etb' },
    { label: 'Payment Status', key: null },
    { label: 'Last Payment', key: null },
    { label: 'Actions', key: null },
  ];

  return (
    <RoleGuard allowedRoles={['admin', 'purchaser']}>
    <div>
      <PageHeader title="Purchase Registration" description="Record and manage coffee purchases">
        {userRole === 'admin' && <DuplicateReport />}
        <Button onClick={() => { setEditRecord(null); setDialogOpen(true); }} className="bg-primary hover:bg-primary/90 text-primary-foreground">
          <Plus className="w-4 h-4 mr-1" /> New Purchase
        </Button>
      </PageHeader>

      <div className="relative mb-4 max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search by supplier, code, date..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto w-full">
          <Table className="min-w-[1400px]">
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                {COLS.map(col => {
                  const minW = col.label === '#' ? 'min-w-[40px]' : col.label === 'Supplier' ? 'min-w-[140px]' : col.label === 'Coffee Code' ? 'min-w-[150px]' : col.label === 'Date' ? 'min-w-[110px]' : col.label === 'Agent' || col.label === 'Region' || col.label === 'Coffee Type' ? 'min-w-[110px]' : col.label === 'Dispatch KG' || col.label === 'Net Feresula' || col.label === 'Unit Price' ? 'min-w-[100px]' : col.label === 'Comm%' ? 'min-w-[80px]' : col.label === 'Actions' ? 'min-w-[80px]' : 'min-w-[110px]';
                  return (
                  <TableHead
                    key={col.label}
                    className={`text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap ${minW} ${col.key ? 'cursor-pointer hover:text-foreground select-none' : ''}`}
                    onClick={() => col.key && handleSort(col.key)}
                    title={col.label}
                  >
                    {col.label}{col.key && <SortIcon col={col.key} sortKey={sortKey} sortDir={sortDir} />}
                  </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array(4).fill(0).map((_, i) => (
                  <TableRow key={i}>{Array(COLS.length).fill(0).map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
                  ))}</TableRow>
                ))
              ) : paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={COLS.length} className="text-center py-12 text-muted-foreground">
                    {search ? 'No purchases match your search.' : 'No purchases yet.'}
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((p, i) => {
                  const receipt = receiptByCoffeeCode[p.coffee_code];
                  // A receipt alone is enough to confirm — GRN not required for balance/grand total display
                  const confirmedReceipt = !!receipt;

                  const rowPayments = parsePayments(p);
                  const totalPaid = calcTotalPaid(p);
                  const payStatus = calcPaymentStatus(p.grand_total_etb, totalPaid);
                  const liveBalance = calcBalance(p.grand_total_etb, totalPaid);
                  const lastPayment = rowPayments.length > 0
                    ? rowPayments.slice().sort((a, b) => (b.payment_date || '') > (a.payment_date || '') ? 1 : -1)[0]
                    : null;

                  // Additional costs display
                  const costs = parseCosts(p);
                  const totalCosts = totalAdditionalCosts(costs);

                  return (
                    <TableRow key={p.id} className={`hover:bg-muted/30 ${!receipt ? 'bg-amber-50/40' : ''}`}>
                      <TableCell className="text-muted-foreground text-xs">{(page - 1) * pageSize + i + 1}</TableCell>
                      <TableCell className="font-mono text-xs font-medium text-primary whitespace-nowrap">
                        {p.coffee_code || '—'}
                        {attachCountByPurchaseId[p.id] > 0 && (
                          <span className="inline-flex items-center gap-0.5 ml-1 text-primary" title={`${attachCountByPurchaseId[p.id]} attachment(s)`}>
                            <Paperclip className="w-3 h-3" />
                            <span className="text-[10px] font-medium">{attachCountByPurchaseId[p.id]}</span>
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{p.purchase_date ? format(new Date(p.purchase_date), 'd MMM yyyy') : '—'}</TableCell>
                      <TableCell className="font-medium whitespace-nowrap capitalize">{p.supplier_name}</TableCell>
                      <TableCell className="whitespace-nowrap">{p.agent || '—'}</TableCell>
                      <TableCell className="whitespace-nowrap">{p.region || '—'}</TableCell>
                      <TableCell className="whitespace-nowrap">{p.coffee_type || '—'}</TableCell>
                      <TableCell className="text-right">{fmt(p.net_dispatch_weight_kg, 2)}</TableCell>
                      <TableCell className="text-right">{fmt(p.net_feresula, 4)}</TableCell>
                      <TableCell className="text-right">{fmt(p.unit_price_etb_per_feresula, 2)}</TableCell>
                      <TableCell className="text-right">{p.commission_percent != null ? `${p.commission_percent}%` : '—'}</TableCell>
                      <TableCell className="text-right">{fmt(totalCosts, 2)}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {!receipt ? (
                          <span className="text-muted-foreground text-xs italic">— Awaiting Receipt</span>
                        ) : (
                          <span>{fmt(p.grand_total_etb, 2)}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-primary">{fmt(totalPaid, 2)}</TableCell>
                      <TableCell className={`text-right font-semibold ${liveBalance === 0 ? 'text-green-700' : liveBalance != null && liveBalance > 0 ? 'text-destructive' : liveBalance != null && liveBalance < 0 ? 'text-accent' : 'text-muted-foreground'}`}>
                        {!receipt ? (
                          <span className="text-muted-foreground text-xs italic">—</span>
                        ) : (
                          liveBalance != null ? (liveBalance === 0 ? '0.00' : fmt(liveBalance, 2)) : '—'
                        )}
                      </TableCell>
                      <TableCell>
                        {!receipt ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground border border-border whitespace-nowrap">⏳ Awaiting Receipt</span>
                        ) : (
                          <PaymentStatusBadge status={payStatus} />
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {lastPayment ? lastPayment.payment_date : '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => { setEditRecord(p); setDialogOpen(true); }}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={async () => {
                            const c = await countPurchaseCascade(p);
                            setArchiveCascade(c);
                            setArchiveTarget(p);
                          }}>
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
      </div>

      <TablePagination
        page={page}
        totalPages={totalPages}
        total={filtered.length}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSize={setPageSize}
      />

      <PurchaseFormDialog
        open={dialogOpen}
        onOpenChange={v => { setDialogOpen(v); if (!v) setEditRecord(null); }}
        initialData={editRecord}
        suppliers={suppliers}
        allRecords={purchases}
        receipts={receipts}
        onSubmit={(data, duplicateOf) => {
          if (editRecord) updateMutation.mutate({ id: editRecord.id, data, previous: editRecord });
          else {
            if (duplicateOf) setPendingDuplicateOf(duplicateOf);
            createMutation.mutate(data);
          }
        }}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      />

      <RichArchiveDialog
        open={!!archiveTarget}
        onOpenChange={v => { if (!v) { setArchiveTarget(null); setArchiveCascade(null); } }}
        title="Archive Purchase Record?"
        requireConfirm={true}
        mainRecord={archiveTarget ? { label: `Purchase: ${archiveTarget.coffee_code || archiveTarget.id} — ${archiveTarget.supplier_name || ''}`, ref: archiveTarget.purchase_date ? `Date: ${archiveTarget.purchase_date}` : undefined } : null}
        linkedRecords={archiveCascade ? [
          ...(archiveCascade.warehouseReceipts > 0 ? [{ count: archiveCascade.warehouseReceipts, label: 'Warehouse Receipt(s)', detail: `${archiveCascade.totalReceiptKg?.toLocaleString(undefined, { maximumFractionDigits: 0 }) || 0} KG total` }] : []),
          ...(archiveCascade.payments > 0 ? [{ count: archiveCascade.payments, label: 'Payment(s)', amountEtb: archiveCascade.totalPaidEtb }] : []),
          ...(archiveCascade.processingEntries > 0 ? [{ count: archiveCascade.processingEntries, label: 'Processing Log entries', detail: `${archiveCascade.totalProcessingKg?.toLocaleString(undefined, { maximumFractionDigits: 0 }) || 0} KG total` }] : []),
          ...(archiveCascade.sampleEntries > 0 ? [{ count: archiveCascade.sampleEntries, label: 'Sample Log entries', detail: `${archiveCascade.totalSampleKg?.toLocaleString(undefined, { maximumFractionDigits: 2 }) || 0} KG` }] : []),
          ...(archiveCascade.bagReceiptEntries > 0 ? [{ count: archiveCascade.bagReceiptEntries, label: 'Bag Receipt(s)', detail: `${archiveCascade.totalBags || 0} bags` }] : []),
        ] : []}
        impacts={['Dashboard KPIs', 'Supplier Balance Report', 'Stock Report', 'Processing totals']}
        isPending={archiveMutation.isPending}
        onConfirm={(reason) => archiveMutation.mutate({ purchase: archiveTarget, reason })}
      />

      <ArchivedRecordsSection
        entityName="PurchaseRecord"
        screenName="Purchase Registration"
        queryKey={['purchase-records']}
        describeRecord={(r) => `Purchase ${r.coffee_code || r.id} — ${r.supplier_name || ''}`}
        onExtraInvalidate={(qc) => {
          qc.invalidateQueries({ queryKey: ['warehouse-receipts'] });
          qc.invalidateQueries({ queryKey: ['processing-logs'] });
          qc.invalidateQueries({ queryKey: ['sample-logs'] });
        }}
        columns={[
          { label: 'Coffee Code', render: (r) => <span className="font-mono">{r.coffee_code || '—'}</span> },
          { label: 'Date', render: (r) => r.purchase_date ? format(new Date(r.purchase_date), 'd MMM yyyy') : '—' },
          { label: 'Supplier', render: (r) => r.supplier_name },
          { label: 'Grand Total', render: (r) => fmt(r.grand_total_etb) },
        ]}
      />
    </div>
    </RoleGuard>
  );
}