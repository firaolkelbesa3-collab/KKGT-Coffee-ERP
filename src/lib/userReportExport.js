import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { exportReportPDF } from '@/lib/reportEngine';

function fmt(n, dec = 0) {
  if (n == null || isNaN(n)) return '';
  return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

const ROLE_LABELS = {
  admin: 'Admin', supervisor: 'Supervisor', purchaser: 'Purchaser',
  warehouse_keeper: 'Warehouse', process_manager: 'Processing',
  final_registrar: 'Output', export_manager: 'Export',
};

export function exportUserReportPDF({ filteredStats, summary, dateRange }) {
  const headers = ['#', 'User', 'Role', 'Purchases', 'Payments', 'Warehouse', 'Processing', 'Output', 'ETB Handled', 'Last Active', 'Status'];
  const today = new Date().toISOString().slice(0, 10);
  const rows = filteredStats.map((u, idx) => {
    const lastSlice = u.lastActive ? u.lastActive.slice(0, 10) : null;
    const statusTxt = !lastSlice ? 'Inactive' : lastSlice === today ? 'Active' : 'Recent';
    return [
      idx + 1,
      u.name || u.email,
      ROLE_LABELS[u.role] || u.role || '',
      u.purchasesCreated,
      u.paymentsRecorded,
      u.warehouseReceipts,
      u.processingEntries,
      u.outputReports,
      u.totalEtbHandled > 0 ? fmt(u.totalEtbHandled) : '—',
      lastSlice || 'Never',
      statusTxt,
    ];
  });
  const period = `Period: ${dateRange.from || 'All'} → ${dateRange.to || 'All'}  ·  Active ${summary.active} · Purchases ${summary.totalPurchases} · Payments ${summary.totalPayments}`;
  exportReportPDF({
    title: 'User Activity Report',
    subtitle: period,
    headers,
    rows,
    filename: `user-activity-${dateRange.from || 'all'}-${dateRange.to || 'all'}`,
  });
}

export function exportUserReportExcel({ filteredStats, purchases, receipts, processingLogs, outputReports, dateRange }) {
  const wb = XLSX.utils.book_new();

  // Summary sheet
  const summaryData = filteredStats.map((u, i) => ({
    '#': i + 1,
    'User': u.name || u.email,
    'Email': u.email,
    'Role': ROLE_LABELS[u.role] || u.role || '',
    'Purchases Created': u.purchasesCreated,
    'Payments Recorded': u.paymentsRecorded,
    'Warehouse Receipts': u.warehouseReceipts,
    'Processing Entries': u.processingEntries,
    'Output Reports': u.outputReports,
    'Total ETB Handled': u.totalEtbHandled,
    'Last Active': u.lastActive ? u.lastActive.slice(0, 10) : 'Never',
  }));
  const summarySheet = XLSX.utils.json_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

  function inRange(dateStr) {
    if (!dateStr) return false;
    const d = dateStr.slice(0, 10);
    if (dateRange.from && d < dateRange.from) return false;
    if (dateRange.to && d > dateRange.to) return false;
    return true;
  }

  // Per-user detail sheets (up to 10 most active users)
  const topUsers = [...filteredStats].sort((a, b) => b.purchasesCreated + b.paymentsRecorded - (a.purchasesCreated + a.paymentsRecorded)).slice(0, 10);
  topUsers.forEach(u => {
    const email = u.email;
    const userPurchases = purchases.filter(p => p.created_by === email && inRange(p.purchase_date || p.created_date || ''));
    const userReceipts = receipts.filter(r => r.created_by === email && inRange(r.received_date || r.created_date || ''));
    const userProcessing = processingLogs.filter(l => l.created_by === email && inRange(l.date || l.created_date || ''));
    const userOutputs = outputReports.filter(o => o.created_by === email && inRange(o.date || o.created_date || ''));

    const rows = [
      [`User: ${u.name || u.email}`, `Role: ${ROLE_LABELS[u.role] || u.role || ''}`],
      [],
      ['=== PURCHASES ==='],
      ['Coffee Code', 'Date', 'Supplier', 'Region', 'Grand Total ETB'],
      ...userPurchases.map(p => [p.coffee_code || '', p.purchase_date || '', p.supplier_name || '', p.region || '', p.grand_total_etb || 0]),
      [],
      ['=== WAREHOUSE RECEIPTS ==='],
      ['Date', 'Coffee Code', 'Supplier', 'GRN Code', 'Received KG', 'Bags'],
      ...userReceipts.map(r => [r.received_date || '', r.coffee_code || '', r.supplier_name || '', r.grn_code || '', r.warehouse_received_net_kg || 0, r.bags_received || 0]),
      [],
      ['=== PROCESSING LOG ==='],
      ['Date', 'Supplier', 'Coffee Code', 'Mode', 'KG Sent', 'Actual KG', 'Batch No'],
      ...userProcessing.map(p => [p.date || '', p.supplier_name || '', p.coffee_code || '', p.entry_mode || '', p.kg_sent || 0, p.actual_weighed_kg || 0, p.batch_no || '']),
      [],
      ['=== OUTPUT REPORTS ==='],
      ['Date', 'Total KG', 'Export KG', 'Reject KG', 'Waste KG', 'Reject %', 'Registrar'],
      ...userOutputs.map(o => [o.date || '', o.total_kg_processed || 0, o.export_kg || 0, o.reject_kg || 0, o.waste_kg || 0, o.reject_pct || 0, o.registrar_name || '']),
    ];

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const sheetName = (u.name || u.email).slice(0, 28).replace(/[\\/:*?[\]]/g, '_');
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Coffee ERP — User Activity Report'],
    [`Period: ${dateRange.from} to ${dateRange.to}`],
    [`Generated: ${format(new Date(), 'MMM d, yyyy HH:mm')}`],
  ]), 'Info');

  XLSX.writeFile(wb, `CoffeeERP_User_Activity_${dateRange.from}_${dateRange.to}.xlsx`);
}