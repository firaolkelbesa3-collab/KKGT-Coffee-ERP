import React from 'react';
import DateRangePicker from '@/components/shared/DateRangePicker';

/**
 * Compute the date range (inclusive) for a { from, to } object.
 * Returns { from: 'YYYY-MM-DD' | null, to: 'YYYY-MM-DD' | null }.
 */
export function computeDateRange(_preset, from, to) {
  return { from: from || null, to: to || null };
}

/**
 * Filter an array of records by a date field given a {from, to} range.
 */
export function filterByDateRange(records, range, dateField = 'purchase_date') {
  if (!range || (!range.from && !range.to)) return records;
  return records.filter(r => {
    const d = r?.[dateField];
    if (!d) return false;
    const ds = String(d).slice(0, 10);
    if (range.from && ds < range.from) return false;
    if (range.to && ds > range.to) return false;
    return true;
  });
}

/**
 * BalanceDateFilter — wraps the new DateRangePicker for dashboard use.
 * Keeps the same props interface as the old component for backwards compat:
 *   preset, onPresetChange, customFrom, customTo, onApplyCustom
 * But also accepts the simpler: from, to, onChange
 */
export default function BalanceDateFilter({ from, to, onChange, customFrom, customTo, onApplyCustom }) {
  // Support both old and new prop styles
  const fromVal = from ?? customFrom ?? '';
  const toVal = to ?? customTo ?? '';

  const handleChange = ({ from: f, to: t }) => {
    if (onChange) onChange({ from: f, to: t });
    if (onApplyCustom) onApplyCustom(f, t);
  };

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-3">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Date Filter</span>
      <div className="w-full sm:w-auto">
        <DateRangePicker
          from={fromVal}
          to={toVal}
          onChange={handleChange}
          placeholder="Filter by date range"
        />
      </div>
    </div>
  );
}