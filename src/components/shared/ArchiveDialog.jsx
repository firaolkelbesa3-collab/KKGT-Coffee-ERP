import React, { useEffect, useState } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { AlertTriangle } from 'lucide-react';

/**
 * Generic archive confirmation dialog.
 *
 * Props:
 * - open / onOpenChange
 * - title (default "Archive Record?")
 * - description (string — main warning text)
 * - cascadeMessage (optional string — e.g. "This will also archive 2 warehouse receipts, 3 payments, 1 processing entry linked to this purchase.")
 * - onConfirm(reason)
 * - isPending
 */
export default function ArchiveDialog({
  open,
  onOpenChange,
  title = 'Archive Record?',
  description,
  cascadeMessage,
  onConfirm,
  isPending,
}) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              {description && <p>{description}</p>}
              {cascadeMessage && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 text-xs font-medium">
                  ⚠ {cascadeMessage}
                </div>
              )}
              <p className="text-muted-foreground text-xs">
                The record will be hidden from normal views but can be restored later by an admin.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Reason (optional)</Label>
          <Textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={2}
            placeholder="Why are you archiving this record?"
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            className="bg-destructive hover:bg-destructive/90"
            onClick={(e) => {
              e.preventDefault();
              onConfirm(reason);
            }}
          >
            {isPending ? 'Archiving...' : 'Archive'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}