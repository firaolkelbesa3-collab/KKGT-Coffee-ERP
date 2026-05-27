import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import NumberInput from '@/components/shared/NumberInput';
import { AlertCircle } from 'lucide-react';

function todayStr() { return new Date().toISOString().slice(0, 10); }

export default function ReturnBagsDialog({ open, onOpenChange, supplier, netToReturn = 0, otherReturned = 0, initialReturn, onSubmit, onDelete, isSubmitting }) {
  const [date, setDate] = useState('');
  const [bags, setBags] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    if (initialReturn) {
      setDate(initialReturn.return_date || todayStr());
      setBags(String(initialReturn.bags_returned ?? ''));
      setNote(initialReturn.note || '');
    } else {
      setDate(todayStr());
      const remaining = Math.max(0, netToReturn - otherReturned);
      setBags(remaining > 0 ? String(remaining) : '');
      setNote('');
    }
  }, [open, initialReturn, netToReturn, otherReturned]);

  const bagsNum = parseFloat(bags) || 0;
  // Remaining = netToReturn minus returns OTHER than this one being edited
  const remaining = Math.max(0, netToReturn - otherReturned);
  const exceeds = bagsNum > remaining;
  const canSubmit = !!date && bagsNum > 0 && !exceeds;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      supplier_name: supplier,
      return_date: date,
      bags_returned: bagsNum,
      note: note || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">
            {initialReturn ? 'Edit Return' : 'Record Return'} — {supplier}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Net to Return:</span>
              <span className="font-semibold">{netToReturn}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Already Returned:</span>
              <span className="font-semibold text-green-700">{otherReturned}</span>
            </div>
            <div className="flex justify-between border-t border-border mt-1 pt-1">
              <span className="font-semibold">You have <span className="text-orange-700">{remaining}</span> bags remaining to return.</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Date *</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Bags Returned *</Label>
              <NumberInput decimals={0} value={bags} onChange={setBags} placeholder="0" required />
            </div>
          </div>

          {exceeds && (
            <div className="flex items-start gap-2 p-2.5 rounded-md bg-red-50 border border-red-200 text-destructive text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>Cannot return more than {remaining} bags.</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Note</Label>
            <Textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Optional..." />
          </div>

          <DialogFooter className="gap-2">
            {initialReturn && onDelete && (
              <Button type="button" variant="outline" className="text-destructive hover:text-destructive mr-auto" onClick={onDelete}>
                Delete
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting || !canSubmit}>
              {isSubmitting ? 'Saving...' : initialReturn ? 'Update' : 'Save Return'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}