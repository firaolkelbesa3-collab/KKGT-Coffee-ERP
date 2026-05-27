import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, ChevronsUpDown, Search, Phone, Upload, AlertTriangle, XCircle } from 'lucide-react';
import RoleGuard from '@/components/RoleGuard';
import DownloadBackupButton from '@/components/admin/DownloadBackupButton';
import * as XLSX from 'xlsx';
import TablePagination from '@/components/shared/TablePagination';

// PAGE_SIZE replaced by dynamic pageSize state
const REGIONS = ['Wollega', 'Yirgacheffe', 'Sidama', 'Jimma', 'Harrar', 'Kaffa', 'Guji', 'Bench', 'Gedeo', 'Other'];
const COFFEE_TYPES = ['Unwashed Lekempti', 'Washed Yirgacheffe', 'Natural Sidama', 'Washed Sidama', 'Unwashed Harrar', 'Washed Jimma', 'Natural Guji', 'Washed Guji', 'Other'];

function getExpiryStatus(expiryDate) {
  if (!expiryDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  if (expiry < today) return 'expired';
  const diff = (expiry - today) / (1000 * 60 * 60 * 24);
  if (diff <= 30) return 'warning';
  return 'ok';
}

function ExpiryBadge({ expiryDate }) {
  const status = getExpiryStatus(expiryDate);
  if (!status || status === 'ok') return null;
  if (status === 'expired') return (
    <span className="inline-flex items-center gap-0.5 ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700">
      <XCircle className="w-3 h-3" /> Expired
    </span>
  );
  return (
    <span className="inline-flex items-center gap-0.5 ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-100 text-orange-700">
      <AlertTriangle className="w-3 h-3" /> Expiring Soon
    </span>
  );
}

function SortIcon({ col, sortKey, sortDir }) {
  if (sortKey !== col) return <ChevronsUpDown className="inline w-3 h-3 ml-1 opacity-30" />;
  return sortDir === 'asc' ? <ChevronUp className="inline w-3 h-3 ml-1" /> : <ChevronDown className="inline w-3 h-3 ml-1" />;
}

function SupplierFormDialog({ open, onOpenChange, initialData, onSubmit, isSubmitting }) {
  const emptyForm = { supplier_name: '', region: '', agent: '', coffee_type: '', opening_stock_kg: '', phone_number: '', coffee_origin: '', station_name: '', agreement_date: '', agreement_expiry_date: '' };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (open) {
      setForm({
        supplier_name: initialData?.supplier_name || '',
        region: initialData?.region || '',
        agent: initialData?.agent || '',
        coffee_type: initialData?.coffee_type || '',
        opening_stock_kg: initialData?.opening_stock_kg ?? '',
        phone_number: initialData?.phone_number || '',
        coffee_origin: initialData?.coffee_origin || '',
        station_name: initialData?.station_name || '',
        agreement_date: initialData?.agreement_date || '',
        agreement_expiry_date: initialData?.agreement_expiry_date || '',
      });
    }
  }, [open, initialData]);

  const set = (key) => (e) => setForm(p => ({ ...p, [key]: e.target.value }));
  const setV = (key) => (v) => setForm(p => ({ ...p, [key]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = { ...form };
    if (data.opening_stock_kg !== '') data.opening_stock_kg = parseFloat(data.opening_stock_kg);
    else delete data.opening_stock_kg;
    onSubmit(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">{initialData ? 'Edit Supplier' : 'Add Supplier'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs font-medium">Supplier Name *</Label>
              <Input value={form.supplier_name} onChange={set('supplier_name')} required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Region</Label>
              <Select value={form.region} onValueChange={setV('region')}>
                <SelectTrigger><SelectValue placeholder="Select region" /></SelectTrigger>
                <SelectContent>{REGIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Agent</Label>
              <Input value={form.agent} onChange={set('agent')} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Coffee Type</Label>
              <Select value={form.coffee_type} onValueChange={setV('coffee_type')}>
                <SelectTrigger><SelectValue placeholder="Select coffee type" /></SelectTrigger>
                <SelectContent>{COFFEE_TYPES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Opening Stock (KG)</Label>
              <Input type="number" step="any" value={form.opening_stock_kg} onChange={set('opening_stock_kg')} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Phone Number</Label>
              <Input value={form.phone_number} onChange={set('phone_number')} placeholder="+251..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Coffee Origin</Label>
              <Input value={form.coffee_origin} onChange={set('coffee_origin')} placeholder="e.g. Wollega, Guji" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs font-medium">SH. Station Name</Label>
              <Input value={form.station_name} onChange={set('station_name')} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Agreement Date</Label>
              <Input type="date" value={form.agreement_date} onChange={set('agreement_date')} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Agreement Expiry Date</Label>
              <Input type="date" value={form.agreement_expiry_date} onChange={set('agreement_expiry_date')} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : initialData ? 'Update' : 'Add Supplier'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ImportResultDialog({ open, onClose, result }) {
  if (!result) return null;
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Import Complete</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-green-50 rounded-lg p-3">
              <p className="text-2xl font-bold text-green-700">{result.created}</p>
              <p className="text-xs text-green-600">Created</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-3">
              <p className="text-2xl font-bold text-blue-700">{result.updated}</p>
              <p className="text-xs text-blue-600">Updated</p>
            </div>
            <div className="bg-red-50 rounded-lg p-3">
              <p className="text-2xl font-bold text-red-700">{result.errors}</p>
              <p className="text-xs text-red-600">Errors</p>
            </div>
          </div>
          {result.errorDetails?.length > 0 && (
            <div className="bg-red-50 rounded-lg p-3 max-h-40 overflow-y-auto">
              <p className="text-xs font-semibold text-red-700 mb-1">Error details:</p>
              {result.errorDetails.map((e, i) => <p key={i} className="text-xs text-red-600">{e}</p>)}
            </div>
          )}
        </div>
        <DialogFooter><Button onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Normalize Excel serial dates or string dates to YYYY-MM-DD
function parseExcelDate(val) {
  if (!val) return '';
  if (typeof val === 'number') {
    // Excel serial date
    const date = new Date((val - 25569) * 86400 * 1000);
    return date.toISOString().split('T')[0];
  }
  const s = String(val).trim();
  if (!s) return '';
  // Try common formats: DD/MM/YYYY or MM/DD/YYYY or YYYY-MM-DD
  const parts = s.split(/[\/\-\.]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`;
    // Assume DD/MM/YYYY
    return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
  }
  return s;
}

export default function MasterData() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('supplier_name');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileInputRef = useRef(null);
  const queryClient = useQueryClient();

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Supplier.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['suppliers'] }); setDialogOpen(false); },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Supplier.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['suppliers'] }); setDialogOpen(false); setEditRecord(null); },
  });
  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Supplier.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['suppliers'] }); setDeleteTarget(null); },
  });

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
    setPage(1);
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const seen = new Set();
    const unique = suppliers.filter(s => {
      const key = (s.supplier_name || '').toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const list = unique.filter(s =>
      !search || s.supplier_name?.toLowerCase().includes(q) || s.region?.toLowerCase().includes(q) || s.agent?.toLowerCase().includes(q) || s.coffee_origin?.toLowerCase().includes(q)
    );
    return [...list].sort((a, b) => {
      let va = a[sortKey] ?? ''; let vb = b[sortKey] ?? '';
      return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
  }, [suppliers, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  // Excel import handler
  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImporting(true);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

        // Build name map from current suppliers
        const nameMap = {};
        suppliers.forEach(s => { if (s.supplier_name) nameMap[s.supplier_name.trim().toLowerCase()] = s; });

        let created = 0, updated = 0, errors = 0;
        const errorDetails = [];

        // Column name aliases (case-insensitive)
        const getCol = (row, ...aliases) => {
          for (const key of Object.keys(row)) {
            if (aliases.some(a => key.trim().toLowerCase() === a.toLowerCase())) return row[key];
          }
          return '';
        };

        for (const row of rows) {
          const name = String(getCol(row, 'Supplier Name', 'supplier_name', 'name') || '').trim();
          if (!name) continue;

          const data = {
            supplier_name: name,
            coffee_origin: String(getCol(row, 'Coffee Origin', 'coffee_origin', 'origin') || '').trim(),
            station_name: String(getCol(row, 'Station Name', 'SH. Station Name', 'station_name') || '').trim(),
            phone_number: String(getCol(row, 'Phone', 'Phone Number', 'phone_number', 'phone') || '').trim(),
            agreement_date: parseExcelDate(getCol(row, 'Agreement Date', 'agreement_date')),
            agreement_expiry_date: parseExcelDate(getCol(row, 'Expiry Date', 'Agreement Expiry Date', 'agreement_expiry_date')),
          };
          // Remove empty strings
          Object.keys(data).forEach(k => { if (data[k] === '') delete data[k]; });

          try {
            const existing = nameMap[name.toLowerCase()];
            if (existing) {
              await base44.entities.Supplier.update(existing.id, data);
              updated++;
            } else {
              await base44.entities.Supplier.create(data);
              created++;
            }
          } catch (err) {
            errors++;
            errorDetails.push(`"${name}": ${err.message || 'unknown error'}`);
          }
        }

        queryClient.invalidateQueries({ queryKey: ['suppliers'] });
        setImportResult({ created, updated, errors, errorDetails });
      } catch (err) {
        setImportResult({ created: 0, updated: 0, errors: 1, errorDetails: [`Failed to parse file: ${err.message}`] });
      } finally {
        setImporting(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const COLS = [
    { label: '#', key: null },
    { label: 'Supplier Name', key: 'supplier_name' },
    { label: 'Region', key: 'region' },
    { label: 'Coffee Origin', key: 'coffee_origin' },
    { label: 'Station', key: 'station_name' },
    { label: 'Agent', key: 'agent' },
    { label: 'Coffee Type', key: 'coffee_type' },
    { label: 'Phone', key: 'phone_number' },
    { label: 'Agreement', key: 'agreement_date' },
    { label: 'Expiry', key: 'agreement_expiry_date' },
    { label: 'Actions', key: null },
  ];

  return (
    <RoleGuard allowedRoles={['admin']}>
    <div>
      <PageHeader title="Master Data" description="Manage supplier records and opening stock">
        <div className="flex gap-2 flex-wrap">
          <DownloadBackupButton />
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportFile} />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            <Upload className="w-4 h-4 mr-1" /> {importing ? 'Importing...' : 'Import Excel'}
          </Button>
          <Button onClick={() => { setEditRecord(null); setDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Add Supplier
          </Button>
        </div>
      </PageHeader>

      <div className="relative mb-4 max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search by name, region, origin..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto w-full">
          <Table className="min-w-[1100px]">
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                {COLS.map(col => {
                  const minW = col.label === '#' ? 'min-w-[40px]' : col.label === 'Supplier Name' ? 'min-w-[160px]' : col.label === 'Region' || col.label === 'Coffee Origin' || col.label === 'Station' ? 'min-w-[110px]' : col.label === 'Agent' ? 'min-w-[120px]' : col.label === 'Coffee Type' ? 'min-w-[140px]' : col.label === 'Phone' ? 'min-w-[120px]' : col.label === 'Agreement' || col.label === 'Expiry' ? 'min-w-[110px]' : col.label === 'Actions' ? 'min-w-[80px]' : 'min-w-[100px]';
                  return (
                  <TableHead
                    key={col.label}
                    className={`text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap ${minW} ${col.key ? 'cursor-pointer hover:text-foreground select-none' : ''}`}
                    onClick={() => col.key && handleSort(col.key)}
                  >
                    {col.label}{col.key && <SortIcon col={col.key} sortKey={sortKey} sortDir={sortDir} />}
                  </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? Array(4).fill(0).map((_, i) => (
                <TableRow key={i}>{COLS.map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>)}</TableRow>
              )) : paginated.length === 0 ? (
                <TableRow><TableCell colSpan={COLS.length} className="text-center py-12 text-muted-foreground">{search ? 'No suppliers match.' : 'No suppliers found. Add your first supplier.'}</TableCell></TableRow>
              ) : paginated.map((r, i) => {
                const incomplete = !r.region || !r.agent || !r.coffee_type;
                const rowCls = incomplete ? 'text-gray-400' : '';
                const expiryStatus = getExpiryStatus(r.agreement_expiry_date);
                return (
                <TableRow key={r.id} className="hover:bg-muted/20" title={incomplete ? 'Incomplete profile.' : undefined}>
                  <TableCell className="text-muted-foreground text-xs">{(page - 1) * pageSize + i + 1}</TableCell>
                  <TableCell className="font-medium">
                    {r.supplier_name}
                    {incomplete && <span className="ml-1.5 text-[10px] text-amber-500 font-normal">⚠ Incomplete</span>}
                  </TableCell>
                  <TableCell className={rowCls}>{r.region || <span className="italic text-gray-300">—</span>}</TableCell>
                  <TableCell className="text-sm">{r.coffee_origin || <span className="italic text-gray-300">—</span>}</TableCell>
                  <TableCell className="text-sm">{r.station_name || <span className="italic text-gray-300">—</span>}</TableCell>
                  <TableCell className={rowCls}>{r.agent || <span className="italic text-gray-300">—</span>}</TableCell>
                  <TableCell className={rowCls}>{r.coffee_type || <span className="italic text-gray-300">—</span>}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {r.phone_number ? (
                      <a href={`tel:${r.phone_number}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                        <Phone className="w-3 h-3" />{r.phone_number}
                      </a>
                    ) : <span className="italic text-gray-300">—</span>}
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{r.agreement_date || '—'}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {r.agreement_expiry_date || '—'}
                    <ExpiryBadge expiryDate={r.agreement_expiry_date} />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => { setEditRecord(r); setDialogOpen(true); }}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(r)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
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

      <SupplierFormDialog
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditRecord(null); }}
        initialData={editRecord}
        onSubmit={(data) => {
          if (editRecord) updateMutation.mutate({ id: editRecord.id, data });
          else createMutation.mutate(data);
        }}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Supplier?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete <strong>{deleteTarget?.supplier_name}</strong>.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deleteMutation.mutate(deleteTarget.id)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ImportResultDialog open={!!importResult} onClose={() => setImportResult(null)} result={importResult} />
    </div>
    </RoleGuard>
  );
}