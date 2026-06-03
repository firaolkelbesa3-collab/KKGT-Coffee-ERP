import React, { useState } from 'react';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Download, Loader2, Database } from 'lucide-react';
import { base44, supabase } from '@/api/supabaseClient';
import { parsePayments } from '@/components/purchases/PaymentHistoryPanel';
import { calcTotalPaid, calcBalance, calcPaymentStatus } from '@/lib/paymentUtils';
import { toast } from 'sonner';

// Every table in the database — for the complete raw export.
const ALL_TABLES = [
  'suppliers', 'purchase_records', 'warehouse_receipts', 'warehouse_receipt_history',
  'warehouse_inventory', 'processing_logs', 'processing_batches', 'output_reports',
  'export_contracts', 'exports', 'buyer_inspections', 'sample_logs',
  'bag_receipts', 'supplier_bag_returns', 'supplier_bag_payments',
  'supplier_bag_settlements', 'reject_bag_usages', 'material_register_entries',
  'material_entries', 'attachments', 'activity_logs', 'notifications',
  'notification_settings', 'role_permissions', 'user_invites', 'profiles',
];

// Build a sheet from raw rows — every column, nothing trimmed.
// JSON/object columns are stringified so nothing is lost.
function rawSheet(rows) {
  if (!rows || rows.length === 0) return XLSX.utils.aoa_to_sheet([['(no rows)']]);
  const keys = Array.from(rows.reduce((set, r) => { Object.keys(r).forEach(k => set.add(k)); return set; }, new Set()));
  const aoa = [keys, ...rows.map(r => keys.map(k => {
    const v = r[k];
    if (v == null) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return v;
  }))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = keys.map(k => ({ wch: Math.min(Math.max(k.length + 2, 12), 40) }));
  return ws;
}

function fmtNum(n) {
  if (n == null || isNaN(n)) return '';
  return Number(n);
}
function fmtDate(s) {
  if (!s) return '';
  try { return format(new Date(s), 'dd/MM/yyyy'); } catch { return s; }
}

function buildSheet(title, headers, rows) {
  const aoa = [
    ['COFFEE ERP'],
    [title],
    [`Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`],
    [],
    headers,
    ...rows,
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = headers.map((h, ci) => {
    let max = String(h).length;
    rows.forEach(r => { const v = r[ci]; if (v != null) max = Math.max(max, String(v).length); });
    return { wch: Math.max(max + 2, 12) };
  });
  return ws;
}

function wbToBlob(ws, sheetName, title) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export default function DownloadBackupButton() {
  const [busy, setBusy] = useState(false);
  const [rawBusy, setRawBusy] = useState(false);

  // Complete raw export — every table, every column, one sheet per table.
  const handleCompleteExport = async () => {
    setRawBusy(true);
    try {
      const wb = XLSX.utils.book_new();
      let totalRows = 0;
      const skipped = [];
      for (const table of ALL_TABLES) {
        const { data, error } = await supabase.from(table).select('*').limit(10000);
        if (error) { skipped.push(table); continue; }
        totalRows += (data?.length || 0);
        XLSX.utils.book_append_sheet(wb, rawSheet(data || []), table.slice(0, 31));
      }
      // Summary sheet first
      const summary = XLSX.utils.aoa_to_sheet([
        ['KKGT Import Export — Complete Data Export'],
        [`Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`],
        [],
        ['Table', 'Rows'],
        ...ALL_TABLES.filter(t => !skipped.includes(t)).map(t => {
          const sheet = wb.Sheets[t.slice(0, 31)];
          const range = sheet ? XLSX.utils.decode_range(sheet['!ref']) : null;
          return [t, range ? range.e.r : 0];
        }),
      ]);
      XLSX.utils.book_append_sheet(wb, summary, 'INDEX');
      // Move INDEX to front
      wb.SheetNames = ['INDEX', ...wb.SheetNames.filter(n => n !== 'INDEX')];

      const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `KKGT-Complete-Data-${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Complete export: ${totalRows} rows across ${ALL_TABLES.length - skipped.length} tables`);
    } catch (err) {
      console.error(err);
      toast.error(`Export failed: ${err.message || 'unknown error'}`);
    } finally {
      setRawBusy(false);
    }
  };

  const handleDownload = async () => {
    setBusy(true);
    try {
      // Fetch all data in parallel
      const [purchases, receipts, sampleLogs, processingLogs, outputReports, activityLogs] = await Promise.all([
        base44.entities.PurchaseRecord.list('-created_date', 5000),
        base44.entities.WarehouseReceipt.list('-created_date', 5000),
        base44.entities.SampleLog.list('-created_date', 5000),
        base44.entities.ProcessingLog.list('-created_date', 5000),
        base44.entities.OutputReport.list('-date', 5000),
        base44.entities.ActivityLog.list('-created_date', 5000),
      ]);

      const zip = new JSZip();

      // 1. Purchase Summary
      {
        const headers = ['Coffee Code', 'Date', 'Supplier', 'Region', 'Net KG', 'Unit Price', 'Commission %', 'Grand Total ETB', 'Total Paid ETB', 'Balance ETB', 'Status'];
        const rows = purchases.filter(p => !p.archived).map(p => {
          const paid = calcTotalPaid(p);
          const bal = calcBalance(p.grand_total_etb, paid);
          const status = calcPaymentStatus(p.grand_total_etb, paid) || 'Unpaid';
          return [p.coffee_code || '', fmtDate(p.purchase_date), p.supplier_name || '', p.region || '',
            fmtNum(p.net_dispatch_weight_kg), fmtNum(p.unit_price_etb_per_feresula),
            p.commission_percent != null ? p.commission_percent : '',
            fmtNum(p.grand_total_etb), fmtNum(paid), fmtNum(bal), status];
        });
        zip.file('1_Purchase_Summary.xlsx', wbToBlob(buildSheet('Purchase Summary', headers, rows), 'Purchase Summary'));
      }

      // 2. Payments Report
      {
        const headers = ['Date', 'Supplier', 'Coffee Code', 'Bank', 'Branch/Account', 'CPV Ref', 'Type', 'Amount ETB', 'Note'];
        const rows = [];
        purchases.filter(p => !p.archived).forEach(p => {
          parsePayments(p).forEach(pay => {
            rows.push([
              pay.payment_date || '', p.supplier_name || '', p.coffee_code || '',
              pay.bank_name || '', pay.branch_account || '', pay.cpv_reference || '',
              pay.payment_type || '', fmtNum(parseFloat(pay.amount_etb)), pay.note || '',
            ]);
          });
        });
        rows.sort((a, b) => (a[0] || '') > (b[0] || '') ? 1 : -1);
        zip.file('2_Payments_Report.xlsx', wbToBlob(buildSheet('Payments Report', headers, rows), 'Payments'));
      }

      // 3. Supplier Balance Report
      {
        const headers = ['Supplier', 'Lots', 'Grand Total ETB', 'Total Paid ETB', 'Balance Owed ETB', 'Status'];
        const map = {};
        purchases.filter(p => !p.archived && p.supplier_name).forEach(p => {
          const k = p.supplier_name;
          if (!map[k]) map[k] = { name: k, lots: 0, gt: 0, paid: 0 };
          map[k].lots++;
          map[k].gt += p.grand_total_etb || 0;
          map[k].paid += calcTotalPaid(p);
        });
        const rows = Object.values(map).sort((a, b) => a.name.localeCompare(b.name)).map(r => {
          const bal = Math.max(0, r.gt - r.paid);
          const status = calcPaymentStatus(r.gt, r.paid) || 'Unpaid';
          return [r.name, r.lots, fmtNum(r.gt), fmtNum(r.paid), fmtNum(bal), status];
        });
        zip.file('3_Supplier_Balance.xlsx', wbToBlob(buildSheet('Supplier Balance', headers, rows), 'Supplier Balance'));
      }

      // 4. Warehouse Stock Report
      {
        const headers = ['Date', 'Coffee Code', 'Supplier', 'GRN Code', 'Dispatch No', 'Net Dispatch KG', 'Received KG', 'Bags Received', 'Remark'];
        const rows = receipts.filter(r => !r.archived).map(r => [
          fmtDate(r.received_date), r.coffee_code || '', r.supplier_name || '',
          r.grn_code || '', r.dispatch_no || '',
          fmtNum(r.net_dispatch_weight_kg), fmtNum(r.warehouse_received_net_kg),
          fmtNum(r.bags_received), r.remark || '',
        ]);
        zip.file('4_Warehouse_Stock.xlsx', wbToBlob(buildSheet('Warehouse Stock', headers, rows), 'Warehouse Stock'));
      }

      // 5. Processing Log
      {
        const headers = ['Date', 'Type', 'Supplier / Buyer', 'Coffee Type', 'Bags Sent', 'KG Sent', 'Actual Weighed KG', 'Variance KG', 'Batch No', 'Remark'];
        const rows = processingLogs.filter(p => !p.archived).map(p => [
          fmtDate(p.date), p.entry_type || 'Standard', p.supplier_name || p.buyer_name || '',
          p.coffee_type || '', fmtNum(p.bags_sent), fmtNum(p.kg_sent),
          fmtNum(p.actual_weighed_kg), fmtNum(p.batch_variance_kg),
          p.batch_no || '', p.remark || '',
        ]);
        zip.file('5_Processing_Log.xlsx', wbToBlob(buildSheet('Processing Log', headers, rows), 'Processing Log'));
      }

      // 6. Output Report
      {
        const headers = ['Date', 'Type', 'Supplier', 'Coffee Type', 'Total KG Processed', 'Export Bags', 'Export KG', 'Reject Bags', 'Reject KG', 'Waste KG', 'Reject %', 'Waste %', 'Registrar'];
        const rows = outputReports.filter(r => !r.archived).map(r => [
          fmtDate(r.date), r.entry_type || 'Standard', r.supplier_name || '', r.coffee_type || '',
          fmtNum(r.total_kg_processed), fmtNum(r.export_bags), fmtNum(r.export_kg),
          fmtNum(r.reject_bags), fmtNum(r.reject_kg), fmtNum(r.waste_kg),
          r.reject_pct != null ? `${Number(r.reject_pct).toFixed(1)}%` : '',
          r.waste_pct != null ? `${Number(r.waste_pct).toFixed(1)}%` : '',
          r.registrar_name || '',
        ]);
        zip.file('6_Output_Report.xlsx', wbToBlob(buildSheet('Output Report', headers, rows), 'Output Report'));
      }

      // 7. Activity Log
      {
        const headers = ['Date / Time', 'User', 'Action', 'Screen', 'Description', 'Reason'];
        const rows = activityLogs.map(l => [
          l.created_date ? format(new Date(l.created_date), 'dd/MM/yyyy HH:mm:ss') : '',
          l.user_email || '', l.action_type || '', l.screen_name || '',
          l.record_description || '', l.reason || '',
        ]);
        zip.file('7_Activity_Log.xlsx', wbToBlob(buildSheet('Activity Log', headers, rows), 'Activity Log'));
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `KKGT-Backup-${format(new Date(), 'yyyy-MM-dd')}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Backup downloaded successfully');
    } catch (err) {
      console.error(err);
      toast.error(`Backup failed: ${err.message || 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={handleDownload} disabled={busy} className="gap-2">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        {busy ? 'Preparing...' : 'Reports Backup'}
      </Button>
      <Button variant="outline" onClick={handleCompleteExport} disabled={rawBusy} className="gap-2">
        {rawBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
        {rawBusy ? 'Exporting...' : 'Complete Data (All Tables)'}
      </Button>
    </div>
  );
}