import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, CreditCard } from 'lucide-react';
import NumberInput from '@/components/shared/NumberInput';

function fmt(n, d = 2) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export const BANKS = ['CBE', 'AWASH', 'BOA', 'COOP', 'OROMI', 'DASHIN', 'Other'];
export const PAYMENT_TYPES = ['Advance', 'Final Payment', 'Adjustment'];

const EMPTY_PAYMENT = {
  payment_date: new Date().toISOString().slice(0, 10),
  bank_name: '',
  branch_account: '',
  amount_etb: '',
  cpv_reference: '',
  payment_type: 'Advance',
  note: '',
};

function PaymentRow({ payment, index, onChange, onRemove }) {
  const set = (k, v) => onChange({ ...payment, [k]: v });

  return (
    <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/10">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">Payment #{payment.payment_no}</span>
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={onRemove}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Payment Date *</Label>
          <Input type="date" value={payment.payment_date} onChange={e => set('payment_date', e.target.value)} className="h-9 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Bank *</Label>
          <Select value={payment.bank_name} onValueChange={v => set('bank_name', v)}>
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select bank" /></SelectTrigger>
            <SelectContent>{BANKS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Branch / Account</Label>
          <Input value={payment.branch_account} onChange={e => set('branch_account', e.target.value)} placeholder="e.g. CBE-18" className="h-9 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Amount ETB *</Label>
          <NumberInput decimals={2} value={payment.amount_etb} onChange={v => set('amount_etb', v)} placeholder="0.00" className="h-9 text-sm font-semibold" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">CPV Reference</Label>
          <Input value={payment.cpv_reference} onChange={e => set('cpv_reference', e.target.value)} placeholder="e.g. CPV-299" className="h-9 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Payment Type</Label>
          <Select value={payment.payment_type} onValueChange={v => set('payment_type', v)}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{PAYMENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1 col-span-2">
          <Label className="text-xs text-muted-foreground">Note</Label>
          <Input value={payment.note} onChange={e => set('note', e.target.value)} placeholder="Optional..." className="h-9 text-sm" />
        </div>
      </div>
    </div>
  );
}

export default function PaymentHistoryPanel({ payments, onChange, grandTotalEtb }) {
  const totalPaid = payments.reduce((s, p) => s + (parseFloat(p.amount_etb) || 0), 0);
  const balance = grandTotalEtb != null ? grandTotalEtb - totalPaid : null;
  const progress = grandTotalEtb > 0 ? Math.min(100, (totalPaid / grandTotalEtb) * 100) : 0;
  const hasAdjustment = payments.some(p => (parseFloat(p.amount_etb) || 0) < 0);

  const addPayment = () => {
    const nextNo = payments.length + 1;
    onChange([...payments, { ...EMPTY_PAYMENT, payment_no: nextNo }]);
  };

  const updatePayment = (i, val) => onChange(payments.map((p, idx) => idx === i ? val : p));

  const removePayment = (i) => {
    const updated = payments.filter((_, idx) => idx !== i).map((p, idx) => ({ ...p, payment_no: idx + 1 }));
    onChange(updated);
  };

  let statusBadge = null;
  if (grandTotalEtb != null) {
    if (balance != null && Math.abs(balance) <= 1) {
      statusBadge = <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800">✅ FULLY PAID</span>;
    } else if (balance != null && balance < -1) {
      statusBadge = <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-800">⚠️ OVERPAID</span>;
    } else if (hasAdjustment) {
      statusBadge = <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800">🔵 HAS ADJUSTMENT</span>;
    } else if (totalPaid > 0) {
      statusBadge = <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-800">🟡 PARTIALLY PAID — {balance != null ? `${fmt(balance)} ETB remaining` : ''}</span>;
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Payment History</span>
          {statusBadge}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addPayment} className="h-8 gap-1">
          <Plus className="w-3.5 h-3.5" /> Add Payment
        </Button>
      </div>

      {payments.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground text-sm border border-dashed border-border rounded-lg">
          No payments recorded yet. Click "Add Payment" to log a payment.
        </div>
      ) : (
        <div className="space-y-2">
          {payments.map((p, i) => (
            <PaymentRow key={i} payment={p} index={i} onChange={val => updatePayment(i, val)} onRemove={() => removePayment(i)} />
          ))}
        </div>
      )}

      {/* Summary */}
      <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Total Paid</p>
            <p className="font-bold text-foreground">{fmt(totalPaid)} ETB</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Balance</p>
            <p className={`font-bold ${balance == null ? 'text-muted-foreground' : balance > 0 ? 'text-destructive' : 'text-green-700'}`}>
              {balance != null ? `${fmt(balance)} ETB` : '— (pending receipt)'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Progress</p>
            <p className="font-bold text-foreground">{grandTotalEtb > 0 ? `${progress.toFixed(1)}%` : '—'}</p>
          </div>
        </div>
        {grandTotalEtb > 0 && (
          <div>
            <div className="h-2.5 rounded-full bg-border overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${progress >= 100 ? 'bg-green-500' : progress > 50 ? 'bg-secondary' : 'bg-primary'}`}
                style={{ width: `${Math.min(100, progress)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">{fmt(totalPaid)} / {fmt(grandTotalEtb)} ETB paid</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Utility: parse payment history from record (payment_history JSON only)
export function parsePayments(record) {
  if (!record) return [];
  try {
    const parsed = JSON.parse(record.payment_history || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Utility: get payment status label
export function getPaymentStatus(totalPaid, grandTotal) {
  if (grandTotal == null || grandTotal === 0) return null;
  if (totalPaid <= 0) return 'Unpaid';
  const diff = grandTotal - totalPaid;
  if (Math.abs(diff) <= 1) return 'Paid';
  if (diff < -1) return 'Overpaid';
  return 'Partial';
}

// Payment status badge for tables
export function PaymentStatusBadge({ status }) {
  if (!status) return <span className="text-muted-foreground text-xs">—</span>;
  const config = {
    'Paid':     { label: 'Paid ✓',      cls: 'bg-green-100 text-green-800' },
    'Partial':  { label: 'Partial',      cls: 'bg-orange-100 text-orange-800' },
    'Unpaid':   { label: 'Unpaid',       cls: 'bg-red-100 text-red-700' },
    'Overpaid': { label: 'Overpaid ⚠️', cls: 'bg-yellow-100 text-yellow-800' },
  };
  const { label, cls } = config[status] || { label: status, cls: 'bg-muted' };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${cls}`}>{label}</span>;
}