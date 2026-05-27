import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';

/**
 * Blur-only formatted number input.
 *
 * Behavior:
 *  - While focused: shows plain digits (no commas), letting the user type freely.
 *  - On blur: shows the formatted value with thousand separators and the configured
 *    number of decimal places (e.g. 10,000.00 for money/kg, 21.50% for percent).
 *  - Parent always receives a CLEAN numeric string in onChange (no commas) so the
 *    stored database value remains a plain number — display only changes.
 *
 * Props:
 *  - value:    string | number  (raw value, plain digits/decimal)
 *  - onChange: (raw: string) => void
 *  - decimals: number of decimal places to show on blur (default 2)
 *  - suffix:   optional suffix shown on blur (e.g. "%")
 *  - All other props pass through to <Input>.
 */
export default function NumberInput({
  value,
  onChange,
  decimals = 2,
  suffix = '',
  className,
  ...rest
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState('');

  // Sync external value into draft when not focused
  useEffect(() => {
    if (!focused) setDraft(value === null || value === undefined ? '' : String(value));
  }, [value, focused]);

  // Strip everything except digits, dot, minus
  const sanitize = (s) => String(s).replace(/[^0-9.\-]/g, '').replace(/(\..*)\./g, '$1');

  const format = (raw) => {
    if (raw === '' || raw === null || raw === undefined) return '';
    const num = Number(raw);
    if (isNaN(num)) return '';
    return num.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const displayValue = focused
    ? draft
    : (draft === '' ? '' : `${format(draft)}${suffix}`);

  const handleChange = (e) => {
    const clean = sanitize(e.target.value);
    setDraft(clean);
    onChange?.(clean);
  };

  const handleFocus = (e) => {
    setFocused(true);
    // strip formatting -> show plain digits
    setDraft(value === null || value === undefined ? '' : String(value));
    rest.onFocus?.(e);
  };

  const handleBlur = (e) => {
    setFocused(false);
    // Re-emit a clean number string in case parent stored an unparseable value
    if (draft !== '' && !isNaN(Number(draft))) {
      onChange?.(String(Number(draft)));
    }
    rest.onBlur?.(e);
  };

  return (
    <Input
      {...rest}
      type="text"
      inputMode="decimal"
      value={displayValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className={className}
    />
  );
}