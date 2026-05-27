import { supabase } from '@/api/base44Client';
import { logActivity } from '@/lib/activityLogger';

/**
 * Build an archive patch (does NOT call entity update — caller does).
 */
async function archivePatch(reason) {
  const me = await base44.auth.me().catch(() => null);
  return {
    archived: true,
    archived_by: me?.email || 'unknown',
    archived_at: new Date().toISOString(),
    archive_reason: reason || '',
  };
}

function restorePatch() {
  return {
    archived: false,
    archived_by: '',
    archived_at: '',
    archive_reason: '',
  };
}

/**
 * Archive a single record with full activity logging.
 */
export async function archiveRecord({ entityName, record, screen_name, description, reason }) {
  const patch = await archivePatch(reason);
  await base44.entities[entityName].update(record.id, patch);
  await logActivity({
    action_type: 'Archived',
    screen_name,
    entity_type: entityName,
    entity_id: record.id,
    record_description: description,
    reason: reason || '',
  });
}

/**
 * Restore a single record with logging.
 *
 * If previousState is provided, ALL those fields are restored to their previous values.
 * This ensures a full restore of the record's data, not just the archive flags.
 *
 * For WarehouseReceipt, also restores the linked BagReceipt (cascade symmetric to archive).
 */
export async function restoreRecord({ entityName, record, screen_name, description, previousState }) {
  // Build the restore patch: clear archive flags + optionally restore all previous field values
  const patch = {
    ...restorePatch(),
    ...(previousState || {}),
    // Always override archive flags back to "not archived" regardless of previousState
    archived: false,
    archived_by: '',
    archived_at: '',
    archive_reason: '',
  };

  await base44.entities[entityName].update(record.id, patch);
  await logActivity({
    action_type: 'Restored',
    screen_name,
    entity_type: entityName,
    entity_id: record.id,
    record_description: description,
  });

  // Post-restore recalculations for WarehouseReceipt
  if (entityName === 'WarehouseReceipt' && previousState) {
    try {
      // Trigger purchase grand_total recalculation via backend function if linked
      const purchaseId = previousState.purchase_record_id || record.purchase_record_id;
      if (purchaseId) {
        await base44.functions.invoke('recalcPurchaseFromReceipt', {
          purchase_record_id: purchaseId,
          warehouse_received_net_kg: previousState.warehouse_received_net_kg ?? record.warehouse_received_net_kg,
        }).catch(() => {});
      }
    } catch (e) { /* best-effort */ }
  }

  // Cascade restore: WarehouseReceipt → linked BagReceipt
  if (entityName === 'WarehouseReceipt') {
    try {
      const linked = await base44.entities.BagReceipt.filter({ warehouse_receipt_id: record.id, archived: true });
      for (const bag of linked || []) {
        await base44.entities.BagReceipt.update(bag.id, restorePatch());
        await logActivity({
          action_type: 'Restored',
          screen_name,
          entity_type: 'BagReceipt',
          entity_id: bag.id,
          record_description: `Bag Receipt for ${bag.supplier_name} (cascade from warehouse receipt restore)`,
        });
      }
    } catch (e) { /* ignore */ }
  }
}

/**
 * Build "previous state" from an ActivityLog 'Edited' entry's changes array.
 * Returns an object with every changed field set to its old_value.
 */
export function buildPreviousStateFromChanges(changesJson) {
  if (!changesJson) return null;
  try {
    const changes = typeof changesJson === 'string' ? JSON.parse(changesJson) : changesJson;
    if (!Array.isArray(changes) || changes.length === 0) return null;
    const state = {};
    changes.forEach(c => {
      if (c.field) state[c.field] = c.old_value ?? null;
    });
    return Object.keys(state).length > 0 ? state : null;
  } catch { return null; }
}

/**
 * Count the records that would also be archived if the given purchase is archived.
 * Returns rich info for the confirmation dialog.
 */
