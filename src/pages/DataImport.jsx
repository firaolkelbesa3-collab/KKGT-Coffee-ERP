import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { db } from '@/api/supabaseClient';
import { useRole } from '@/lib/useRole';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, ShieldOff, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

// ---------------------------------------------------------------------------
// Admin-only bulk importer for opening data (suppliers, purchases, inventory).
// Reads CSV / XLSX in the browser via SheetJS, shows a preview, then commits
// row-by-row via the existing db.<Entity>.create() helpers so RLS, triggers,
// and audit fields still apply.
// ---------------------------------------------------------------------------

const ENTITIES = {
  Supplier: {
    label: 'Suppliers',
    columns: [
      { key: 'supplier_name', required: true },
      { key: 'region' },
      { key: 'agent' },
      { key: 'coffee_type' },
      { key: 'opening_stock_kg', type: 'number' },
      { key: 'phone_number' },
      { key: 'station_name' },
    ],
  },
  PurchaseRecord: {
    label: 'Purchase Records (opening backlog)',
    columns: [
      { key: 'coffee_code', required: true },
      { key: 'purchase_date', required: true, type: 'date' },
      { key: 'supplier_name', required: true },
      { key: 'agent' },
      { key: 'region' },
      { key: 'coffee_type' },
      { key: 'net_dispatch_weight_kg', type: 'number' },
      { key: 'unit_price_etb_per_feresula', type: 'number' },
      { key: 'commission_percent', type: 'number' },
    ],
  },
  WarehouseInventory: {
    label: 'Warehouse Inventory (opening stock)',
    columns: [
      { key: 'lot_number' },
      { key: 'coffee_type' },
      { key: 'grade' },
      { key: 'quantity_kg', type: 'number' },
      { key: 'warehouse_location' },
      { key: 'status' },
      { key: 'received_date', type: 'date' },
      { key: 'moisture_content', type: 'number' },
    ],
  },
};

function coerceCell(value, type) {
  if (value === '' || value === null || value === undefined) return null;
  if (type === 'number') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (type === 'date') {
    // SheetJS returns Date objects for XLSX date cells when cellDates:true is set.
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toISOString().slice(0, 10);
  }
  return String(value).trim();
}

function normalizeRows(rows, columns) {
  return rows.map((raw, idx) => {
    const cleaned = {};
    const errors = [];
    for (const col of columns) {
      const value = coerceCell(raw[col.key], col.type);
      cleaned[col.key] = value;
      if (col.required && (value === null || value === '')) {
        errors.push(`${col.key} is required`);
      }
    }
    return { rowNumber: idx + 2, data: cleaned, errors };
  });
}

export default function DataImport() {
  const { isAdmin } = useRole();
  const qc = useQueryClient();
  const fileRef = useRef(null);
  const [entityKey, setEntityKey] = useState('Supplier');
  const [parsed, setParsed] = useState(null); // { fileName, rows: [{rowNumber, data, errors}] }
  const [importStatus, setImportStatus] = useState({ done: 0, total: 0, errors: [], running: false });

  if (!isAdmin) {
    return (
      <div className="p-6 max-w-xl mx-auto text-center space-y-3">
        <ShieldOff className="w-10 h-10 mx-auto text-muted-foreground" />
        <h2 className="text-lg font-semibold">Admin access required</h2>
        <p className="text-sm text-muted-foreground">
          The data importer is restricted to administrators.
        </p>
      </div>
    );
  }

  const entity = ENTITIES[entityKey];

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    const normalized = normalizeRows(rows, entity.columns);
    setParsed({ fileName: file.name, rows: normalized });
    setImportStatus({ done: 0, total: 0, errors: [], running: false });
  };

  const handleCommit = async () => {
    if (!parsed) return;
    const valid = parsed.rows.filter(r => r.errors.length === 0);
    setImportStatus({ done: 0, total: valid.length, errors: [], running: true });

    for (let i = 0; i < valid.length; i++) {
      const { rowNumber, data } = valid[i];
      try {
        await db[entityKey].create(data);
      } catch (err) {
        setImportStatus(prev => ({
          ...prev,
          errors: [...prev.errors, `Row ${rowNumber}: ${err.message || 'insert failed'}`],
        }));
      }
      setImportStatus(prev => ({ ...prev, done: i + 1 }));
    }

    setImportStatus(prev => ({ ...prev, running: false }));
    qc.invalidateQueries();
  };

  const validCount = parsed ? parsed.rows.filter(r => r.errors.length === 0).length : 0;
  const invalidCount = parsed ? parsed.rows.length - validCount : 0;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Data Import</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Bulk-load opening data from CSV or XLSX. First row must be a header with column names matching the entity fields.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Choose what to import</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={entityKey} onValueChange={k => { setEntityKey(k); setParsed(null); }}>
            <SelectTrigger className="max-w-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ENTITIES).map(([k, e]) => (
                <SelectItem key={k} value={k}>{e.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="text-xs text-muted-foreground">
            Expected columns:{' '}
            <code className="text-foreground">
              {entity.columns.map(c => c.key + (c.required ? '*' : '')).join(', ')}
            </code>
            <span className="ml-2 text-muted-foreground">(* required)</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Upload file</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={handleFile}
          />
          <Button type="button" onClick={() => fileRef.current?.click()} variant="outline">
            <Upload className="w-4 h-4 mr-2" />
            {parsed ? `Replace file (${parsed.fileName})` : 'Choose CSV or XLSX'}
          </Button>

          {parsed && (
            <div className="flex gap-4 text-sm">
              <span className="text-green-700 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> {validCount} valid
              </span>
              {invalidCount > 0 && (
                <span className="text-destructive flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" /> {invalidCount} with errors
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {parsed && parsed.rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. Preview (first 20 rows)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    {entity.columns.map(c => <TableHead key={c.key}>{c.key}</TableHead>)}
                    <TableHead>Errors</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.rows.slice(0, 20).map(row => (
                    <TableRow key={row.rowNumber} className={row.errors.length ? 'bg-destructive/5' : ''}>
                      <TableCell className="text-xs text-muted-foreground">{row.rowNumber}</TableCell>
                      {entity.columns.map(c => (
                        <TableCell key={c.key} className="text-xs">
                          {row.data[c.key] === null ? <span className="text-muted-foreground">—</span> : String(row.data[c.key])}
                        </TableCell>
                      ))}
                      <TableCell className="text-xs text-destructive">
                        {row.errors.join('; ')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {parsed && validCount > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">4. Commit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              type="button"
              onClick={handleCommit}
              disabled={importStatus.running}
            >
              {importStatus.running ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing {importStatus.done}/{importStatus.total}…</>
              ) : (
                <>Import {validCount} rows</>
              )}
            </Button>

            {!importStatus.running && importStatus.done > 0 && (
              <div className="text-sm">
                <p className="text-green-700">
                  Imported {importStatus.done - importStatus.errors.length} of {importStatus.total} rows.
                </p>
                {importStatus.errors.length > 0 && (
                  <div className="mt-2 text-destructive">
                    <p className="font-medium">{importStatus.errors.length} errors:</p>
                    <ul className="list-disc pl-5 mt-1 text-xs space-y-0.5">
                      {importStatus.errors.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}
                      {importStatus.errors.length > 20 && (
                        <li>… and {importStatus.errors.length - 20} more</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
