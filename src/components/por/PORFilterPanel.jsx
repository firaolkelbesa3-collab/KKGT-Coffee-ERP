import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const STATUSES = ['Paid', 'Partial', 'Unpaid', 'Awaiting Receipt', 'Overpaid'];
const COFFEE_TYPES = ['Unwashed Lekempti', 'Washed Yirgacheffe', 'Natural Sidama', 'Washed Sidama', 'Unwashed Harrar', 'Washed Jimma', 'Natural Guji', 'Washed Guji', 'Other'];
const DAY_RANGES = [
  { label: 'All', value: null },
  { label: '0–7 days', value: [0, 7] },
  { label: '8–14 days', value: [8, 14] },
  { label: '15+ days', value: [15, null] },
];

export default function PORFilterPanel({ open, onClose, suppliers, filters, onApply, onReset }) {
  const [draft, setDraft] = useState(filters || {});

  useEffect(() => { setDraft(filters || {}); }, [filters, open]);

  const toggleStatus = (s) => {
    const cur = draft.statuses || [];
    const next = cur.includes(s) ? cur.filter(x => x !== s) : [...cur, s];
    setDraft(d => ({ ...d, statuses: next.length ? next : undefined }));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white w-80 max-w-full h-full shadow-2xl flex flex-col overflow-y-auto z-10">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="font-semibold text-base">Advanced Filters</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 px-5 py-4 space-y-5 overflow-y-auto">
          {/* Date Range */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Date Range</label>
            <div className="flex gap-2">
              <Input type="date" className="h-8 text-sm" value={draft.from || ''} onChange={e => setDraft(d => ({ ...d, from: e.target.value || undefined }))} placeholder="From" />
              <Input type="date" className="h-8 text-sm" value={draft.to || ''} onChange={e => setDraft(d => ({ ...d, to: e.target.value || undefined }))} placeholder="To" />
            </div>
          </div>

          {/* Supplier */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Supplier</label>
            <Select value={draft.supplier || '__all__'} onValueChange={v => setDraft(d => ({ ...d, supplier: v === '__all__' ? undefined : v }))}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="All Suppliers" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Suppliers</SelectItem>
                {suppliers.map(s => <SelectItem key={s.id} value={s.supplier_name}>{s.supplier_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Region */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Region</label>
            <Select value={draft.region || '__all__'} onValueChange={v => setDraft(d => ({ ...d, region: v === '__all__' ? undefined : v }))}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="All Regions" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Regions</SelectItem>
                {['Wollega','Yirgacheffe','Sidama','Jimma','Harrar','Kaffa','Guji','Bench','Gedeo','Other'].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Status */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Status</label>
            <div className="space-y-1.5">
              {STATUSES.map(s => (
                <label key={s} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" className="accent-[#126333]" checked={(draft.statuses || []).includes(s)} onChange={() => toggleStatus(s)} />
                  {s}
                </label>
              ))}
            </div>
          </div>

          {/* Coffee Type */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Coffee Type</label>
            <Select value={draft.coffeeType || '__all__'} onValueChange={v => setDraft(d => ({ ...d, coffeeType: v === '__all__' ? undefined : v }))}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="All Types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Types</SelectItem>
                {COFFEE_TYPES.map(ct => <SelectItem key={ct} value={ct}>{ct}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Days Since Purchase */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Days Since Purchase</label>
            <Select value={JSON.stringify(draft.dayRange || null)} onValueChange={v => setDraft(d => ({ ...d, dayRange: JSON.parse(v) }))}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                {DAY_RANGES.map(dr => <SelectItem key={dr.label} value={JSON.stringify(dr.value)}>{dr.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Balance Range */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Balance Range (ETB)</label>
            <div className="flex gap-2">
              <Input type="number" placeholder="Min" className="h-8 text-sm" value={draft.minBalance ?? ''} onChange={e => setDraft(d => ({ ...d, minBalance: e.target.value !== '' ? Number(e.target.value) : undefined }))} />
              <Input type="number" placeholder="Max" className="h-8 text-sm" value={draft.maxBalance ?? ''} onChange={e => setDraft(d => ({ ...d, maxBalance: e.target.value !== '' ? Number(e.target.value) : undefined }))} />
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t flex gap-2">
          <Button className="flex-1 bg-[#EB6C25] hover:bg-[#d4591c] text-white" onClick={() => onApply(draft)}>Apply Filters</Button>
          <Button variant="outline" className="border-red-300 text-red-600 hover:bg-red-50" onClick={onReset}>Reset</Button>
        </div>
      </div>
    </div>
  );
}