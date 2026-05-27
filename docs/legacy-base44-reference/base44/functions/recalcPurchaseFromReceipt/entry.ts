import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Automation handler: When a WarehouseReceipt is created or updated,
 * find the linked PurchaseRecord by coffee_code and recalculate
 * grand_total_etb and balance_etb server-side.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const receipt = body.data;

    if (!receipt || !receipt.coffee_code) {
      return Response.json({ message: 'No coffee_code in receipt, skipping' });
    }

    const warehouseKg = receipt.warehouse_received_net_kg;
    if (!warehouseKg || warehouseKg <= 0) {
      return Response.json({ message: 'No warehouse KG, skipping recalc' });
    }

    // Find linked purchase record by coffee_code
    const purchases = await base44.asServiceRole.entities.PurchaseRecord.filter(
      { coffee_code: receipt.coffee_code }
    );

    if (!purchases || purchases.length === 0) {
      return Response.json({ message: `No purchase found for coffee_code ${receipt.coffee_code}` });
    }

    const purchase = purchases[0];
    const unitPrice = purchase.unit_price_etb_per_feresula || 0;
    const commPct = purchase.commission_percent || 0;

    // Parse additional costs (handle legacy other_cost_etb field)
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

    // Recalculate GT: (warehouse_kg / 17) * unit_price * (1 + comm%) + additional_costs
    const feresula = warehouseKg / 17;
    const purchasePrice = unitPrice * feresula;
    const commission = unitPrice * feresula * commPct / 100;
    const grandTotal = purchasePrice + commission + totalAdditionalCosts;

    // Recalculate total paid from payment_history
    let totalPaid = 0;
    try {
      const payments = JSON.parse(purchase.payment_history || '[]');
      totalPaid = payments.reduce((s, p) => s + (parseFloat(p.amount_etb) || 0), 0);
    } catch {
      totalPaid = 0;
    }

    const rawBalance = grandTotal - totalPaid;
    const balance = Math.abs(rawBalance) <= 1 ? 0 : rawBalance;

    // Update purchase record
    await base44.asServiceRole.entities.PurchaseRecord.update(purchase.id, {
      grand_total_etb: grandTotal,
      balance_etb: balance,
      total_paid_etb: totalPaid,
    });

    console.log(`Recalculated ${purchase.coffee_code}: GT=${grandTotal.toFixed(2)}, Balance=${balance.toFixed(2)}`);

    return Response.json({
      message: 'Purchase recalculated',
      coffee_code: purchase.coffee_code,
      grand_total_etb: grandTotal,
      balance_etb: balance,
    });
  } catch (error) {
    console.error('recalcPurchaseFromReceipt error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});