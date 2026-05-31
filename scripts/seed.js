#!/usr/bin/env node
/**
 * KKGT Coffee Flow — test data seeder.
 *
 * Populates the Supabase database with realistic suppliers, purchases,
 * warehouse receipts, processing logs, output reports, export contracts,
 * inspections, samples, and bag-ledger entries. Use this to "fill up" the
 * app for end-to-end testing without manually filling forms.
 *
 * Usage:
 *   1. Add SUPABASE_SERVICE_ROLE_KEY to .env.local (get it from Supabase
 *      Dashboard → Project Settings → API → service_role key).
 *      ⚠️  Service role bypasses RLS. Remove this line from .env.local after
 *      seeding so it never ships to the frontend.
 *
 *   2. Run from the project root:
 *        node scripts/seed.js              # add data (idempotent-ish; adds more rows each run)
 *        node scripts/seed.js --reset      # wipe seeded data first, then re-seed
 *
 *   3. Open the app — every page should show data.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const RESET = args.includes('--reset');

// ---------------------------------------------------------------------------
// Env loading (no dotenv dep — parse .env.local manually)
// ---------------------------------------------------------------------------
function loadEnvFile() {
  try {
    const content = readFileSync(join(__dirname, '..', '.env.local'), 'utf8');
    const env = {};
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
    return env;
  } catch { return {}; }
}

const env = { ...loadEnvFile(), ...process.env };
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('\n❌  Missing config.\n');
  console.error('Add the service role key to .env.local (TEMPORARY — remove after seeding):');
  console.error('  SUPABASE_SERVICE_ROLE_KEY=<paste service_role key>\n');
  console.error('Get the key from:');
  console.error('  https://supabase.com/dashboard/project/<your-project>/settings/api-keys');
  console.error('  → "service_role" secret (NOT "anon public")\n');
  console.error('Then re-run:  node scripts/seed.js\n');
  process.exit(1);
}

const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randFloat = (min, max, d = 2) => +(Math.random() * (max - min) + min).toFixed(d);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const isoDate = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);
const isoDateTime = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString();

const REGIONS = ['Wollega', 'Yirgacheffe', 'Sidama', 'Jimma', 'Harrar', 'Kaffa', 'Guji', 'Bench', 'Gedeo'];
const COFFEE_TYPES = ['Washed Yirgacheffe', 'Natural Sidama', 'Washed Sidama', 'Unwashed Lekempti', 'Unwashed Harrar', 'Washed Jimma', 'Natural Guji', 'Washed Guji'];
const FIRST_NAMES = ['Abebe', 'Alemu', 'Tesfaye', 'Bekele', 'Kebede', 'Lemma', 'Solomon', 'Daniel', 'Tadesse', 'Worku', 'Asnake', 'Berhanu', 'Girma', 'Mulugeta', 'Yonas', 'Dawit'];
const LAST_NAMES = ['Bekele', 'Tesfaye', 'Worku', 'Gebre', 'Tadesse', 'Mengistu', 'Wolde', 'Hailu', 'Assefa', 'Lemma', 'Belay'];
const AGENTS = ['Habtamu Tessema', 'Eyob Demissie', 'Tigist Berhanu', 'Mulu Negash', 'Selamawit Tadesse'];
const BANKS = ['CBE', 'Awash Bank', 'Dashen Bank', 'Wegagen Bank', 'Bank of Abyssinia'];
const BRANCHES = ['Bole', 'Piazza', 'Mexico', 'Kazanchis', 'Megenagna', 'Sarbet'];
const BUYERS = ['Aramex Coffee', 'Global Beans LLC', 'European Coffee Co', 'Asia Trading Corp', 'Premium Beans Inc', 'Nordic Coffee AB'];
const DESTINATIONS = ['Saudi Arabia', 'UAE', 'Germany', 'Italy', 'Japan', 'USA', 'Belgium', 'South Korea'];
const COST_NAMES = ['Transport', 'Cleaning', 'Loading', 'Storage'];

const supplierName = () => `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
const log = (s) => process.stdout.write(s);

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------
async function reset() {
  console.log('\n🗑   Wiping existing data (in dependency order)...');
  const tables = [
    'reject_bag_usages', 'supplier_bag_payments', 'supplier_bag_returns', 'supplier_bag_settlements',
    'bag_receipts', 'sample_logs', 'buyer_inspections',
    'attachments', 'export_contracts', 'exports', 'purchases',
    'output_reports', 'processing_batches', 'processing_logs',
    'warehouse_receipt_history', 'warehouse_receipts', 'warehouse_inventory',
    'purchase_records', 'material_register_entries', 'material_entries',
    'activity_logs', 'notifications', 'suppliers',
  ];
  for (const t of tables) {
    const { error, count } = await sb.from(t).delete({ count: 'exact' }).not('id', 'is', null);
    if (error) console.log(`   ${t.padEnd(32)} ⚠  ${error.message}`);
    else console.log(`   ${t.padEnd(32)} cleared ${count ?? 0}`);
  }
}

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------
async function seedSuppliers(target = 15) {
  log(`\n👤  Suppliers (${target})... `);
  const rows = [];
  const names = new Set();
  while (names.size < target) names.add(supplierName());
  for (const name of names) {
    rows.push({
      supplier_name: name,
      region: pick(REGIONS),
      agent: pick(AGENTS),
      coffee_type: pick(COFFEE_TYPES),
      opening_stock_kg: randFloat(0, 5000, 0),
      phone_number: `+2519${rand(10000000, 99999999)}`,
      coffee_origin: pick(REGIONS),
      station_name: `Station ${rand(1, 9)}`,
      agreement_date: isoDate(rand(60, 365)),
      agreement_expiry_date: isoDate(-rand(180, 730)),
    });
  }
  const { data, error } = await sb.from('suppliers').insert(rows).select();
  if (error) throw error;
  console.log(`✅ ${data.length}`);
  return data;
}

// ---------------------------------------------------------------------------
// Purchase records
// ---------------------------------------------------------------------------
async function seedPurchases(suppliers, target = 40) {
  log(`📝  Purchase records (${target})... `);
  const seqByRegion = {};
  const year = new Date().getFullYear();
  const rows = [];
  for (let i = 0; i < target; i++) {
    const s = pick(suppliers);
    const region = s.region;
    seqByRegion[region] = (seqByRegion[region] || 0) + 1;
    const code = `KKGT/${region}/${String(seqByRegion[region]).padStart(3, '0')}/${year}`;
    const dispatchKg = rand(5000, 30000);
    const unitPrice = randFloat(10000, 18000, 0);
    const commPct = randFloat(1.5, 3.0, 2);
    const feresula = dispatchKg / 17;
    const baseCost = feresula * unitPrice;
    const commEtb = baseCost * commPct / 100;
    const additionalCosts = COST_NAMES.slice(0, rand(1, 3)).map(n => ({ name: n, amount: rand(2000, 15000) }));
    const extraTotal = additionalCosts.reduce((s, c) => s + c.amount, 0);
    const grandTotal = +(baseCost + commEtb + extraTotal).toFixed(2);

    // 60% have at least one payment
    const payments = [];
    if (Math.random() < 0.6) {
      const numPayments = rand(1, 3);
      const fraction = Math.random() < 0.4 ? 1.0 : randFloat(0.2, 0.8, 2); // 40% fully paid
      let remaining = grandTotal * fraction;
      for (let p = 0; p < numPayments; p++) {
        const amt = p === numPayments - 1 ? remaining : +(remaining / (numPayments - p)).toFixed(2);
        remaining -= amt;
        payments.push({
          payment_no: `PMT-${p + 1}`,
          payment_date: isoDate(rand(1, 90)),
          bank_name: pick(BANKS),
          branch_account: pick(BRANCHES),
          amount_etb: amt,
          cpv_reference: `CPV-${rand(1000, 9999)}`,
          payment_type: p === numPayments - 1 ? 'Final Payment' : 'Advance',
          note: '',
        });
      }
    }

    rows.push({
      coffee_code: code,
      purchase_date: isoDate(rand(7, 120)),
      supplier_name: s.supplier_name,
      agent: s.agent,
      region,
      coffee_type: s.coffee_type,
      net_dispatch_weight_kg: dispatchKg,
      unit_price_etb_per_feresula: unitPrice,
      commission_percent: commPct,
      commission_etb: +commEtb.toFixed(2),
      total_purchase_price: +baseCost.toFixed(2),
      grand_total_etb: grandTotal,
      other_cost_etb: extraTotal,
      additional_costs: JSON.stringify(additionalCosts),
      payment_history: JSON.stringify(payments),
      // total_paid_etb + balance_etb are set by the pr_recompute_totals trigger
      remark: Math.random() < 0.2 ? 'Test data' : null,
    });
  }
  const { data, error } = await sb.from('purchase_records').insert(rows).select();
  if (error) throw error;
  console.log(`✅ ${data.length}`);
  return data;
}

// ---------------------------------------------------------------------------
// Warehouse receipts (about 75% of purchases get a receipt)
// ---------------------------------------------------------------------------
async function seedReceipts(purchases) {
  const eligible = purchases.filter(() => Math.random() < 0.75);
  log(`📦  Warehouse receipts (${eligible.length})... `);
  const rows = eligible.map((p, i) => {
    const shrinkage = randFloat(-2, 1, 3); // -2% to +1%
    const receivedKg = +(p.net_dispatch_weight_kg * (1 + shrinkage / 100)).toFixed(3);
    return {
      coffee_code: p.coffee_code,
      purchase_record_id: p.id,
      supplier_name: p.supplier_name,
      net_dispatch_weight_kg: p.net_dispatch_weight_kg,
      warehouse_received_net_kg: receivedKg,
      bags_received: Math.floor(receivedKg / 60),
      grn_code: `GRN-${String(i + 1).padStart(4, '0')}`,
      dispatch_no: `DN-${String(i + 1).padStart(4, '0')}`,
      received_date: p.purchase_date,
    };
  });
  // Insert one by one so the wr_recalc trigger runs cleanly per row
  const created = [];
  for (const r of rows) {
    const { data, error } = await sb.from('warehouse_receipts').insert(r).select().single();
    if (error) { console.log(`\n   ⚠  ${error.message}`); continue; }
    created.push(data);
  }
  console.log(`✅ ${created.length}`);
  return created;
}

// ---------------------------------------------------------------------------
// Processing logs
// ---------------------------------------------------------------------------
async function seedProcessing(suppliers, target = 25) {
  log(`⚙️   Processing logs (${target})... `);
  const rows = [];
  for (let i = 0; i < target; i++) {
    const s = pick(suppliers);
    const byKg = Math.random() < 0.4;
    const bagsSent = byKg ? null : rand(50, 250);
    const kgSent = byKg ? rand(3000, 18000) : bagsSent * 85;
    const actualKg = +(kgSent * randFloat(0.9, 1.05, 3)).toFixed(2);
    const variance = +(actualKg - kgSent).toFixed(2);
    rows.push({
      entry_type: 'Standard',
      entry_mode: byKg ? 'By KG' : 'By Bags',
      date: isoDate(rand(1, 60)),
      supplier_name: s.supplier_name,
      coffee_type: s.coffee_type,
      batch_no: `B-${String(i + 1).padStart(3, '0')}`,
      bags_sent: bagsSent,
      kg_sent: kgSent,
      actual_weighed_kg: actualKg,
      batch_variance_kg: variance,
    });
  }
  const { data, error } = await sb.from('processing_logs').insert(rows).select();
  if (error) throw error;
  console.log(`✅ ${data.length}`);
  return data;
}

// ---------------------------------------------------------------------------
// Output reports
// ---------------------------------------------------------------------------
async function seedOutputs(suppliers, target = 20) {
  log(`📊  Output reports (${target})... `);
  const rows = [];
  for (let i = 0; i < target; i++) {
    const s = pick(suppliers);
    const totalKg = rand(5000, 20000);
    const exportBags = Math.floor((totalKg * randFloat(0.8, 0.92, 2)) / 60);
    const rejectBags = rand(0, 5);
    const wasteKg = +(totalKg * randFloat(0.01, 0.05, 3)).toFixed(2);
    const start = rand(20, 90);
    rows.push({
      entry_type: Math.random() < 0.85 ? 'Standard' : 'Recleaned',
      start_date: isoDate(start),
      end_date: isoDate(start - rand(0, 5)),
      supplier_name: s.supplier_name,
      coffee_type: s.coffee_type,
      total_kg_processed: totalKg,
      export_bags: exportBags,
      reject_bags: rejectBags,
      waste_kg: wasteKg,
      registrar_name: 'Yohannes Mulugeta',
    });
  }
  const { data, error } = await sb.from('output_reports').insert(rows).select();
  if (error) throw error;
  console.log(`✅ ${data.length}`);
  return data;
}

// ---------------------------------------------------------------------------
// Export contracts
// ---------------------------------------------------------------------------
async function seedContracts(target = 12) {
  log(`🚢  Export contracts (${target})... `);
  const year = new Date().getFullYear();
  const rows = [];
  for (let i = 0; i < target; i++) {
    const exportKg = rand(8000, 25000);
    const pricePerKg = randFloat(4.5, 8.5, 4);
    const totalUsd = +(exportKg * pricePerKg).toFixed(2);
    const rate = randFloat(55, 60, 4);
    const totalEtb = +(totalUsd * rate).toFixed(2);
    const costs = [
      { name: 'Freight', amount_etb: rand(500000, 1500000) },
      { name: 'Fumigation', amount_etb: rand(30000, 80000) },
      { name: 'COO', amount_etb: rand(10000, 30000) },
      { name: 'ICO', amount_etb: rand(15000, 40000) },
    ];
    const totalCosts = costs.reduce((s, c) => s + c.amount_etb, 0);
    const profit = +(totalEtb - totalCosts).toFixed(2);
    // 25% loss-making contracts to test the "negative profit" Telegram alert
    const actualProfit = Math.random() < 0.25 ? -Math.abs(profit) / 3 : profit;

    rows.push({
      contract_no: `KKGT/EXP/${String(i + 1).padStart(3, '0')}/${year}`,
      contract_date: isoDate(rand(5, 90)),
      coffee_type: pick(COFFEE_TYPES),
      coffee_grade: `Grade ${rand(1, 3)}`,
      destination_country: pick(DESTINATIONS),
      buyer_name: pick(BUYERS),
      stock_pool: Math.random() < 0.85 ? 'Fresh' : 'Recleaned',
      payment_terms: pick(['Letter of Credit (LC)', 'Cash Against Documents (CAD)', 'Advance Payment']),
      export_kg: exportKg,
      export_bags: Math.floor(exportKg / 60),
      price_per_kg_usd: pricePerKg,
      pricing_method: 'per_kg',
      contract_rate_etb: rate,
      rate_status: 'Rate Confirmed',
      total_export_value_usd: totalUsd,
      total_export_value_etb: totalEtb,
      cost_rows: JSON.stringify(costs),
      total_costs_etb: totalCosts,
      grand_total_revenue_etb: totalEtb,
      profit_etb: actualProfit,
      profit_usd: +(actualProfit / rate).toFixed(2),
      profit_margin_pct: +(actualProfit / totalEtb * 100).toFixed(2),
      status: pick(['Pending', 'In Progress', 'Shipped', 'Completed']),
      payment_status: pick(['Unpaid', 'Partial', 'Fully Received']),
    });
  }
  const { data, error } = await sb.from('export_contracts').insert(rows).select();
  if (error) throw error;
  console.log(`✅ ${data.length}`);
  return data;
}

// ---------------------------------------------------------------------------
// Buyer inspections
// ---------------------------------------------------------------------------
async function seedInspections(contracts, target = 6) {
  log(`🔍  Buyer inspections (${target})... `);
  const rows = [];
  for (let i = 0; i < target; i++) {
    const passed = Math.random() < 0.7;
    const c = pick(contracts);
    const kgToInspect = rand(5000, 15000);
    const sample = randFloat(5, 25, 2);
    rows.push({
      inspection_date: isoDate(rand(5, 60)),
      buyer_name: pick(BUYERS),
      coffee_type: c.coffee_type,
      kg_to_inspect: kgToInspect,
      sample_kg_taken: sample,
      result: passed ? 'Passed' : 'Failed',
      kg_approved: passed ? kgToInspect - sample : null,
      linked_contract_id: passed ? c.id : null,
      linked_contract_no: passed ? c.contract_no : null,
      rejection_reason: passed ? null : pick(['Too Much Moisture', 'Grade Too Low', 'Defects']),
      kg_rejected: passed ? null : kgToInspect - sample,
      action_taken: passed ? null : pick(['Reprocess', 'Sell Locally']),
    });
  }
  const { data, error } = await sb.from('buyer_inspections').insert(rows).select();
  if (error) throw error;
  console.log(`✅ ${data.length}`);
  return data;
}

// ---------------------------------------------------------------------------
// Sample logs
// ---------------------------------------------------------------------------
async function seedSamples(suppliers, target = 10) {
  log(`🧪  Sample logs (${target})... `);
  const rows = [];
  for (let i = 0; i < target; i++) {
    const s = pick(suppliers);
    rows.push({
      sample_type: pick(['Warehouse', 'Export Inspection', 'Arrival']),
      supplier_name: s.supplier_name,
      coffee_type: s.coffee_type,
      sample_date: isoDate(rand(2, 60)),
      sample_datetime: isoDateTime(rand(2, 60)),
      sample_kg: randFloat(2, 30, 2),
      company_recipient: pick(BUYERS),
      keeper_name: pick(AGENTS),
    });
  }
  const { data, error } = await sb.from('sample_logs').insert(rows).select();
  if (error) throw error;
  console.log(`✅ ${data.length}`);
  return data;
}

// ---------------------------------------------------------------------------
// Bag ledger (receipts, returns, payments, reject usage)
// ---------------------------------------------------------------------------
async function seedBagLedger(suppliers) {
  log(`🛍   Bag ledger entries... `);
  const bagReceipts = suppliers.slice(0, 8).map(s => ({
    receipt_mode: 'supplier',
    supplier_name: s.supplier_name,
    date: isoDate(rand(10, 90)),
    bags_received: rand(50, 300),
    warehouse_received_kg: rand(3000, 18000),
    source: 'manual',
  }));
  await sb.from('bag_receipts').insert(bagReceipts).select();

  const bagReturns = suppliers.slice(0, 4).map(s => ({
    supplier_name: s.supplier_name,
    return_date: isoDate(rand(5, 30)),
    bags_returned: rand(10, 80),
    note: 'Routine return',
  }));
  await sb.from('supplier_bag_returns').insert(bagReturns).select();

  const bagPayments = suppliers.slice(0, 5).map(s => ({
    supplier_name: s.supplier_name,
    payment_date: isoDate(rand(5, 60)),
    bank_name: pick(BANKS),
    branch_account: pick(BRANCHES),
    reference_no: `CPV-${rand(10000, 99999)}`,
    payment_type: pick(['Advance', 'Final Payment']),
    amount_etb: rand(50000, 500000),
  }));
  await sb.from('supplier_bag_payments').insert(bagPayments).select();

  const rejectBags = suppliers.slice(0, 6).map(s => ({
    reject_mode: 'supplier',
    supplier_name: s.supplier_name,
    date: isoDate(rand(3, 45)),
    bags_used: rand(2, 15),
  }));
  await sb.from('reject_bag_usages').insert(rejectBags).select();

  console.log(`✅ ${bagReceipts.length + bagReturns.length + bagPayments.length + rejectBags.length}`);
}

// ---------------------------------------------------------------------------
// Materials register
// ---------------------------------------------------------------------------
async function seedMaterials() {
  log(`🧰  Material register entries... `);
  const exportItems = [
    { item_type: 'Bag', bag_size: '60kg' },
    { item_type: 'Bag', bag_size: '50kg' },
    { item_type: 'Craft' },
    { item_type: 'Plaster' },
    { item_type: 'Green Pro' },
  ];
  const rows = [];
  for (let i = 0; i < 12; i++) {
    const item = pick(exportItems);
    const qty = rand(50, 1000);
    const unit = randFloat(15, 80, 2);
    rows.push({
      category: 'export',
      date: isoDate(rand(5, 90)),
      item_type: item.item_type,
      bag_size: item.bag_size,
      entry_type: i % 3 === 0 ? 'Usage' : 'Purchase',
      quantity: qty,
      unit_cost_etb: unit,
      purpose: 'Export packaging',
    });
  }
  for (let i = 0; i < 6; i++) {
    rows.push({
      category: 'general',
      date: isoDate(rand(5, 90)),
      item_name: pick(['Office supplies', 'Fuel', 'Cleaning supplies', 'Tools']),
      quantity: rand(1, 20),
      unit_cost_etb: randFloat(500, 5000, 2),
      purpose: 'Office operations',
    });
  }
  const { data, error } = await sb.from('material_register_entries').insert(rows).select();
  if (error) throw error;
  console.log(`✅ ${data.length}`);
  return data;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`\nSeeding ${url}`);
  console.log(RESET ? '(reset mode — wiping existing data first)' : '(append mode — use --reset to wipe first)');

  if (RESET) await reset();

  const suppliers = await seedSuppliers();
  const purchases = await seedPurchases(suppliers);
  await seedReceipts(purchases);
  await seedProcessing(suppliers);
  await seedOutputs(suppliers);
  const contracts = await seedContracts();
  await seedInspections(contracts);
  await seedSamples(suppliers);
  await seedBagLedger(suppliers);
  await seedMaterials();

  console.log('\n✅  Seeding complete. Open the app — every page should now have data.\n');
  console.log('⚠   Reminder: remove SUPABASE_SERVICE_ROLE_KEY from .env.local now.\n');
}

main().catch(e => {
  console.error('\n❌  Seed failed:', e.message);
  if (e.details) console.error('   ', e.details);
  if (e.hint) console.error('   hint:', e.hint);
  process.exit(1);
});
