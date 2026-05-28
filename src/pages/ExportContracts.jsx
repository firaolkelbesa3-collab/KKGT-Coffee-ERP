import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Pencil, Trash2, Eye, ArrowLeft, X, AlertTriangle, Download } from 'lucide-react';
import jsPDF from 'jspdf';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import ExportDocsPanel from '@/components/attachments/ExportDocsPanel';
import ContractForm from '@/components/exports/ContractForm';
import { format } from 'date-fns';
import RoleGuard from '@/components/RoleGuard';
import { computeStockPools } from '@/lib/stockPools';
import { notifyExportContract } from '@/lib/notificationService';
import NumberInput from '@/components/shared/NumberInput';
import TablePagination from '@/components/shared/TablePagination';
import { base44 } from '@/api/supabaseClient';

function fmt(n, d = 2) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function todayStr() { return new Date().toISOString().slice(0, 10); }
function generateContractNo(count) {
  const year = new Date().getFullYear();
  return `KKGT/EXP/${String(count + 1).padStart(3, '0')}/${year}`;
}

const PAYMENT_TERMS = ['Letter of Credit (LC)', 'Cash Against Documents (CAD)', 'Advance Payment', 'Open Account'];

const PAY_STATUS_STYLES = {
  'Unpaid': 'bg-red-100 text-red-700',
  'Partial': 'bg-amber-100 text-amber-700',
  'Fully Received': 'bg-green-100 text-green-800',
};
function PayStatusBadge({ status }) {
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${PAY_STATUS_STYLES[status || 'Unpaid'] || 'bg-muted text-muted-foreground'}`}>
      {status || 'Unpaid'}
    </span>
  );
}

// ─── Available Stock Calculator (Fresh + Recleaned pools) ────────────────────
function useAvailableStock(outputReports, contracts, inspections, sampleLogs) {
  return useMemo(() => {
    const { fresh, recleaned } = computeStockPools({ outputReports, contracts, inspections, sampleLogs });
    return { available: fresh, availableRecleaned: recleaned };
  }, [outputReports, contracts, inspections, sampleLogs]);
}

// ─── Payment Row Component ────────────────────────────────────────────────────
function PaymentRow({ row, onChange, onRemove }) {
  const amountEtb = (parseFloat(row.amount_usd) || 0) * (parseFloat(row.actual_rate_etb) || 0);
  const update = (k, v) => onChange({ ...row, [k]: v });
  return (
    <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end border border-border rounded-lg p-3 bg-muted/10">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Date</Label>
        <Input type="date" value={row.payment_date || ''} onChange={e => update('payment_date', e.target.value)} className="h-9 text-xs" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Amount USD</Label>
        <NumberInput decimals={2} value={row.amount_usd || ''} onChange={v => update('amount_usd', v)} placeholder="0.00" className="h-9 text-xs" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Actual Rate ETB</Label>
        <NumberInput decimals={4} value={row.actual_rate_etb || ''} onChange={v => update('actual_rate_etb', v)} placeholder="0.0000" className="h-9 text-xs" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Amount ETB (auto)</Label>
        <Input value={fmt(amountEtb)} readOnly className="h-9 bg-muted text-xs font-semibold" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Bank / Ref</Label>
        <Input value={row.bank_name || ''} onChange={e => update('bank_name', e.target.value)} placeholder="Bank..." className="h-9 text-xs" />
      </div>
      <div className="flex gap-1 items-end">
        <div className="flex-1 space-y-1">
          <Label className="text-xs text-muted-foreground">Ref No</Label>
          <Input value={row.reference_no || ''} onChange={e => update('reference_no', e.target.value)} placeholder="Ref..." className="h-9 text-xs" />
        </div>
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive flex-shrink-0" onClick={onRemove}>
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Cost Row Component ───────────────────────────────────────────────────────
function CostRow({ row, onChange, onRemove }) {
  return (
    <div className="flex gap-2 items-end">
      <div className="flex-1 space-y-1">
        <Label className="text-xs text-muted-foreground">Cost Name</Label>
        <Input value={row.name || ''} onChange={e => onChange({ ...row, name: e.target.value })} placeholder="e.g. Purchase Cost ETB" className="h-9 text-xs" />
      </div>
      <div className="w-40 space-y-1">
        <Label className="text-xs text-muted-foreground">Amount ETB</Label>
        <Input type="number" step="any" value={row.amount_etb || ''} onChange={e => onChange({ ...row, amount_etb: e.target.value })} placeholder="0" className="h-9 text-xs" />
      </div>
      <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive flex-shrink-0" onClick={onRemove}>
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}

// ContractForm is in components/exports/ContractForm.jsx

// ─── Payment History Panel ────────────────────────────────────────────────────
function PaymentHistoryPanel({ contract, onUpdate }) {
  const [payments, setPayments] = useState([]);

  useEffect(() => {
    try {
      const parsed = JSON.parse(contract.payment_history || '[]');
      setPayments(parsed);
    } catch { setPayments([]); }
  }, [contract]);

  const totalUsd = payments.reduce((s, p) => s + (parseFloat(p.amount_usd) || 0), 0);
  const totalEtb = payments.reduce((s, p) => s + ((parseFloat(p.amount_usd) || 0) * (parseFloat(p.actual_rate_etb) || 0)), 0);
  const outstandingUsd = (contract.total_export_value_usd || 0) - totalUsd;
  const contractEtb = contract.total_export_value_etb || (contract.total_export_value_usd || 0) * (contract.contract_rate_etb || contract.usd_rate_etb || 0);
  const rateDiffEtb = totalEtb - contractEtb;

  const paymentStatus = totalUsd <= 0 ? 'Unpaid'
    : totalUsd >= (contract.total_export_value_usd || 0) ? 'Fully Received'
    : 'Partial';

  const addPayment = () => setPayments(p => [...p, { payment_date: todayStr(), amount_usd: '', actual_rate_etb: '', bank_name: '', reference_no: '', note: '' }]);

  const save = () => {
    const amountEtbRows = payments.map(p => ({ ...p, amount_etb: (parseFloat(p.amount_usd) || 0) * (parseFloat(p.actual_rate_etb) || 0) }));
    onUpdate({
      payment_history: JSON.stringify(amountEtbRows),
      total_received_usd: totalUsd,
      total_received_etb: totalEtb,
      payment_status: paymentStatus,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Payment History</h3>
        <Button type="button" size="sm" variant="outline" onClick={addPayment}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Record Payment
        </Button>
      </div>

      {payments.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No payments recorded yet.</p>
      ) : (
        <div className="space-y-2">
          {payments.map((p, i) => (
            <PaymentRow
              key={i}
              row={p}
              onChange={v => setPayments(prev => prev.map((r, idx) => idx === i ? v : r))}
              onRemove={() => setPayments(prev => prev.filter((_, idx) => idx !== i))}
            />
          ))}
        </div>
      )}

      {/* Summary */}
      {payments.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl bg-muted/40 border border-border text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Total Received USD</p>
            <p className="font-bold text-green-700">${fmt(totalUsd)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Received ETB</p>
            <p className="font-bold">{fmt(totalEtb)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Outstanding USD</p>
            <p className={`font-bold ${outstandingUsd > 0 ? 'text-amber-600' : 'text-green-700'}`}>${fmt(outstandingUsd)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Rate Difference ETB</p>
            <p className={`font-bold ${rateDiffEtb >= 0 ? 'text-green-700' : 'text-destructive'}`}>{rateDiffEtb >= 0 ? '+' : ''}{fmt(rateDiffEtb)}</p>
            <p className="text-[10px] text-muted-foreground">{rateDiffEtb >= 0 ? 'gain' : 'loss'}</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-border">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Status:</span>
          <PayStatusBadge status={paymentStatus} />
        </div>
        <Button size="sm" onClick={save}>Save Payments</Button>
      </div>
    </div>
  );
}

// ─── Export Contract PDF ──────────────────────────────────────────────────────
function exportContractPDF(contract) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 15;
  const fmtD = d => { try { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return d || '—'; } };
  const fmtN = (n, dp = 2) => (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });

  doc.setFillColor(18, 100, 51);
  doc.rect(0, 0, W, 28, 'F');
  doc.setFillColor(240, 103, 33);
  doc.rect(0, 28, W, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14); doc.setFont('helvetica', 'bold');
  doc.text('KKGT IMPORT & EXPORT — ETHIOPIA', M, 11);
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text('Export Contract', M, 19);
  doc.setFontSize(8);
  doc.text('CONFIDENTIAL', W - M, 19, { align: 'right' });

  doc.setTextColor(50, 50, 50);
  let y = 40;
  const row = (label, value) => {
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 100, 100);
    doc.text(label, M, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
    doc.text(String(value ?? '—'), M + 60, y);
    y += 6;
  };

  row('Contract No:', contract.contract_no || '—');
  row('Contract PI Number:', contract.contract_pi_number || '—');
  row('Contract Date:', fmtD(contract.contract_date || contract.export_date));
  row('Buyer:', contract.buyer_name || '—');
  row('Destination:', contract.destination_country || '—');
  row('Coffee Type:', contract.coffee_type || contract.commodity || '—');
  row('Coffee Grade:', contract.coffee_grade || '—');
  row('Payment Terms:', contract.payment_terms === 'Other' ? (contract.custom_payment_terms || 'Other') : (contract.payment_terms || '—'));

  y += 3; doc.setDrawColor(200, 200, 200); doc.line(M, y, W - M, y); y += 6;

  row('Export KG:', `${fmtN(contract.export_kg, 0)} KG`);
  row('Actual Shipped KG:', `${fmtN(contract.actual_shipped_kg ?? contract.export_kg, 0)} KG`);
  const contractRate = contract.contract_rate_etb || contract.usd_rate_etb || 0;
  row('Contract Rate:', contractRate > 0 ? `${fmtN(contractRate, 4)} ETB/USD` : 'Rate Pending');
  const priceLine = contract.pricing_method === 'per_lb'
    ? (contract.price_per_lb_usd ? `$${fmtN(contract.price_per_lb_usd, 6)}/LB` : '—')
    : (contract.price_per_kg_usd ? `$${fmtN(contract.price_per_kg_usd, 4)}/KG` : '—');
  row('Price:', priceLine);
  row('Total Export Value USD:', `$${fmtN(contract.total_export_value_usd, 3)}`);
  row('Total Export Value ETB:', contractRate > 0 ? fmtN(contract.total_export_value_etb || contract.export_total_sales_price_etb) : '—');
  row('Total Costs ETB:', fmtN(contract.total_costs_etb || contract.total_expenses_etb));
  row('Profit ETB:', contractRate > 0 ? fmtN(contract.profit_etb ?? contract.total_profit_etb) : '—');
  row('Profit USD:', contractRate > 0 ? fmtN(contract.profit_usd) : '—');
  row('Payment Status:', contract.payment_status || 'Unpaid');
  if (contract.remark) row('Remark:', contract.remark);

  doc.setTextColor(150, 150, 150); doc.setFontSize(7);
  doc.text(`Generated: ${new Date().toLocaleString()} — KKGT CONFIDENTIAL`, W / 2, 285, { align: 'center' });
  doc.save(`KKGT-Contract-${contract.contract_no?.replace(/\//g, '-') || contract.id}.pdf`);
}

// ─── Contract Detail View ─────────────────────────────────────────────────────
function ContractDetailView({ contract, onBack, onEdit, onUpdatePayments }) {
  const contractRate = contract.contract_rate_etb || contract.usd_rate_etb || 0;
  const rateMissing = !(contractRate > 0);
  const profitEtb = contract.profit_etb ?? contract.total_profit_etb ?? 0;
  const profitColor = rateMissing ? '#9ca3af' : (profitEtb >= 0 ? '#126433' : '#dc2626');
  const paymentTermsDisplay = contract.payment_terms === 'Other'
    ? (contract.custom_payment_terms || 'Other')
    : (contract.payment_terms || '—');

  const costRows = useMemo(() => {
    try { return JSON.parse(contract.cost_rows || '[]'); } catch { return []; }
  }, [contract]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5"><ArrowLeft className="w-4 h-4" /> Back</Button>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">{contract.contract_no}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {contract.coffee_type || contract.commodity} {contract.coffee_grade && `· ${contract.coffee_grade}`} → {contract.destination_country}
            {contract.buyer_name && ` · ${contract.buyer_name}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {rateMissing && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200 whitespace-nowrap">
              <AlertTriangle className="w-3 h-3" /> Rate Pending
            </span>
          )}
          <PayStatusBadge status={contract.payment_status} />
          {rateMissing && (
            <Button onClick={onEdit} size="sm" className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"><Plus className="w-3.5 h-3.5" /> Add Rate</Button>
          )}
          <Button onClick={() => exportContractPDF(contract)} size="sm" variant="outline" className="gap-1.5"><Download className="w-3.5 h-3.5" /> Export PDF</Button>
          <Button onClick={onEdit} size="sm" className="gap-1.5"><Pencil className="w-3.5 h-3.5" /> Edit</Button>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="docs">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-5 mt-4">
          {/* Header info */}
          <div className="bg-card border border-border rounded-xl p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {[
              { label: 'Contract Date', value: contract.contract_date ? format(new Date(contract.contract_date), 'dd/MM/yyyy') : (contract.export_date ? format(new Date(contract.export_date), 'dd/MM/yyyy') : '—') },
              { label: 'Contract PI Number', value: contract.contract_pi_number || '—' },
              { label: 'Export KG', value: `${fmt(contract.export_kg, 0)} KG` },
              { label: 'Export Sample KG', value: contract.export_sample_kg ? `${fmt(contract.export_sample_kg, 0)} KG` : '—' },
              { label: 'Actual Shipped KG', value: contract.actual_shipped_kg ? `${fmt(contract.actual_shipped_kg, 0)} KG` : `${fmt(contract.export_kg, 0)} KG` },
              { label: 'Pricing Method', value: contract.pricing_method === 'per_lb' ? 'Per LB (USD)' : 'Per KG (USD)' },
              { label: 'Price', value: contract.pricing_method === 'per_lb' ? `$${fmt(contract.price_per_lb_usd, 6)}/LB` : `$${fmt(contract.price_per_kg_usd, 4)}/KG` },
              { label: 'Total LB', value: contract.total_lb ? `${fmt(contract.total_lb, 3)} LB` : '—' },
              { label: 'Contract Rate', value: rateMissing ? '— (Rate Pending)' : `${fmt(contractRate, 4)} ETB/USD` },
              { label: 'Rate Confirmed', value: contract.rate_confirmed_date ? format(new Date(contract.rate_confirmed_date), 'dd/MM/yyyy') : '—' },
              { label: 'Payment Terms', value: paymentTermsDisplay },
              { label: 'Expected Payment', value: contract.expected_payment_date ? format(new Date(contract.expected_payment_date), 'dd/MM/yyyy') : '—' },
              { label: 'Remark', value: contract.remark || '—' },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
                <p className="text-sm font-medium mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          {/* Arrival Inputs */}
          {(() => {
            try {
              const arr = JSON.parse(contract.arrival_inputs || '[]');
              if (!arr.length) return null;
              const totalBags = arr.reduce((s, r) => s + (parseFloat(r.bags) || 0), 0);
              const totalKg = totalBags * 85;
              const totalCost = arr.reduce((s, r) => {
                const b = parseFloat(r.bags) || 0;
                const p = parseFloat(r.price_etb) || 0;
                return s + (b * 85 / 17) * p;
              }, 0);
              return (
                <div className="bg-card border border-border rounded-xl p-5">
                  <h3 className="text-sm font-semibold mb-3">Arrival Inputs</h3>
                  <div className="space-y-1">
                    <div className="grid grid-cols-4 gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1 pb-1 border-b border-border">
                      <span>Bags</span><span>Price ETB/Feresula</span><span>Feresula</span><span>Amount ETB</span>
                    </div>
                    {arr.map((r, i) => {
                      const b = parseFloat(r.bags) || 0;
                      const p = parseFloat(r.price_etb) || 0;
                      const fer = b * 85 / 17;
                      return (
                        <div key={i} className="grid grid-cols-4 gap-2 text-sm py-1 border-b border-border/30 last:border-0">
                          <span>{fmt(b, 0)}</span><span>{fmt(p, 0)}</span><span>{fmt(fer, 0)}</span><span className="font-medium">{fmt(fer * p, 0)}</span>
                        </div>
                      );
                    })}
                    <div className="grid grid-cols-4 gap-2 text-sm font-bold pt-2 border-t border-border">
                      <span>{fmt(totalBags, 0)} bags</span><span></span><span>{fmt(totalKg, 0)} KG</span><span className="text-green-700">{fmt(totalCost, 0)}</span>
                    </div>
                  </div>
                </div>
              );
            } catch { return null; }
          })()}

          {/* Financials */}
          <div className="bg-card border-2 border-primary/20 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold">Financial Summary</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {[
                { label: 'Total Export Value USD', value: `$${fmt(contract.total_export_value_usd, 3)}` },
                { label: 'Total Export Value ETB', value: rateMissing ? '—' : fmt(contract.total_export_value_etb || contract.export_total_sales_price_etb) },
                { label: 'Reject Sales ETB', value: fmt(contract.reject_sales_etb || contract.total_reject_sales_etb) },
                { label: 'Grand Revenue ETB', value: rateMissing ? '—' : fmt(contract.grand_total_revenue_etb || contract.grand_total_sales_etb) },
                { label: 'Total Costs ETB', value: fmt(contract.total_costs_etb || contract.total_expenses_etb) },
                { label: 'Profit Margin', value: rateMissing ? '—' : (contract.profit_margin_pct != null ? `${fmt(contract.profit_margin_pct, 1)}%` : '—') },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className={`text-base font-semibold ${value === '—' ? 'text-muted-foreground' : ''}`}>{value}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Profit ETB</p>
                <p className="text-3xl font-bold" style={{ color: profitColor }}>{rateMissing ? '—' : fmt(profitEtb)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Profit USD</p>
                <p className="text-3xl font-bold" style={{ color: profitColor }}>{rateMissing ? '—' : fmt(contract.profit_usd ?? contract.profit_usd)}</p>
              </div>
            </div>
          </div>

          {/* Cost rows */}
          {costRows.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold mb-3">Cost Breakdown</h3>
              <div className="space-y-2">
                {costRows.map((r, i) => (
                  <div key={i} className="flex justify-between text-sm py-1.5 border-b border-border/50 last:border-0">
                    <span className="text-muted-foreground">{r.name}</span>
                    <span className="font-medium">{fmt(r.amount_etb)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-bold pt-2">
                  <span>Total Costs</span>
                  <span>{fmt(contract.total_costs_etb || contract.total_expenses_etb)}</span>
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <div className="bg-card border border-border rounded-xl p-5">
            <PaymentHistoryPanel contract={contract} onUpdate={onUpdatePayments} />
          </div>
        </TabsContent>

        <TabsContent value="docs" className="mt-4">
          <div className="bg-card border border-border rounded-xl p-5">
            <ExportDocsPanel contract={contract} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ExportContracts() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [detailContract, setDetailContract] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ['export-contracts'],
    queryFn: () => base44.entities.ExportContract.list('-contract_date', 500),
  });
  const { data: outputReports = [] } = useQuery({
    queryKey: ['output-reports'],
    queryFn: () => base44.entities.OutputReport.list('-date', 500),
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list(),
  });
  const { data: inspections = [] } = useQuery({
    queryKey: ['buyer-inspections'],
    queryFn: () => base44.entities.BuyerInspection.list(),
  });
  const { data: sampleLogs = [] } = useQuery({
    queryKey: ['sample-logs'],
    queryFn: () => base44.entities.SampleLog.list(),
  });

  const masterCoffeeTypes = useMemo(() => {
    const types = new Set(suppliers.map(s => s.coffee_type).filter(Boolean));
    return Array.from(types).sort();
  }, [suppliers]);

  const { available: availableStock, availableRecleaned } = useAvailableStock(outputReports, contracts, inspections, sampleLogs);

  const createMutation = useMutation({
    mutationFn: data => base44.entities.ExportContract.create(data),
    onSuccess: (rec) => {
      queryClient.invalidateQueries({ queryKey: ['export-contracts'] });
      setDialogOpen(false);
      notifyExportContract(rec).catch(() => {});
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ExportContract.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['export-contracts'] }); setDialogOpen(false); setEditRecord(null); },
  });
  const deleteMutation = useMutation({
    mutationFn: id => base44.entities.ExportContract.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['export-contracts'] }); setDeleteTarget(null); },
  });
  const paymentMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ExportContract.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['export-contracts'] }),
  });

  const openNew = () => { setEditRecord(null); setDialogOpen(true); };
  const openEdit = (r) => { setDetailContract(null); setEditRecord(r); setDialogOpen(true); };

  const filteredContracts = useMemo(() => {
    if (!search.trim()) return contracts;
    const q = search.toLowerCase();
    return contracts.filter(c =>
      (c.contract_no || '').toLowerCase().includes(q) ||
      (c.contract_pi_number || '').toLowerCase().includes(q) ||
      (c.coffee_type || c.commodity || '').toLowerCase().includes(q) ||
      (c.destination_country || '').toLowerCase().includes(q) ||
      (c.buyer_name || '').toLowerCase().includes(q)
    );
  }, [contracts, search]);

  const COLS = ['#', 'Contract No', 'PI Number', 'Date', 'Coffee Type', 'Destination', 'Export KG', 'Shipped KG', 'Price', 'Total USD', 'Profit ETB', 'Profit %', 'Payment Status', 'Actions'];

  if (detailContract) {
    const current = contracts.find(c => c.id === detailContract.id) || detailContract;
    return (
      <RoleGuard allowedRoles={['admin', 'export_manager']}>
        <div>
          <ContractDetailView
            contract={current}
            onBack={() => setDetailContract(null)}
            onEdit={() => openEdit(current)}
            onUpdatePayments={data => paymentMutation.mutate({ id: current.id, data })}
          />
          <ContractForm
            open={dialogOpen}
            onOpenChange={v => { setDialogOpen(v); if (!v) setEditRecord(null); }}
            initialData={editRecord}
            contractCount={contracts.length}
            availableStock={availableStock}
            availableStockRecleaned={availableRecleaned}
            masterCoffeeTypes={masterCoffeeTypes}
            onSubmit={data => updateMutation.mutate({ id: editRecord.id, data })}
            isSubmitting={updateMutation.isPending}
          />
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard allowedRoles={['admin', 'export_manager']}>
      <div className="space-y-6">
        <PageHeader title="Export Contracts" description="Manage coffee export contracts and profitability">
          <Button onClick={openNew} className="h-11 px-5"><Plus className="w-4 h-4 mr-2" /> New Contract</Button>
        </PageHeader>

        {/* Available Stock Summary */}
        {Object.keys(availableStock).length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Available Export Stock</p>
            <div className="flex flex-wrap gap-3">
              {Object.entries(availableStock).map(([ct, kg]) => (
                <div key={ct} className={`px-3 py-2 rounded-lg border text-sm ${kg > 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                  <span className="text-muted-foreground text-xs">{ct}</span>
                  <p className={`font-bold ${kg > 0 ? 'text-green-800' : 'text-red-700'}`}>{fmt(kg, 0)} KG</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search */}
        <div className="flex items-center gap-3">
          <Input
            placeholder="Search by contract no, PI number, coffee type, destination, buyer..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="max-w-md h-10"
          />
        </div>

        {/* Table */}
        <div className="hidden md:block rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  {COLS.map(h => <TableHead key={h} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{h}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? Array(3).fill(0).map((_, i) => (
                  <TableRow key={i}>{COLS.map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>)}</TableRow>
                )) : contracts.length === 0 ? (
                  <TableRow><TableCell colSpan={COLS.length} className="text-center py-12 text-muted-foreground">No export contracts yet.</TableCell></TableRow>
                ) : filteredContracts.length === 0 ? (
                  <TableRow><TableCell colSpan={COLS.length} className="text-center py-12 text-muted-foreground">No contracts match your search.</TableCell></TableRow>
                ) : filteredContracts.slice((page - 1) * pageSize, page * pageSize).map((r, i) => {
                  const profitEtb = r.profit_etb ?? r.total_profit_etb ?? 0;
                  const shippedKg = r.actual_shipped_kg ?? r.export_kg;
                  const profitMarginPct = r.profit_margin_pct;
                  const priceLabel = r.pricing_method === 'per_lb'
                    ? (r.price_per_lb_usd ? `$${fmt(r.price_per_lb_usd, 4)}/LB` : '—')
                    : (r.price_per_kg_usd ? `$${fmt(r.price_per_kg_usd, 4)}/KG` : '—');
                  // Feature 1: rate pending detection
                  const rateMissing = !((r.contract_rate_etb || r.usd_rate_etb) > 0);
                  return (
                    <TableRow key={r.id} className={`hover:bg-muted/20 cursor-pointer ${rateMissing ? 'bg-amber-50/40' : ''}`} onClick={() => setDetailContract(r)}>
                      <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                      <TableCell className="font-mono text-xs font-semibold text-primary whitespace-nowrap">
                        {r.contract_no}
                        {rateMissing && (
                          <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 whitespace-nowrap">
                            <AlertTriangle className="w-3 h-3" /> Rate Pending
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{r.contract_pi_number || '—'}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{(r.contract_date || r.export_date) ? format(new Date(r.contract_date || r.export_date), 'dd/MM/yyyy') : '—'}</TableCell>
                      <TableCell className="whitespace-nowrap">{r.coffee_type || r.commodity}</TableCell>
                      <TableCell className="whitespace-nowrap">{r.destination_country}</TableCell>
                      <TableCell className="text-right font-medium">{fmt(r.export_kg, 0)}</TableCell>
                      <TableCell className="text-right text-green-700 font-medium">{fmt(shippedKg, 0)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap text-xs font-medium">{priceLabel}</TableCell>
                      <TableCell className="text-right font-medium">{r.total_export_value_usd ? `$${fmt(r.total_export_value_usd, 3)}` : '—'}</TableCell>
                      <TableCell className="text-right font-semibold" style={{ color: rateMissing ? '#9ca3af' : (profitEtb >= 0 ? '#126433' : '#dc2626') }}>
                        {rateMissing ? '—' : fmt(profitEtb)}
                      </TableCell>
                      <TableCell className="text-right text-xs">{rateMissing ? '—' : (profitMarginPct != null ? `${fmt(profitMarginPct, 1)}%` : '—')}</TableCell>
                      <TableCell><PayStatusBadge status={r.payment_status} /></TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1">
                          {rateMissing && (
                            <Button size="sm" variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 hover:text-amber-900 h-7 px-2 text-[11px] font-semibold whitespace-nowrap" onClick={() => openEdit(r)}>
                              Add Rate
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setDetailContract(r)}><Eye className="w-3.5 h-3.5" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => openEdit(r)}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(r)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden space-y-3">
          {contracts.map(r => {
            const profitEtb = r.profit_etb ?? r.total_profit_etb ?? 0;
            return (
              <div key={r.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-sm font-bold text-primary">{r.contract_no}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{r.coffee_type || r.commodity} → {r.destination_country}</p>
                  </div>
                  <PayStatusBadge status={r.payment_status} />
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Profit ETB</p>
                    <p className="text-xl font-bold" style={{ color: profitEtb >= 0 ? '#126433' : '#dc2626' }}>{fmt(profitEtb, 0)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Export KG</p>
                    <p className="text-sm font-semibold">{fmt(r.export_kg, 0)}</p>
                  </div>
                </div>
                <div className="flex gap-2 pt-1 border-t border-border">
                  <Button variant="default" className="flex-1 h-10 text-sm" onClick={() => setDetailContract(r)}><Eye className="w-4 h-4 mr-2" /> View</Button>
                  <Button variant="outline" className="h-10 px-4" onClick={() => openEdit(r)}><Pencil className="w-4 h-4" /></Button>
                  <Button variant="ghost" className="h-10 text-destructive px-4" onClick={() => setDeleteTarget(r)}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
            );
          })}
        </div>

        <TablePagination
          page={page}
          totalPages={Math.max(1, Math.ceil(filteredContracts.length / pageSize))}
          total={filteredContracts.length}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSize={setPageSize}
        />

        <ContractForm
          open={dialogOpen}
          onOpenChange={v => { setDialogOpen(v); if (!v) setEditRecord(null); }}
          initialData={editRecord}
          contractCount={contracts.length}
          availableStock={availableStock}
          availableStockRecleaned={availableRecleaned}
          masterCoffeeTypes={masterCoffeeTypes}
          onSubmit={data => {
            if (editRecord) updateMutation.mutate({ id: editRecord.id, data });
            else createMutation.mutate(data);
          }}
          isSubmitting={createMutation.isPending || updateMutation.isPending}
        />

        <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Contract?</AlertDialogTitle>
              <AlertDialogDescription>Delete <strong>{deleteTarget?.contract_no}</strong>? This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deleteMutation.mutate(deleteTarget.id)}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </RoleGuard>
  );
}
