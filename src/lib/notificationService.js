import { base44 } from '@/api/supabaseClient';

/**
 * Central notification service.
 * - Deduplication: each event fires at most once per entity_id + type.
 * - Telegram: every in-app notification also sends to the Telegram group via
 *   the `send-telegram-message` Supabase Edge Function.
 */

async function getAllUsers() {
  try { return await base44.entities.User.list(); } catch { return []; }
}

function byRoles(users, roles) {
  return users.filter(u => roles.includes(u.role));
}

function uniqueById(users) {
  return [...new Map(users.map(u => [u.id, u])).values()];
}

/** Check if a notification of this type for this entity was already sent today */
async function alreadyFired(type, entityId) {
  if (!entityId) return false;
  try {
    const today = new Date().toISOString().slice(0, 10);
    // Check if any admin already has this notification (proxy for "was fired")
    const existing = await base44.entities.Notification.filter({ type, entity_id: entityId });
    // Only suppress if fired today
    return existing.some(n => n.created_date && n.created_date.slice(0, 10) === today);
  } catch { return false; }
}

/** Send Telegram message — fire-and-forget, never throws */
async function sendTelegram(message) {
  try {
    await base44.functions.invoke('send-telegram-message', { message });
  } catch { /* never block in-app notifications on Telegram failure */ }
}

async function createForUsers(users, payload, telegramMsg) {
  for (const u of users) {
    try {
      await base44.entities.Notification.create({
        recipient_email: u.email,
        is_read: false,
        ...payload,
      });
    } catch { /* ignore per-user failures */ }
  }
  if (telegramMsg) sendTelegram(telegramMsg);
}

// ─── Purchase Notifications ──────────────────────────────────────────────────

export async function notifyNewPurchase(record) {
  if (await alreadyFired('new_purchase', record.id)) return;
  const allUsers = await getAllUsers();
  const warehouseKeepers = byRoles(allUsers, ['warehouse_keeper']);
  const supervisors = byRoles(allUsers, ['admin', 'supervisor']);
  const tg = `📦 *New Purchase Registered*\n${record.supplier_name} — ${record.coffee_code || ''}\n${(record.net_dispatch_weight_kg || 0).toLocaleString()} KG dispatched`;

  await createForUsers(warehouseKeepers, {
    type: 'new_purchase',
    title: `📦 New Purchase — ${record.coffee_code || ''}`,
    message: `${record.supplier_name} | ${(record.net_dispatch_weight_kg || 0).toLocaleString()} KG dispatched. Prepare to receive delivery.`,
    link_path: '/purchase-registration',
    link_label: 'View Purchase',
    severity: 'info',
    entity_type: 'PurchaseRecord',
    entity_id: record.id,
  });

  await createForUsers(supervisors, {
    type: 'new_purchase_supervisor',
    title: `📦 New Purchase — ${record.supplier_name}`,
    message: `${(record.net_dispatch_weight_kg || 0).toLocaleString()} KG | Price: ${(record.unit_price_etb_per_feresula || 0).toLocaleString()} ETB/Feresula | GT: ${(record.grand_total_etb || 0).toLocaleString()} ETB`,
    link_path: '/purchase-registration',
    link_label: 'View Purchase',
    severity: 'info',
    entity_type: 'PurchaseRecord',
    entity_id: record.id,
  }, tg);
}

export async function notifyPaymentRecorded(record, payment) {
  const allUsers = await getAllUsers();
  const supervisors = byRoles(allUsers, ['admin', 'supervisor']);
  const amount = Number(payment.amount_etb || 0);
  const tg = `💰 *Payment Recorded*\n${record.supplier_name} — ${amount.toLocaleString()} ETB\nBank: ${payment.bank_name || '—'} | CPV: ${payment.cpv_reference || payment.reference_no || '—'}`;

  await createForUsers(supervisors, {
    type: 'payment_recorded',
    title: `💰 Payment — ${record.supplier_name}`,
    message: `${amount.toLocaleString()} ETB via ${payment.bank_name || '—'} (CPV: ${payment.cpv_reference || payment.reference_no || '—'})`,
    link_path: '/reports',
    link_label: 'View Payments',
    severity: 'info',
    entity_type: 'PurchaseRecord',
    entity_id: record.id,
  }, tg);
}

