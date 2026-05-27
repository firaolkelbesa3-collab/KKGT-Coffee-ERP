import React from 'react';
import { AlertTriangle, XCircle } from 'lucide-react';

/**
 * Inline warning/error shown on forms before saving.
 * severity: 'warning' (yellow) | 'error' (red)
 */
export default function InlineWarning({ message, severity = 'warning' }) {
  if (!message) return null;
  const isError = severity === 'error';
  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded-lg text-xs mt-1 ${
      isError ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-amber-50 border border-amber-200 text-amber-700'
    }`}>
      {isError ? <XCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
      <span>{message}</span>
    </div>
  );
}

/**
 * Renders a list of warnings
 */
export function InlineWarningList({ warnings }) {
  if (!warnings || warnings.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {warnings.map((w, i) => (
        <InlineWarning key={i} message={w.message} severity={w.severity} />
      ))}
    </div>
  );
}