import React from 'react';
import { Button } from '@/components/ui/button';
import { Paperclip, Eye, CheckCircle2, FileText, Lock } from 'lucide-react';
import { format } from 'date-fns';
import { useRole } from '@/lib/useRole';

// ---------------------------------------------------------------------------
// v1: file uploads are intentionally disabled. The Supabase Storage wiring
// lands in v1.1. Existing attachments (imported records or future writes)
// still render read-only.
// ---------------------------------------------------------------------------

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function DisabledUploadHint({ emptyLabel = 'Upload File' }) {
  return (
    <div
      className="w-full border-2 border-dashed border-border rounded-lg py-5 flex flex-col items-center gap-1.5 bg-slate-50 cursor-not-allowed"
      role="status"
      aria-disabled="true"
      title="File uploads are coming in v1.1"
    >
      <div className="relative">
        <FileText className="w-6 h-6 text-muted-foreground" />
        <Lock className="w-3 h-3 text-muted-foreground absolute -bottom-1 -right-1 bg-slate-50 rounded-full" />
      </div>
      <span className="text-xs font-medium text-muted-foreground">{emptyLabel}</span>
      <span className="text-[10px] text-muted-foreground">Coming in v1.1</span>
    </div>
  );
}

/**
 * Read-only attachment slot. Uploads are disabled in v1; existing attachments
 * still render with view/delete affordances.
 */
export function AttachmentSlot({
  label,
  subtext,
  emptyLabel = 'Upload File',
  attachments = [],
  onDelete,
}) {
  const { role } = useRole();
  const canDelete = role === 'admin' || role === 'supervisor';
  const showEmpty = attachments.length === 0;

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-foreground">{label}</p>
          {subtext && <p className="text-[10px] text-muted-foreground mt-0.5">{subtext}</p>}
        </div>
      </div>

      {showEmpty && <DisabledUploadHint emptyLabel={emptyLabel} />}

      {attachments.map((att) => (
        <div
          key={att.id}
          className="flex items-center gap-2.5 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5"
        >
          <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-foreground truncate">{att.file_name}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {att.uploaded_by}
              {att.uploaded_at ? ` · ${format(new Date(att.uploaded_at), 'd MMM yyyy')}` : ''}
              {att.file_size ? ` · ${formatBytes(att.file_size)}` : ''}
            </p>
          </div>
          {att.file_url && (
            <a href={att.file_url} target="_blank" rel="noopener noreferrer">
              <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0 text-primary hover:text-primary">
                <Eye className="w-3.5 h-3.5" />
              </Button>
            </a>
          )}
          {canDelete && onDelete && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
              onClick={() => onDelete(att)}
            >
              ×
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Compact inline read-only attachment row used inside payment rows.
 * Renders nothing actionable in v1 — uploads are disabled. Existing attachments
 * still show with view/delete affordances.
 */
export function CompactAttachSlot({ attachments = [], onDelete }) {
  const { role } = useRole();
  const canDelete = role === 'admin' || role === 'supervisor';

  if (attachments.length === 0) {
    return (
      <span
        className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground italic"
        title="Attachments are coming in v1.1"
      >
        <Lock className="w-2.5 h-2.5" /> attachments coming soon
      </span>
    );
  }

  return (
    <div className="mt-1 space-y-1">
      {attachments.map(att => (
        <div key={att.id} className="flex items-center gap-1.5 bg-green-50 border border-green-200 rounded px-2 py-1">
          <CheckCircle2 className="w-3 h-3 text-green-600 flex-shrink-0" />
          <span className="text-[10px] font-medium text-foreground truncate max-w-[140px]">{att.file_name}</span>
          {att.file_url && (
            <a href={att.file_url} target="_blank" rel="noopener noreferrer">
              <Button type="button" size="sm" variant="ghost" className="h-5 w-5 p-0 text-primary">
                <Eye className="w-3 h-3" />
              </Button>
            </a>
          )}
          {canDelete && onDelete && (
            <Button type="button" size="sm" variant="ghost" className="h-5 w-5 p-0 text-destructive" onClick={() => onDelete(att)}>
              ×
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

export function AttachmentIndicator({ count = 0 }) {
  if (!count) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-primary ml-1" title={`${count} attachment${count > 1 ? 's' : ''}`}>
      <Paperclip className="w-3 h-3" />
      <span className="text-[10px] font-medium">{count}</span>
    </span>
  );
}

export function parseAttachments(jsonStr) {
  if (!jsonStr) return [];
  try { return JSON.parse(jsonStr) || []; } catch { return []; }
}
