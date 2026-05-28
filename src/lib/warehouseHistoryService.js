import { supabase } from '@/api/base44Client';
import { logActivity } from '@/lib/activityLogger';
import { base44 } from '@/api/supabaseClient';

const TRACKED_FIELDS = [
  { key: 'warehouse_received_net_kg', label: 'Warehouse Received KG' },
  { key: 'grn_code',                  label: 'GRN Code' },
  { key: 'dispatch_no',               label: 'Dispatch No' },
  { key: 'received_date',             label: 'Received Date' },
  { key: 'bags_received',             label: 'Bags Received' },
  { key: 'remark',                    label: 'Remark' },
  { key: 'coffee_code',               label: 'Coffee Code' },
  { key: 'supplier_name',             label: 'Supplier' },
  { key: 'net_dispatch_weight_kg',    label: 'Net Dispatch KG' },
];

export function diffReceiptFields(oldRec, newRec) {
  const changes = [];
  TRACKED_FIELDS.forEach(({ key, label }) => {
    const ov = oldRec?.[key] ?? null;
    const nv = newRec?.[key] ?? null;
    if (JSON.stringify(ov) !== JSON.stringify(nv)) {
      changes.push({ field: key, label, old_value: ov, new_value: nv });
    }
  });
  // Auto-compute shrinkage change if warehouse_received_net_kg changed
  const oldWh = Number(oldRec?.warehouse_received_net_kg) || 0;
  const newWh = Number(newRec?.warehouse_received_net_kg) || 0;
  const dispatch = Number(newRec?.net_dispatch_weight_kg || oldRec?.net_dispatch_weight_kg) || 0;
  if (oldWh !== newWh && dispatch) {
    changes.push({
      field: 'shrinkage_kg',
      label: 'Shrinkage KG',
      old_value: oldWh - dispatch,
      new_value: newWh - dispatch,
    });
  }
  return changes;
}

export async function saveReceiptHistory({ action_type, receipt, oldReceipt = null, reason = '' }) {
  try {
    const me = await base44.auth.me().catch(() => null);
    const now = new Date().toISOString();

    let changes = [];
    if (action_type === 'Created') {
      // Record all initial field values
      changes = TRACKED_FIELDS
        .filter(({ key }) => receipt[key] != null && receipt[key] !== '')
        .map(({ key, label }) => ({ field: key, label, old_value: null, new_value: receipt[key] }));
      // Add shrinkage if applicable
      const wh = Number(receipt.warehouse_received_net_kg) || 0;
      const dis = Number(receipt.net_dispatch_weight_kg) || 0;
      if (wh && dis) changes.push({ field: 'shrinkage_kg', label: 'Shrinkage KG', old_value: null, new_value: wh - dis });
    } else if (action_type === 'Edited' && oldReceipt) {
      changes = diffReceiptFields(oldReceipt, receipt);
    }

    // Build KG impact if warehouse KG changed
    let kg_impact = null;
    const oldWh = Number(oldReceipt?.warehouse_received_net_kg) || 0;
    const newWh = Number(receipt?.warehouse_received_net_kg) || 0;
    if (action_type === 'Edited' && oldWh !== newWh) {
      const diff = newWh - oldWh;
      kg_impact = JSON.stringify({ old_kg: oldWh, new_kg: newWh, diff });
    }

    await base44.entities.WarehouseReceiptHistory.create({
      receipt_id: receipt.id,
      coffee_code: receipt.coffee_code || '',
      supplier_name: receipt.supplier_name || '',
      grn_code: receipt.grn_code || '',
      action_type,
      user_email: me?.email || 'unknown',
      user_name: me?.full_name || me?.email || 'unknown',
      user_role: me?.role || '',
      action_at: now,
      changes: JSON.stringify(changes),
      reason: reason || '',
      kg_impact: kg_impact || '',
    });

    // Also log to main ActivityLog
    await logActivity({
      action_type,
      screen_name: 'Warehouse Receipt',
      entity_type: 'WarehouseReceipt',
      entity_id: receipt.id,
      record_description: `Warehouse Receipt ${receipt.grn_code || receipt.coffee_code || receipt.id} — ${receipt.supplier_name || ''}`,
      changes: changes.map(c => ({ field: c.label, old_value: c.old_value, new_value: c.new_value })),
      reason: reason || '',
    });
  } catch (err) {
    console.warn('[warehouseHistoryService] failed:', err?.message || err);
  }
}
