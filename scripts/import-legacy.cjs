// Legacy data importer for KKGT Import Export.
// Reads staging files + backup Excel and inserts into the NEW Supabase project
// using the service_role key.  Run a sub-step:
//   node scripts/import-legacy.cjs suppliers
//   node scripts/import-legacy.cjs purchases   (etc.)
const fs = require('fs');
const XLSX = require('xlsx');

const env = fs.readFileSync('.env.local', 'utf8');
const URL = env.match(/VITE_SUPABASE_URL=(.+)/)[1].trim();
const SVC = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim();
const STAGE = 'D:/download/import-staging';
const BACKUP = 'D:/download/kkgt-backup-extracted';
const nameMap = JSON.parse(fs.readFileSync(`${STAGE}/nameMap.json`, 'utf8'));

const fixName = (n) => {
  if (n == null) return n;
  const t = String(n).trim();
  return nameMap[t] || nameMap[t.toLowerCase()] || t;
};

async function insertBatch(table, rows) {
  if (!rows.length) return;
  const r = await fetch(`${URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: SVC, Authorization: `Bearer ${SVC}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!r.ok) {
    const txt = await r.text();
    // Self-heal: if a column doesn't exist on this table, strip it and retry.
    const m = txt.match(/Could not find the '([^']+)' column/);
    if (m) {
      const col = m[1];
      console.log(`  (stripping unknown column "${col}" and retrying)`);
      rows.forEach(row => { delete row[col]; });
      return insertBatch(table, rows);
    }
    throw new Error(`${table} insert failed (${r.status}): ${txt.slice(0, 500)}`);
  }
}

async function patchByCode(table, code, patch) {
  const r = await fetch(`${URL}/rest/v1/${table}?coffee_code=eq.${encodeURIComponent(code)}`, {
    method: 'PATCH',
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(`patch ${table} ${code} failed: ${(await r.text()).slice(0, 200)}`);
}

async function countTable(table) {
  const r = await fetch(`${URL}/rest/v1/${table}?select=id`, {
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, Prefer: 'count=exact', Range: '0-0' },
  });
  return r.headers.get('content-range')?.split('/')?.[1] ?? '?';
}

function readSheet(file) {
  const wb = XLSX.readFile(`${BACKUP}/${file}`);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
  let hdr = 0;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    if ((rows[i] || []).filter(c => c != null && c !== '').length >= 3) { hdr = i; break; }
  }
  const headers = rows[hdr].map(h => String(h).trim());
  return rows.slice(hdr + 1)
    .filter(r => r.some(c => c != null && c !== ''))
    .map(r => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
}

const toNum = (v) => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
};
function toISO(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
async function suppliers() {
  const data = JSON.parse(fs.readFileSync(`${STAGE}/suppliers.json`, 'utf8'));
  const seen = new Set();
  const rows = [];
  for (const s of data) {
    const key = s.supplier_name.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ ...s, supplier_name: s.supplier_name.trim() });
  }
  console.log(`Inserting ${rows.length} suppliers...`);
  await insertBatch('suppliers', rows);
  console.log(`✓ suppliers in DB now: ${await countTable('suppliers')}`);
}

