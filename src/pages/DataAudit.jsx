import { useState, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { base44 } from '@/api/supabaseClient';
import { useRole } from '@/lib/useRole';
import { runDataAudit, summarize, reconcileWithExcel } from '@/lib/dataAudit';
import { exportXLSX } from '@/lib/exportUtils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ShieldCheck, AlertTriangle, AlertCircle, CheckCircle2, RefreshCw,
  FileSpreadsheet, Upload, Download, ShieldOff,
} from 'lucide-react';

// Entities that can be reconciled against Excel, with their key + comparable fields.
const RECON_ENTITIES = {
  PurchaseRecord: {
    label: 'Purchase Records',
    keyField: 'coffee_code',
    keyAliases: ['coffee code', 'code'],
    fields: [
      { field: 'supplier_name', label: 'Supplier', numeric: false, aliases: ['supplier', 'supplier name'] },
      { field: 'net_dispatch_weight_kg', label: 'Dispatch KG', numeric: true, aliases: ['net kg', 'dispatch kg', 'net dispatch', 'dispatch weight'] },
      { field: 'unit_price_etb_per_feresula', label: 'Unit Price', numeric: true, aliases: ['unit price', 'price'] },
      { field: 'grand_total_etb', label: 'Grand Total ETB', numeric: true, aliases: ['grand total etb', 'grand total'] },
      { field: 'total_paid_etb', label: 'Total Paid ETB', numeric: true, aliases: ['total paid etb', 'total paid', 'paid'] },
      { field: 'balance_etb', label: 'Balance ETB', numeric: true, aliases: ['balance etb', 'balance'] },
    ],
  },
  Supplier: {
    label: 'Suppliers',
    keyField: 'supplier_name',
    keyAliases: ['supplier', 'supplier name', 'name'],
    fields: [
      { field: 'region', label: 'Region', numeric: false, aliases: ['region'] },
      { field: 'opening_stock_kg', label: 'Opening Stock KG', numeric: true, aliases: ['opening stock', 'opening stock kg', 'opening'] },
    ],
  },
  WarehouseReceipt: {
    label: 'Warehouse Receipts',
    keyField: 'coffee_code',
    keyAliases: ['coffee code', 'code'],
    fields: [
      { field: 'warehouse_received_net_kg', label: 'Received KG', numeric: true, aliases: ['received kg', 'net kg', 'warehouse received', 'received net kg'] },
      { field: 'bags_received', label: 'Bags', numeric: true, aliases: ['bags', 'bags received'] },
    ],
  },
};

const SEVERITY = {
  critical: { label: 'Critical', icon: AlertCircle, cls: 'text-red-700 bg-red-50 border-red-200' },
  warning: { label: 'Warning', icon: AlertTriangle, cls: 'text-amber-700 bg-amber-50 border-amber-200' },
};

// Fuzzy header → app field auto-mapping (checks field name, label, and aliases).
function guessColumn(headers, field, label, aliases = []) {
  const targets = [field, label, ...aliases]
    .filter(Boolean)
    .map(s => String(s).toLowerCase().replace(/[^a-z0-9]/g, ''))
    .filter(t => t.length >= 3);
  return headers.find(h => {
    const n = String(h).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (n.length < 3) return false; // skip junk headers like "#"
    return targets.some(t => n === t || n.includes(t) || t.includes(n));
  }) || '';
}

// Excel exports often have title rows before the real header. Pick the row
// (within the first 15) with the most non-empty cells as the header row.
function detectHeaderRow(aoa) {
  let best = 0, bestCount = 0;
  const limit = Math.min(aoa.length, 15);
  for (let i = 0; i < limit; i++) {
    const count = (aoa[i] || []).filter(c => c != null && String(c).trim() !== '').length;
    if (count > bestCount) { bestCount = count; best = i; }
  }
  return best;
}

