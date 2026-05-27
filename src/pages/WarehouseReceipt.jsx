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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Plus, Pencil, Trash2, Search, ChevronUp, ChevronDown, ChevronsUpDown, Paperclip, Clock } from 'lucide-react';
import FilterPanel, { FilterButton } from '@/components/shared/FilterPanel';
import { format } from 'date-fns';
import RoleGuard from '@/components/RoleGuard';
import RichArchiveDialog from '@/components/shared/RichArchiveDialog';
import ArchivedRecordsSection from '@/components/shared/ArchivedRecordsSection';
import { archiveRecord, countWarehouseReceiptCascade } from '@/lib/archiveService';
import WarehouseAttachmentsPanel from '@/components/attachments/WarehouseAttachmentsPanel';
import { InlineWarningList } from '@/components/notifications/InlineWarning';
import { getWarehouseWarnings } from '@/lib/formWarnings';
import { notifyWarehouseReceipt } from '@/lib/notificationService';
import NumberInput from '@/components/shared/NumberInput';
import TablePagination from '@/components/shared/TablePagination';
import { saveReceiptHistory } from '@/lib/warehouseHistoryService';
import ReceiptInlineHistory from '@/components/warehouse/ReceiptInlineHistory';
import WarehouseHistoryTab from '@/components/warehouse/WarehouseHistoryTab';
import { useRole } from '@/lib/useRole';

// PAGE_SIZE replaced by dynamic pageSize state

function fmt(n, decimals = 2) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function todayStr() { return new Date().toISOString().slice(0, 10); }

function SortIcon({ col, sortKey, sortDir }) {
  if (sortKey !== col) return <ChevronsUpDown className="inline w-3 h-3 ml-1 opacity-30" />;
  return sortDir === 'asc' ? <ChevronUp className="inline w-3 h-3 ml-1" /> : <ChevronDown className="inline w-3 h-3 ml-1" />;
}

const EMPTY_FORM = {
  coffee_code: '', purchase_record_id: '', supplier_name: '',
  net_dispatch_weight_kg: '', warehouse_received_net_kg: '', bags_received: '',
  grn_code: '', dispatch_no: '', received_date: todayStr(), remark: '',
};

