import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { X, Pencil, FileText } from 'lucide-react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import { parsePayments } from '@/components/purchases/PaymentHistoryPanel';
import { calcTotalPaid, calcBalance, calcPaymentStatus } from '@/lib/paymentUtils';

function fmt(n, d = 2) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtDate(str) {
  if (!str) return '—';
  try { return format(new Date(str), 'dd/MM/yyyy'); } catch { return str; }
}

function parseCosts(p) {
  if (!p?.additional_costs) return [];
  try {
    const parsed = JSON.parse(p.additional_costs);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function generatePDF(record, receipt, payments, costs, totals) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = 18;

  // Header band
  doc.setFillColor(18, 100, 51);
  doc.rect(0, 0, pageWidth, 14, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text('COFFEE ERP', margin, 9);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Generated ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, pageWidth - margin, 9, { align: 'right' });

  y = 22;
  doc.setTextColor(18, 100, 51);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Purchase Record Detail', margin, y);
  y += 8;

  // Summary block
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(10);
  const rows = [
    ['Coffee Code', record.coffee_code || '—'],
    ['Purchase Date', fmtDate(record.purchase_date)],
    ['Supplier', record.supplier_name || '—'],
    ['Region', record.region || '—'],
    ['Coffee Type', record.coffee_type || '—'],
    ['Warehouse Received KG', receipt ? fmt(receipt.warehouse_received_net_kg) : '— (no receipt)'],
    ['Unit Price ETB/Feresula', fmt(record.unit_price_etb_per_feresula)],
    ['Commission %', record.commission_percent != null ? `${record.commission_percent}%` : '—'],
    ['Grand Total ETB', fmt(record.grand_total_etb)],
    ['Total Paid ETB', fmt(totals.totalPaid)],
    ['Balance ETB', fmt(totals.balance)],
    ['Status', totals.status],
  ];
  rows.forEach(([k, v]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(`${k}:`, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(String(v), margin + 55, y);
    y += 6;
  });

  // Additional costs
  if (costs.length > 0) {
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(18, 100, 51);
    doc.text('Additional Costs', margin, y);
    y += 6;
    doc.setTextColor(30, 30, 30);
    doc.setFont('helvetica', 'normal');
    costs.forEach(c => {
      doc.text(`• ${c.name || '—'}`, margin + 2, y);
      doc.text(fmt(c.amount), pageWidth - margin, y, { align: 'right' });
      y += 5.5;
    });
  }

  // Payments table
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(18, 100, 51);
  doc.text('Payment History', margin, y);
  y += 6;
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(8);

  const cols = ['Date', 'Bank', 'Branch', 'CPV Ref', 'Type', 'Amount ETB'];
  const colW = [25, 24, 32, 30, 30, 30];
  let x = margin;
  doc.setFillColor(18, 100, 51);
  doc.rect(margin, y - 4, pageWidth - margin * 2, 6, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  cols.forEach((c, i) => { doc.text(c, x + 1, y); x += colW[i]; });
  y += 4;
  doc.setTextColor(30, 30, 30);
  doc.setFont('helvetica', 'normal');

  if (payments.length === 0) {
    y += 4;
    doc.setTextColor(120, 120, 120);
    doc.text('No payments recorded.', margin, y);
  } else {
    payments.forEach((pay, ri) => {
      x = margin;
      if (ri % 2 === 0) {
        doc.setFillColor(248, 253, 248);
        doc.rect(margin, y - 3, pageWidth - margin * 2, 6, 'F');
      }
      const cells = [
        pay.payment_date || '—',
        pay.bank_name || '—',
        pay.branch_account || '—',
        pay.cpv_reference || '—',
        pay.payment_type || '—',
        fmt(parseFloat(pay.amount_etb)),
      ];
      cells.forEach((c, i) => {
        const align = i === 5 ? { align: 'right' } : {};
        const xPos = i === 5 ? x + colW[i] - 2 : x + 1;
        doc.text(String(c), xPos, y, align);
        x += colW[i];
      });
      y += 6;
    });
  }

  doc.save(`Purchase_${record.coffee_code || record.id}.pdf`);
}

export default function PurchaseDetailPanel({ record, receipt, open, onClose }) {
  const navigate = useNavigate();

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!record) return null;

  const payments = parsePayments(record).slice().sort((a, b) =>
    (a.payment_date || '') > (b.payment_date || '') ? 1 : -1
  );
  const totalPaid = calcTotalPaid(record);
  const balance = calcBalance(record.grand_total_etb, totalPaid);
  const status = record.grand_total_etb == null
    ? 'Pending'
    : (calcPaymentStatus(record.grand_total_etb, totalPaid) ?? 'Unpaid');
  const costs = parseCosts(record);

  const statusClass =
    status === 'Paid' ? 'bg-green-100 text-green-700' :
    status === 'Partial' ? 'bg-amber-100 text-amber-700' :
    status === 'Unpaid' ? 'bg-red-100 text-red-700' :
    'bg-muted text-muted-foreground';

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/40 z-40 transition-opacity ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Slide-out panel */}
      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-[640px] bg-card border-l border-border z-50 shadow-2xl transition-transform duration-300 flex flex-col ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border bg-gradient-to-r from-primary/10 to-secondary/5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Purchase Detail</p>
            <h3 className="font-display font-bold text-lg text-foreground truncate">{record.coffee_code || '—'}</h3>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Button size="sm" variant="outline" onClick={() => navigate(`/purchase-registration?edit=${record.id}`)} className="gap-1.5">
              <Pencil className="w-3.5 h-3.5" /> Edit
            </Button>
            <Button size="sm" variant="outline" onClick={() => generatePDF(record, receipt, payments, costs, { totalPaid, balance: balance ?? 0, status })} className="gap-1.5">
              <FileText className="w-3.5 h-3.5" /> Print PDF
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose} className="gap-1.5">
              <X className="w-4 h-4" /> Close
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Summary card */}
          <section className="rounded-xl border border-border bg-muted/20 p-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Field label="Date" value={fmtDate(record.purchase_date)} />
            <Field label="Supplier" value={record.supplier_name || '—'} />
            <Field label="Region" value={record.region || '—'} />
            <Field label="Coffee Type" value={record.coffee_type || '—'} />
            <Field label="Warehouse Received KG" value={receipt ? `${fmt(receipt.warehouse_received_net_kg)} kg` : <span className="italic text-muted-foreground">— no receipt</span>} />
            <Field label="Unit Price (ETB/Feresula)" value={fmt(record.unit_price_etb_per_feresula)} />
            <Field
              label="Grand Total ETB"
              value={<span className="font-bold text-primary">{fmt(record.grand_total_etb)}</span>}
            />
            <Field
              label="Status"
              value={<span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${statusClass}`}>{status}</span>}
            />
          </section>

          {/* Additional costs */}
          <section>
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Additional Costs</h4>
            {costs.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No additional costs recorded.</p>
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="text-xs">Name</TableHead>
                      <TableHead className="text-xs text-right">Amount ETB</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {costs.map((c, i) => (
                      <TableRow key={i}>
                        <TableCell>{c.name || '—'}</TableCell>
                        <TableCell className="text-right">{fmt(c.amount)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/30 font-bold border-t-2 border-border">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right">
                        {fmt(costs.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0))}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </section>

          {/* Payment History */}
          <section>
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Payment History</h4>
            {payments.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No payments recorded.</p>
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead className="text-xs whitespace-nowrap">Date</TableHead>
                        <TableHead className="text-xs">Bank</TableHead>
                        <TableHead className="text-xs">Branch</TableHead>
                        <TableHead className="text-xs">CPV Reference</TableHead>
                        <TableHead className="text-xs">Type</TableHead>
                        <TableHead className="text-xs text-right">Amount ETB</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((pay, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs whitespace-nowrap">{pay.payment_date || '—'}</TableCell>
                          <TableCell className="text-xs">{pay.bank_name || '—'}</TableCell>
                          <TableCell className="text-xs">{pay.branch_account || '—'}</TableCell>
                          <TableCell className="text-xs font-mono">{pay.cpv_reference || '—'}</TableCell>
                          <TableCell className="text-xs">{pay.payment_type || '—'}</TableCell>
                          <TableCell className="text-right font-semibold">{fmt(parseFloat(pay.amount_etb))}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </section>

          {/* Balance summary */}
          <section className="rounded-xl border border-primary/20 bg-primary/5 p-4 grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Grand Total</p>
              <p className="font-bold text-foreground">{fmt(record.grand_total_etb)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Paid</p>
              <p className="font-bold text-primary">{fmt(totalPaid)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Balance</p>
              <p className={`font-bold ${(balance ?? 0) > 0 ? 'text-destructive' : 'text-green-700'}`}>
                {balance == null ? '—' : fmt(balance)}
              </p>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      <p className="text-sm font-medium text-foreground mt-0.5">{value}</p>
    </div>
  );
}