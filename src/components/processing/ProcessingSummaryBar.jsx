import React, { useMemo } from 'react';
import { Package, Scale, CheckCircle, TrendingUp, TrendingDown, List } from 'lucide-react';
import { BAG_WEIGHT_KG } from '@/lib/constants';

export default function ProcessingSummaryBar({ entries = [] }) {
  const summary = useMemo(() => {
    const std = entries.filter(l => l.entry_type !== 'Recleaning' && l.archived !== true);
    const rcl = entries.filter(l => l.entry_type === 'Recleaning' && l.archived !== true);

    const totalEntries    = entries.filter(l => l.archived !== true).length;
    const totalBags       = std.reduce((s, l) => s + (Number(l.bags_sent)          || 0), 0);
    const totalAssumedKg  = std.reduce((s, l) => s + (Number(l.kg_sent) || (Number(l.bags_sent) || 0) * BAG_WEIGHT_KG), 0);
    const totalActualKg   = entries.filter(l => l.archived !== true)
                                   .reduce((s, l) => s + (Number(l.actual_weighed_kg) || 0), 0);
    const totalVariance       = totalAssumedKg > 0 ? totalActualKg - totalAssumedKg : null;
    const totalRecleaningKg   = rcl.reduce((s, l) => s + (Number(l.actual_weighed_kg) || 0), 0);

    return { totalEntries, totalBags, totalAssumedKg, totalActualKg, totalVariance, totalRecleaningKg };
  }, [entries]);

  if (summary.totalEntries === 0) {
    return (
      <div className="rounded-xl border border-border bg-muted/40 px-5 py-4 text-sm text-muted-foreground">
        No entries match the current filters.
      </div>
    );
  }

  const variancePositive = summary.totalVariance === null ? null : summary.totalVariance >= 0;

  const cards = [
    {
      label: 'FILTERED ENTRIES',
      value: summary.totalEntries.toLocaleString(),
      unit: null,
      sub: 'matching current filters',
      icon: List,
      valueClass: 'text-foreground',
      cardClass: '',
    },
    {
      label: 'TOTAL BAGS SENT',
      value: summary.totalBags.toLocaleString(),
      unit: 'bags',
      sub: 'Standard entries only',
      icon: Package,
      valueClass: 'text-[#126333]',
      cardClass: '',
    },
    {
      label: 'ASSUMED KG',
      value: summary.totalAssumedKg.toLocaleString(),
      unit: 'KG',
      sub: `Bags × ${BAG_WEIGHT_KG} kg`,
      icon: Scale,
      valueClass: 'text-foreground',
      cardClass: '',
    },
    {
      label: 'ACTUAL WEIGHED KG',
      value: summary.totalActualKg.toLocaleString(),
      unit: 'KG',
      sub: 'After factory weighing',
      icon: CheckCircle,
      valueClass: 'text-[#126333]',
      cardClass: '',
    },
    {
      label: 'TOTAL VARIANCE',
      value: summary.totalVariance === null
        ? '—'
        : `${summary.totalVariance >= 0 ? '+' : ''}${Math.round(summary.totalVariance).toLocaleString()}`,
      unit: summary.totalVariance !== null ? 'KG' : null,
      sub: 'Actual minus Assumed',
      icon: variancePositive === false ? TrendingDown : TrendingUp,
      valueClass: summary.totalVariance === null
        ? 'text-muted-foreground'
        : variancePositive
          ? 'text-[#126333]'
          : 'text-red-600',
      cardClass: summary.totalVariance !== null && !variancePositive
        ? 'bg-red-50 border-red-200'
        : '',
    },
  ];

  return (
    <div className="space-y-2">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <div className="w-1 h-4 rounded-full bg-[#126333]" />
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Summary — {summary.totalEntries} {summary.totalEntries === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className={`relative rounded-xl border bg-white p-4 shadow-sm min-w-0 ${card.cardClass || 'border-border'}`}
            >
              <Icon className="absolute top-3 right-3 w-4 h-4 text-muted-foreground/50" />
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1 pr-6 truncate">
                {card.label}
              </p>
              <p className={`text-xl font-bold truncate ${card.valueClass}`}>
                {card.value}
                {card.unit && (
                  <span className="text-xs font-medium text-muted-foreground ml-1">{card.unit}</span>
                )}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{card.sub}</p>
            </div>
          );
        })}
      </div>

      {/* Recleaning footnote */}
      {summary.totalRecleaningKg > 0 && (
        <p className="text-[11px] text-[#EB6C25] pl-1">
          ⚠ Includes {summary.totalRecleaningKg.toLocaleString()} KG recleaning — excluded from bag and assumed KG totals.
        </p>
      )}
    </div>
  );
}