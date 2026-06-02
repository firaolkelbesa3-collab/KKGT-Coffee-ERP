/**
 * Data consistency audit (KKGT Import Export).
 *
 * Pure functions that scan the app's records, re-run every calculation, and
 * return a flat list of issues so the team can verify the app instead of
 * eyeballing Excel. Each issue:
 *   { id, severity: 'critical'|'warning', category, entity, record, field?,
 *     message, expected?, actual? }
 *
 * Tolerances are generous (±1 ETB, ±0.01 KG) so floating-point rounding never
 * produces false positives — trust dies fast if the audit cries wolf.
 */

const FERESULA = 17;
const ETB_TOL = 1;
const KG_TOL = 0.05;

function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (v == null) return 0;
  // Strip thousands separators, currency, %, spaces — Excel exports are formatted.
  const cleaned = String(v).replace(/[^0-9.\-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}
function parseJsonArray(v) {
  if (Array.isArray(v)) return v;
  if (!v) return [];
  try { const a = JSON.parse(v); return Array.isArray(a) ? a : []; } catch { return []; }
}
function norm(s) {
  return (s ?? '').toString().trim().toLowerCase();
}
let _seq = 0;
function issue(severity, category, entity, record, message, extra = {}) {
  return { id: `iss_${++_seq}`, severity, category, entity, record, message, ...extra };
}

/**
 * @param {object} data — { purchaseRecords, receipts, suppliers, processingLogs,
 *                          outputReports, sampleLogs, exportContracts }
 * @returns {Array} issues
 */
export function runDataAudit(data) {
  _seq = 0;
  const {
    purchaseRecords = [],
    receipts = [],
    suppliers = [],
    outputReports = [],
  } = data;

  const issues = [];
  const active = (x) => x?.archived !== true;

  const supplierNames = new Set(suppliers.map(s => norm(s.supplier_name)));
  const purchaseByCode = {};
  purchaseRecords.forEach(p => { if (p.coffee_code) purchaseByCode[p.coffee_code] = p; });

  // ── Purchase records ──────────────────────────────────────────────────
  const seenCodes = {};
  purchaseRecords.filter(active).forEach(p => {
    const ref = p.coffee_code || `(no code, id ${String(p.id).slice(0, 8)})`;

    // Required fields
    if (!norm(p.supplier_name)) {
      issues.push(issue('critical', 'Missing data', 'Purchase', ref, 'Supplier name is empty'));
    }
    if (!p.purchase_date) {
      issues.push(issue('critical', 'Missing data', 'Purchase', ref, 'Purchase date is empty'));
    }

    // Duplicate coffee_code
    if (p.coffee_code) {
      seenCodes[p.coffee_code] = (seenCodes[p.coffee_code] || 0) + 1;
    }

    // Unknown supplier (used in a purchase but not in Master Data)
    if (norm(p.supplier_name) && !supplierNames.has(norm(p.supplier_name))) {
      issues.push(issue('warning', 'Unknown supplier', 'Purchase', ref,
        `Supplier "${p.supplier_name}" is not in Master Data`));
    }

    // Recompute net_feresula
    const expFeresula = num(p.net_dispatch_weight_kg) / FERESULA;
    if (p.net_feresula != null && Math.abs(num(p.net_feresula) - expFeresula) > KG_TOL) {
      issues.push(issue('warning', 'Calculation', 'Purchase', ref,
        'Net Feresula does not match dispatch ÷ 17', {
          field: 'net_feresula', expected: round(expFeresula, 3), actual: round(num(p.net_feresula), 3),
        }));
    }

    // Recompute grand_total (mirror the DB trigger: use received KG if present)
    const kg = num(p.warehouse_received_net_kg) > 0 ? num(p.warehouse_received_net_kg) : num(p.net_dispatch_weight_kg);
    const base = (kg / FERESULA) * num(p.unit_price_etb_per_feresula);
    const comm = base * num(p.commission_percent) / 100;
    const extra = parseJsonArray(p.additional_costs).reduce((s, c) => s + num(c.amount), 0);
    const expGrand = base + comm + extra;
    if (p.grand_total_etb != null && num(p.grand_total_etb) !== 0 &&
        Math.abs(num(p.grand_total_etb) - expGrand) > ETB_TOL) {
      issues.push(issue('critical', 'Calculation', 'Purchase', ref,
        'Grand Total does not match recomputed value', {
          field: 'grand_total_etb', expected: round(expGrand), actual: round(num(p.grand_total_etb)),
        }));
    }

    // Recompute total_paid from payment_history
    const payments = parseJsonArray(p.payment_history);
    const expPaid = payments.reduce((s, x) => s + num(x.amount_etb), 0);
    if (p.total_paid_etb != null && Math.abs(num(p.total_paid_etb) - expPaid) > ETB_TOL) {
      issues.push(issue('warning', 'Calculation', 'Purchase', ref,
        'Total Paid does not match sum of payments', {
          field: 'total_paid_etb', expected: round(expPaid), actual: round(num(p.total_paid_etb)),
        }));
    }

    // Recompute balance
    if (p.grand_total_etb != null && p.balance_etb != null) {
      const expBal = num(p.grand_total_etb) - expPaid;
      if (Math.abs(num(p.balance_etb) - expBal) > ETB_TOL) {
        issues.push(issue('critical', 'Calculation', 'Purchase', ref,
          'Balance does not match Grand Total − Total Paid', {
            field: 'balance_etb', expected: round(expBal), actual: round(num(p.balance_etb)),
          }));
      }
      // Overpayment
      if (expPaid - num(p.grand_total_etb) > ETB_TOL) {
        issues.push(issue('warning', 'Overpayment', 'Purchase', ref,
          `Paid ${round(expPaid)} ETB exceeds Grand Total ${round(num(p.grand_total_etb))} ETB`));
      }
    }
  });

  Object.entries(seenCodes).forEach(([code, count]) => {
    if (count > 1) {
      issues.push(issue('critical', 'Duplicate', 'Purchase', code,
        `Coffee code "${code}" appears ${count} times`));
    }
  });

  // ── Warehouse receipts ────────────────────────────────────────────────
  receipts.filter(active).forEach(r => {
    const ref = r.coffee_code || `(receipt ${String(r.id).slice(0, 8)})`;
    if (r.coffee_code && !purchaseByCode[r.coffee_code]) {
      issues.push(issue('warning', 'Orphan record', 'Warehouse Receipt', ref,
        `Receipt references coffee code "${r.coffee_code}" with no matching purchase`));
    }
    const recv = num(r.warehouse_received_net_kg);
    const disp = num(r.net_dispatch_weight_kg);
    if (recv <= 0) {
      issues.push(issue('warning', 'Missing data', 'Warehouse Receipt', ref, 'Received KG is zero or empty'));
    }
    if (disp > 0 && recv > disp * 1.02) {
      issues.push(issue('warning', 'Suspicious value', 'Warehouse Receipt', ref,
        `Received ${round(recv)} KG exceeds dispatched ${round(disp)} KG (gain in transit?)`));
    }
  });

  // ── Output reports ────────────────────────────────────────────────────
  outputReports.filter(active).forEach(o => {
    const ref = `${o.supplier_name || o.coffee_type || 'output'} ${o.end_date || o.start_date || ''}`.trim();
    const total = num(o.total_kg_processed);
    const exp = num(o.export_kg) || num(o.export_bags) * 60;
    const rej = num(o.reject_kg) || num(o.reject_bags) * 85;
    const waste = num(o.waste_kg);
    if (total > 0 && (exp + rej + waste) > total * 1.02) {
      issues.push(issue('critical', 'Over-allocation', 'Output Report', ref,
        'Export + reject + waste exceeds total processed', {
          expected: `≤ ${round(total)} KG`, actual: `${round(exp + rej + waste)} KG`,
        }));
    }
  });

  return issues;
}

function round(n, d = 0) {
  const f = Math.pow(10, d);
  return Math.round(num(n) * f) / f;
}

/** Group issues for summary display. */
export function summarize(issues) {
  const critical = issues.filter(i => i.severity === 'critical').length;
  const warning = issues.filter(i => i.severity === 'warning').length;
  const byCategory = {};
  issues.forEach(i => { byCategory[i.category] = (byCategory[i.category] || 0) + 1; });
  return { total: issues.length, critical, warning, byCategory };
}

// ===========================================================================
// Excel reconciliation
// ===========================================================================

/**
 * Compare uploaded Excel rows against app records, matched on a key column.
 *
 * @param {Array<object>} excelRows  — parsed Excel rows (header→value objects)
 * @param {Array<object>} appRecords — app records for the chosen entity
 * Supports composite keys (match on several columns) for entities without a
 * single unique field (Output Reports, Processing, etc.).
 *
 * @param {object} opts
 *   - keyExcelCols: Excel headers forming the match key (array)
 *   - keyAppFields: app fields forming the match key (array, same order)
 *   - compareCols:  [{ excelCol, appField, numeric }] value columns to compare
 *   - numericTol:   tolerance for numeric compares (default 1)
 * @returns {{ onlyInExcel, onlyInApp, mismatches, matched }}
 */
export function reconcileWithExcel(excelRows, appRecords, opts) {
  const { keyExcelCols = [], keyAppFields = [], compareCols = [], numericTol = 1 } = opts;

  // Build a composite key from several values (dates normalized to YYYY-MM-DD-ish).
  const compositeKey = (getter, cols) =>
    cols.map(c => normKeyPart(getter(c))).join('|');

  const appByKey = new Map();
  appRecords.forEach(r => {
    const k = compositeKey(f => r[f], keyAppFields);
    if (k.replace(/\|/g, '')) appByKey.set(k, r);
  });
  const excelByKey = new Map();
  excelRows.forEach(row => {
    const k = compositeKey(c => row[c], keyExcelCols);
    if (k.replace(/\|/g, '')) excelByKey.set(k, row);
  });

  const onlyInExcel = [];
  const onlyInApp = [];
  const mismatches = [];
  let matched = 0;

  const keyLabel = (getter, cols) => cols.map(c => getter(c) ?? '').filter(Boolean).join(' · ');

  for (const [k, row] of excelByKey) {
    const appRec = appByKey.get(k);
    if (!appRec) {
      onlyInExcel.push({ key: keyLabel(c => row[c], keyExcelCols), row });
      continue;
    }
    matched++;
    const fieldDiffs = [];
    for (const { excelCol, appField, numeric } of compareCols) {
      const ev = row[excelCol];
      const av = appRec[appField];
      const differs = numeric
        ? Math.abs(num(ev) - num(av)) > numericTol
        : norm(ev) !== norm(av);
      if (differs) fieldDiffs.push({ field: appField, excel: ev ?? '', app: av ?? '' });
    }
    if (fieldDiffs.length) {
      mismatches.push({ key: keyLabel(c => row[c], keyExcelCols), diffs: fieldDiffs });
    }
  }

  for (const [k, rec] of appByKey) {
    if (!excelByKey.has(k)) {
      onlyInApp.push({ key: keyLabel(f => rec[f], keyAppFields), record: rec });
    }
  }

  return { onlyInExcel, onlyInApp, mismatches, matched };
}

// Normalize a key part: dates → YYYY-MM-DD so '23/02/2026' and a Date match.
function normKeyPart(v) {
  if (v == null) return '';
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  // dd/mm/yyyy or d/m/yyyy
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  // yyyy-mm-dd (already) or ISO datetime
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  return s.toLowerCase();
}
