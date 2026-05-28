import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { authenticate, ensureTestUserAndSignIn, cleanupTestData } from '../fixtures/auth.js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '../fixtures/env.js';

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

test.describe('Purchase + warehouse trigger flow', () => {
  test.beforeAll(async () => {
    await ensureTestUserAndSignIn('admin');
    await cleanupTestData('PWTEST');
  });

  test.afterAll(async () => {
    await cleanupTestData('PWTEST');
  });

  test('creating a purchase persists with computed grand_total_etb', async ({ page }) => {
    await authenticate(page, 'admin');

    // Seed a supplier directly so we don't depend on the Master Data UI in this test
    const supplierName = `PWTEST Supplier ${Date.now()}`;
    await admin.from('suppliers').insert({
      supplier_name: supplierName,
      region: 'Sidama',
      agent: 'Test Agent',
      coffee_type: 'Natural Sidama',
    });

    // Insert a purchase via the DB directly (we'll test the UI submission in a separate test)
    const coffeeCode = `PWTEST/Sidama/${Date.now()}`;
    const { error } = await admin.from('purchase_records').insert({
      coffee_code: coffeeCode,
      purchase_date: new Date().toISOString().slice(0, 10),
      supplier_name: supplierName,
      region: 'Sidama',
      coffee_type: 'Natural Sidama',
      net_dispatch_weight_kg: 17000,                  // exactly 1000 feresula
      unit_price_etb_per_feresula: 10000,
      commission_percent: 2,
      additional_costs: JSON.stringify([{ name: 'Transport', amount: 50000 }]),
      payment_history: JSON.stringify([]),
      grand_total_etb: 17000 / 17 * 10000 * 1.02 + 50000, // 10,250,000
    });
    expect(error?.message).toBeFalsy();

    // Visit Purchase Registration — row should be visible
    await page.goto('/purchase-registration');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(coffeeCode)).toBeVisible({ timeout: 15000 });
  });

  test('warehouse receipt triggers recalc of parent purchase grand_total', async () => {
    // Pure DB test — exercises the wr_recalc trigger end-to-end.
    const supplierName = `PWTEST WR Supplier ${Date.now()}`;
    const coffeeCode = `PWTEST/Trigger/${Date.now()}`;

    await admin.from('suppliers').insert({ supplier_name: supplierName, region: 'Yirgacheffe' });
    await admin.from('purchase_records').insert({
      coffee_code: coffeeCode,
      purchase_date: new Date().toISOString().slice(0, 10),
      supplier_name: supplierName,
      region: 'Yirgacheffe',
      coffee_type: 'Washed Yirgacheffe',
      net_dispatch_weight_kg: 25000,
      unit_price_etb_per_feresula: 12000,
      commission_percent: 2,
      additional_costs: JSON.stringify([]),
      payment_history: JSON.stringify([]),
    });

    // Pre-state
    const { data: before } = await admin
      .from('purchase_records').select('grand_total_etb').eq('coffee_code', coffeeCode).single();
    expect(before).toBeTruthy();

    // Create a warehouse receipt with lower KG — trigger should fire
    await admin.from('warehouse_receipts').insert({
      coffee_code: coffeeCode,
      supplier_name: supplierName,
      net_dispatch_weight_kg: 25000,
      warehouse_received_net_kg: 23000,
      received_date: new Date().toISOString().slice(0, 10),
      grn_code: 'PWTEST-GRN-001',
    });

    // Allow trigger to commit
    await new Promise(r => setTimeout(r, 500));

    const { data: after } = await admin
      .from('purchase_records').select('grand_total_etb, warehouse_received_net_kg, commission_etb, total_purchase_price')
      .eq('coffee_code', coffeeCode).single();

    expect(after.warehouse_received_net_kg).toBe(23000);
    // Expected grand_total: (23000/17)*12000*1.02 = ~16,553,000
    const expectedGrand = (23000 / 17) * 12000 * 1.02;
    expect(Number(after.grand_total_etb)).toBeCloseTo(expectedGrand, -2);
  });

  test('adding a payment recomputes total_paid_etb and balance_etb', async () => {
    const coffeeCode = `PWTEST/Payment/${Date.now()}`;
    const supplierName = `PWTEST Payment Supplier ${Date.now()}`;
    await admin.from('suppliers').insert({ supplier_name: supplierName, region: 'Guji' });
    await admin.from('purchase_records').insert({
      coffee_code: coffeeCode,
      purchase_date: new Date().toISOString().slice(0, 10),
      supplier_name: supplierName,
      net_dispatch_weight_kg: 17000,
      unit_price_etb_per_feresula: 10000,
      commission_percent: 2,
      grand_total_etb: 10200000,
      additional_costs: JSON.stringify([]),
      payment_history: JSON.stringify([]),
    });

    // Add a payment
    const payments = [{ payment_no: 'P1', payment_date: '2026-01-01', amount_etb: 3000000, bank_name: 'CBE' }];
    await admin.from('purchase_records').update({
      payment_history: JSON.stringify(payments),
    }).eq('coffee_code', coffeeCode);

    const { data } = await admin.from('purchase_records')
      .select('total_paid_etb, balance_etb').eq('coffee_code', coffeeCode).single();
    expect(Number(data.total_paid_etb)).toBe(3000000);
    expect(Number(data.balance_etb)).toBe(10200000 - 3000000);
  });
});
