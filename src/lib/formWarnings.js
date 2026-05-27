/**
 * Pure functions that compute inline form warnings.
 * Each returns an array of { message, severity } objects.
 * severity: 'warning' | 'error'
 */

// ─── Purchase Registration ───────────────────────────────────────────────────
export function getPurchaseWarnings(form, existingRecords = []) {
  const warnings = [];
  const price = parseFloat(form.unit_price_etb_per_feresula) || 0;
  const kg = parseFloat(form.net_dispatch_weight_kg) || 0;
  const commission = parseFloat(form.commission_percent) || 0;

  if (price === 0 || (!form.unit_price_etb_per_feresula && form.unit_price_etb_per_feresula !== undefined)) {
    if (kg > 0) warnings.push({ message: 'Unit price is 0 — please confirm this is correct', severity: 'warning' });
  }
  if (price > 0 && price < 10000) warnings.push({ message: 'Price is unusually low — please confirm', severity: 'warning' });
  if (price > 20000) warnings.push({ message: 'Price is unusually high — please confirm', severity: 'warning' });
  if (commission > 5) warnings.push({ message: 'High commission rate — please verify', severity: 'warning' });
  if (kg > 0 && kg < 5000) warnings.push({ message: 'Small quantity — please confirm', severity: 'warning' });
  if (kg > 50000) warnings.push({ message: 'Very large quantity — please confirm', severity: 'warning' });

  // Additional costs check
  try {
    const costs = JSON.parse(form.additional_costs || '[]');
    if (costs.some(c => parseFloat(c.amount) > 200000)) {
      warnings.push({ message: 'Large additional cost — please verify', severity: 'warning' });
    }
  } catch {}

  // Duplicate supplier on same date
  if (form.supplier_name && form.purchase_date) {
    const dup = existingRecords.find(r =>
      r.supplier_name === form.supplier_name &&
      r.purchase_date === form.purchase_date &&
      r.id !== form.id
    );
    if (dup) warnings.push({ message: 'This supplier already has a purchase on this date — is this a new lot?', severity: 'warning' });
  }

  return warnings;
}

// ─── Warehouse Receipt ───────────────────────────────────────────────────────
export function getWarehouseWarnings(form, existingReceipts = []) {
  const warnings = [];
  const dispatch = parseFloat(form.net_dispatch_weight_kg) || 0;
  const received = parseFloat(form.warehouse_received_net_kg) || 0;
  const shrinkage = received - dispatch;

  if (dispatch > 0 && received > 0) {
    const pct = ((received - dispatch) / dispatch) * 100;
    if (pct > 5) warnings.push({ message: 'Received significantly more than dispatched — verify weights', severity: 'warning' });
    if (pct < -5) warnings.push({ message: 'Received significantly less than dispatched — large transit loss', severity: 'warning' });
  }
  if (shrinkage < -500) warnings.push({ message: 'Large weight loss — investigate before confirming', severity: 'warning' });

  // Duplicate GRN
  if (form.grn_code) {
    const dup = existingReceipts.find(r => r.grn_code === form.grn_code && r.id !== form.id);
    if (dup) warnings.push({ message: 'Duplicate GRN Code — this number is already used', severity: 'error' });
  }

  return warnings;
}

// ─── Processing Log ──────────────────────────────────────────────────────────
// Stock check is now based on Actual Weighed KG (handled directly in the form).
// This helper only returns soft warnings about scale variance/bag count.
export function getProcessingWarnings(form /*, availableKg */) {
  const warnings = [];
  const assumed = (parseFloat(form.bags_sent) || 0) * 85;
  const actual = parseFloat(form.actual_weighed_kg) || 0;

  if (assumed > 0 && actual > 0) {
    if (actual > assumed) warnings.push({ message: 'Actual weight exceeds assumed — verify bag count', severity: 'warning' });
  }

  return warnings;
}

