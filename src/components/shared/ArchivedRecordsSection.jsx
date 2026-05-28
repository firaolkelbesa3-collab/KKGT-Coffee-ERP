import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Archive, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import { useRole } from '@/lib/useRole';
import { restoreRecord, buildPreviousStateFromChanges } from '@/lib/archiveService';
import { base44 } from '@/api/supabaseClient';

/**
 * Renders an "Archived Records" section visible only to admin/supervisor.
 *
 * Props:
 * - entityName: string (e.g. "PurchaseRecord")
 * - screenName: string (for activity log)
 * - queryKey: React Query key used by the parent screen (we invalidate it on restore)
 * - columns: array of { label, render(record) }
 * - describeRecord: (record) => string (for activity log description)
 * - onExtraInvalidate: optional function(queryClient) for extra cache invalidations after restore
 */
export default function ArchivedRecordsSection({ entityName, screenName, queryKey, columns, describeRecord, onExtraInvalidate }) {
  const { isAdminOrSupervisor } = useRole();
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: archived = [], isLoading } = useQuery({
    queryKey: [`${entityName}-archived`],
    queryFn: () => base44.entities[entityName].filter({ archived: true }, '-archived_at', 200),
    enabled: isAdminOrSupervisor && open,
  });

  // Fetch the last "Edited" activity log entry for each archived record so we can restore all fields
  const { data: activityLogs = [] } = useQuery({
    queryKey: [`${entityName}-activity-for-restore`],
    queryFn: () => base44.entities.ActivityLog.filter({ entity_type: entityName, action_type: 'Edited' }, '-created_date', 500),
    enabled: isAdminOrSupervisor && open && archived.length > 0,
  });

  // Build a map: recordId → previousState (from last Edited log)
  const previousStateByRecordId = React.useMemo(() => {
    const map = {};
    // We want the most recent Edited entry per record (logs are already sorted desc)
    activityLogs.forEach(log => {
      if (!map[log.entity_id] && log.changes) {
        const ps = buildPreviousStateFromChanges(log.changes);
        if (ps) map[log.entity_id] = ps;
      }
    });
    return map;
  }, [activityLogs]);

  const restoreMutation = useMutation({
    mutationFn: async (record) => {
      const previousState = previousStateByRecordId[record.id] || null;
      await restoreRecord({
        entityName,
        record,
        screen_name: screenName,
        description: describeRecord ? describeRecord(record) : record.id,
        previousState,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`${entityName}-archived`] });
      queryClient.invalidateQueries({ queryKey: [`${entityName}-activity-for-restore`] });
      if (queryKey) queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['activity-log'] });
      // Extra invalidations (e.g. recalc purchase, bag ledger, etc.)
      if (onExtraInvalidate) onExtraInvalidate(queryClient);
    },
  });

  if (!isAdminOrSupervisor) return null;

  return (
    <div className="mt-8 rounded-xl border border-border bg-muted/20 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Archive className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Archived Records</span>
          <span className="text-xs text-muted-foreground">(admin / supervisor only)</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {open && (
        <div className="border-t border-border">
          {isLoading ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">Loading archived records...</p>
          ) : archived.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">No archived records.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    {columns.map(c => (
                      <TableHead key={c.label} className="text-xs">{c.label}</TableHead>
                    ))}
                    <TableHead className="text-xs">Archived By</TableHead>
                    <TableHead className="text-xs">Archived At</TableHead>
                    <TableHead className="text-xs">Reason</TableHead>
                    <TableHead className="text-xs text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {archived.map(rec => {
                    const hasPreviousState = !!previousStateByRecordId[rec.id];
                    return (
                      <TableRow key={rec.id} className="hover:bg-muted/20">
                        {columns.map(c => (
                          <TableCell key={c.label} className="text-xs">{c.render(rec)}</TableCell>
                        ))}
                        <TableCell className="text-xs">{rec.archived_by || '—'}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {rec.archived_at ? format(new Date(rec.archived_at), 'dd/MM/yyyy HH:mm') : '—'}
                        </TableCell>
                        <TableCell className="text-xs italic text-muted-foreground max-w-[200px] truncate" title={rec.archive_reason}>
                          {rec.archive_reason || '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {hasPreviousState && (
                              <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded font-medium" title="Will restore all previous field values">
                                Full restore
                              </span>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={restoreMutation.isPending}
                              onClick={() => restoreMutation.mutate(rec)}
                              className="gap-1.5 h-7"
                            >
                              <RotateCcw className="w-3 h-3" /> Restore
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
