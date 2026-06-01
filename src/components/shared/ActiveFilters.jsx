import React from 'react';

export default function ActiveFilters({ filters = [], onClearAll }) {
  const active = filters.filter(f => f.value);
  if (active.length === 0) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
      {active.map((f, i) => (
        <span
          key={i}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            background: 'hsl(var(--muted))',
            border: '0.5px solid hsl(var(--border))',
            borderRadius: '20px', padding: '3px 10px 3px 9px',
            fontSize: '12px', color: 'hsl(var(--foreground))',
          }}
        >
          <span style={{ color: '#126433', fontWeight: 500 }}>{f.label}:</span>
          <span>{f.value}</span>
          <button
            onClick={f.onRemove}
            aria-label={`Remove ${f.label} filter`}
            style={{
              marginLeft: '2px', background: 'none', border: 'none',
              cursor: 'pointer', fontSize: '15px', lineHeight: 1,
              color: 'hsl(var(--muted-foreground))', padding: '0 2px',
            }}
          >×</button>
        </span>
      ))}
      {active.length > 1 && (
        <button
          onClick={onClearAll}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '12px', color: '#f06721', fontWeight: 500, padding: '3px 6px',
          }}
        >
          Clear all
        </button>
      )}
    </div>
  );
}