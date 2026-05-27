import { useMemo } from 'react';
import { differenceInCalendarDays } from 'date-fns';

/**
 * Checks active (non-archived) purchases for duplicates.
 * Returns:
 *   exactMatch  — same supplier + same date
 *   nearMatch   — same supplier + within 3 days (different date)
 *   codeConflict — same coffee_code already exists (active or archived)
 */
export function useDuplicateCheck({ supplierName, purchaseDate, coffeeCode, allPurchases, currentId = null }) {
  return useMemo(() => {
    if (!supplierName || !purchaseDate) return { exactMatch: null, nearMatch: null, codeConflict: null };

    const active = allPurchases.filter(p => !p.archived && p.id !== currentId);
    const date = new Date(purchaseDate);

    let exactMatch = null;
    let nearMatch = null;

    for (const p of active) {
      if (!p.supplier_name || !p.purchase_date) continue;
      if (p.supplier_name.trim().toLowerCase() !== supplierName.trim().toLowerCase()) continue;

      const diff = Math.abs(differenceInCalendarDays(new Date(p.purchase_date), date));
      if (diff === 0) {
        exactMatch = p;
        break;
      } else if (diff <= 3 && !nearMatch) {
        nearMatch = p;
      }
    }

    // Code conflict — check ALL records (including archived)
    let codeConflict = null;
    if (coffeeCode) {
      codeConflict = allPurchases.find(p => p.id !== currentId && p.coffee_code === coffeeCode) || null;
    }

    return { exactMatch, nearMatch, codeConflict };
  }, [supplierName, purchaseDate, coffeeCode, allPurchases, currentId]);
}