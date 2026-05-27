import React from 'react';

function fmt(n, d = 0) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

/**
 * Card showing the two stock pools (Fresh vs Recleaned) for one coffee type.
 * Fresh = green, Recleaned = amber.
 */
export default function CoffeePoolsCard({ coffeeType, breakdown, buyerNote }) {
  const {
    freshOutput = 0,
    inspectionSamples = 0,
    exportInspectionSamples = 0,
    freshExported = 0,
    freshAvail = 0,
    recleanedOutput = 0,
    recleanedExported = 0,
    recleanedAvail = 0,
  } = breakdown || {};

  const hasRecleaned = recleanedOutput > 0 || recleanedExported > 0;

  return (
    <div className="rounded-xl border border-border overflow-hidden shadow-sm">
      <div className="px-5 py-3 bg-foreground">
        <p className="text-background font-bold text-base leading-tight">{coffeeType}</p>
      </div>

      {/* Fresh Stock — green */}
      <div className="bg-green-50 border-b border-green-200 px-5 py-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-green-800">Fresh Stock (Pool 1)</p>
          <span className="text-2xl font-bold text-green-700">{fmt(freshAvail)} <span className="text-xs font-medium">KG</span></span>
        </div>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between"><span className="text-muted-foreground">From standard processing</span><span className="font-medium">+ {fmt(freshOutput)}</span></div>
          {inspectionSamples > 0 && (
            <div className="flex justify-between"><span className="text-muted-foreground">Buyer inspection samples</span><span className="font-medium text-amber-700">− {fmt(inspectionSamples)}</span></div>
          )}
          {exportInspectionSamples > 0 && (
            <div className="flex justify-between"><span className="text-muted-foreground">Export-inspection samples</span><span className="font-medium text-amber-700">− {fmt(exportInspectionSamples)}</span></div>
          )}
          <div className="flex justify-between"><span className="text-muted-foreground">Already exported</span><span className="font-medium text-blue-700">− {fmt(freshExported)}</span></div>
          <div className="flex justify-between pt-1 mt-1 border-t border-green-200"><span className="font-semibold text-green-900">Available Fresh KG</span><span className="font-bold text-green-700">{fmt(freshAvail)}</span></div>
        </div>
      </div>

      {/* Recleaned Stock — amber */}
      <div className={`${hasRecleaned ? 'bg-amber-50' : 'bg-muted/30'} px-5 py-4`}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-800">Recleaned Stock (Pool 2)</p>
          <span className={`text-2xl font-bold ${hasRecleaned ? 'text-amber-700' : 'text-muted-foreground'}`}>{fmt(recleanedAvail)} <span className="text-xs font-medium">KG</span></span>
        </div>
        {hasRecleaned ? (
          <div className="space-y-1 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">From recleaning processing</span><span className="font-medium">+ {fmt(recleanedOutput)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Already exported</span><span className="font-medium text-blue-700">− {fmt(recleanedExported)}</span></div>
            {buyerNote && <div className="text-[11px] text-muted-foreground pt-1">Buyer ref: {buyerNote}</div>}
            <div className="flex justify-between pt-1 mt-1 border-t border-amber-200"><span className="font-semibold text-amber-900">Available Recleaned KG</span><span className="font-bold text-amber-700">{fmt(recleanedAvail)}</span></div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">No recleaned stock for this coffee type yet.</p>
        )}
      </div>
    </div>
  );
}