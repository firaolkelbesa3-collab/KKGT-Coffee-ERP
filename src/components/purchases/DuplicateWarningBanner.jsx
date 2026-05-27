import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { format, differenceInCalendarDays } from 'date-fns';

function fmt(n) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function payStatus(p) {
  if (!p.grand_total_etb) return null;
  const paid = p.total_paid_etb || 0;
  if (paid <= 0) return 'Unpaid';
  if (paid >= p.grand_total_etb - 1) return 'Fully Paid';
  return 'Partial';
}

export default function DuplicateWarningBanner({ exactMatch, nearMatch }) {
  if (!exactMatch && !nearMatch) return null;

  if (exactMatch) {
    const status = payStatus(exactMatch);
    return (
      <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-900">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />
        <div className="text-xs space-y-1">
          <p className="font-semibold">⚠️ Possible Duplicate Detected</p>
          <p>A purchase already exists for this supplier on this date:</p>
          <p className="font-mono font-medium">
            {exactMatch.coffee_code} — {exactMatch.supplier_name} — {exactMatch.purchase_date ? format(new Date(exactMatch.purchase_date), 'd MMM yyyy') : ''}
          </p>
          <p>
            Grand Total: {fmt(exactMatch.grand_total_etb)} ETB
            {status && <span> — Status: {status}</span>}
          </p>
          <p className="italic text-amber-700">Are you sure this is a new separate purchase?</p>
        </div>
      </div>
    );
  }

  if (nearMatch) {
    const days = Math.abs(differenceInCalendarDays(new Date(nearMatch.purchase_date), new Date()));
    return (
      <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-900">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-blue-500" />
        <div className="text-xs space-y-1">
          <p className="font-semibold">ℹ️ Similar Purchase Found</p>
          <p>
            A purchase exists for <strong>{nearMatch.supplier_name}</strong> dated{' '}
            {nearMatch.purchase_date ? format(new Date(nearMatch.purchase_date), 'd MMM yyyy') : ''}.
          </p>
          <p className="font-mono font-medium">Code: {nearMatch.coffee_code}</p>
          <p className="italic text-blue-700">Just checking — is this a new separate lot?</p>
        </div>
      </div>
    );
  }

  return null;
}