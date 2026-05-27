import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Eye, Trash2, CheckCircle2, FileX, Lock } from 'lucide-react';
import { format } from 'date-fns';
import { useRole } from '@/lib/useRole';

const EXPORT_DOCS = [
  { key: 'clu_quality', label: 'CLU Quality Certificate' },
  { key: 'phytosanitary', label: 'Phytosanitary Certificate' },
  { key: 'ico_coo', label: 'ICO Certificate of Origin' },
  { key: 'chamber_commerce', label: 'Chamber of Commerce Certificate' },
  { key: 'commercial_invoice', label: 'Commercial Invoice' },
  { key: 'packing_list', label: 'Packing List' },
  { key: 'bill_of_lading', label: 'Bill of Lading' },
  { key: 'customs_declaration', label: 'Customs Declaration' },
  { key: 'bank_permit', label: 'Bank Permit' },
];

// v1: uploads are disabled. v1.1 will wire Supabase Storage.
// Read-only display of existing attachments still works.

function DocRow({ doc, attachment, onDelete }) {
  const { role } = useRole();
  const canDelete = role === 'admin' || role === 'supervisor';

  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl border ${
        attachment ? 'border-green-200 bg-green-50/40' : 'border-border bg-card'
      }`}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {attachment ? (
          <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
        ) : (
          <FileX className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{doc.label}</p>
          {attachment ? (
            <p className="text-[10px] text-muted-foreground truncate">
              {attachment.file_name} · {attachment.uploaded_by} ·
              {attachment.created_date ? ` ${format(new Date(attachment.created_date), 'd MMM yyyy')}` : ''}
            </p>
          ) : (
            <p className="text-[10px] text-muted-foreground">Upload coming in v1.1</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {attachment ? (
          <>
            <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
              Uploaded
            </span>
            {attachment.file_url && (
              <a href={attachment.file_url} target="_blank" rel="noopener noreferrer">
                <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
                  <Eye className="w-3.5 h-3.5" /> View
                </Button>
              </a>
            )}
            {canDelete && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                onClick={() => onDelete(attachment)}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </>
        ) : (
          <>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              Not Uploaded
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs cursor-not-allowed opacity-60"
              disabled
              title="File uploads are coming in v1.1"
            >
              <Lock className="w-3.5 h-3.5" /> v1.1
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export default function ExportDocsPanel({ contract }) {
  const qc = useQueryClient();

  const { data: attachments = [] } = useQuery({
    queryKey: ['attachments', 'export_contract', contract.id],
    queryFn: () => base44.entities.Attachment.filter({ entity_type: 'export_contract', entity_id: contract.id }),
    enabled: !!contract.id,
  });

  const deleteMut = useMutation({
    mutationFn: id => base44.entities.Attachment.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attachments', 'export_contract', contract.id] }),
  });

  const handleDelete = (att) => deleteMut.mutate(att.id);

  const uploadedCount = EXPORT_DOCS.filter(d => attachments.some(a => a.section_ref === d.key)).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">Export Documents Checklist</h4>
        <span
          className={`text-xs font-bold px-2.5 py-1 rounded-full ${
            uploadedCount === EXPORT_DOCS.length
              ? 'bg-green-100 text-green-700'
              : 'bg-amber-100 text-amber-700'
          }`}
        >
          {uploadedCount}/{EXPORT_DOCS.length} uploaded
        </span>
      </div>
      <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 text-xs flex items-start gap-2">
        <Lock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
        <span>
          Document uploads land in v1.1 once Supabase Storage is wired. Existing uploads (imported records) still render here.
        </span>
      </div>
      <div className="space-y-2">
        {EXPORT_DOCS.map(doc => {
          const att = attachments.find(a => a.section_ref === doc.key);
          return (
            <DocRow
              key={doc.key}
              doc={doc}
              attachment={att}
              onDelete={handleDelete}
            />
          );
        })}
      </div>
    </div>
  );
}

export { EXPORT_DOCS };
