/**
 * Central utility for computing per-supplier Available KG.
 *
 * Formula (enforced everywhere):
 *   Received KG   = SUM(warehouse_received_net_kg)
 *                  from active non-archived WarehouseReceipts
 *                  whose linked PurchaseRecord is also active + non-archived
 *
 *   Samples KG    = SUM(sample_kg) from active non-archived SampleLog entries
 *                  for that supplier (Warehouse-type only)
 *
 *   Processing KG = SUM(actual_weighed_kg ?? kg_sent) from active non-archived
 *                  ProcessingLog entries for that supplier (Standard only, not Recleaning)
 *
 *   Available KG  = Received KG − Samples KG − Processing KG
 *                  (never show negative — clamped to 0)
 *
 * Returns a map: { [supplierName]: { netCoffeeKg, samplesKg, processedKg, availableKg } }
 */
export function computeAvailabilityBySupplier({ receipts = [], purchases = [], sampleLogs = [], processingLogs = [] }) {
  const notArchived = (x) => x?.archived !== true;

  // Build a set of active (non-archived) purchase coffee_codes + ids
  const activePurchaseCodes = new Set();
  const activePurchaseIds = new Set();
  purchases.filter(notArchived).forEach(p => {
    if (p.coffee_code) activePurchaseCodes.add(p.coffee_code);
    if (p.id) activePurchaseIds.add(p.id);
  });

  // Build purchase lookup maps for receipt → supplier resolution fallback
  const purchaseById = {};
  const purchaseByCode = {};
  purchases.filter(notArchived).forEach(p => {
    if (p.id) purchaseById[p.id] = p;
    if (p.coffee_code) purchaseByCode[p.coffee_code] = p;
  });

  const resolveSupplier = (r) =>
    r.supplier_name ||
    (r.purchase_record_id && purchaseById[r.purchase_record_id]?.supplier_name) ||
    (r.coffee_code && purchaseByCode[r.coffee_code]?.supplier_name) ||
    null;

  // --- Net Coffee KG per supplier ---
  const netCoffeeMap = {};
  receipts.filter(notArchived).forEach(r => {
    // Exclude receipts whose linked purchase is archived (orphaned or cascade-archived)
    const linkedPurchaseActive =
      !r.coffee_code && !r.purchase_record_id  // no link — include (manual receipts)
      || (r.purchase_record_id && activePurchaseIds.has(r.purchase_record_id))
      || (r.coffee_code && activePurchaseCodes.has(r.coffee_code));
    if (!linkedPurchaseActive) return;

    const name = resolveSupplier(r);
    if (!name) return;

    const grossKg = r.warehouse_received_net_kg || 0;
    netCoffeeMap[name] = (netCoffeeMap[name] || 0) + grossKg;
  });

  // --- Samples KG per supplier (Warehouse-type only) ---
  const samplesMap = {};
  sampleLogs.filter(notArchived).forEach(s => {
    if (s.supplier_name && (!s.sample_type || s.sample_type === 'Warehouse')) {
      samplesMap[s.supplier_name] = (samplesMap[s.supplier_name] || 0) + (s.sample_kg || 0);
    }
  });

  // --- Processing KG per supplier (Standard only, use actual_weighed_kg with fallback to kg_sent) ---
  const procMap = {};
  processingLogs.filter(notArchived).forEach(p => {
    if (p.supplier_name && p.entry_type !== 'Recleaning') {
      procMap[p.supplier_name] = (procMap[p.supplier_name] || 0) + (p.actual_weighed_kg ?? p.kg_sent ?? 0);
    }
  });

  // --- Build result map for every supplier that has at least a receipt ---
  const allNames = new Set([
    ...Object.keys(netCoffeeMap),
    ...Object.keys(samplesMap),
    ...Object.keys(procMap),
  ]);

  const result = {};
  allNames.forEach(name => {
    const netCoffeeKg = netCoffeeMap[name] || 0;
    const samplesKg = samplesMap[name] || 0;
    const processedKg = procMap[name] || 0;
    const availableKg = Math.max(0, netCoffeeKg - samplesKg - processedKg);
    result[name] = { netCoffeeKg, samplesKg, processedKg, availableKg };
  });

  return result;
}