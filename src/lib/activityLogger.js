import { supabase } from '@/api/base44Client';
import { base44 } from '@/api/supabaseClient';

/**
 * Log an activity. Best-effort — failures should not block business actions.
 *
 * @param {object} params
 * @param {'Created'|'Edited'|'Archived'|'Restored'} params.action_type
 * @param {string} params.screen_name - e.g. "Purchase Registration"
 * @param {string} params.entity_type - e.g. "PurchaseRecord"
 * @param {string} [params.entity_id]
 * @param {string} [params.record_description]
 * @param {Array<{field:string,old_value:any,new_value:any}>} [params.changes]
 * @param {string} [params.reason]
 */
export async function logActivity({
  action_type,
  screen_name,
  entity_type,
  entity_id,
  record_description,
  changes,
  reason,
}) {
  try {
    const me = await base44.auth.me().catch(() => null);
    await base44.entities.ActivityLog.create({
      user_email: me?.email || 'unknown',
      action_type,
      screen_name,
      entity_type: entity_type || '',
      entity_id: entity_id || '',
      record_description: record_description || '',
      changes: changes && changes.length > 0 ? JSON.stringify(changes) : '',
      reason: reason || '',
    });
  } catch (err) {
    console.warn('[activityLogger] failed:', err?.message || err);
  }
}

/**
 * Compute a diff between two records, returning a list of changed fields.
 * Skips computed / system fields.
 */
const SKIP_FIELDS = new Set([
  'id', 'created_date', 'updated_date', 'created_by',
  'archived', 'archived_by', 'archived_at', 'archive_reason',
  'total_paid_etb', 'balance_etb', 'net_feresula', 'commission_etb',
  'total_purchase_price', 'grand_total_etb',
]);

export function diffRecords(oldRec, newRec) {
  if (!oldRec) return [];
  const fields = new Set([...Object.keys(oldRec || {}), ...Object.keys(newRec || {})]);
  const changes = [];
  fields.forEach(f => {
    if (SKIP_FIELDS.has(f)) return;
    const oldV = oldRec?.[f];
    const newV = newRec?.[f];
    const sameStr = JSON.stringify(oldV ?? null) === JSON.stringify(newV ?? null);
    if (!sameStr) changes.push({ field: f, old_value: oldV ?? null, new_value: newV ?? null });
  });
  return changes;
}