export async function countPurchaseCascade(purchase) {
  const code = purchase?.coffee_code;
  const supplier = purchase?.supplier_name;

  const [receipts, processingLogs, sampleLogs, bagReceipts] = await Promise.all([
    code ? base44.entities.WarehouseReceipt.filter({ coffee_code: code, archived: false }) : Promise.resolve([]),
    code && supplier ? base44.entities.ProcessingLog.filter({ coffee_code: code, supplier_name: supplier, archived: false }) : Promise.resolve([]),
    code && supplier ? base44.entities.SampleLog.filter({ coffee_code: code, supplier_name: supplier, archived: false }) : Promise.resolve([]),
    code ? base44.entities.BagReceipt.filter({ archived: false }) : Promise.resolve([]),
  ]);

  // Filter bag receipts linked to these warehouse receipts
  const receiptIds = new Set(receipts.map(r => r.id));
  const linkedBagReceipts = bagReceipts.filter(b => b.warehouse_receipt_id && receiptIds.has(b.warehouse_receipt_id));

  let paymentCount = 0;
  let totalPaidEtb = 0;
  try {
    const arr = purchase?.payment_history ? JSON.parse(purchase.payment_history) : [];
    if (Array.isArray(arr)) {
      paymentCount = arr.length;
      totalPaidEtb = arr.reduce((s, p) => s + (parseFloat(p.amount_etb) || 0), 0);
    }
  } catch { /* ignore */ }

  const totalProcessingKg = processingLogs.reduce((s, p) => s + (p.actual_weighed_kg ?? p.kg_sent ?? 0), 0);
  const totalSampleKg = sampleLogs.reduce((s, p) => s + (p.sample_kg || 0), 0);
  const totalReceiptKg = receipts.reduce((s, r) => s + (r.warehouse_received_net_kg || 0), 0);
  const totalBags = linkedBagReceipts.reduce((s, b) => s + (b.bags_received || 0), 0);

  return {
    warehouseReceipts: receipts.length,
    payments: paymentCount,
    processingEntries: processingLogs.length,
    sampleEntries: sampleLogs.length,
    bagReceiptEntries: linkedBagReceipts.length,
    totalPaidEtb,
    totalProcessingKg,
    totalSampleKg,
    totalReceiptKg,
    totalBags,
    _records: { receipts, processingLogs, sampleLogs, linkedBagReceipts },
  };
}

/**
 * Count linked records for a Warehouse Receipt archive.
 */
export async function countWarehouseReceiptCascade(receipt) {
  const bagReceipts = receipt?.id
    ? await base44.entities.BagReceipt.filter({ warehouse_receipt_id: receipt.id, archived: false }).catch(() => [])
    : [];

  return {
    bagReceipts,
    totalBags: bagReceipts.reduce((s, b) => s + (b.bags_received || 0), 0),
  };
}

/**
 * Archive a purchase + cascade to all linked records.
 */
export async function archivePurchaseWithCascade({ purchase, reason }) {
  const cascade = await countPurchaseCascade(purchase);
  const patch = await archivePatch(reason);
  const desc = `Purchase ${purchase.coffee_code || purchase.id} - ${purchase.supplier_name || ''}`;

  // Archive the purchase itself
  await base44.entities.PurchaseRecord.update(purchase.id, patch);
  await logActivity({
    action_type: 'Archived',
    screen_name: 'Purchase Registration',
    entity_type: 'PurchaseRecord',
    entity_id: purchase.id,
    record_description: desc,
    reason: reason || '',
  });

  // Cascade — warehouse receipts
  for (const r of cascade._records.receipts) {
    await base44.entities.WarehouseReceipt.update(r.id, patch);
    await logActivity({
      action_type: 'Archived',
      screen_name: 'Purchase Registration',
      entity_type: 'WarehouseReceipt',
      entity_id: r.id,
      record_description: `Warehouse Receipt ${r.grn_code || r.coffee_code || r.id} (cascade)`,
      reason: `Cascade from purchase ${purchase.coffee_code || purchase.id}`,
    });
  }
  // Cascade — bag receipts linked to those warehouse receipts
  for (const b of cascade._records.linkedBagReceipts) {
    await base44.entities.BagReceipt.update(b.id, patch);
  }
  // Cascade — processing logs
  for (const p of cascade._records.processingLogs) {
    await base44.entities.ProcessingLog.update(p.id, patch);
    await logActivity({
      action_type: 'Archived',
      screen_name: 'Purchase Registration',
      entity_type: 'ProcessingLog',
      entity_id: p.id,
      record_description: `Processing entry ${p.batch_no || p.date} (cascade)`,
      reason: `Cascade from purchase ${purchase.coffee_code || purchase.id}`,
    });
  }
  // Cascade — sample logs
  for (const s of cascade._records.sampleLogs) {
    await base44.entities.SampleLog.update(s.id, patch);
    await logActivity({
      action_type: 'Archived',
      screen_name: 'Purchase Registration',
      entity_type: 'SampleLog',
      entity_id: s.id,
      record_description: `Sample log ${s.sample_date || s.id} (cascade)`,
      reason: `Cascade from purchase ${purchase.coffee_code || purchase.id}`,
    });
  }

  return cascade;
}