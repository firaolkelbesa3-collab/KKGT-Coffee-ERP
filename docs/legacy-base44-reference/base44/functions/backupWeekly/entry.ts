import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import * as XLSX from 'npm:xlsx@0.18.5';

function checkAuth(req) {
  const key = req.headers.get('X-API-Key') || req.headers.get('x-api-key');
  return key === Deno.env.get('BACKUP_API_KEY');
}

function fmt(v) { return v != null ? Number(v) : ''; }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-GB') : ''; }

function getWeekNumber(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

Deno.serve(async (req) => {
  if (!checkAuth(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const base44 = createClientFromRequest(req);

  const [purchases, receipts, processingLogs, outputReports, activityLogs] = await Promise.all([
    base44.asServiceRole.entities.PurchaseRecord.filter({ archived: false }, '-purchase_date', 2000),
    base44.asServiceRole.entities.WarehouseReceipt.filter({ archived: false }, '-received_date', 2000),
    base44.asServiceRole.entities.ProcessingLog.filter({ archived: false }, '-date', 2000),
    base44.asServiceRole.entities.OutputReport.filter({ archived: false }, '-date', 2000),
    base44.asServiceRole.entities.ActivityLog.list('-created_date', 2000),
  ]);

  const now = new Date();
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Sheet 1: Purchase Summary
  const purchaseRows = purchases.map(p => ({
    'Coffee Code': p.coffee_code || '',
    'Purchase Date': fmtDate(p.purchase_date),
    'Supplier': p.supplier_name || '',
    'Agent': p.agent || '',
    'Region': p.region || '',
    'Coffee Type': p.coffee_type || '',
    'Net Dispatch KG': fmt(p.net_dispatch_weight_kg),
    'Net Feresula': fmt(p.net_feresula),
    'Unit Price (ETB/Feresula)': fmt(p.unit_price_etb_per_feresula),
    'Commission %': fmt(p.commission_percent),
    'Commission ETB': fmt(p.commission_etb),
    'Total Purchase Price': fmt(p.total_purchase_price),
    'Other Cost ETB': fmt(p.other_cost_etb),
    'Grand Total ETB': fmt(p.grand_total_etb),
    'Total Paid ETB': fmt(p.total_paid_etb),
    'Balance ETB': fmt(p.balance_etb),
    'Remark': p.remark || '',
  }));

  // Sheet 2: Payments Report
  const paymentRows = [];
  for (const p of purchases) {
    if (!p.payment_history) continue;
    let payments = [];
    try { payments = JSON.parse(p.payment_history); } catch { continue; }
    for (const pay of payments) {
      paymentRows.push({
        'Coffee Code': p.coffee_code || '',
        'Supplier': p.supplier_name || '',
        'Payment No': pay.payment_no || '',
        'Payment Date': pay.payment_date ? fmtDate(pay.payment_date) : '',
        'Bank Name': pay.bank_name || '',
        'Branch/Account': pay.branch_account || '',
        'Amount ETB': fmt(pay.amount_etb),
        'CPV Reference': pay.cpv_reference || '',
        'Payment Type': pay.payment_type || '',
        'Note': pay.note || '',
      });
    }
  }
  paymentRows.sort((a, b) => new Date(a['Payment Date']) - new Date(b['Payment Date']));

  // Sheet 3: Supplier Balance
  const supplierMap = {};
  for (const p of purchases) {
    const name = p.supplier_name || 'Unknown';
    if (!supplierMap[name]) supplierMap[name] = { supplier: name, grandTotal: 0, totalPaid: 0, balance: 0 };
    supplierMap[name].grandTotal += fmt(p.grand_total_etb) || 0;
    supplierMap[name].totalPaid += fmt(p.total_paid_etb) || 0;
    supplierMap[name].balance += fmt(p.balance_etb) || 0;
  }
  const supplierRows = Object.values(supplierMap).map(s => ({
    'Supplier': s.supplier,
    'Total Grand Total ETB': s.grandTotal,
    'Total Paid ETB': s.totalPaid,
    'Balance ETB': s.balance,
  }));

  // Sheet 4: Warehouse Stock
  const warehouseRows = receipts.map(r => ({
    'Coffee Code': r.coffee_code || '',
    'Supplier': r.supplier_name || '',
    'GRN Code': r.grn_code || '',
    'Dispatch No': r.dispatch_no || '',
    'Received Date': fmtDate(r.received_date),
    'Net Dispatch KG': fmt(r.net_dispatch_weight_kg),
    'Warehouse Received KG': fmt(r.warehouse_received_net_kg),
    'Bags Received': fmt(r.bags_received),
    'Remark': r.remark || '',
  }));

  // Sheet 5: Processing Log
  const processingRows = processingLogs.map(p => ({
    'Date': fmtDate(p.date),
    'Supplier': p.supplier_name || '',
    'Coffee Type': p.coffee_type || '',
    'Coffee Code': p.coffee_code || '',
    'Batch No': p.batch_no || '',
    'Entry Type': p.entry_type || '',
    'Entry Mode': p.entry_mode || '',
    'Bags Sent': fmt(p.bags_sent),
    'KG Sent': fmt(p.kg_sent),
    'Actual Weighed KG': fmt(p.actual_weighed_kg),
    'Batch Variance KG': fmt(p.batch_variance_kg),
    'Buyer': p.buyer_name || '',
    'Remark': p.remark || '',
  }));

  // Sheet 6: Output Report
  const outputRows = outputReports.map(o => ({
    'Date': fmtDate(o.date),
    'Supplier': o.supplier_name || '',
    'Coffee Type': o.coffee_type || '',
    'Entry Type': o.entry_type || '',
    'Total KG Processed': fmt(o.total_kg_processed),
    'Export Bags': fmt(o.export_bags),
    'Export KG': fmt(o.export_kg),
    'Reject Bags': fmt(o.reject_bags),
    'Reject KG': fmt(o.reject_kg),
    'Waste KG': fmt(o.waste_kg),
    'Reject %': fmt(o.reject_pct),
    'Waste %': fmt(o.waste_pct),
    'Export Status': o.export_status || '',
    'Remark': o.remark || '',
  }));

  // Sheet 7: Activity Log (last 7 days)
  const activityRows = activityLogs
    .filter(a => new Date(a.created_date) >= since7d)
    .map(a => ({
      'Timestamp': fmtDate(a.created_date),
      'User': a.user_email || '',
      'Action': a.action_type || '',
      'Screen': a.screen_name || '',
      'Entity Type': a.entity_type || '',
      'Record': a.record_description || '',
      'Reason': a.reason || '',
    }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(purchaseRows), 'Purchase Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(paymentRows), 'Payments Report');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(supplierRows), 'Supplier Balance');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(warehouseRows), 'Warehouse Stock');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(processingRows), 'Processing Log');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(outputRows), 'Output Report');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(activityRows), 'Activity Log');

  const week = String(getWeekNumber(now)).padStart(2, '0');
  const yyyy = now.getFullYear();
  const filename = `KKGT-Weekly-Backup-Week${week}-${yyyy}.xlsx`;

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  return new Response(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
});