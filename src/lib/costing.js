/**
 * Costing engine — Supplier + Season Weighted Average Cost (WAC).
 *
 * The money flow at KKGT:
 *   Purchase (per supplier, per lot, has cost)
 *     → Processing (records SUPPLIER + raw KG sent)
 *       → Output Report (per coffee TYPE: export KG + reject KG)
 *         → Export Contract (per coffee TYPE, draws export KG from the pool)
 *
 * So we cost in three rolls:
 *   1. Per supplier+season: raw landed cost / received KG  (their own WAC)
 *   2. Roll those up through PROCESSING into a coffee-type+season pool,
 *      weighted by how much of each supplier was actually processed.
 *   3. Apply yield + reject credit → cost per EXPORT kg → contract COGS.
 *
 * This means expensive unprocessed stock never distorts the cost of what was
 * actually sold, and each supplier's real price is honoured.
 */

// Ethiopian coffee export season: Oct 1 → Sep 30. e.g. Nov 2025 → "2025/26".
export function seasonOf(dateStr) {
  if (!dateStr) return 'Unknown';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'Unknown';
  const y = d.getFullYear();
  const startYear = d.getMonth() >= 9 ? y : y - 1;
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`;
}

const num = (v) => { const n = Number(v); return isNaN(n) ? 0 : n; };
const KEY = (type, season) => `${type || 'Unspecified'}__${season}`;

/**
 * @returns {{
 *   byTypeSeason: Object,   // KEY(type,season) -> costing detail
 *   bySupplierSeason: Object, // `${supplier}__${season}` -> { cost, kg, costPerKg }
 *   list: Array,           // flattened byTypeSeason for tables
 * }}
 */
export function computeCosting({ purchases = [], processingLogs = [], outputReports = [], contracts = [] }) {
  // ── 1. Supplier + season raw landed cost per KG ──────────────────────────
  const sup = {};
  purchases.forEach(p => {
    if (p.archived) return;
    const season = seasonOf(p.purchase_date);
    const k = `${(p.supplier_name || '').trim()}__${season}`;
    const kg = num(p.warehouse_received_net_kg) || num(p.net_dispatch_weight_kg);
    (sup[k] = sup[k] || { supplier: (p.supplier_name || '').trim(), season, cost: 0, kg: 0 });
    sup[k].cost += num(p.grand_total_etb);
    sup[k].kg += kg;
  });
  // supplier all-season fallback (in case processing season ≠ purchase season)
  const supAll = {};
  Object.values(sup).forEach(s => {
    (supAll[s.supplier] = supAll[s.supplier] || { cost: 0, kg: 0 });
    supAll[s.supplier].cost += s.cost;
    supAll[s.supplier].kg += s.kg;
  });
  const bySupplierSeason = {};
  Object.entries(sup).forEach(([k, s]) => {
    bySupplierSeason[k] = { ...s, costPerKg: s.kg > 0 ? s.cost / s.kg : 0 };
  });
  const supplierCostPerKg = (supplier, season) => {
    const name = (supplier || '').trim();
    const exact = bySupplierSeason[`${name}__${season}`];
    if (exact && exact.kg > 0) return exact.costPerKg;
    const all = supAll[name];
    return all && all.kg > 0 ? all.cost / all.kg : 0;
  };

  // ── 2. Roll supplier cost through processing into type+season pools ───────
  const pool = {}; // KEY -> { processedCost, processedKg, suppliers:{} }
  processingLogs.forEach(pl => {
    if (pl.archived) return;
    const season = seasonOf(pl.date);
    const type = pl.coffee_type || 'Unspecified';
    const k = KEY(type, season);
    const kg = num(pl.actual_weighed_kg) || num(pl.kg_sent);
    if (kg <= 0) return;
    const cpk = supplierCostPerKg(pl.supplier_name, season);
    (pool[k] = pool[k] || { type, season, processedCost: 0, processedKg: 0, suppliers: {} });
    pool[k].processedCost += kg * cpk;
    pool[k].processedKg += kg;
    const sname = (pl.supplier_name || '—').trim();
    (pool[k].suppliers[sname] = pool[k].suppliers[sname] || { kg: 0, costPerKg: cpk });
    pool[k].suppliers[sname].kg += kg;
  });

  // ── 3. Output (export/reject KG produced) per type+season ────────────────
  const out = {};
  outputReports.forEach(o => {
    if (o.archived) return;
    const season = seasonOf(o.end_date || o.start_date || o.date);
    const type = o.coffee_type || 'Unspecified';
    const k = KEY(type, season);
    (out[k] = out[k] || { exportKg: 0, rejectKg: 0, totalProcessed: 0 });
    out[k].exportKg += num(o.export_kg) || num(o.export_bags) * 60;
    out[k].rejectKg += num(o.reject_kg) || num(o.reject_bags) * 85;
    out[k].totalProcessed += num(o.total_kg_processed);
  });

  // ── 4. Reject sales (to derive reject price) per type+season ─────────────
  const rej = {};
  contracts.forEach(c => {
    if (c.archived) return;
    const season = seasonOf(c.contract_date || c.export_date);
    const type = c.coffee_type || c.commodity || 'Unspecified';
    const k = KEY(type, season);
    (rej[k] = rej[k] || { rejectSales: 0 });
    rej[k].rejectSales += num(c.total_reject_sales_etb) || num(c.reject_sales_etb);
  });

  // ── 5. Combine → cost per export KG per type+season ──────────────────────
  const byTypeSeason = {};
  const keys = new Set([...Object.keys(pool), ...Object.keys(out)]);
  keys.forEach(k => {
    const p = pool[k] || { type: k.split('__')[0], season: k.split('__')[1], processedCost: 0, processedKg: 0, suppliers: {} };
    const o = out[k] || { exportKg: 0, rejectKg: 0, totalProcessed: 0 };
    const r = rej[k] || { rejectSales: 0 };

    const rejectPricePerKg = (o.rejectKg > 0 && r.rejectSales > 0) ? r.rejectSales / o.rejectKg : 0;
    const rejectCredit = o.rejectKg * rejectPricePerKg;
    const netCost = p.processedCost - rejectCredit;
    const costPerExportKg = o.exportKg > 0 ? netCost / o.exportKg : null;
    const rawCostPerKg = p.processedKg > 0 ? p.processedCost / p.processedKg : 0;
    const yieldPct = o.totalProcessed > 0 ? (o.exportKg / o.totalProcessed) * 100 : null;

    byTypeSeason[k] = {
      type: p.type, season: p.season,
      processedCost: p.processedCost, processedKg: p.processedKg, rawCostPerKg,
      exportKg: o.exportKg, rejectKg: o.rejectKg, totalProcessed: o.totalProcessed, yieldPct,
      rejectSales: r.rejectSales, rejectPricePerKg, rejectCredit, rejectDerived: rejectPricePerKg > 0,
      netCost, costPerExportKg,
      suppliers: Object.entries(p.suppliers).map(([name, v]) => ({ name, kg: v.kg, costPerKg: v.costPerKg }))
        .sort((a, b) => b.kg - a.kg),
    };
  });

  const list = Object.values(byTypeSeason).sort((a, b) =>
    a.season === b.season ? a.type.localeCompare(b.type) : b.season.localeCompare(a.season));

  return { byTypeSeason, bySupplierSeason, list };
}

/** Cost a single contract from the costing map. */
export function costForContract(contract, costing) {
  const season = seasonOf(contract.contract_date || contract.export_date);
  const type = contract.coffee_type || contract.commodity || 'Unspecified';
  const entry = costing?.byTypeSeason?.[KEY(type, season)];
  const exportKg = num(contract.export_kg);
  if (!entry || entry.costPerExportKg == null) {
    return { season, type, costPerExportKg: null, cogs: null, available: false, entry: entry || null };
  }
  return {
    season, type,
    costPerExportKg: entry.costPerExportKg,
    cogs: exportKg * entry.costPerExportKg,
    available: true,
    entry,
  };
}