function ReceiptFormDialog({ open, onOpenChange, initialData, purchases, sampleSumBySupplier, processingSumBySupplier, allReceipts, onSubmit, isSubmitting }) {
  const [form, setForm] = useState(EMPTY_FORM);
  // Track whether Net Dispatch KG came from a matched purchase (true) or from the
  // legacy stored value (false). Used to show "— (purchase not linked)" when nothing matches.
  const [dispatchLinked, setDispatchLinked] = useState(true);

  useEffect(() => {
    if (open) {
      if (initialData) {
        // 3-step fallback to resolve Net Dispatch Weight KG:
        // 1. by purchase_record_id  →  2. by exact coffee_code  →  3. by supplier_name + purchase_date == received_date
        let matched =
          (initialData.purchase_record_id && purchases.find(p => p.id === initialData.purchase_record_id)) ||
          (initialData.coffee_code && purchases.find(p => p.coffee_code === initialData.coffee_code)) ||
          (initialData.supplier_name && initialData.received_date &&
            purchases.find(p => p.supplier_name === initialData.supplier_name && p.purchase_date === initialData.received_date)) ||
          (initialData.supplier_name && purchases.find(p => p.supplier_name === initialData.supplier_name));

        const dispatchFromPurchase = matched?.net_dispatch_weight_kg;
        const dispatchFromReceipt = initialData.net_dispatch_weight_kg;
        const resolvedDispatch = dispatchFromPurchase ?? dispatchFromReceipt ?? '';
        setDispatchLinked(!!matched || dispatchFromReceipt != null);

        setForm({
          coffee_code: initialData.coffee_code || matched?.coffee_code || '',
          purchase_record_id: initialData.purchase_record_id || matched?.id || '',
          supplier_name: initialData.supplier_name || matched?.supplier_name || '',
          net_dispatch_weight_kg: resolvedDispatch,
          warehouse_received_net_kg: initialData.warehouse_received_net_kg ?? '',
          bags_received: initialData.bags_received ?? '',
          grn_code: initialData.grn_code || '',
          dispatch_no: initialData.dispatch_no || '',
          received_date: initialData.received_date || todayStr(),
          remark: initialData.remark || '',
        });
      } else {
        setDispatchLinked(true);
        setForm({ ...EMPTY_FORM, received_date: todayStr() });
      }
    }
  }, [open, initialData, purchases]);

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const handleCoffeeCodeChange = (coffeeCode) => {
    const purchase = purchases.find(p => p.coffee_code === coffeeCode);
    setDispatchLinked(!!purchase);
    setForm(prev => ({
      ...prev,
      coffee_code: coffeeCode,
      purchase_record_id: purchase?.id || '',
      supplier_name: purchase?.supplier_name || '',
      net_dispatch_weight_kg: purchase?.net_dispatch_weight_kg ?? '',
    }));
  };

  const receivedKg = parseFloat(form.warehouse_received_net_kg) || 0;
  const dispatchKg = parseFloat(form.net_dispatch_weight_kg) || 0;
  const shrinkageKg = receivedKg - dispatchKg;
  const formWarnings = useMemo(() => getWarehouseWarnings(form, allReceipts || []), [form, allReceipts]);
  const samplesKg = sampleSumBySupplier?.[form.supplier_name] || 0;
  const processingKg = processingSumBySupplier?.[form.supplier_name] || 0;
  const netRemainingKg = receivedKg - samplesKg - processingKg;

  const handleSubmit = (e) => {
    e.preventDefault();
    // Fix 9: Auto-trim name fields on save
    if (form.supplier_name) form.supplier_name = form.supplier_name.trim();
    // Build a clean payload: strip empty strings (which can fail schema validation
    // on legacy receipts that have null purchase_record_id) and parse numerics.
    const data = {
      coffee_code: form.coffee_code || null,
      supplier_name: form.supplier_name || null,
      grn_code: form.grn_code || null,
      dispatch_no: form.dispatch_no || null,
      received_date: form.received_date || null,
      remark: form.remark || null,
      warehouse_received_net_kg: form.warehouse_received_net_kg !== '' ? parseFloat(form.warehouse_received_net_kg) : null,
      net_dispatch_weight_kg: form.net_dispatch_weight_kg !== '' ? parseFloat(form.net_dispatch_weight_kg) : null,
      bags_received: form.bags_received !== '' ? parseFloat(form.bags_received) : null,
    };
    // Only include purchase_record_id when it's actually set — never send "".
    if (form.purchase_record_id) data.purchase_record_id = form.purchase_record_id;
    onSubmit(data);
  };

  const ReadOnly = ({ label, value, highlight }) => (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <Input value={value} readOnly className={`font-medium ${highlight ? 'bg-accent/10 text-accent' : 'bg-muted'}`} />
    </div>
  );

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Coffee Code (from Purchases) *</Label>
        <Select value={form.coffee_code} onValueChange={handleCoffeeCodeChange}>
          <SelectTrigger><SelectValue placeholder="Select coffee code..." /></SelectTrigger>
          <SelectContent>
            {purchases.map(p => (
              <SelectItem key={p.id} value={p.coffee_code}>
                {p.coffee_code} — {p.supplier_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ReadOnly label="Supplier Name" value={form.supplier_name || '—'} />
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Net Dispatch Weight KG (from Purchase)</Label>
          <Input
            value={
              form.net_dispatch_weight_kg !== '' && form.net_dispatch_weight_kg != null
                ? fmt(form.net_dispatch_weight_kg)
                : '— (purchase not linked)'
            }
            readOnly
            className={`font-medium ${form.net_dispatch_weight_kg !== '' && form.net_dispatch_weight_kg != null ? 'bg-muted' : 'bg-muted text-muted-foreground italic'}`}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Warehouse Received Net KG *</Label>
          <NumberInput decimals={2} value={form.warehouse_received_net_kg}
            onChange={v => set('warehouse_received_net_kg', v)} placeholder="0.00" required />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Bags Received <span className="text-muted-foreground font-normal">(physical count)</span></Label>
          <NumberInput decimals={0} value={form.bags_received}
            onChange={v => set('bags_received', v)} placeholder="0" />
          <p className="text-[10px] text-muted-foreground">Auto-syncs to Bag Ledger</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ReadOnly
          label="Shrinkage KG (Received − Dispatch)"
          value={form.warehouse_received_net_kg !== '' ? fmt(shrinkageKg) : '—'}
          highlight={shrinkageKg < 0}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">GRN Code</Label>
          <Input value={form.grn_code} onChange={e => set('grn_code', e.target.value)} placeholder="e.g. GRN-001" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Dispatch No</Label>
          <Input value={form.dispatch_no} onChange={e => set('dispatch_no', e.target.value)} placeholder="e.g. DN-001" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Received Date</Label>
          <Input type="date" value={form.received_date} onChange={e => set('received_date', e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Remark</Label>
        <Textarea value={form.remark} onChange={e => set('remark', e.target.value)} rows={2} placeholder="Optional..." />
      </div>

      {form.warehouse_received_net_kg !== '' && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-green-800 uppercase tracking-wide">Net Remaining KG</p>
            <p className="text-[10px] text-green-700 mt-0.5">Received KG − Samples KG − Processing KG Sent</p>
            <p className="text-[10px] text-green-600 mt-0.5">{fmt(receivedKg)} − {fmt(samplesKg)} − {fmt(processingKg)}</p>
          </div>
          <span className={`text-xl font-bold ${netRemainingKg < 0 ? 'text-destructive' : 'text-green-700'}`}>
            {fmt(netRemainingKg)} KG
          </span>
        </div>
      )}

      {formWarnings.length > 0 && <InlineWarningList warnings={formWarnings} />}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : initialData ? 'Update' : 'Create Receipt'}</Button>
      </DialogFooter>
    </form>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">{initialData ? 'Edit Receipt' : 'New Warehouse Receipt'}</DialogTitle>
        </DialogHeader>
        {initialData ? (
          <Tabs defaultValue="details" className="w-full">
            <TabsList className="w-full mb-4">
              <TabsTrigger value="details" className="flex-1">Receipt Details</TabsTrigger>
              <TabsTrigger value="attachments" className="flex-1 gap-1.5">
                <Paperclip className="w-3.5 h-3.5" /> Attachments
              </TabsTrigger>
            </TabsList>
            <TabsContent value="details">{formContent}</TabsContent>
            <TabsContent value="attachments">
              <WarehouseAttachmentsPanel receipt={initialData} />
            </TabsContent>
          </Tabs>
        ) : formContent}
      </DialogContent>
    </Dialog>
  );
}

export default function WarehouseReceiptPage() {
  const { isAdmin } = useRole();
  const [activeTab, setActiveTab] = useState('receipts');
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveCascade, setArchiveCascade] = useState(null);
  const [attachTarget, setAttachTarget] = useState(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState(null);
  const [sortKey, setSortKey] = useState('received_date');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState({ date: { from: '', to: '' }, supplier: 'all', grnCode: '', status: 'all' });
  const queryClient = useQueryClient();

  const { data: receipts = [], isLoading } = useQuery({
    queryKey: ['warehouse-receipts'],
    queryFn: () => base44.entities.WarehouseReceipt.list('-created_date', 500),
    staleTime: 60000,
  });
  const { data: allAttachments = [] } = useQuery({
    queryKey: ['attachments-warehouse-all'],
    queryFn: () => base44.entities.Attachment.filter({ entity_type: 'warehouse_receipt' }),
    staleTime: 60000,
  });
  const { data: purchases = [] } = useQuery({
    queryKey: ['purchase-records'],
    queryFn: () => base44.entities.PurchaseRecord.list('-created_date', 500),
    staleTime: 60000,
  });
  const { data: suppliersForAgent = [] } = useQuery({
    queryKey: ['suppliers-for-bagledger'],
    queryFn: () => base44.entities.Supplier.list('supplier_name', 500),
    staleTime: 60000,
  });
  const { data: sampleLogs = [] } = useQuery({
    queryKey: ['sample-logs'],
    queryFn: () => base44.entities.SampleLog.list(),
    staleTime: 60000,
  });
  const { data: processingLogs = [] } = useQuery({
    queryKey: ['processing-logs'],
    queryFn: () => base44.entities.ProcessingLog.list(),
    staleTime: 60000,
  });

  // Archived records must never be included in supplier-level aggregates
  const notArchived = (x) => x?.archived !== true;

  const sampleSumBySupplier = useMemo(() => {
    const map = {};
    sampleLogs.filter(notArchived).forEach(s => { if (s.supplier_name) map[s.supplier_name] = (map[s.supplier_name] || 0) + (s.sample_kg || 0); });
    return map;
  }, [sampleLogs]);

  const processingSumBySupplier = useMemo(() => {
    const map = {};
    processingLogs.filter(notArchived).forEach(p => { if (p.supplier_name) map[p.supplier_name] = (map[p.supplier_name] || 0) + (p.actual_weighed_kg ?? p.kg_sent ?? 0); });
    return map;
  }, [processingLogs]);

  const purchaseByCode = useMemo(() => {
    const map = {};
    purchases.forEach(p => { if (p.coffee_code) map[p.coffee_code] = p; });
    return map;
  }, [purchases]);

  const attachCountByReceiptId = useMemo(() => {
    const map = {};
    allAttachments.forEach(a => { map[a.entity_id] = (map[a.entity_id] || 0) + 1; });
    return map;
  }, [allAttachments]);

  // Supplier-level total received KG (sum of all lots for that supplier) — archived excluded
  const receivedTotalBySupplier = useMemo(() => {
    const map = {};
    receipts.filter(notArchived).forEach(r => {
      if (r.supplier_name) map[r.supplier_name] = (map[r.supplier_name] || 0) + (r.warehouse_received_net_kg || 0);
    });
    return map;
  }, [receipts]);

  // Supplier-level remaining = total received − total samples − total processing (never negative)
  const remainingBySupplier = useMemo(() => {
    const map = {};
    Object.keys(receivedTotalBySupplier).forEach(name => {
      const received = receivedTotalBySupplier[name] || 0;
      const samples = sampleSumBySupplier[name] || 0;
      const processing = processingSumBySupplier[name] || 0;
      map[name] = Math.max(0, received - samples - processing);
    });
    return map;
  }, [receivedTotalBySupplier, sampleSumBySupplier, processingSumBySupplier]);

  // Sync bag receipt for a given warehouse receipt (create / update / delete the linked BagReceipt)
  const syncBagReceipt = async (receipt) => {
    if (!receipt?.id) return;
    try {
      const existing = await base44.entities.BagReceipt.filter({ warehouse_receipt_id: receipt.id });
      const existingRow = existing?.[0];
      const bags = Number(receipt.bags_received) || 0;
      if (bags > 0) {
        // Look up the agent linked to this supplier to tag the auto-created bag receipt
        const agentForSupplier = suppliersForAgent.find(s => s.supplier_name === receipt.supplier_name)?.agent || null;
        const payload = {
          warehouse_receipt_id: receipt.id,
          receipt_mode: 'agent',
          agent_name: agentForSupplier,
          supplier_name: receipt.supplier_name,
          date: receipt.received_date,
          warehouse_received_kg: Number(receipt.warehouse_received_net_kg) || 0,
          bags_received: bags,
          source: 'warehouse',
        };
        if (existingRow) {
          await base44.entities.BagReceipt.update(existingRow.id, payload);
        } else {
          await base44.entities.BagReceipt.create(payload);
        }
      } else if (existingRow) {
        await base44.entities.BagReceipt.delete(existingRow.id);
      }
      queryClient.invalidateQueries({ queryKey: ['bag-receipts'] });
    } catch (e) {
      console.error('Bag receipt sync failed:', e);
    }
  };

  const createMutation = useMutation({
    mutationFn: data => base44.entities.WarehouseReceipt.create(data),
    onSuccess: (receipt) => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-receipts'] });
      queryClient.invalidateQueries({ queryKey: ['wh-history-all'] });
      setDialogOpen(false);
      const shrinkage = (receipt.warehouse_received_net_kg || 0) - (receipt.net_dispatch_weight_kg || 0);
      notifyWarehouseReceipt(receipt, shrinkage).catch(() => {});
      syncBagReceipt(receipt);
      saveReceiptHistory({ action_type: 'Created', receipt }).catch(() => {});
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data, previous }) => base44.entities.WarehouseReceipt.update(id, data).then(r => ({ receipt: r, previous })),
    onSuccess: async ({ receipt, previous }) => {
      // Force a fresh refetch (not just invalidate) so the table shows updated values immediately.
      await queryClient.refetchQueries({ queryKey: ['warehouse-receipts'] });
      // Also refresh purchases since the recalc automation updates linked grand_total_etb.
      queryClient.invalidateQueries({ queryKey: ['purchase-records'] });
      queryClient.invalidateQueries({ queryKey: ['wh-history-all'] });
      queryClient.invalidateQueries({ queryKey: ['wh-history', receipt?.id] });
      syncBagReceipt(receipt);
      saveReceiptHistory({ action_type: 'Edited', receipt, oldReceipt: previous }).catch(() => {});
      setDialogOpen(false);
      setEditRecord(null);
    },
    onError: (err) => {
      console.error('Warehouse receipt update failed:', err);
      alert('Failed to save receipt: ' + (err?.message || 'Unknown error'));
    },
  });
  const archiveMutation = useMutation({
    mutationFn: async ({ record, reason }) => {
      // Also archive the linked bag receipt entry (if any) so Bag Ledger stays in sync.
      try {
        const linked = await base44.entities.BagReceipt.filter({ warehouse_receipt_id: record.id });
        if (linked?.[0]) {
          await archiveRecord({
            entityName: 'BagReceipt',
            record: linked[0],
            screen_name: 'Warehouse Receipt',
            description: `Bag Receipt for ${linked[0].supplier_name} (cascade from warehouse receipt archive)`,
            reason: 'Cascade from warehouse receipt archive',
          });
        }
      } catch (e) { console.error('Failed to archive linked BagReceipt:', e); }
      await archiveRecord({
        entityName: 'WarehouseReceipt',
        record,
        screen_name: 'Warehouse Receipt',
        description: `Warehouse Receipt ${record.grn_code || record.coffee_code || record.id} — ${record.supplier_name || ''}`,
        reason,
      });
      await saveReceiptHistory({ action_type: 'Archived', receipt: record, reason }).catch(() => {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-receipts'] });
      queryClient.invalidateQueries({ queryKey: ['bag-receipts'] });
      queryClient.invalidateQueries({ queryKey: ['activity-log'] });
      queryClient.invalidateQueries({ queryKey: ['wh-history-all'] });
      setArchiveTarget(null);
    },
  });

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
    setPage(1);
  };

  const warehouseSupplierOpts = useMemo(() =>
    [...new Set(receipts.filter(r => !r.archived).map(r => r.supplier_name).filter(Boolean))].sort().map(n => ({ value: n, label: n })),
    [receipts]
  );

  const filterActiveCount = [
    filters.date?.from || filters.date?.to,
    filters.supplier !== 'all',
    filters.grnCode,
    filters.status !== 'all',
  ].filter(Boolean).length;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const fd = filters.date?.from || '';
    const td = filters.date?.to || '';
    const list = receipts.filter(r => {
      if (r.archived) return false;
      if (search && !r.supplier_name?.toLowerCase().includes(q) && !r.coffee_code?.toLowerCase().includes(q)) return false;
      if (fd && (r.received_date || '') < fd) return false;
      if (td && (r.received_date || '') > td) return false;
      if (filters.supplier !== 'all' && r.supplier_name !== filters.supplier) return false;
      if (filters.grnCode && !(r.grn_code || '').toLowerCase().includes(filters.grnCode.toLowerCase())) return false;
      if (filters.status === 'Confirmed' && !r.grn_code) return false;
      if (filters.status === 'Pending' && r.grn_code) return false;
      return true;
    });
    return [...list].sort((a, b) => {
      let va = a[sortKey] ?? ''; let vb = b[sortKey] ?? '';
      if (typeof va === 'number' && typeof vb === 'number') return sortDir === 'asc' ? va - vb : vb - va;
      return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
  }, [receipts, search, filters, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const COLS = [
    { label: '#', key: null },
    { label: 'Coffee Code', key: 'coffee_code' },
    { label: 'Supplier', key: 'supplier_name' },
    { label: 'GRN Code', key: 'grn_code' },
    { label: 'Dispatch No', key: 'dispatch_no' },
    { label: 'Received Date', key: 'received_date' },
    { label: 'Dispatch KG (ref)', key: 'net_dispatch_weight_kg' },
    { label: 'Received KG ✓', key: 'warehouse_received_net_kg' },
    { label: 'Shrinkage KG', key: null },
    { label: 'Samples KG', key: null },
    { label: 'Net Remaining KG', key: null },
    { label: 'Remark', key: null },
    { label: 'Docs', key: null },
    { label: 'Actions', key: null },
    ...(isAdmin ? [{ label: 'History', key: null }] : []),
  ];

  return (
    <RoleGuard allowedRoles={['admin', 'warehouse_keeper']}>
    <div>
      <PageHeader title="Warehouse Receipt" description="Manage incoming coffee warehouse receipts">
        <Button onClick={() => { setEditRecord(null); setDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-1" /> New Receipt
        </Button>
      </PageHeader>

      {/* Main tabs — History tab only for admin/supervisor */}
      <div className="flex gap-1 mb-5 border-b border-border">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'receipts' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          onClick={() => setActiveTab('receipts')}
        >
          Receipts
        </button>
        {isAdmin && (
          <button
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'history' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            onClick={() => setActiveTab('history')}
          >
            Receipt History
          </button>
        )}
      </div>

      {activeTab === 'history' && isAdmin && (
        <WarehouseHistoryTab
          suppliers={suppliersForAgent}
          onViewReceipt={(receiptId) => {
            setActiveTab('receipts');
            // Highlight is nice-to-have; switching tab is sufficient
          }}
        />
      )}

      {activeTab === 'receipts' && <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by supplier or coffee code..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <FilterButton onClick={() => setFilterOpen(true)} activeCount={filterActiveCount} />
      </div>
      <FilterPanel
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        fields={[
          { key: 'date', label: 'Date', type: 'date' },
          { key: 'supplier', label: 'Supplier', type: 'select', options: warehouseSupplierOpts, placeholder: 'All Suppliers' },
          { key: 'grnCode', label: 'GRN Code', type: 'text', placeholder: 'Search GRN...' },
          { key: 'status', label: 'Status', type: 'select', options: [{ value: 'Confirmed', label: 'Confirmed (has GRN)' }, { value: 'Pending', label: 'Pending (no GRN)' }], placeholder: 'All Statuses' },
        ]}
        values={filters}
        onApply={v => { setFilters(v); setPage(1); }}
        onReset={() => { setFilters({ date: { from: '', to: '' }, supplier: 'all', grnCode: '', status: 'all' }); setPage(1); }}
      />

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto w-full">
          <Table className="min-w-[1400px]">
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                {COLS.map(col => {
                  const minW = col.label === '#' ? 'min-w-[40px]' : col.label === 'Supplier' ? 'min-w-[140px]' : col.label === 'Coffee Code' ? 'min-w-[150px]' : col.label === 'GRN Code' || col.label === 'Dispatch No' ? 'min-w-[120px]' : col.label === 'Received Date' ? 'min-w-[110px]' : col.label.includes('KG') ? 'min-w-[100px]' : col.label === 'Actions' || col.label === 'Docs' || col.label === 'History' ? 'min-w-[80px]' : 'min-w-[100px]';
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
                  <TableRow key={i}>{COLS.map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>)}</TableRow>
                ))
              ) : paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={COLS.length} className="text-center py-12 text-muted-foreground">
                    {search ? 'No receipts match your search.' : 'No warehouse receipts yet.'}
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((r, i) => {
                  const purchaseDispatchKg = purchaseByCode[r.coffee_code]?.net_dispatch_weight_kg ?? r.net_dispatch_weight_kg ?? null;
                  const shrinkage = purchaseDispatchKg != null ? (r.warehouse_received_net_kg || 0) - purchaseDispatchKg : null;
                  const samplesKg = sampleSumBySupplier[r.supplier_name] || 0;
                  const netRemaining = remainingBySupplier[r.supplier_name] ?? 0;
                  const supplierIsNegative = netRemaining < 0;
                  const missingGrn = !r.grn_code;
                  const missingDispatch = !r.dispatch_no;
                  return (
                    <React.Fragment key={r.id}>
                    <TableRow className={`hover:bg-muted/30 ${expandedHistoryId === r.id ? 'bg-muted/20' : ''}`}>
                      <TableCell className="text-muted-foreground text-xs">{(page - 1) * pageSize + i + 1}</TableCell>
                      <TableCell className="font-mono text-xs font-medium text-primary whitespace-nowrap">
                        {r.coffee_code}
                        {attachCountByReceiptId[r.id] > 0 && (
                          <span className="inline-flex items-center gap-0.5 ml-1 text-primary" title={`${attachCountByReceiptId[r.id]} attachment(s)`}>
                            <Paperclip className="w-3 h-3" />
                            <span className="text-[10px] font-medium">{attachCountByReceiptId[r.id]}</span>
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium whitespace-nowrap capitalize">{r.supplier_name}</TableCell>
                      {/* GRN Code — highlight amber if missing */}
                      <TableCell
                        className={`whitespace-nowrap ${missingGrn ? 'bg-amber-50 text-amber-700 font-semibold' : ''}`}
                        title={missingGrn ? 'GRN Code not yet entered — receipt unconfirmed.' : undefined}
                      >
                        {r.grn_code || <span className="text-amber-600">⚠ Not entered</span>}
                      </TableCell>
                      {/* Dispatch No — highlight amber if missing */}
                      <TableCell
                        className={`whitespace-nowrap ${missingDispatch ? 'bg-amber-50 text-amber-700 font-semibold' : ''}`}
                        title={missingDispatch ? 'GRN Code not yet entered — receipt unconfirmed.' : undefined}
                      >
                        {r.dispatch_no || <span className="text-amber-600">⚠ Not entered</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{r.received_date ? format(new Date(r.received_date), 'd MMM yyyy') : '—'}</TableCell>
                      <TableCell className="text-right">{purchaseDispatchKg != null ? fmt(purchaseDispatchKg) : '—'}</TableCell>
                      <TableCell className="text-right font-medium">{fmt(r.warehouse_received_net_kg)}</TableCell>
                      <TableCell className={`text-right font-medium ${shrinkage == null ? '' : shrinkage === 0 ? 'text-green-700' : shrinkage > 0 ? 'text-amber-600' : 'text-destructive'}`}>
                        {shrinkage == null ? '—' : `${shrinkage > 0 ? '+' : ''}${fmt(shrinkage)}`}
                      </TableCell>
                      <TableCell className="text-right">{fmt(samplesKg)}</TableCell>
                      <TableCell className={`text-right font-semibold ${supplierIsNegative ? 'text-destructive' : 'text-accent'}`}>{fmt(netRemaining)}</TableCell>
                      <TableCell className="max-w-[120px] truncate text-muted-foreground">{r.remark || '—'}</TableCell>
                      <TableCell>
                         <Button size="sm" variant="ghost" className="gap-1 text-primary h-8" onClick={() => setAttachTarget(r)}>
                          <Paperclip className="w-3.5 h-3.5" /> Docs
                        </Button>
                       </TableCell>
                       <TableCell>
                         <div className="flex gap-1">
                           <Button size="sm" variant="ghost" onClick={() => { setEditRecord(r); setDialogOpen(true); }}>
                             <Pencil className="w-3.5 h-3.5" />
                           </Button>
                           <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={async () => {
                              const c = await countWarehouseReceiptCascade(r);
                              setArchiveCascade(c);
                              setArchiveTarget(r);
                            }}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                         </div>
                       </TableCell>
                       {isAdmin && (
                         <TableCell>
                           <Button
                             size="sm"
                             variant="ghost"
                             className={`h-8 ${expandedHistoryId === r.id ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-primary'}`}
                             title="View change history"
                             onClick={() => setExpandedHistoryId(id => id === r.id ? null : r.id)}
                           >
                             <Clock className="w-3.5 h-3.5" />
                           </Button>
                         </TableCell>
                       )}
                      </TableRow>
                      {isAdmin && expandedHistoryId === r.id && (
                         <TableRow>
                           <TableCell colSpan={COLS.length} className="p-0">
                             <ReceiptInlineHistory receipt={r} onClose={() => setExpandedHistoryId(null)} />
                           </TableCell>
                         </TableRow>
                         )}
                      </React.Fragment>
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
      </div>
      }

      <ReceiptFormDialog
        open={dialogOpen}
        onOpenChange={v => { setDialogOpen(v); if (!v) setEditRecord(null); }}
        initialData={editRecord}
        purchases={purchases}
        allReceipts={receipts}
        sampleSumBySupplier={sampleSumBySupplier}
        processingSumBySupplier={processingSumBySupplier}
        onSubmit={data => {
          if (editRecord) updateMutation.mutate({ id: editRecord.id, data, previous: editRecord });
          else createMutation.mutate(data);
        }}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      />

      {/* Attachments Dialog */}
      <Dialog open={!!attachTarget} onOpenChange={v => !v && setAttachTarget(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">
              Documents — {attachTarget?.coffee_code}
            </DialogTitle>
          </DialogHeader>
          {attachTarget && <WarehouseAttachmentsPanel receipt={attachTarget} />}
        </DialogContent>
      </Dialog>

      <RichArchiveDialog
        open={!!archiveTarget}
        onOpenChange={v => { if (!v) { setArchiveTarget(null); setArchiveCascade(null); } }}
        title="Archive Warehouse Receipt?"
        requireConfirm={true}
        mainRecord={archiveTarget ? { label: `Warehouse Receipt: ${archiveTarget.grn_code || archiveTarget.coffee_code || archiveTarget.id} — ${archiveTarget.supplier_name || ''}`, ref: archiveTarget.warehouse_received_net_kg != null ? `Received: ${Number(archiveTarget.warehouse_received_net_kg).toLocaleString()} KG` : undefined } : null}
        linkedRecords={archiveCascade && archiveCascade.bagReceipts.length > 0 ? [
          { count: archiveCascade.bagReceipts.length, label: 'Bag Receipt(s)', detail: `${archiveCascade.totalBags} bags — from warehouse` },
        ] : []}
        impacts={['Grand Total recalculation on linked purchase', 'Remaining KG for supplier', 'Bag Ledger summary', 'Dashboard KPIs']}
        isPending={archiveMutation.isPending}
        onConfirm={(reason) => archiveMutation.mutate({ record: archiveTarget, reason })}
      />

      <ArchivedRecordsSection
        entityName="WarehouseReceipt"
        screenName="Warehouse Receipt"
        queryKey={['warehouse-receipts']}
        describeRecord={(r) => `Warehouse Receipt ${r.grn_code || r.coffee_code || r.id} — ${r.supplier_name || ''}`}
        onExtraInvalidate={(qc) => {
          qc.invalidateQueries({ queryKey: ['purchase-records'] });
          qc.invalidateQueries({ queryKey: ['bag-receipts'] });
          qc.invalidateQueries({ queryKey: ['wh-history-all'] });
        }}
        columns={[
          { label: 'Coffee Code', render: (r) => <span className="font-mono">{r.coffee_code || '—'}</span> },
          { label: 'Supplier', render: (r) => r.supplier_name || '—' },
          { label: 'GRN', render: (r) => r.grn_code || '—' },
          { label: 'Received KG', render: (r) => fmt(r.warehouse_received_net_kg) },
        ]}
      />
    </div>
    </RoleGuard>
  );
}