export default function DataAudit() {
  const { isAdmin, role } = useRole();
  const canView = isAdmin || role === 'supervisor';

  // ── Fetch all data needed for the audit ──────────────────────────────
  const q = (key, fn) => useQuery({ queryKey: [key], queryFn: fn, enabled: canView });
  const { data: purchaseRecords = [] } = q('purchase-records', () => base44.entities.PurchaseRecord.list('-created_date', 1000));
  const { data: receipts = [] } = q('warehouse-receipts', () => base44.entities.WarehouseReceipt.list('-created_date', 1000));
  const { data: suppliers = [] } = q('suppliers', () => base44.entities.Supplier.list());
  const { data: processingLogs = [] } = q('processing-logs', () => base44.entities.ProcessingLog.list());
  const { data: outputReports = [] } = q('output-reports', () => base44.entities.OutputReport.list());
  const { data: sampleLogs = [] } = q('sample-logs', () => base44.entities.SampleLog.list());
  const { data: exportContracts = [] } = q('export-contracts', () => base44.entities.ExportContract.list());

  const [auditRun, setAuditRun] = useState(false);
  const issues = useMemo(() => {
    if (!auditRun) return [];
    return runDataAudit({ purchaseRecords, receipts, suppliers, processingLogs, outputReports, sampleLogs, exportContracts });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditRun, purchaseRecords, receipts, suppliers, processingLogs, outputReports, sampleLogs, exportContracts]);
  const summary = useMemo(() => summarize(issues), [issues]);
  const [filter, setFilter] = useState('all');

  const filteredIssues = issues.filter(i => filter === 'all' || i.severity === filter);

  const downloadAudit = () => {
    const headers = ['Severity', 'Category', 'Entity', 'Record', 'Issue', 'Expected', 'Actual'];
    const rows = issues.map(i => [
      SEVERITY[i.severity]?.label || i.severity, i.category, i.entity, i.record, i.message,
      i.expected ?? '', i.actual ?? '',
    ]);
    exportXLSX('coffee-erp-data-audit', 'Data Audit Report', headers, rows);
  };

  // ── Excel reconciliation state ────────────────────────────────────────
  const fileRef = useRef(null);
  const [reconEntity, setReconEntity] = useState('PurchaseRecord');
  const [excelRows, setExcelRows] = useState(null);
  const [excelHeaders, setExcelHeaders] = useState([]);
  const [fileName, setFileName] = useState('');
  const [keyCol, setKeyCol] = useState('');
  const [colMap, setColMap] = useState({});      // appField -> excelCol
  const [reconResult, setReconResult] = useState(null);

  const cfg = RECON_ENTITIES[reconEntity];
  const appRecords = {
    PurchaseRecord: purchaseRecords, Supplier: suppliers, WarehouseReceipt: receipts,
  }[reconEntity] || [];

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    // Read as a grid so we can skip title rows and find the real header row.
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const headerIdx = detectHeaderRow(aoa);
    const rawHeaders = (aoa[headerIdx] || []).map(h => String(h).trim());
    // De-duplicate + drop blanks (blank header → crashing empty SelectItem value).
    const headers = [];
    const seen = new Set();
    rawHeaders.forEach((h, i) => {
      if (h && !seen.has(h)) { seen.add(h); headers.push(h); }
      else if (h && seen.has(h)) { const u = `${h} (${i})`; seen.add(u); headers.push(u); }
    });
    // Build row objects from the data rows below the header.
    const rows = aoa.slice(headerIdx + 1)
      .filter(r => r.some(c => c != null && String(c).trim() !== ''))
      .map(r => {
        const obj = {};
        rawHeaders.forEach((h, i) => { if (h) obj[h] = r[i]; });
        return obj;
      });

    setExcelRows(rows);
    setExcelHeaders(headers);
    setFileName(file.name);
    setReconResult(null);
    // Auto-map key + fields by header name / label / aliases.
    setKeyCol(guessColumn(headers, cfg.keyField, cfg.label, cfg.keyAliases) || headers[0] || '');
    const m = {};
    cfg.fields.forEach(f => { m[f.field] = guessColumn(headers, f.field, f.label, f.aliases); });
    setColMap(m);
  };

  const runRecon = () => {
    const compareCols = cfg.fields
      .filter(f => colMap[f.field])
      .map(f => ({ excelCol: colMap[f.field], appField: f.field, numeric: f.numeric }));
    const result = reconcileWithExcel(excelRows, appRecords, {
      keyExcelCol: keyCol,
      keyAppField: cfg.keyField,
      compareCols,
      numericTol: 1,
    });
    setReconResult(result);
  };

  const downloadRecon = () => {
    if (!reconResult) return;
    const headers = ['Type', 'Key', 'Field', 'Excel value', 'App value'];
    const rows = [];
    reconResult.onlyInExcel.forEach(r => rows.push(['In Excel, missing from app', r.key, '', '', '']));
    reconResult.onlyInApp.forEach(r => rows.push(['In app, missing from Excel', r.key, '', '', '']));
    reconResult.mismatches.forEach(m => m.diffs.forEach(d =>
      rows.push(['Value mismatch', m.key, d.field, d.excel, d.app])));
    exportXLSX('coffee-erp-excel-reconciliation', 'Excel Reconciliation', headers, rows);
  };

  if (!canView) {
    return (
      <div className="p-6 max-w-xl mx-auto text-center space-y-3">
        <ShieldOff className="w-10 h-10 mx-auto text-muted-foreground" />
        <h2 className="text-lg font-semibold">Admin / supervisor access required</h2>
        <p className="text-sm text-muted-foreground">The data audit is restricted.</p>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-primary" /> Data Audit
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Verify the app's data automatically — re-checks every calculation and compares against your Excel.
        </p>
      </div>

      <Tabs defaultValue="audit">
        <TabsList>
          <TabsTrigger value="audit">Consistency Audit</TabsTrigger>
          <TabsTrigger value="reconcile">Excel Reconciliation</TabsTrigger>
        </TabsList>

        {/* ── Consistency Audit ── */}
        <TabsContent value="audit" className="space-y-5 pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => setAuditRun(true)} className="press">
              <RefreshCw className="w-4 h-4 mr-2" /> {auditRun ? 'Re-run audit' : 'Run audit'}
            </Button>
            {auditRun && issues.length > 0 && (
              <Button variant="outline" onClick={downloadAudit} className="press">
                <Download className="w-4 h-4 mr-2" /> Download report
              </Button>
            )}
          </div>

          {auditRun && (
            <>
              {issues.length === 0 ? (
                <div className="flex flex-col items-center text-center py-14 animate-fade-up">
                  <div className="w-16 h-16 rounded-2xl bg-green-100 text-green-700 flex items-center justify-center mb-4">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-semibold">All checks passed</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    No calculation mismatches, missing data, or inconsistencies found.
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <SummaryCard label="Total issues" value={summary.total} tone="text-foreground" onClick={() => setFilter('all')} active={filter === 'all'} />
                    <SummaryCard label="Critical" value={summary.critical} tone="text-red-700" onClick={() => setFilter('critical')} active={filter === 'critical'} />
                    <SummaryCard label="Warnings" value={summary.warning} tone="text-amber-700" onClick={() => setFilter('warning')} active={filter === 'warning'} />
                    <SummaryCard label="Categories" value={Object.keys(summary.byCategory).length} tone="text-foreground" />
                  </div>

                  <div className="space-y-2">
                    {filteredIssues.map(i => {
                      const sev = SEVERITY[i.severity] || SEVERITY.warning;
                      const Icon = sev.icon;
                      return (
                        <div key={i.id} className={`flex items-start gap-3 rounded-lg border p-3 ${sev.cls}`}>
                          <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                              <span className="font-semibold">{i.entity}</span>
                              <span className="text-xs opacity-70">·</span>
                              <span className="font-mono text-xs">{i.record}</span>
                              <span className="text-xs px-1.5 py-0.5 rounded bg-white/60">{i.category}</span>
                            </div>
                            <p className="text-sm mt-0.5">{i.message}</p>
                            {(i.expected != null || i.actual != null) && (
                              <p className="text-xs mt-1 font-mono">
                                expected <b>{String(i.expected)}</b> · actual <b>{String(i.actual)}</b>
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}
          {!auditRun && (
            <p className="text-sm text-muted-foreground">
              Click <b>Run audit</b> to scan all records for calculation mismatches, missing data,
              duplicates, orphan receipts, and impossible values.
            </p>
          )}
        </TabsContent>

        {/* ── Excel Reconciliation ── */}
        <TabsContent value="reconcile" className="space-y-5 pt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">1. Choose data + upload your Excel</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Select value={reconEntity} onValueChange={(v) => { setReconEntity(v); setExcelRows(null); setReconResult(null); }}>
                <SelectTrigger className="max-w-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(RECON_ENTITIES).map(([k, e]) => <SelectItem key={k} value={k}>{e.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} />
              <div>
                <Button variant="outline" onClick={() => fileRef.current?.click()} className="press">
                  <Upload className="w-4 h-4 mr-2" /> {fileName ? `Replace (${fileName})` : 'Choose Excel / CSV'}
                </Button>
                {excelRows && <span className="ml-3 text-sm text-muted-foreground">{excelRows.length} rows loaded</span>}
              </div>
            </CardContent>
          </Card>

          {excelRows && (
            <Card>
              <CardHeader><CardTitle className="text-base">2. Map columns</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <MapRow label={`Match key (${cfg.keyField})`} value={keyCol} onChange={setKeyCol} headers={excelHeaders} />
                <div className="h-px bg-border" />
                {cfg.fields.map(f => (
                  <MapRow
                    key={f.field}
                    label={f.label}
                    value={colMap[f.field] || ''}
                    onChange={(v) => setColMap(m => ({ ...m, [f.field]: v }))}
                    headers={excelHeaders}
                    optional
                  />
                ))}
                <Button onClick={runRecon} disabled={!keyCol} className="press">
                  <FileSpreadsheet className="w-4 h-4 mr-2" /> Compare with app
                </Button>
              </CardContent>
            </Card>
          )}

          {reconResult && (
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-base">3. Results</CardTitle>
                <Button size="sm" variant="outline" onClick={downloadRecon} className="press">
                  <Download className="w-4 h-4 mr-2" /> Download
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <SummaryCard label="Matched" value={reconResult.matched} tone="text-green-700" />
                  <SummaryCard label="Missing from app" value={reconResult.onlyInExcel.length} tone="text-red-700" />
                  <SummaryCard label="Missing from Excel" value={reconResult.onlyInApp.length} tone="text-amber-700" />
                  <SummaryCard label="Value mismatches" value={reconResult.mismatches.length} tone="text-red-700" />
                </div>

                <ReconList title="In Excel but missing from app" tone="border-red-200 bg-red-50"
                  items={reconResult.onlyInExcel.map(r => r.key)} />
                <ReconList title="In app but missing from Excel" tone="border-amber-200 bg-amber-50"
                  items={reconResult.onlyInApp.map(r => r.key)} />

                {reconResult.mismatches.length > 0 && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                    <p className="text-sm font-semibold text-red-700 mb-2">Value mismatches</p>
                    <div className="space-y-2">
                      {reconResult.mismatches.slice(0, 100).map((m, i) => (
                        <div key={i} className="text-xs">
                          <span className="font-mono font-semibold">{m.key}</span>
                          {m.diffs.map((d, j) => (
                            <span key={j} className="ml-2">
                              {d.field}: Excel <b>{String(d.excel)}</b> ≠ app <b>{String(d.app)}</b>
                            </span>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryCard({ label, value, tone, onClick, active }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl border p-4 bg-card transition-shadow ${onClick ? 'hover:shadow-md cursor-pointer' : 'cursor-default'} ${active ? 'ring-2 ring-primary' : 'border-border'}`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${tone}`}>{value}</p>
    </button>
  );
}

function MapRow({ label, value, onChange, headers, optional }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
      <span className="text-sm font-medium w-48 flex-shrink-0">{label}{!optional && ' *'}</span>
      <Select value={value || '__none__'} onValueChange={(v) => onChange(v === '__none__' ? '' : v)}>
        <SelectTrigger className="max-w-xs"><SelectValue placeholder="— select column —" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">{optional ? '(skip)' : '— select —'}</SelectItem>
          {headers
            .filter(h => h != null && String(h).trim() !== '')
            .map(h => <SelectItem key={h} value={String(h)}>{h}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function ReconList({ title, tone, items }) {
  if (items.length === 0) return null;
  return (
    <div className={`rounded-lg border p-3 ${tone}`}>
      <p className="text-sm font-semibold mb-1">{title} ({items.length})</p>
      <div className="flex flex-wrap gap-1.5">
        {items.slice(0, 200).map((k, i) => (
          <span key={i} className="font-mono text-xs px-1.5 py-0.5 rounded bg-white/70">{String(k)}</span>
        ))}
        {items.length > 200 && <span className="text-xs">+{items.length - 200} more (see download)</span>}
      </div>
    </div>
  );
}
