import React, { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Eye, Trash2, CheckCircle2, FileX, Upload, Loader2 } from 'lucide-react';
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

const MAX_SIZE_MB = 10;
const ACCEPT = 'application/pdf,image/jpeg,image/jpg,image/png,image/webp,image/heic,.heic';

async function viewAttachment(att) {
  const path = att.storage_path || att.file_url;
  if (!path) return;
  if (/^https?:\/\//.test(path) || path.startsWith('blob:')) { window.open(path, '_blank'); return; }
  const url = await base44.integrations.Core.getSignedUrl(path);
  if (url) window.open(url, '_blank');
}

function DocRow({ doc, attachment, contract, onUpload, onDelete, uploading }) {
  const { role } = useRole();
  const canDelete = role === 'admin' || role === 'supervisor';
  const inputRef = useRef(null);
  const [error, setError] = useState('');

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    if (file.size > MAX_SIZE_MB * 1024 * 1024) { setError(`Max ${MAX_SIZE_MB} MB`); e.target.value = ''; return; }
    onUpload(doc, file);
    e.target.value = '';
  };

  return (
    <div className={`flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl border ${attachment ? 'border-green-200 bg-green-50/40' : 'border-border bg-card'}`}>
      <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={handleFile} />
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {attachment ? <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" /> : <FileX className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{doc.label}</p>
          {attachment ? (
            <p className="text-[10px] text-muted-foreground truncate">
              {attachment.file_name} · {attachment.uploaded_by}
              {attachment.uploaded_at ? ` · ${format(new Date(attachment.uploaded_at), 'd MMM yyyy')}` : ''}
            </p>
          ) : (
            <p className="text-[10px] text-muted-foreground">{error || 'PDF, JPG, PNG · Max 10 MB'}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {attachment ? (
          <>
            <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">Uploaded</span>
            <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs press" onClick={() => viewAttachment(attachment)}>
              <Eye className="w-3.5 h-3.5" /> View
            </Button>
            {canDelete && (
              <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive press" onClick={() => onDelete(attachment)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </>
        ) : (
          <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs press" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {uploading ? 'Uploading…' : 'Upload'}
          </Button>
        )}
      </div>
    </div>
  );
}

export default function ExportDocsPanel({ contract }) {
  const qc = useQueryClient();
  const [uploadingKey, setUploadingKey] = useState(null);

  const { data: attachments = [] } = useQuery({
    queryKey: ['attachments', 'export_contract', contract.id],
    queryFn: () => base44.entities.Attachment.filter({ entity_type: 'export_contract', entity_id: contract.id }),
    enabled: !!contract.id,
  });

  const createMut = useMutation({
    mutationFn: data => base44.entities.Attachment.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attachments', 'export_contract', contract.id] }),
  });
  const deleteMut = useMutation({
    mutationFn: id => base44.entities.Attachment.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attachments', 'export_contract', contract.id] }),
  });

  const handleUpload = async (doc, file) => {
    setUploadingKey(doc.key);
    try {
      const me = await base44.auth.me().catch(() => null);
      const { file_url } = await base44.integrations.Core.UploadFile({
        file, entityType: 'export_contract', entityId: contract.id,
      });
      await createMut.mutateAsync({
        entity_type: 'export_contract',
        entity_id: contract.id,
        section: 'export_document',
        section_ref: doc.key,
        file_url,
        storage_path: file_url,
        file_name: file.name,
        file_size: file.size,
        uploaded_at: new Date().toISOString(),
        uploaded_by: me?.full_name || me?.email || 'Unknown',
      });
    } catch (err) {
      console.error('[ExportDocsPanel upload]', err?.message);
      alert(err?.message || 'Upload failed. Try again.');
    } finally {
      setUploadingKey(null);
    }
  };

  const handleDelete = (att) => {
    const path = att.storage_path || att.file_url;
    base44.integrations.Core.removeFile?.(path);
    deleteMut.mutate(att.id);
  };

  const uploadedCount = EXPORT_DOCS.filter(d => attachments.some(a => a.section_ref === d.key)).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">Export Documents Checklist</h4>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${uploadedCount === EXPORT_DOCS.length ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
          {uploadedCount}/{EXPORT_DOCS.length} uploaded
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
              contract={contract}
              uploading={uploadingKey === doc.key}
              onUpload={handleUpload}
              onDelete={handleDelete}
            />
          );
        })}
      </div>
    </div>
  );
}

export { EXPORT_DOCS };
