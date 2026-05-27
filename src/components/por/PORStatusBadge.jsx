import React from 'react';

const CONFIG = {
  'Paid':             { bg: 'bg-green-100',  text: 'text-green-800',  border: 'border-green-300',  label: '✅ Paid' },
  'Partial':          { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300', label: '🟡 Partial' },
  'Unpaid':           { bg: 'bg-red-100',    text: 'text-red-800',    border: 'border-red-300',    label: '🔴 Unpaid' },
  'Awaiting Receipt': { bg: 'bg-slate-100',  text: 'text-slate-700',  border: 'border-slate-300',  label: '⏳ Awaiting' },
  'Overpaid':         { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300', label: '🟣 Overpaid' },
};

export default function PORStatusBadge({ status, size = 'sm' }) {
  const c = CONFIG[status] || CONFIG['Awaiting Receipt'];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-medium ${c.bg} ${c.text} ${c.border} ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>
      {c.label}
    </span>
  );
}

export { CONFIG as STATUS_CONFIG };