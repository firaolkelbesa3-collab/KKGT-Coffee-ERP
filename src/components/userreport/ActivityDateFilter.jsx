import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear, subDays } from 'date-fns';

function fmt(d) { return format(d, 'yyyy-MM-dd'); }

const PRESETS = [
  { label: 'Today', get: () => { const d = new Date(); return { from: fmt(d), to: fmt(d) }; } },
  { label: 'Yesterday', get: () => { const d = subDays(new Date(), 1); return { from: fmt(d), to: fmt(d) }; } },
  { label: 'This Week', get: () => ({ from: fmt(startOfWeek(new Date(), { weekStartsOn: 1 })), to: fmt(endOfWeek(new Date(), { weekStartsOn: 1 })) }) },
  { label: 'This Month', get: () => ({ from: fmt(startOfMonth(new Date())), to: fmt(endOfMonth(new Date())) }) },
  { label: 'Last Month', get: () => { const d = subMonths(new Date(), 1); return { from: fmt(startOfMonth(d)), to: fmt(endOfMonth(d)) }; } },
  { label: 'This Year', get: () => ({ from: fmt(startOfYear(new Date())), to: fmt(endOfYear(new Date())) }) },
];

export default function ActivityDateFilter({ dateRange, onChange }) {
  const isPresetActive = (preset) => {
    const p = preset.get();
    return p.from === dateRange.from && p.to === dateRange.to;
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 mb-6">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-sm font-medium text-muted-foreground mr-1">Quick Select:</span>
        {PRESETS.map(preset => (
          <Button
            key={preset.label}
            variant={isPresetActive(preset) ? 'default' : 'outline'}
            size="sm"
            className={isPresetActive(preset) ? 'bg-orange-600 hover:bg-orange-700 text-white' : ''}
            onClick={() => onChange(preset.get())}
          >
            {preset.label}
          </Button>
        ))}
      </div>
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">From</Label>
          <Input type="date" value={dateRange.from} onChange={e => onChange({ ...dateRange, from: e.target.value })} className="w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input type="date" value={dateRange.to} onChange={e => onChange({ ...dateRange, to: e.target.value })} className="w-40" />
        </div>
        <Button variant="outline" size="sm" onClick={() => {
          const d = new Date();
          onChange({ from: format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd'), to: format(endOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd') });
        }}>
          Reset
        </Button>
      </div>
    </div>
  );
}