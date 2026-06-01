import React, { useMemo } from 'react';
import { X, ExternalLink, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PORStatusBadge from './PORStatusBadge';
import { format, parseISO, differenceInDays } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { exportSinglePurchasePDF } from '@/lib/porExport';

const fmt = (n, dp = 2) => typeof n === 'number' ? n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }) : '—';
const fmtDate = d => { try { return format(parseISO(d), 'd MMM yyyy'); } catch { return d || '—'; } };

function Row({ label, value, valueClass = '' }) {
  return (
    <div className="flex items-start justify-between py-1.5 border-b border-border/50 last:border-0 text-sm">
      <span className="text-muted-foreground min-w-[160px]">{label}:</span>
      <span className={`text-right font-medium ${valueClass}`}>{value}</span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-6">
      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 pb-1 border-b border-border">{title}</h4>
      {children}
    </div>
  );
}

export default function PORDetailPanel({ purchase, onClose, processingLogs }) {
  const navigate = useNavigate();

  const receipt = purchase._receipt;
  const payments = useMemo(() => {
    if (!purchase.payment_history) return [];
    try { return JSON.parse(purchase.payment_history) || []; } catch { return []; }
  }, [purchase]);

  const additionalCosts = useMemo(() => {
    if (!purchase.additional_costs) return [];
    try { return JSON.parse(purchase.additional_costs) || []; } catch { return []; }
  }, [purchase]);

  const paidTotal = payments.reduce((s, p) => s + (p.amount_etb || 0), 0);
  const balance = (purchase.grand_total_etb || 0) - paidTotal;
  const paidPct = purchase.grand_total_etb ? Math.min(100, (paidTotal / purchase.grand_total_etb) * 100) : 0;
  const days = purchase.purchase_date ? differenceInDays(new Date(), parseISO(purchase.purchase_date)) : 0;

  const whKg = receipt?.warehouse_received_net_kg;
  const dispatchKg = purchase.net_dispatch_weight_kg;
  const shrinkage = whKg != null && dispatchKg != null ? whKg - dispatchKg : null;

  // Processing summary for this purchase
  const procLogs = useMemo(() => {
    return processingLogs.filter(l => !l.archived && l.coffee_code === purchase.coffee_code);
  }, [processingLogs, purchase]);
  const totalProcKg = procLogs.reduce((s, l) => s + (l.actual_weighed_kg || l.kg_sent || 0), 0);
  const remainingKg = whKg != null ? Math.max(0, whKg - totalProcKg) : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white w-full max-w-2xl h-full shadow-2xl flex flex-col overflow-hidden z-10">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ backgroundColor: '#6F4E37' }}>
          <div>
            <div className="text-white font-mono font-bold text-lg">{purchase.coffee_code || 'Purchase Detail'}</div>
            <div className="mt-1"><PORStatusBadge status={purchase._status} size="md" /></div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="bg-white/10 border-white/30 text-white hover:bg-white/20 gap-2"
              onClick={() => exportSinglePurchasePDF(purchase, payments, receipt)}
            >
              <Printer className="w-4 h-4" /> Print PDF
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="bg-white/10 border-white/30 text-white hover:bg-white/20 gap-2"
              onClick={() => navigate('/purchase-registration')}
            >
              <ExternalLink className="w-4 h-4" /> Edit Purchase
            </Button>
            <button onClick={onClose} className="text-white/70 hover:text-white ml-2">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Section A — Purchase Details */}
          <Section title="A — Purchase Details">
            <Row label="Coffee Code" value={purchase.coffee_code || '—'} valueClass="text-[#6F4E37] font-mono" />
            <Row label="Date" value={fmtDate(purchase.purchase_date)} />
            <Row label="Supplier" value={purchase.supplier_name || '—'} />
            <Row label="Agent" value={purchase.agent || '—'} />
            <Row label="Region" value={purchase.region || '—'} />
            <Row label="Coffee Type" value={purchase.coffee_type || '—'} />
            <Row label="Dispatch KG" value={dispatchKg != null ? `${dispatchKg.toLocaleString()} KG` : '—'} />
            <Row label="Warehouse KG" value={whKg != null ? `${whKg.toLocaleString()} KG` : '⏳ Not yet received'} />
            {shrinkage != null && <Row label="Shrinkage" value={`${shrinkage > 0 ? '+' : ''}${shrinkage.toLocaleString()} KG`} valueClass={shrinkage < 0 ? 'text-red-600' : 'text-green-700'} />}
            <Row label="Unit Price" value={purchase.unit_price_etb_per_feresula ? `${fmt(purchase.unit_price_etb_per_feresula, 0)} ETB per Feresula` : '—'} />
            <Row label="Net Feresula" value={purchase.net_feresula ? fmt(purchase.net_feresula, 2) : '—'} />
            <Row label="Commission" value={purchase.commission_percent != null ? `${purchase.commission_percent}%` : '—'} />
          </Section>

          {/* Section B — Additional Costs */}
          {additionalCosts.length > 0 && (
            <Section title="B — Additional Costs">
              {additionalCosts.map((c, i) => (
                <Row key={i} label={c.name || `Cost ${i + 1}`} value={`${fmt(c.amount || c.amount_etb)} ETB`} />
              ))}
              <Row label="Other Cost (ETB)" value={`${fmt(purchase.other_cost_etb || 0)} ETB`} />
              <Row label="Commission ETB" value={`${fmt(purchase.commission_etb || 0)} ETB`} />
            </Section>
          )}

          {/* Section C — Financial Summary */}
          <Section title="C — Financial Summary">
            <Row label="Grand Total ETB" value={`${fmt(purchase.grand_total_etb)} ETB`} valueClass="font-bold text-base" />
            <Row label="Total Paid ETB" value={`${fmt(paidTotal)} ETB`} valueClass="text-green-700" />
            <Row label="Balance ETB" value={`${fmt(balance)} ETB`} valueClass={balance > 0.01 ? 'text-red-600 font-bold' : 'text-green-700'} />
            <Row label="Status" value={<PORStatusBadge status={purchase._status} />} />
            <Row label="Days Since Purchase" value={
              <span className={days <= 7 ? 'text-slate-600' : days <= 14 ? 'text-orange-600' : 'text-red-600 font-bold'}>
                {days} days {days > 14 ? '⚠️' : ''}
              </span>
            } />
            {/* Payment progress bar */}
            <div className="mt-3">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Payment Progress</span>
                <span>{paidPct.toFixed(1)}% paid</span>
              </div>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${paidPct}%` }} />
              </div>
            </div>
          </Section>

          {/* Section D — Payment History */}
          <Section title="D — Payment History">
            {payments.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No payments recorded yet.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-2 py-2 font-semibold text-muted-foreground">Date</th>
                        <th className="text-left px-2 py-2 font-semibold text-muted-foreground">Bank</th>
                        <th className="text-left px-2 py-2 font-semibold text-muted-foreground">Branch</th>
                        <th className="text-left px-2 py-2 font-semibold text-muted-foreground">CPV Ref</th>
                        <th className="text-left px-2 py-2 font-semibold text-muted-foreground">Type</th>
                        <th className="text-right px-2 py-2 font-semibold text-muted-foreground">Amount ETB</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p, i) => (
                        <tr key={i} className="border-b border-border/50 last:border-0">
                          <td className="px-2 py-1.5">{fmtDate(p.payment_date)}</td>
                          <td className="px-2 py-1.5">{p.bank_name || '—'}</td>
                          <td className="px-2 py-1.5">{p.branch_account || '—'}</td>
                          <td className="px-2 py-1.5">{p.cpv_reference || '—'}</td>
                          <td className="px-2 py-1.5">{p.payment_type || '—'}</td>
                          <td className="px-2 py-1.5 text-right font-mono font-semibold text-green-700">{fmt(p.amount_etb)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-muted/20 font-semibold">
                        <td colSpan={5} className="px-2 py-2 text-right text-xs">Total Paid:</td>
                        <td className="px-2 py-2 text-right font-mono text-green-700">{fmt(paidTotal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}
          </Section>

          {/* Section E — Warehouse Receipt */}
          <Section title="E — Warehouse Receipt">
            {!receipt ? (
              <p className="text-sm text-orange-600 font-medium">⏳ Warehouse receipt not yet confirmed</p>
            ) : (
              <>
                <Row label="GRN Code" value={receipt.grn_code || '—'} />
                <Row label="Dispatch No" value={receipt.dispatch_no || '—'} />
                <Row label="Received Date" value={fmtDate(receipt.received_date)} />
                <Row label="Warehouse KG" value={whKg != null ? `${whKg.toLocaleString()} KG` : '—'} />
                {shrinkage != null && <Row label="Shrinkage" value={`${shrinkage > 0 ? '+' : ''}${shrinkage.toLocaleString()} KG`} valueClass={shrinkage < 0 ? 'text-red-600' : 'text-green-700'} />}
                <Row label="Bags Received" value={receipt.bags_received != null ? `${receipt.bags_received} bags` : '—'} />
              </>
            )}
          </Section>

          {/* Section F — Processing Summary */}
          <Section title="F — Processing Summary">
            <Row label="Total Processing KG" value={totalProcKg > 0 ? `${totalProcKg.toLocaleString()} KG` : '0 KG'} />
            {remainingKg != null && <Row label="Remaining KG" value={`${remainingKg.toLocaleString()} KG`} />}
            <Row label="Processing Status" value={remainingKg === 0 ? 'Complete' : remainingKg != null ? 'In Progress' : '—'} valueClass={remainingKg === 0 ? 'text-green-700' : 'text-orange-600'} />
          </Section>
        </div>
      </div>
    </div>
  );
}