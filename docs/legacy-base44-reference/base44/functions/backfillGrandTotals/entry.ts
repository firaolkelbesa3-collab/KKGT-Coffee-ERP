import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * One-time admin backfill:
 * 1. Recalculate all purchase GTs from warehouse KG
 * 2. Link warehouse receipts to purchase records by ID
 * 3. Migrate processing log actual_weighed_kg
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const purchases = await base44.asServiceRole.entities.PurchaseRecord.list('-created_date', 500);
    const receipts = await base44.asServiceRole.entities.WarehouseReceipt.list('-created_date', 500);
    const processingLogs = await base44.asServiceRole.entities.ProcessingLog.list('-created_date', 500);

    // Build receipt lookup by coffee_code
    const receiptByCode = {};
    for (const r of receipts) {
      if (r.coffee_code) receiptByCode[r.coffee_code] = r;
    }

    // Build purchase lookup by coffee_code
    const purchaseByCode = {};
    for (const p of purchases) {
      if (p.coffee_code) purchaseByCode[p.coffee_code] = p;
    }

    const results = {
      gt_updated: [],
      gt_unchanged: [],
      gt_no_receipt: [],
      receipts_linked: [],
      processing_migrated: 0,
    };

    // ── 1. Backfill Grand Totals ──────────────────────────────────────
    for (const purchase of purchases) {
      const receipt = receiptByCode[purchase.coffee_code];
      if (!receipt || !receipt.warehouse_received_net_kg) {
        results.gt_no_receipt.push(purchase.coffee_code);
        continue;
      }

      const warehouseKg = receipt.warehouse_received_net_kg;
      const unitPrice = purchase.unit_price_etb_per_feresula || 0;
      const commPct = purchase.commission_percent || 0;

      let totalAdditionalCosts = 0;
      if (purchase.additional_costs) {
        try {
          const costs = JSON.parse(purchase.additional_costs);
          totalAdditionalCosts = costs.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
        } catch {
          totalAdditionalCosts = purchase.other_cost_etb || 0;
        }
      } else {
        totalAdditionalCosts = purchase.other_cost_etb || 0;
      }

      const feresula = warehouseKg / 17;
      const purchasePrice = unitPrice * feresula;
      const commission = unitPrice * feresula * commPct / 100;
      const newGT = purchasePrice + commission + totalAdditionalCosts;

      let totalPaid = 0;
      try {
        const payments = JSON.parse(purchase.payment_history || '[]');
        totalPaid = payments.reduce((s, p) => s + (parseFloat(p.amount_etb) || 0), 0);
      } catch {
        totalPaid = 0;
      }

      const rawBalance = newGT - totalPaid;
      const newBalance = Math.abs(rawBalance) <= 1 ? 0 : rawBalance;

      const oldGT = purchase.grand_total_etb || 0;
      const diff = Math.abs(newGT - oldGT);

      if (diff > 1) {
        await base44.asServiceRole.entities.PurchaseRecord.update(purchase.id, {
          grand_total_etb: newGT,
          balance_etb: newBalance,
          total_paid_etb: totalPaid,
        });
        results.gt_updated.push({
          code: purchase.coffee_code,
          supplier: purchase.supplier_name,
          old_gt: oldGT,
          new_gt: newGT,
          diff: newGT - oldGT,
          new_balance: newBalance,
        });
        console.log(`GT updated: ${purchase.coffee_code} | Old: ${oldGT.toFixed(2)} → New: ${newGT.toFixed(2)} | Δ ${(newGT - oldGT).toFixed(2)}`);
      } else {
        // Still update balance/total_paid to ensure consistency
        const oldBalance = purchase.balance_etb;
        if (oldBalance == null || Math.abs((oldBalance || 0) - newBalance) > 1) {
          await base44.asServiceRole.entities.PurchaseRecord.update(purchase.id, {
            grand_total_etb: newGT,
            balance_etb: newBalance,
            total_paid_etb: totalPaid,
          });
        }
        results.gt_unchanged.push(purchase.coffee_code);
      }
    }

    // ── 2. Link warehouse receipts to purchase records ────────────────
    for (const receipt of receipts) {
      if (receipt.purchase_record_id) continue;
      const purchase = purchaseByCode[receipt.coffee_code];
      if (!purchase) continue;

      await base44.asServiceRole.entities.WarehouseReceipt.update(receipt.id, {
        purchase_record_id: purchase.id,
      });
      results.receipts_linked.push({ receipt_id: receipt.id, coffee_code: receipt.coffee_code, purchase_id: purchase.id });
      console.log(`Linked receipt ${receipt.coffee_code} → purchase ${purchase.id}`);
    }

    // ── 3. Migrate processing logs actual_weighed_kg ─────────────────
    for (const log of processingLogs) {
      if (log.actual_weighed_kg != null && !log.actual_weighed_kg_needs_migration) continue;

      const actualKg = log.actual_weighed_kg ?? log.kg_sent ?? 0;
      await base44.asServiceRole.entities.ProcessingLog.update(log.id, {
        actual_weighed_kg: actualKg,
        actual_weighed_kg_needs_migration: null,
        batch_variance_kg: actualKg - ((log.bags_sent || 0) * 85),
      });
      results.processing_migrated++;
    }

    console.log(`Backfill complete. GT updated: ${results.gt_updated.length}, Receipts linked: ${results.receipts_linked.length}, Processing migrated: ${results.processing_migrated}`);

    return Response.json({
      summary: {
        gt_records_updated: results.gt_updated.length,
        gt_records_unchanged: results.gt_unchanged.length,
        gt_no_receipt: results.gt_no_receipt.length,
        receipts_linked: results.receipts_linked.length,
        processing_migrated: results.processing_migrated,
      },
      gt_changes: results.gt_updated,
      receipts_linked: results.receipts_linked,
    });
  } catch (error) {
    console.error('backfillGrandTotals error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});