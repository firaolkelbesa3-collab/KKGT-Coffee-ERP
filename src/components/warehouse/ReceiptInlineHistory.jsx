import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { X, PlusCircle, Pencil, Archive, RotateCcw, AlertTriangle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';

function fmtVal(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number') return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return String(v);
}

function fmtTs(iso) {
  try { return format(parseISO(iso), 'd MMM yyyy — h:mm a'); } catch { return iso || '—'; }
}

const ACTION_ICON = {
  Created:  { Icon: PlusCircle,  color: 'text-green-600',  bg: 'bg-green-50',  border: 'border-green-200' },
  Edited:   { Icon: Pencil,      color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-200' },
  Archived: { Icon: Archive,     color: 'text-slate-500',  bg: 'bg-slate-50',  border: 'border-slate-200' },
  Restored: { Icon: RotateCcw,   color: 'text-emerald-600',bg: 'bg-emerald-50',border: 'border-emerald-200' },
};

function HistoryEntry({ entry }) {
  const changes = useMemo(() => { try { return JSON.parse(entry.changes || '[]'); } catch { return []; } }, [entry.changes]);
  const kgImpact = useMemo(() => { try { return entry.kg_impact ? JSON.parse(entry.kg_impact) : null; } catch { return null; } }, [entry.kg_impact]);
  const cfg = ACTION_ICON[entry.action_type] || ACTION_ICON.Edited;
  const { Icon } = cfg;
  const roleLabel = entry.user_role ? `(${entry.user_role.replace(/_/g,' ')})` : '';

  return (
    <div className={`rounded-lg border p-3 mb-3 ${cfg.border} ${cfg.bg}`}>
      <div className="flex items-start gap-2">
        <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${cfg.color}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold ${cfg.color}`}>{entry.action_type}</span>
            <span className="text-xs text-slate-600">— {entry.user_name || entry.user_email} <span className="text-slate-400">{roleLabel}</span></span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{fmtTs(entry.action_at)}</div>

          {changes.length > 0 && (
            <div className="mt-2 space-y-1">
              {changes.map((c, i) => (
                <div key={i} className="text-xs flex items-start gap-1.5">
                  <span className="text-slate-400 mt-0.5">{'└──'}</span>
                  <span>
                    <span className="font-medium text-slate-700">{c.label || c.field}:</span>{' '}
                    {entry.action_type === 'Created' ? (
                      <span className="text-green-700">{fmtVal(c.new_value)}</span>
                    ) : (
                      <>
                        <span className="text-red-600 line-through">{fmtVal(c.old_value)}</span>
                        <span className="mx-1 text-slate-400">→</span>
                        <span className="text-green-700">{fmtVal(c.new_value)}</span>
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          {kgImpact && (
            <div className="mt-2 bg-amber-50 border border-amber-200 rounded p-2 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-amber-700 mb-1">
                <AlertTriangle className="w-3.5 h-3.5" /> KG CHANGE IMPACT
              </div>
              <div className="text-amber-800">
                Warehouse KG changed: {fmtVal(kgImpact.old_kg)} → {fmtVal(kgImpact.new_kg)}
                {' '}(<span className={kgImpact.diff > 0 ? 'text-green-700' : 'text-red-600'}>{kgImpact.diff > 0 ? '+' : ''}{fmtVal(kgImpact.diff)} KG</span>)
              </div>
            </div>
          )}

          {entry.reason && (
            <div className="mt-1.5 text-xs text-slate-500 italic">Reason: {entry.reason}</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ReceiptInlineHistory({ receipt, onClose }) {
  const { data: history = [], isLoading } = useQuery({
    queryKey: ['wh-history', receipt.id],
    queryFn: () => base44.entities.WarehouseReceiptHistory.filter({ receipt_id: receipt.id }, '-action_at', 100),
    staleTime: 30000,
  });

  const sorted = useMemo(() => [...history].sort((a, b) => (b.action_at || '').localeCompare(a.action_at || '')), [history]);

  return (
    <div className="bg-slate-50 border-t border-slate-200 px-4 py-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="text-sm font-semibold text-slate-800">Change History</span>
          {receipt.coffee_code && <span className="ml-2 text-xs text-slate-500 font-mono">{receipt.coffee_code}</span>}
          {receipt.supplier_name && <span className="ml-1 text-xs text-slate-500">— {receipt.supplier_name}</span>}
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
          <X className="w-4 h-4" />
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground italic py-2">No history recorded yet for this receipt.</p>
      ) : (
        <div className="max-h-80 overflow-y-auto pr-1">
          {sorted.map(e => <HistoryEntry key={e.id} entry={e} />)}
        </div>
      )}
    </div>
  );
}