async function purchases() {
  // Pull supplier name → agent/coffee_type/region map from the DB to enrich.
  const sr = await fetch(`${URL}/rest/v1/suppliers?select=supplier_name,agent,coffee_type,region&limit=1000`,
    { headers: { apikey: SVC, Authorization: `Bearer ${SVC}` } });
  const sup = await sr.json();
  const supMap = {};
  sup.forEach(s => { supMap[s.supplier_name.trim().toLowerCase()] = s; });

  const P = readSheet('1_Purchase_Summary.xlsx');
  const PAY = readSheet('2_Payments_Report.xlsx');
  const byCode = {};
  PAY.forEach(p => {
    const c = (p['Coffee Code'] || '').trim();
    (byCode[c] = byCode[c] || []).push({
      amount_etb: toNum(p['Amount ETB']),
      payment_date: toISO(p['Date']),
      bank_name: p['Bank'] || '',
      branch_account: p['Branch/Account'] || '',
      cpv_reference: String(p['CPV Ref'] || '').replace(/^CPV-/i, ''),
      payment_type: p['Type'] || '',
      note: p['Note'] || '',
    });
  });

  const rows = P.map(p => {
    const code = (p['Coffee Code'] || '').trim();
    const supplier = fixName(p['Supplier']);
    const s = supMap[String(supplier).toLowerCase()] || {};
    return {
      coffee_code: code,
      purchase_date: toISO(p['Date']),
      supplier_name: supplier,
      region: p['Region'] || s.region || null,
      agent: s.agent || null,
      coffee_type: s.coffee_type || null,
      net_dispatch_weight_kg: toNum(p['Net KG']),
      warehouse_received_net_kg: toNum(p['Net KG']),
      unit_price_etb_per_feresula: toNum(p['Unit Price']),
      commission_percent: toNum(p['Commission %']) || 0,
      additional_costs: [],
      payment_history: byCode[code] || [],
      grand_total_etb: toNum(p['Grand Total ETB']),
      // total_paid_etb / balance_etb are computed by the pr_recompute_totals trigger
    };
  });
  console.log(`Inserting ${rows.length} purchases (with embedded payments)...`);
  await insertBatch('purchase_records', rows);
  console.log(`✓ purchase_records in DB now: ${await countTable('purchase_records')}`);

  // Verify the trigger reproduced the report balances.
  const vr = await fetch(`${URL}/rest/v1/purchase_records?select=coffee_code,grand_total_etb,total_paid_etb,balance_etb&limit=1000`,
    { headers: { apikey: SVC, Authorization: `Bearer ${SVC}` } });
  const got = await vr.json();
  const gPaid = got.reduce((a, r) => a + (Number(r.total_paid_etb) || 0), 0);
  const gBal = got.reduce((a, r) => a + (Number(r.balance_etb) || 0), 0);
  console.log(`  DB totals → Paid: ${gPaid.toLocaleString()} | Balance: ${gBal.toLocaleString()}`);
  console.log(`  Expected  → Paid: 466,090,018.41 | Balance: 109,517,126.47`);
}

async function receipts() {
  const W = readSheet('4_Warehouse_Stock.xlsx');
  // map coffee_code -> purchase id
  const pr = await fetch(`${URL}/rest/v1/purchase_records?select=id,coffee_code,grand_total_etb&limit=1000`,
    { headers: { apikey: SVC, Authorization: `Bearer ${SVC}` } });
  const purchases = await pr.json();
  const idByCode = {};
  purchases.forEach(p => { idByCode[p.coffee_code] = p.id; });

  const rows = W.map(w => {
    const code = (w['Coffee Code'] || '').trim();
    return {
      coffee_code: code,
      purchase_record_id: idByCode[code] || null,
      supplier_name: fixName(w['Supplier']),
      net_dispatch_weight_kg: toNum(w['Net Dispatch KG']),
      warehouse_received_net_kg: toNum(w['Received KG']),
      bags_received: toNum(w['Bags Received']),
      grn_code: w['GRN Code'] != null ? String(w['GRN Code']) : null,
      dispatch_no: w['Dispatch No'] != null ? String(w['Dispatch No']) : null,
      received_date: toISO(w['Date']),
    };
  });
  console.log(`Inserting ${rows.length} warehouse receipts...`);
  await insertBatch('warehouse_receipts', rows);
  console.log(`✓ warehouse_receipts in DB now: ${await countTable('warehouse_receipts')}`);

  // The wr_recalc trigger may have recomputed grand_total from received KG
  // (without the original additional-costs). Restore the exact backup grand
  // totals so balances stay correct; the BEFORE-update trigger re-derives balance.
  const P = readSheet('1_Purchase_Summary.xlsx');
  console.log('Restoring exact grand totals from backup...');
  for (const p of P) {
    const code = (p['Coffee Code'] || '').trim();
    await patchByCode('purchase_records', code, { grand_total_etb: toNum(p['Grand Total ETB']) });
  }
  const vr = await fetch(`${URL}/rest/v1/purchase_records?select=balance_etb&limit=1000`,
    { headers: { apikey: SVC, Authorization: `Bearer ${SVC}` } });
  const got = await vr.json();
  const gBal = got.reduce((a, r) => a + (Number(r.balance_etb) || 0), 0);
  console.log(`  DB balance after restore: ${gBal.toLocaleString()} (expected ~109,517,126)`);
}

async function processing() {
  const PR = readSheet('5_Processing_Log.xlsx');
  const rows = PR.map(r => ({
    entry_type: (r['Type'] || 'Standard').trim(),
    date: toISO(r['Date']),
    supplier_name: fixName(r['Supplier / Buyer']),
    coffee_type: r['Coffee Type'] || null,
    batch_no: r['Batch No'] ? String(r['Batch No']) : null,
    bags_sent: toNum(r['Bags Sent']),
    kg_sent: toNum(r['KG Sent']),
    actual_weighed_kg: toNum(r['Actual Weighed KG']),
    batch_variance_kg: toNum(r['Variance KG']),
    remark: r['Remark'] || null,
  }));
  console.log(`Inserting ${rows.length} processing logs...`);
  await insertBatch('processing_logs', rows);
  console.log(`✓ processing_logs in DB now: ${await countTable('processing_logs')}`);
}

