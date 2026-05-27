import React, { useEffect, useState } from 'react';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { useRole } from '@/lib/useRole';

function fmt(n) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Rich archive confirmation dialog with linked records, impact list, and optional CONFIRM typing.
 *
 * Props:
 * - open / onOpenChange
 * - title
 * - mainRecord: { label, ref } — the record being archived
 * - linkedRecords: Array<{ icon, label, count, detail, amountEtb? }>
 * - impacts: Array<string> — dashboard/report impacts
 * - requireConfirm: boolean — if true, user must type "CONFIRM"
 * - onConfirm(reason: string)
 * - isPending
 */
export default function RichArchiveDialog({
  open,
  onOpenChange,
  title = 'Archive Record?',
  mainRecord,
  linkedRecords = [],
  impacts = [],
  requireConfirm = false,
  onConfirm,
  isPending,
}) {
  const { isAdminOrSupervisor } = useRole();
  const [reason, setReason] = useState('');
  const [confirmText, setConfirmText] = useState('');

  useEffect(() => {
    if (open) { setReason(''); setConfirmText(''); }
  }, [open]);

  const canProceed = isAdminOrSupervisor && (!requireConfirm || confirmText.trim() === 'CONFIRM');
  const totalLinked = linkedRecords.reduce((s, r) => s + (r.count || 0), 0);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            {title}
          </AlertDialogTitle>
        </AlertDialogHeader>

        <div className="space-y-4 text-sm">
          {/* Main record */}
          {mainRecord && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="font-semibold text-amber-900">📋 {mainRecord.label}</p>
              {mainRecord.ref && <p className="text-xs text-amber-700 mt-0.5">{mainRecord.ref}</p>}
            </div>
          )}

          {/* Linked records */}
          {linkedRecords.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 space-y-2">
              <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2">
                Linked records that will also be archived:
              </p>
              {linkedRecords.map((r, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-green-600 font-bold text-sm mt-0.5">✓</span>
                  <div>
                    <span className="text-sm font-medium">{r.count} {r.label}</span>
                    {r.detail && <span className="text-muted-foreground text-xs ml-1">({r.detail})</span>}
                    {r.amountEtb != null && (
                      <span className={`ml-1 text-xs font-semibold ${r.amountEtb >= 1000000 ? 'text-destructive' : 'text-foreground'}`}>
                        — {fmt(r.amountEtb)} ETB
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {totalLinked > 0 && (
                <p className="text-xs text-muted-foreground border-t border-border pt-2 mt-2 font-medium">
                  Total linked records: {totalLinked}
                </p>
              )}
            </div>
          )}

          {linkedRecords.length === 0 && (
            <p className="text-xs text-muted-foreground italic">No linked records will be archived.</p>
          )}

          {/* Report impacts */}
          {impacts.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 space-y-1">
              <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-1">This action will affect your:</p>
              {impacts.map((imp, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs text-foreground">
                  <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                  {imp}
                </div>
              ))}
            </div>
          )}

          {/* Role gate */}
          {!isAdminOrSupervisor && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive font-semibold">
              🔒 Contact admin to delete — only Admin or Supervisor can archive records.
            </div>
          )}

          {/* Reason */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Reason (optional)</Label>
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={2}
              placeholder="Why are you archiving this record?"
              disabled={!isAdminOrSupervisor}
            />
          </div>

          {/* CONFIRM typing */}
          {requireConfirm && isAdminOrSupervisor && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Type <span className="font-mono font-bold text-destructive">CONFIRM</span> to proceed
              </Label>
              <Input
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder="Type CONFIRM..."
                className="font-mono"
              />
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            The record will be hidden from normal views but can be restored later by an admin.
          </p>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={isPending || !canProceed}
            onClick={() => onConfirm(reason)}
          >
            {isPending ? 'Archiving...' : 'Archive'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}