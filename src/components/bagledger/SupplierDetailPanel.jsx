import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle2, Plus, Pencil, AlertCircle, Package, Coins, Lock } from 'lucide-react';
import { format } from 'date-fns';
import ReturnBagsDialog from './ReturnBagsDialog';
import PayCashDialog from './PayCashDialog';

function fmt(n, d = 0) {
  if (n == null || isNaN(n)) return '0';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function StatusPill({ settled, label }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${settled ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
      {settled ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
      {label}
    </span>
  );
}

export default function SupplierDetailPanel({ open, onOpenChange, row }) {
  const queryClient = useQueryClient();
  const [returnDialog, setReturnDialog] = useState(null); // {initial?} or null
  const [payDialog, setPayDialog] = useState(null);

  const saveReturn = useMutation({
    mutationFn: async ({ existingId, data }) => {
      if (existingId) return base44.entities.SupplierBagReturn.update(existingId, data);
      return base44.entities.SupplierBagReturn.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-bag-returns'] });
      setReturnDialog(null);
    },
  });

  const deleteReturn = useMutation({
    mutationFn: id => base44.entities.SupplierBagReturn.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-bag-returns'] });
      setReturnDialog(null);
    },
  });

  const savePayment = useMutation({
    mutationFn: async ({ existingId, data }) => {
      if (existingId) return base44.entities.SupplierBagPayment.update(existingId, data);
      return base44.entities.SupplierBagPayment.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-bag-payments'] });
      setPayDialog(null);
    },
  });

  const deletePayment = useMutation({
    mutationFn: id => base44.entities.SupplierBagPayment.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-bag-payments'] });
      setPayDialog(null);
    },
  });

  if (!row) return null;

  const returns = row.returns || [];
  const totalReturned = returns.reduce((s, r) => s + (Number(r.bags_returned) || 0), 0);
  const bagsToReturn = row.netToReturn; // already computed in summary
  const bagsRemainingToReturn = Math.max(0, bagsToReturn - totalReturned);
  const bagsFullySettled = bagsToReturn <= 0 || totalReturned >= bagsToReturn;

  const payments = row.payments || [];
  const totalPaid = row.totalPaid || 0;
  const cashRemaining = row.cashRemaining || 0;
  const cashFullySettled = row.cashEarned <= 0 || totalPaid >= row.cashEarned;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-3">
              {row.supplier}
              <span className="text-xs font-normal text-muted-foreground">
                {row._level === 'agent' ? 'Agent Bag Detail' : 'Supplier Bag Detail'}
              </span>
            </DialogTitle>
          </DialogHeader>

          {/* Status summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
            <div className="rounded-xl border border-border bg-gradient-to-br from-primary/5 to-primary/10 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Package className="w-4 h-4 text-primary" />
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Bags</span>
                <StatusPill settled={bagsFullySettled} label={bagsFullySettled ? 'Settled' : 'Pending'} />
              </div>
              <p className="text-sm">
                <span className="font-bold text-foreground">{fmt(totalReturned)}</span>
                <span className="text-muted-foreground"> returned of </span>
                <span className="font-bold text-foreground">{fmt(bagsToReturn)}</span>
                <span className="text-muted-foreground"> to return</span>
              </p>
              {bagsRemainingToReturn > 0 && (
                <p className="text-xs text-orange-700 mt-1">{fmt(bagsRemainingToReturn)} bags still to return</p>
              )}
            </div>
            <div className="rounded-xl border border-border bg-gradient-to-br from-secondary/5 to-secondary/10 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Coins className="w-4 h-4 text-secondary" />
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Cash</span>
                <StatusPill settled={cashFullySettled} label={cashFullySettled ? 'Settled' : 'Pending'} />
              </div>
              <p className="text-sm">
                <span className="font-bold text-foreground">{fmt(totalPaid, 2)}</span>
                <span className="text-muted-foreground"> ETB paid of </span>
                <span className="font-bold text-foreground">{fmt(row.cashEarned, 2)}</span>
                <span className="text-muted-foreground"> owed</span>
              </p>
              {cashRemaining > 0 && (
                <p className="text-xs text-orange-700 mt-1">{fmt(cashRemaining, 2)} ETB still owed</p>
              )}
            </div>
          </div>

          {/* Bags / Loss / Used — read-only summary (Bags Received locked if from warehouse) */}
          <section className="rounded-xl border border-border p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-medium">Bags Received</Label>
              <Input value={row.received} readOnly className="bg-muted font-semibold" />
              <p className={`text-[10px] flex items-center gap-1 ${row.bagsReceivedLocked ? 'text-muted-foreground' : 'text-primary'}`}>
                {row.bagsReceivedLocked ? <><Lock className="w-3 h-3" /> Auto from warehouse — locked</> : 'Manual entry — editable'}
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium">Loss %</Label>
              <Input value={`${row.lossPercent}%`} readOnly className="bg-muted font-semibold" />
              <p className="text-[10px] text-muted-foreground">Fixed at 1%</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium">Bags Used for Reject</Label>
              <Input value={row.used} readOnly className="bg-muted font-semibold" />
              <p className="text-[10px] text-muted-foreground">From Reject Bag Usage log</p>
            </div>
          </section>

          {/* Bag Return History */}
          <section className="rounded-xl border border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Bag Return History</h4>
              <Button
                size="sm"
                onClick={() => setReturnDialog({ initial: null })}
                disabled={bagsRemainingToReturn <= 0 && bagsToReturn > 0}
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Record Return
              </Button>
            </div>
            {returns.length === 0 ? (
              <p className="text-sm text-muted-foreground italic py-2">No returns recorded yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs text-right">Bags Returned</TableHead>
                    <TableHead className="text-xs">Note</TableHead>
                    <TableHead className="text-xs w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {returns.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm">{r.return_date ? format(new Date(r.return_date), 'd MMM yyyy') : '—'}</TableCell>
                      <TableCell className="text-sm text-right font-semibold">{fmt(r.bags_returned)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.note || '—'}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setReturnDialog({ initial: r })}>
                          <Pencil className="w-3 h-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <div className="flex justify-between pt-2 border-t border-border text-sm">
              <span>Total Returned: <span className="font-bold">{fmt(totalReturned)}</span></span>
              <span className={bagsRemainingToReturn > 0 ? 'text-orange-700' : 'text-green-700'}>
                Remaining: <span className="font-bold">{fmt(bagsRemainingToReturn)}</span>
              </span>
            </div>
          </section>

          {/* Cash Payment History */}
          <section className="rounded-xl border border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Cash Payment History</h4>
              <Button
                size="sm"
                onClick={() => setPayDialog({ initial: null })}
                disabled={cashRemaining <= 0 && row.cashEarned > 0}
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Record Payment
              </Button>
            </div>
            {payments.length === 0 ? (
              <p className="text-sm text-muted-foreground italic py-2">No payments recorded yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Bank</TableHead>
                    <TableHead className="text-xs">Reference</TableHead>
                    <TableHead className="text-xs text-right">Amount ETB</TableHead>
                    <TableHead className="text-xs">Note</TableHead>
                    <TableHead className="text-xs w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm">{p.payment_date ? format(new Date(p.payment_date), 'd MMM yyyy') : '—'}</TableCell>
                      <TableCell className="text-sm">{p.bank_name || '—'}</TableCell>
                      <TableCell className="text-xs font-mono">{p.reference_no || '—'}</TableCell>
                      <TableCell className="text-sm text-right font-semibold text-green-700">{fmt(p.amount_etb, 2)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.note || '—'}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setPayDialog({ initial: p })}>
                          <Pencil className="w-3 h-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <div className="flex justify-between pt-2 border-t border-border text-sm">
              <span>Total Paid: <span className="font-bold text-green-700">{fmt(totalPaid, 2)} ETB</span></span>
              <span className={cashRemaining > 0 ? 'text-orange-700' : 'text-green-700'}>
                Remaining Owed: <span className="font-bold">{fmt(cashRemaining, 2)} ETB</span>
              </span>
            </div>
          </section>

          <DialogFooter className="pt-2 border-t border-border">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReturnBagsDialog
        open={!!returnDialog}
        onOpenChange={v => !v && setReturnDialog(null)}
        supplier={row.supplier}
        netToReturn={bagsToReturn}
        otherReturned={totalReturned - (Number(returnDialog?.initial?.bags_returned) || 0)}
        initialReturn={returnDialog?.initial}
        onSubmit={data => {
          const payload = row._level === 'agent'
            ? { ...data, agent_name: row.supplier, supplier_name: null }
            : { ...data, supplier_name: row.supplier, agent_name: null };
          saveReturn.mutate({ existingId: returnDialog?.initial?.id, data: payload });
        }}
        onDelete={() => returnDialog?.initial?.id && deleteReturn.mutate(returnDialog.initial.id)}
        isSubmitting={saveReturn.isPending || deleteReturn.isPending}
      />

      <PayCashDialog
        open={!!payDialog}
        onOpenChange={v => !v && setPayDialog(null)}
        supplier={row.supplier}
        cashOwed={row.cashEarned}
        otherPaid={totalPaid - (Number(payDialog?.initial?.amount_etb) || 0)}
        initialPayment={payDialog?.initial}
        onSubmit={data => {
          const payload = row._level === 'agent'
            ? { ...data, agent_name: row.supplier, supplier_name: null }
            : { ...data, supplier_name: row.supplier, agent_name: null };
          savePayment.mutate({ existingId: payDialog?.initial?.id, data: payload });
        }}
        onDelete={() => payDialog?.initial?.id && deletePayment.mutate(payDialog.initial.id)}
        isSubmitting={savePayment.isPending || deletePayment.isPending}
      />
    </>
  );
}