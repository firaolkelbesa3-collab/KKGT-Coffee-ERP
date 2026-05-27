/**
 * Central payment calculation utilities.
 * ALWAYS compute totalPaid from payment_history JSON — never trust stored total_paid_etb or balance_etb.
 */

export function parsePaymentHistory(record) {
  if (!record) return [];
  try {
    const parsed = JSON.parse(record.payment_history || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Sum all payment amounts from payment_history JSON */
export function calcTotalPaid(record) {
  return parsePaymentHistory(record).reduce((s, p) => s + (parseFloat(p.amount_etb) || 0), 0);
}

/** Compute balance: grand_total - totalPaid, floored to 0 if within ±1 ETB tolerance */
export function calcBalance(grandTotal, totalPaid) {
  if (grandTotal == null) return null;
  const raw = grandTotal - totalPaid;
  return Math.abs(raw) <= 1 ? 0 : raw;
}

/**
 * Derive payment status string.
 * 'Paid'     — balance == 0 (within ±1 ETB)
 * 'Overpaid' — totalPaid > grandTotal + 1
 * 'Partial'  — some paid but balance remains
 * 'Unpaid'   — nothing paid yet
 * null       — grand total not yet set
 */
export function calcPaymentStatus(grandTotal, totalPaid) {
  if (grandTotal == null || grandTotal === 0) return null;
  const balance = calcBalance(grandTotal, totalPaid);
  if (balance === 0) return 'Paid';
  if (balance < 0) return 'Overpaid';
  if (totalPaid > 0) return 'Partial';
  return 'Unpaid';
}