async function output() {
  const O = readSheet('6_Output_Report.xlsx');
  const rows = O.map(r => ({
    entry_type: (r['Type'] || 'Standard').trim(),
    start_date: toISO(r['Date']),
    end_date: toISO(r['Date']),
    supplier_name: r['Supplier'] ? fixName(r['Supplier']) : null,
    coffee_type: r['Coffee Type'] || null,
    total_kg_processed: toNum(r['Total KG Processed']),
    export_bags: toNum(r['Export Bags']),
    reject_bags: toNum(r['Reject Bags']),
    waste_kg: toNum(r['Waste KG']),
    registrar_name: r['Registrar'] ? String(r['Registrar']).trim() : null,
    // export_kg & reject_kg are GENERATED columns — do not insert.
  }));
  console.log(`Inserting ${rows.length} output reports...`);
  await insertBatch('output_reports', rows);
  console.log(`✓ output_reports in DB now: ${await countTable('output_reports')}`);
}

async function samples() {
  const data = JSON.parse(fs.readFileSync(`${STAGE}/sample_logs.json`, 'utf8'));
  const rows = data.map(s => ({ ...s, supplier_name: fixName(s.supplier_name) }));
  console.log(`Inserting ${rows.length} sample logs...`);
  await insertBatch('sample_logs', rows);
  console.log(`✓ sample_logs in DB now: ${await countTable('sample_logs')}`);
}

async function contracts() {
  const data = JSON.parse(fs.readFileSync(`${STAGE}/export_contracts.json`, 'utf8'));
  const rows = data.map(c => {
    const exportSales = c.total_export_value_etb || 0;
    const reject = c.total_reject_sales_etb || 0;
    const costs = c.total_costs_etb || 0;
    const grand = exportSales + reject;
    const profit = grand - costs;
    return {
      contract_no: c.contract_no,
      contract_pi_number: c.contract_pi_number,
      contract_date: toISO(c.contract_date),
      coffee_type: c.coffee_type,
      destination_country: c.destination_country,
      export_kg: c.export_kg,
      total_export_value_usd: c.total_export_value_usd,
      contract_rate_etb: c.contract_rate_etb,
      rate_status: 'Rate Confirmed',
      price_per_kg_usd: c.export_kg ? +(c.total_export_value_usd / c.export_kg).toFixed(4) : null,
      total_export_value_etb: exportSales,
      total_reject_sales_etb: reject,
      total_costs_etb: costs,
      grand_total_revenue_etb: grand,
      profit_etb: profit,
      profit_margin_pct: grand ? +((profit / grand) * 100).toFixed(4) : null,
      payment_history: [],
      status: 'Completed',
    };
  });
  console.log(`Inserting ${rows.length} export contracts...`);
  await insertBatch('export_contracts', rows);
  console.log(`✓ export_contracts in DB now: ${await countTable('export_contracts')}`);
  const tot = rows.reduce((a, r) => a + r.profit_etb, 0);
  console.log(`  Total reconstructed profit: ${tot.toLocaleString()} ETB`);
}

async function materials() {
  const data = JSON.parse(fs.readFileSync(`${STAGE}/materials.json`, 'utf8'));
  const parseDate = (s) => {
    const d = new Date(s);
    return isNaN(d) ? null : d.toISOString().slice(0, 10);
  };
  const rows = data.map(m => {
    const isGreen = /green\s*pro/i.test(m.item_name);
    const sizeMatch = (m.item_name.match(/(30|50|60)\s*kg/i) || [])[1];
    return {
      category: 'export',
      date: parseDate(m.date),
      item_type: isGreen ? 'Green Pro' : 'Bag',
      bag_size: sizeMatch ? `${sizeMatch}kg` : null,
      entry_type: m.entry_type,
      item_name: m.item_name,
      quantity: m.quantity,
      unit_cost_etb: m.unit_cost_etb,
      note: m.note,
      // total_cost_etb is a GENERATED column — do not insert.
    };
  });
  console.log(`Inserting ${rows.length} material entries...`);
  await insertBatch('material_register_entries', rows);
  console.log(`✓ material_register_entries in DB now: ${await countTable('material_register_entries')}`);
}

const steps = { suppliers, purchases, receipts, processing, output, samples, contracts, materials };
const step = process.argv[2];
if (!steps[step]) { console.log('Usage: node scripts/import-legacy.cjs <' + Object.keys(steps).join('|') + '>'); process.exit(1); }
steps[step]().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