export async function notifyFullyPaid(record) {
  if (await alreadyFired('fully_paid', record.id)) return;
  const allUsers = await getAllUsers();
  const supervisors = byRoles(allUsers, ['admin', 'supervisor']);
  const tg = `✅ *Supplier Fully Paid*\n${record.supplier_name}\nTotal: ${(record.grand_total_etb || 0).toLocaleString()} ETB settled`;

  await createForUsers(supervisors, {
    type: 'fully_paid',
    title: `✅ ${record.supplier_name} Fully Paid`,
    message: `Total ${(record.grand_total_etb || 0).toLocaleString()} ETB fully settled.`,
    link_path: '/reports',
    link_label: 'Supplier Balance',
    severity: 'info',
    entity_type: 'PurchaseRecord',
    entity_id: record.id,
  }, tg);
}

// ─── Warehouse Notifications ─────────────────────────────────────────────────

export async function notifyWarehouseReceipt(receipt, shrinkage) {
  if (await alreadyFired('warehouse_confirmed', receipt.id)) return;
  const allUsers = await getAllUsers();
  const purchasers = byRoles(allUsers, ['purchaser', 'admin']);
  const supervisors = byRoles(allUsers, ['admin', 'supervisor']);
  const tg = `🏭 *Warehouse Receipt Confirmed*\n${receipt.supplier_name} — ${receipt.coffee_code || ''}\n${(receipt.warehouse_received_net_kg || 0).toLocaleString()} KG received | GRN: ${receipt.grn_code || '—'}`;

  await createForUsers(purchasers, {
    type: 'warehouse_confirmed',
    title: `✅ Warehouse Confirmed — ${receipt.coffee_code || ''}`,
    message: `${receipt.supplier_name} | ${(receipt.warehouse_received_net_kg || 0).toLocaleString()} KG received. GRN: ${receipt.grn_code || '—'}`,
    link_path: '/warehouse-receipt',
    link_label: 'View Receipt',
    severity: 'info',
    entity_type: 'WarehouseReceipt',
    entity_id: receipt.id,
  });

  await createForUsers(supervisors, {
    type: 'warehouse_receipt_supervisor',
    title: `🏭 Receipt Confirmed — ${receipt.supplier_name}`,
    message: `Received ${(receipt.warehouse_received_net_kg || 0).toLocaleString()} KG. Shrinkage: ${Math.abs(shrinkage).toLocaleString()} KG${shrinkage < 0 ? ' (loss)' : ' (gain)'}`,
    link_path: '/warehouse-receipt',
    link_label: 'View Receipt',
    severity: shrinkage < -500 ? 'warning' : 'info',
    entity_type: 'WarehouseReceipt',
    entity_id: receipt.id,
  }, tg);

  if (shrinkage < -500) {
    const shrinkTg = `⚠️ *Large Shrinkage Alert*\n${receipt.supplier_name}\n${Math.abs(shrinkage).toLocaleString()} KG difference — investigate!`;
    await createForUsers(supervisors, {
      type: 'large_shrinkage',
      title: `⚠️ Large Shrinkage — ${receipt.supplier_name}`,
      message: `${Math.abs(shrinkage).toLocaleString()} KG difference between dispatch and received.`,
      link_path: '/warehouse-receipt',
      link_label: 'View Receipt',
      severity: 'critical',
      entity_type: 'WarehouseReceipt',
      entity_id: receipt.id,
    }, shrinkTg);
  }
}

// ─── Stock Notifications ─────────────────────────────────────────────────────

export async function notifyLowStock(supplierName, remainingKg) {
  const allUsers = await getAllUsers();
  const warehouseKeepers = byRoles(allUsers, ['warehouse_keeper', 'admin']);
  const supervisors = byRoles(allUsers, ['admin', 'supervisor']);

  if (remainingKg <= 0) {
    const targets = uniqueById([...warehouseKeepers, ...supervisors]);
    const tg = `🔴 *Stock Empty*\n${supplierName} — 0 KG remaining. No more processing possible.`;
    await createForUsers(targets, {
      type: 'stock_empty',
      title: `🔴 Stock Empty — ${supplierName}`,
      message: `${supplierName} has 0 KG remaining. No more processing possible.`,
      link_path: '/stock-report',
      link_label: 'View Stock',
      severity: 'critical',
    }, tg);
  } else if (remainingKg < 500) {
    const tg = `⚠️ *Low Stock Warning*\n${supplierName} — only ${remainingKg.toLocaleString()} KG remaining`;
    await createForUsers(warehouseKeepers, {
      type: 'low_stock',
      title: `⚠️ Low Stock — ${supplierName}`,
      message: `${supplierName} has only ${remainingKg.toLocaleString()} KG remaining.`,
      link_path: '/stock-report',
      link_label: 'View Stock',
      severity: 'warning',
    }, tg);
  }
}

