import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AttachmentSlot, CompactAttachSlot } from './FileAttachments';
import { parsePayments } from '@/components/purchases/PaymentHistoryPanel';
import { FileText, Receipt, Warehouse } from 'lucide-react';
import { base44 } from '@/api/supabaseClient';

function SectionHeader({ icon: Icon, label, subtitle }) {
  return (
    <div className="flex items-start gap-2 mb-3">
      <div className="mt-0.5 h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">{label}</p>
        {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

export default function PurchaseAttachmentsPanel({ purchase }) {
  const qc = useQueryClient();
  const { data: attachments = [] } = useQuery({
    queryKey: ['attachments', 'purchase_record', purchase.id],
    queryFn: () => base44.entities.Attachment.filter({ entity_type: 'purchase_record', entity_id: purchase.id }),
    enabled: !!purchase.id,
  });

  const createMut = useMutation({
    mutationFn: data => base44.entities.Attachment.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attachments', 'purchase_record', purchase.id] }),
  });
  const deleteMut = useMutation({
    mutationFn: id => base44.entities.Attachment.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attachments', 'purchase_record', purchase.id] }),
  });

  const handleAdd = (section, sectionRef) => (att) => {
    createMut.mutate({
      entity_type: 'purchase_record',
      entity_id: purchase.id,
      section,
      section_ref: sectionRef || '',
      file_url: att.file_url,
      storage_path: att.storage_path || att.file_url,
      file_name: att.file_name,
      file_size: att.file_size,
      uploaded_at: att.uploaded_at,
      uploaded_by: att.uploaded_by,
    });
  };

  const handleDelete = (att) => deleteMut.mutate(att.id);

  const contractDocs = attachments.filter(a => a.section === 'contract_document');
  const grnDocs = attachments.filter(a => a.section === 'grn_certificate');
  const payments = parsePayments(purchase);

  return (
    <div className="space-y-6 py-2">
      {/* ── Section 1: Purchase Contract ─────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <SectionHeader
          icon={FileText}
          label="Purchase Contract"
          subtitle="Upload the signed purchase contract for this lot"
        />
        <AttachmentSlot
          label=""
          emptyLabel="Upload signed contract"
          subtext="PDF, JPG, PNG · Max 10 MB"
          attachments={contractDocs}
          entityType="purchase_record"
          entityId={purchase.id}
          onAdd={handleAdd('contract_document', 'signed_contract')}
          onDelete={handleDelete}
        />
      </div>

      {/* ── Section 2: Payment Vouchers (CPV slips) ───────────────── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <SectionHeader
          icon={Receipt}
          label="Payment Vouchers"
          subtitle="Attach the bank payment slip for each CPV reference number"
        />
        {payments.length === 0 ? (
          <div className="text-xs text-muted-foreground border border-dashed border-border rounded-lg py-4 text-center">
            No payment entries yet. Add payments in the Purchase Details tab first.
          </div>
        ) : (
          <div className="space-y-3">
            {payments.map((pay, i) => {
              const ref = pay.cpv_reference || `payment-${i + 1}`;
              const cpvLabel = pay.cpv_reference ? `CPV-${pay.cpv_reference}` : `Payment #${i + 1}`;
              const amount = parseFloat(pay.amount_etb) || 0;
              const slotAtts = attachments.filter(a => a.section === 'payment_voucher' && a.section_ref === ref);

              return (
                <div key={`${ref}-${i}`} className="border border-border rounded-lg p-3 bg-muted/20">
                  {/* Payment row header */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Receipt className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20 flex-shrink-0">
                        {cpvLabel}
                      </span>
                      <span className="text-xs text-muted-foreground truncate">
                        {pay.bank_name || '—'} · ETB {amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        {pay.payment_date ? ` · ${pay.payment_date}` : ''}
                      </span>
                    </div>
                  </div>

                  {/* Compact attach slot for this CPV */}
                  <CompactAttachSlot
                    attachments={slotAtts}
                    entityType="purchase_record"
                    entityId={purchase.id}
                    onAdd={handleAdd('payment_voucher', ref)}
                    onDelete={handleDelete}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Section 3: GRN Certificate ───────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <SectionHeader
          icon={Warehouse}
          label="Warehouse Receipt (GRN)"
          subtitle="Attach the physical GRN certificate for this lot"
        />
        <AttachmentSlot
          label=""
          emptyLabel="Upload GRN certificate"
          subtext={`PDF, JPG, PNG · Max 10 MB`}
          attachments={grnDocs}
          entityType="purchase_record"
          entityId={purchase.id}
          onAdd={handleAdd('grn_certificate', purchase.coffee_code || 'grn')}
          onDelete={handleDelete}
        />
      </div>
    </div>
  );
}
