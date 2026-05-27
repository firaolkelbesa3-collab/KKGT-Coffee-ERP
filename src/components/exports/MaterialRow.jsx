import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import NumberInput from '@/components/shared/NumberInput';
import { X } from 'lucide-react';

function fmt(n, d = 2) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

/**
 * One row in the "Export Materials Purchased" section.
 * Columns: Item Name | Quantity | Unit Cost ETB | Total ETB (auto) | delete (hidden on first row)
 */
export default function MaterialRow({ row, isFirst, onChange, onRemove }) {
  const qty = parseFloat(row.quantity) || 0;
  const unit = parseFloat(row.unit_cost_etb) || 0;
  const total = qty * unit;
  const update = (k, v) => onChange({ ...row, [k]: v });

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end border border-border rounded-lg p-3 bg-muted/10">
      <div className="space-y-1 col-span-2 sm:col-span-1">
        <Label className="text-xs text-muted-foreground">Item Name</Label>
        <Input
          value={row.name || ''}
          onChange={e => update('name', e.target.value)}
          placeholder="e.g. Jute Bags"
          className="h-9 text-xs"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Quantity</Label>
        <NumberInput
          value={row.quantity || ''}
          onChange={v => update('quantity', v)}
          decimals={2}
          placeholder="0.00"
          className="h-9 text-xs"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Unit Cost ETB</Label>
        <NumberInput
          value={row.unit_cost_etb || ''}
          onChange={v => update('unit_cost_etb', v)}
          decimals={2}
          placeholder="0.00"
          className="h-9 text-xs"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Total ETB (auto)</Label>
        <Input value={total > 0 ? fmt(total) : '—'} readOnly className="h-9 bg-muted text-xs font-semibold" />
      </div>
      <div className="flex items-end">
        {isFirst ? (
          <div className="w-9 h-9" />
        ) : (
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive" onClick={onRemove}>
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}