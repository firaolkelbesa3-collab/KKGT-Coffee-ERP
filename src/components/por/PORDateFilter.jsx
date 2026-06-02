import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths, startOfYear } from 'date-fns';
import { cn } from '@/lib/utils';

const QUICK = [
  { label: 'Today', get: () => { const d = format(new Date(), 'yyyy-MM-dd'); return { from: d, to: d }; } },
  { label: 'This Week', get: () => ({ from: format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'), to: format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd') }) },
  { label: 'This Month', get: () => ({ from: format(startOfMonth(new Date()), 'yyyy-MM-dd'), to: format(endOfMonth(new Date()), 'yyyy-MM-dd') }) },
  { label: 'Last Month', get: () => { const lm = subMonths(new Date(), 1); return { from: format(startOfMonth(lm), 'yyyy-MM-dd'), to: format(endOfMonth(lm), 'yyyy-MM-dd') }; } },
  { label: 'This Year', get: () => ({ from: format(startOfYear(new Date()), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') }) },
  { label: 'All Time', get: () => ({ from: null, to: null }) },
];

function fmtDisplay(d) {
  if (!d) return '';
  try { return format(new Date(d + 'T00:00:00'), 'd MMM yyyy'); } catch { return d; }
}

export default function PORDateFilter({ dateRange, onChange }) {
  const [active, setActive] = useState('All Time');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [showCustom, setShowCustom] = useState(false);

  const handleQuick = (q) => {
    setActive(q.label);
    setShowCustom(false);
    onChange(q.get());
  };

  const handleApply = () => {
    onChange({ from: custom.from || null, to: custom.to || null });
    setActive('Custom');
  };

  const handleReset = () => {
    setActive('All Time');
    setShowCustom(false);
    setCustom({ from: '', to: '' });
    onChange({ from: null, to: null });
  };

  const hasFilter = dateRange.from || dateRange.to;

  return (
    <div className="bg-card border border-border rounded-xl p-4 mb-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground mr-1">Date Range:</span>
        {QUICK.map(q => (
          <Button
            key={q.label}
            variant={active === q.label ? 'default' : 'outline'}
            size="sm"
            className={cn('text-xs h-7 px-3', active === q.label && 'bg-[#126333] hover:bg-[#0e5229] text-white border-[#126333]')}
            onClick={() => handleQuick(q)}
          >
            {q.label}
          </Button>
        ))}
        <Button
          variant={showCustom ? 'default' : 'outline'}
          size="sm"
          className={cn('text-xs h-7 px-3', showCustom && 'bg-[#126333] hover:bg-[#0e5229] text-white')}
          onClick={() => setShowCustom(v => !v)}
        >
          Custom
        </Button>

        {hasFilter && (
          <span className="ml-2 text-xs bg-green-100 text-green-800 border border-green-300 rounded-full px-2.5 py-0.5 font-medium">
            Filtered: {fmtDisplay(dateRange.from) || '—'} → {fmtDisplay(dateRange.to) || '—'}
          </span>
        )}
      </div>

      {showCustom && (
        <div className="flex flex-wrap items-end gap-3 mt-3 pt-3 border-t border-border">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">From</label>
            <Input type="date" className="h-8 text-sm w-40" value={custom.from} onChange={e => setCustom(v => ({ ...v, from: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">To</label>
            <Input type="date" className="h-8 text-sm w-40" value={custom.to} onChange={e => setCustom(v => ({ ...v, to: e.target.value }))} />
          </div>
          <Button size="sm" className="h-8 bg-[#126333] hover:bg-[#0e5229] text-white" onClick={handleApply}>Apply</Button>
          <Button size="sm" variant="outline" className="h-8" onClick={handleReset}>Reset</Button>
        </div>
      )}
    </div>
  );
}