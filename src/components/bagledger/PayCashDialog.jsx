import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import NumberInput from '@/components/shared/NumberInput';
import { AlertCircle } from 'lucide-react';

function todayStr() { return new Date().toISOString().slice(0, 10); }

const BANKS = ['CBE', 'AWASH', 'BOA', 'COOP', 'DASHEN', 'OROMI', 'Other'];
const PAYMENT_TYPES = ['Advance', 'Final Payment'];

function fmt(n, d = 2) {
  if (n == null || isNaN(n)) return '0';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export default function PayCashDialog({ open, onOpenChange, supplier, cashOwed = 0, otherPaid = 0, initialPayment, onSubmit, onDelete, isSubmitting }) {
  const [date, setDate] = useState('');
  const [bank, setBank] = useState('');
  const [branchAccount, setBranchAccount] = useState('');
  const [ref, setRef] = useState('');
  const [paymentType, setPaymentType] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    if (initialPayment) {
      setDate(initialPayment.payment_date || todayStr());
      setBank(initialPayment.bank_name || '');
      setBranchAccount(initialPayment.branch_account || '');
      setRef(initialPayment.reference_no || '');
      setPaymentType(initialPayment.payment_type || '');
      setAmount(initialPayment.amount_etb ?? '');
      setNote(initialPayment.note || '');
    } else {
      const remaining = Math.max(0, cashOwed - otherPaid);
      setDate(todayStr());
      setBank('');
      setBranchAccount('');
      setRef('');
      setPaymentType('');
      setAmount(remaining > 0 ? remaining : '');
      setNote('');
    }
  }, [open, initialPayment, cashOwed, otherPaid]);

  const amt = parseFloat(amount) || 0;
  // Remaining = cashOwed minus payments OTHER than this one being edited
  const remaining = Math.max(0, cashOwed - otherPaid);
  const exceeds = amt > remaining + 0.001;
  const canSubmit = !!date && amt > 0 && !exceeds;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      supplier_name: supplier,
      payment_date: date,
      bank_name: bank || null,
      branch_account: branchAccount || null,
      reference_no: ref || null,
      payment_type: paymentType || null,
      amount_etb: amt,
      note: note || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">
            {initialPayment ? 'Edit Payment' : 'Record Payment'} — {supplier}
          </DialogTitle>
        </DialogHeader>

        {/* Remaining owed callout */}
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Cash Owed:</span>
            <span className="font-semibold">{fmt(cashOwed)} ETB</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Already Paid:</span>
            <span className="font-semibold text-green-700">{fmt(otherPaid)} ETB</span>
          </div>
          <div className="flex justify-between border-t border-border mt-1 pt-1">
            <span className="font-semibold">Remaining Owed:</span>
            <span className={`font-bold ${remaining > 0 ? 'text-orange-700' : 'text-green-700'}`}>{fmt(remaining)} ETB</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Payment Date *</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Amount ETB *</Label>
              <NumberInput decimals={2} value={amount} onChange={setAmount} placeholder="0.00" required />
            </div>
          </div>

          {exceeds && (
            <div className="flex items-start gap-2 p-2.5 rounded-md bg-red-50 border border-red-200 text-destructive text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>Cannot pay more than {fmt(remaining)} ETB remaining.</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Bank</Label>
              <Select value={bank} onValueChange={setBank}>
                <SelectTrigger><SelectValue placeholder="Choose bank" /></SelectTrigger>
                <SelectContent>
                  {BANKS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Branch / Account</Label>
              <Input value={branchAccount} onChange={e => setBranchAccount(e.target.value)} placeholder="e.g. Bole / 1000123456" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">CPV Reference</Label>
              <Input value={ref} onChange={e => setRef(e.target.value)} placeholder="e.g. CPV-001" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Payment Type</Label>
              <Select value={paymentType} onValueChange={setPaymentType}>
                <SelectTrigger><SelectValue placeholder="Choose type" /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Note</Label>
            <Textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Optional..." />
          </div>

          <DialogFooter className="gap-2">
            {initialPayment && onDelete && (
              <Button type="button" variant="outline" className="text-destructive hover:text-destructive mr-auto" onClick={onDelete}>
                Delete
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting || !canSubmit}>
              {isSubmitting ? 'Saving...' : initialPayment ? 'Update Payment' : 'Record Payment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}