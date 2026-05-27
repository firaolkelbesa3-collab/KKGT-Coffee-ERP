import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, XCircle } from 'lucide-react';
import { format } from 'date-fns';

function fmt(n) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/**
 * Props:
 *   open, onOpenChange
 *   duplicate — the existing PurchaseRecord that conflicts
 *   codeConflict — the existing record that has the same coffee_code (blocks save)
 *   onConfirmSave — called when user confirms it's a genuine second purchase
 */
export default function DuplicateConfirmDialog({ open, onOpenChange, duplicate, codeConflict, onConfirmSave }) {
  const [choice, setChoice] = useState('genuine');

  const handleConfirm = () => {
    if (codeConflict) {
      onOpenChange(false);
      return;
    }
    if (choice === 'genuine') {
      onConfirmSave();
    }
    onOpenChange(false);
  };

  // Code conflict — hard block
  if (codeConflict) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="w-5 h-5" /> Cannot Save — Duplicate Coffee Code
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive font-medium font-mono">
              {codeConflict.coffee_code} already exists.
            </div>
            <p className="text-muted-foreground">Coffee codes must be unique. Please check and try again.</p>
            <p className="text-xs text-muted-foreground">
              Existing: {codeConflict.supplier_name} — {codeConflict.purchase_date ? format(new Date(codeConflict.purchase_date), 'd MMM yyyy') : ''}
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Go Back</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (!duplicate) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-700">
            <AlertTriangle className="w-5 h-5" /> Duplicate Purchase Warning
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 space-y-1">
            <p className="font-semibold text-amber-900">A purchase already exists for:</p>
            <p><span className="text-muted-foreground">Supplier:</span> <strong>{duplicate.supplier_name}</strong></p>
            <p><span className="text-muted-foreground">Date:</span> <strong>{duplicate.purchase_date ? format(new Date(duplicate.purchase_date), 'd MMM yyyy') : '—'}</strong></p>
            <p><span className="text-muted-foreground">Existing code:</span> <span className="font-mono font-medium">{duplicate.coffee_code}</span></p>
            <p><span className="text-muted-foreground">Existing Grand Total:</span> <strong>{fmt(duplicate.grand_total_etb)} ETB</strong></p>
          </div>

          <p className="text-foreground font-medium">
            You are about to create another purchase for the same supplier on the same date.
            This may be a mistake. Please confirm:
          </p>

          <div className="space-y-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="dup_choice"
                value="genuine"
                checked={choice === 'genuine'}
                onChange={() => setChoice('genuine')}
                className="mt-0.5 accent-primary"
              />
              <span className="text-sm">This is a genuine second purchase (different lot)</span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="dup_choice"
                value="mistake"
                checked={choice === 'mistake'}
                onChange={() => setChoice('mistake')}
                className="mt-0.5 accent-destructive"
              />
              <span className="text-sm text-destructive">I made a mistake — go back and cancel</span>
            </label>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel — Go Back</Button>
          <Button
            variant={choice === 'mistake' ? 'outline' : 'default'}
            disabled={choice === 'mistake'}
            onClick={handleConfirm}
          >
            Confirm — Save Anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}