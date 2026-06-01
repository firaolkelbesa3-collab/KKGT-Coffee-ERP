import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, SlidersHorizontal } from 'lucide-react';

const COFFEE_TYPES = [
  'Unwashed Lekempti', 'Washed Yirgacheffe', 'Natural Sidama', 'Washed Sidama',
  'Unwashed Harrar', 'Washed Jimma', 'Natural Guji', 'Washed Guji', 'Other',
];

export default function WRRFilterPanel({ open, onClose, values, onApply, onReset, suppliers = [] }) {
  const [draft, setDraft] = useState(values);
  useEffect(() => { setDraft(values); }, [values, open]);

  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />}
      <div className={`fixed top-0 right-0 h-full w-80 bg-card shadow-2xl z-50 transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'} flex flex-col`}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">Advanced Filters</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Date range */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">Date Range</Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">From</Label>
                <Input type="date" value={draft.dateFrom || ''} onChange={e => set('dateFrom', e.target.value)} className="h-8 text-xs" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">To</Label>
                <Input type="date" value={draft.dateTo || ''} onChange={e => set('dateTo', e.target.value)} className="h-8 text-xs" />
              </div>
            </div>
          </div>

          {/* Supplier */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">Supplier</Label>
            <Select value={draft.supplier || 'all'} onValueChange={v => set('supplier', v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All Suppliers" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Suppliers</SelectItem>
                {suppliers.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* GRN Status */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">GRN Status</Label>
            <Select value={draft.grnStatus || 'all'} onValueChange={v => set('grnStatus', v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="entered">Entered</SelectItem>
                <SelectItem value="not_entered">Not Entered</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Shrinkage */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">Shrinkage</Label>
            <Select value={draft.shrinkage || 'all'} onValueChange={v => set('shrinkage', v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="positive">Positive</SelectItem>
                <SelectItem value="negative">Negative</SelectItem>
                <SelectItem value="zero">Zero</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Region */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">Region</Label>
            <Select value={draft.region || 'all'} onValueChange={v => set('region', v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Regions</SelectItem>
                {['Wollega','Yirgacheffe','Sidama','Jimma','Harrar','Kaffa','Guji','Bench','Gedeo','Other'].map(r => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Coffee Type */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">Coffee Type</Label>
            <Select value={draft.coffeeType || 'all'} onValueChange={v => set('coffeeType', v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {COFFEE_TYPES.map(ct => <SelectItem key={ct} value={ct}>{ct}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="p-4 border-t border-border flex gap-2">
          <Button
            variant="outline"
            className="flex-1 border-destructive text-destructive hover:bg-destructive hover:text-white text-xs h-8"
            onClick={() => { onReset(); onClose(); }}
          >
            Reset
          </Button>
          <Button
            className="flex-1 text-xs h-8"
            style={{ background: '#C8873E' }}
            onClick={() => { onApply(draft); onClose(); }}
          >
            Apply Filters
          </Button>
        </div>
      </div>
    </>
  );
}