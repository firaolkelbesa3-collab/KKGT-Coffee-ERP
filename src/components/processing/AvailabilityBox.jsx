import React from 'react';

function fmt(n, d = 2) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

/**
 * Live availability box for a selected supplier in the processing form.
 * Shows: Warehouse Received - Samples - Already Processed = Remaining Available
 * Color coded: green > 500, amber 100-500, red < 100.
 *
 * When `actualKg` (the value the user is entering now) is > 0, also shows
 * a "After this entry" line with the post-save remaining.
 */
export default function AvailabilityBox({ supplierName, receivedKg, samplesKg, processedKg, availableKg, actualKg }) {
  if (!supplierName) return null;

  let tone = 'green';
  if (availableKg < 100) tone = 'red';
  else if (availableKg < 500) tone = 'amber';

  const styles = {
    green: 'border-green-200 bg-green-50 text-green-900',
    amber: 'border-amber-300 bg-amber-50 text-amber-900',
    red: 'border-red-300 bg-red-50 text-red-900',
  }[tone];

  const remainingTone = {
    green: 'text-green-700',
    amber: 'text-amber-700',
    red: 'text-red-700',
  }[tone];

  const showAfter = actualKg > 0;
  const after = availableKg - actualKg;

  return (
    <div className={`rounded-lg border p-3 text-sm ${styles}`}>
      <p className="font-semibold uppercase tracking-wide text-xs mb-2">
        Available KG for {supplierName}
      </p>
      <div className="space-y-1 text-xs">
        <div className="flex justify-between"><span>Warehouse Received:</span><span className="font-medium">{fmt(receivedKg)} KG</span></div>
        <div className="flex justify-between"><span>Minus Samples:</span><span className="font-medium">{fmt(samplesKg)} KG</span></div>
        <div className="flex justify-between"><span>Minus Already Processed:</span><span className="font-medium">{fmt(processedKg)} KG</span></div>
        <div className={`flex justify-between pt-1 border-t mt-1 ${remainingTone}`}>
          <span className="font-semibold">Remaining Available:</span>
          <span className="font-bold text-base">{fmt(availableKg)} KG</span>
        </div>
        {showAfter && (
          <div className={`flex justify-between pt-1 ${after < 0 ? 'text-red-700 font-semibold' : after < 100 ? 'text-amber-700' : ''}`}>
            <span>After this entry:</span>
            <span className="font-medium">{fmt(after)} KG</span>
          </div>
        )}
      </div>
    </div>
  );
}