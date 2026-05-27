import React, { useState, useEffect } from 'react';
import { X, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import DateRangePicker from './DateRangePicker';

/**
 * FilterPanel — slides from right.
 *
 * Props:
 *   open: bool
 *   onClose: fn
 *   fields: array of field config objects (see below)
 *   values: object { [fieldKey]: value }
 *   onApply: fn(values)
 *   onReset: fn()
 *   activeCount: number  — shown on external Filter button badge
 *
 * Field config shapes:
 *   { key, label, type: 'date' }  — uses DateRangePicker; value is { from, to }
 *   { key, label, type: 'text', placeholder? }
 *   { key, label, type: 'select', options: [{ value, label }], placeholder? }
 *   { key, label, type: 'toggle' }  — boolean switch
 */
export default function FilterPanel({ open, onClose, fields = [], values = {}, onApply, onReset }) {
  const [draft, setDraft] = useState(values);

  // Sync draft when panel opens
  useEffect(() => { if (open) setDraft(values); }, [open]);

  const set = (key, val) => setDraft(p => ({ ...p, [key]: val }));

  const handleApply = () => { onApply(draft); onClose(); };
  const handleReset = () => { onReset(); onClose(); };

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/20 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-80 bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4" style={{ color: '#f06721' }} />
            <h3 className="font-bold text-sm text-foreground">Filters</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Fields */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {fields.map(field => (
            <div key={field.key} className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {field.label}
              </Label>

              {field.type === 'date' && (
                <DateRangePicker
                  from={draft[field.key]?.from || ''}
                  to={draft[field.key]?.to || ''}
                  onChange={v => set(field.key, v)}
                />
              )}

              {field.type === 'text' && (
                <Input
                  value={draft[field.key] || ''}
                  onChange={e => set(field.key, e.target.value)}
                  placeholder={field.placeholder || ''}
                  className="h-9"
                />
              )}

              {field.type === 'select' && (
                <Select
                  value={draft[field.key] || 'all'}
                  onValueChange={v => set(field.key, v)}
                >
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue placeholder={field.placeholder || 'Select...'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{field.placeholder || 'All'}</SelectItem>
                    {(field.options || []).map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {field.type === 'toggle' && (
                <div className="flex items-center gap-3">
                  <Switch
                    checked={!!draft[field.key]}
                    onCheckedChange={v => set(field.key, v)}
                  />
                  <span className="text-sm text-muted-foreground">{draft[field.key] ? 'On' : 'Off'}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border flex gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="flex-1 border-destructive text-destructive hover:bg-destructive hover:text-white transition-colors"
          >
            Reset
          </Button>
          <Button
            size="sm"
            onClick={handleApply}
            className="flex-1 text-white"
            style={{ backgroundColor: '#f06721', borderColor: '#f06721' }}
          >
            Apply Filters
          </Button>
        </div>
      </div>
    </>
  );
}

/**
 * FilterButton — the orange button that opens the panel, with active count badge.
 */
export function FilterButton({ onClick, activeCount = 0, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex items-center gap-2 h-9 px-3 rounded-lg border text-sm font-medium transition-colors
        ${activeCount > 0 ? 'border-orange-400 text-white' : 'border-border bg-background text-foreground hover:border-orange-400'}
        ${className}`}
      style={activeCount > 0 ? { backgroundColor: '#f06721', borderColor: '#f06721' } : {}}
    >
      <Filter className="w-4 h-4" />
      Filters
      {activeCount > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
          {activeCount}
        </span>
      )}
    </button>
  );
}