// ─── Payment Form ────────────────────────────────────────────────────────────
export function getPaymentWarnings(newPayment, existingPayments, grandTotal) {
  const warnings = [];
  const newAmount = parseFloat(newPayment.amount_etb) || 0;
  const alreadyPaid = existingPayments.reduce((s, p) => s + (parseFloat(p.amount_etb) || 0), 0);
  const afterTotal = alreadyPaid + newAmount;

  if (grandTotal > 0 && afterTotal > grandTotal) {
    const excess = afterTotal - grandTotal;
    warnings.push({ message: `This payment will exceed the contract amount by ${excess.toLocaleString()} ETB. Confirm overpayment?`, severity: 'warning' });
  }

  // Duplicate CPV
  const cpv = (newPayment.cpv_reference || newPayment.reference_no || '').trim();
  if (cpv && existingPayments.some(p => (p.cpv_reference || p.reference_no || '').trim() === cpv)) {
    warnings.push({ message: 'Duplicate CPV reference — this voucher number already exists on this purchase', severity: 'error' });
  }

  // Same amount on same date
  if (newPayment.payment_date && newAmount > 0) {
    const dup = existingPayments.find(p =>
      p.payment_date === newPayment.payment_date &&
      Math.abs((parseFloat(p.amount_etb) || 0) - newAmount) < 0.01
    );
    if (dup) warnings.push({ message: 'A payment of this exact amount was already recorded on this date — possible duplicate', severity: 'warning' });
  }

  return warnings;
}

// ─── Output Report ───────────────────────────────────────────────────────────
export function getOutputWarnings(form) {
  const warnings = [];
  const totalKg = parseFloat(form.total_kg_processed) || 0;
  const exportKg = (parseFloat(form.export_bags) || 0) * 60;
  const rejectKg = (parseFloat(form.reject_bags) || 0) * 85;
  const wasteKg = totalKg - exportKg - rejectKg;
  const rejectPct = totalKg > 0 ? (rejectKg / totalKg) * 100 : 0;

  if (rejectPct > 25) warnings.push({ message: 'High reject rate — verify quality. Reject above 25% is unusual.', severity: 'warning' });
  if (totalKg > 0 && (exportKg + rejectKg) > totalKg) {
    warnings.push({ message: 'Output exceeds input — check bag counts before saving', severity: 'error' });
  }
  if (wasteKg < 0) warnings.push({ message: 'Negative waste detected — output exceeds processed KG', severity: 'warning' });
  if (exportKg === 0 && (parseFloat(form.export_bags) || 0) === 0) {
    warnings.push({ message: 'No export KG entered — is this correct?', severity: 'warning' });
  }

  return warnings;
}

// ─── Export Contract ─────────────────────────────────────────────────────────
export function getExportContractWarnings(form, availableStock) {
  const warnings = [];
  const priceLb = parseFloat(form.price_per_lb_usd) || 0;
  const priceKg = parseFloat(form.price_per_kg_usd) || 0;
  const exportKg = parseFloat(form.export_kg) || 0;
  const revenue = parseFloat(form.total_export_value_etb) || 0;
  const costs = parseFloat(form.total_costs_etb) || 0;
  const profit = parseFloat(form.profit_etb) || 0;

  if (form.pricing_method === 'per_lb') {
    if (priceLb > 0 && priceLb < 0.30) warnings.push({ message: 'Price below typical market minimum — please confirm', severity: 'warning' });
    if (priceLb > 5.00) warnings.push({ message: 'Price above typical market maximum — please confirm', severity: 'warning' });
  } else {
    if (priceKg > 0 && priceKg < 0.66) warnings.push({ message: 'Price below typical market minimum — please confirm', severity: 'warning' });
    if (priceKg > 11) warnings.push({ message: 'Price above typical market maximum — please confirm', severity: 'warning' });
  }

  const coffeeType = form.coffee_type;
  if (coffeeType && availableStock && exportKg > 0) {
    const available = availableStock[coffeeType] || 0;
    if (exportKg > available) {
      warnings.push({ message: `Insufficient stock — only ${available.toLocaleString()} KG available for ${coffeeType}. Cannot save.`, severity: 'error' });
    }
  }

  if (revenue > 0 && costs > 0 && costs / revenue > 0.9) {
    warnings.push({ message: 'Costs are very high — profit margin below 10%', severity: 'warning' });
  }

  if (profit < 0) {
    warnings.push({ message: `This contract will make a loss of ${Math.abs(profit).toLocaleString()} ETB. Review costs before saving.`, severity: 'error' });
  }

  return warnings;
}