import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AttachmentSlot } from './FileAttachments';
import { Warehouse, FileText, Scale } from 'lucide-react';
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

export default function WarehouseAttachmentsPanel({ receipt }) {
  const qc = useQueryClient();
  const { data: attachments = [] } = useQuery({
    queryKey: ['attachments', 'warehouse_receipt', receipt.id],
    queryFn: () => base44.entities.Attachment.filter({ entity_type: 'warehouse_receipt', entity_id: receipt.id }),
    enabled: !!receipt.id,
  });

  const createMut = useMutation({
    mutationFn: data => base44.entities.Attachment.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attachments', 'warehouse_receipt', receipt.id] }),
  });
  const deleteMut = useMutation({
    mutationFn: id => base44.entities.Attachment.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attachments', 'warehouse_receipt', receipt.id] }),
  });

  const handleAdd = (section) => (att) => {
    createMut.mutate({
      entity_type: 'warehouse_receipt',
      entity_id: receipt.id,
      section,
      section_ref: section,
      file_url: att.file_url,
      file_name: att.file_name,
      file_size: att.file_size,
      uploaded_at: att.uploaded_at,
      uploaded_by: att.uploaded_by,
    });
  };

  const handleDelete = (att) => deleteMut.mutate(att.id);

  return (
    <div className="space-y-4 py-2">
      {/* ── Section 1: GRN Certificate ───────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <SectionHeader
          icon={Warehouse}
          label="GRN Certificate"
          subtitle="Primary document — the physical Goods Received Note for this lot"
        />
        <AttachmentSlot
          label=""
          emptyLabel="Upload GRN certificate"
          subtext={`PDF, JPG, PNG · Max 10 MB${receipt.grn_code ? ` · Reference: ${receipt.grn_code}` : ''}`}
          attachments={attachments.filter(a => a.section === 'grn_certificate')}
          onAdd={handleAdd('grn_certificate')}
          onDelete={handleDelete}
        />
      </div>

      {/* ── Section 2: Dispatch Note ──────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <SectionHeader
          icon={FileText}
          label="Dispatch Note"
          subtitle="Supplier dispatch document from farm to warehouse"
        />
        <AttachmentSlot
          label=""
          emptyLabel="Upload dispatch note"
          subtext="PDF, JPG, PNG · Max 10 MB"
          attachments={attachments.filter(a => a.section === 'dispatch_note')}
          onAdd={handleAdd('dispatch_note')}
          onDelete={handleDelete}
        />
      </div>

      {/* ── Section 3: Weighbridge Ticket ─────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <SectionHeader
          icon={Scale}
          label="Weighbridge Ticket"
          subtitle="Weight certificate from the weighing point"
        />
        <AttachmentSlot
          label=""
          emptyLabel="Upload weighbridge ticket"
          subtext="PDF, JPG, PNG · Max 10 MB"
          attachments={attachments.filter(a => a.section === 'weighbridge_ticket')}
          onAdd={handleAdd('weighbridge_ticket')}
          onDelete={handleDelete}
        />
      </div>
    </div>
  );
}