// ─── Output Report Notifications ─────────────────────────────────────────────

export async function notifyOutputReport(report) {
  if (await alreadyFired('output_report', report.id)) return;
  const allUsers = await getAllUsers();
  const supervisors = byRoles(allUsers, ['admin', 'supervisor']);
  const rejectPct = report.reject_pct || 0;
  const isHighReject = rejectPct > 25;
  const tg = `📊 *New Output Report*\n${report.supplier_name || ''} — ${(report.total_kg_processed || 0).toLocaleString()} KG processed\nExport: ${(report.export_kg || 0).toLocaleString()} KG | Reject: ${rejectPct.toFixed(1)}%`;

  await createForUsers(supervisors, {
    type: 'output_report',
    title: `📊 Output Report — ${report.supplier_name || report.date}`,
    message: `${(report.total_kg_processed || 0).toLocaleString()} KG processed. Export: ${(report.export_kg || 0).toLocaleString()} KG | Reject: ${rejectPct.toFixed(1)}%`,
    link_path: '/output-report',
    link_label: 'View Report',
    severity: isHighReject ? 'warning' : 'info',
    entity_type: 'OutputReport',
    entity_id: report.id,
  }, tg);

  if (isHighReject) {
    const rejectTg = `⚠️ *High Reject Rate*\n${report.supplier_name || ''} — ${rejectPct.toFixed(1)}% reject rate (above 25% threshold)`;
    await createForUsers(supervisors, {
      type: 'high_reject_rate',
      title: `⚠️ High Reject Rate — ${report.supplier_name || ''}`,
      message: `Reject rate is ${rejectPct.toFixed(1)}% — above the 25% threshold. Review quality.`,
      link_path: '/output-report',
      link_label: 'View Report',
      severity: 'critical',
      entity_type: 'OutputReport',
      entity_id: report.id,
    }, rejectTg);
  }
}

// ─── Export Contract Notifications ───────────────────────────────────────────

export async function notifyExportContract(contract) {
  if (await alreadyFired('export_contract', contract.id)) return;
  const allUsers = await getAllUsers();
  const supervisors = byRoles(allUsers, ['admin', 'supervisor', 'export_manager']);
  const profit = contract.total_profit_etb || contract.profit_etb || 0;
  const isNegative = profit < 0;
  const tg = `🚢 *New Export Contract*\n${contract.contract_no} — ${contract.destination_country}\nValue: $${(contract.total_export_value_usd || 0).toLocaleString()} | Profit: ${profit.toLocaleString()} ETB`;

  await createForUsers(supervisors, {
    type: 'export_contract',
    title: `🚢 Export Contract — ${contract.contract_no}`,
    message: `${contract.destination_country} | Value: $${(contract.total_export_value_usd || 0).toLocaleString()} | Profit: ${profit.toLocaleString()} ETB`,
    link_path: '/export-contracts',
    link_label: 'View Contract',
    severity: isNegative ? 'critical' : 'info',
    entity_type: 'ExportContract',
    entity_id: contract.id,
  }, tg);

  if (isNegative) {
    const negTg = `🔴 *Negative Profit Alert*\nContract ${contract.contract_no} — Loss of ${Math.abs(profit).toLocaleString()} ETB. Review costs.`;
    await createForUsers(supervisors, {
      type: 'negative_profit',
      title: `🔴 Negative Profit — ${contract.contract_no}`,
      message: `This contract will make a loss of ${Math.abs(profit).toLocaleString()} ETB. Review costs immediately.`,
      link_path: '/export-contracts',
      link_label: 'View Contract',
      severity: 'critical',
      entity_type: 'ExportContract',
      entity_id: contract.id,
    }, negTg);
  }
}