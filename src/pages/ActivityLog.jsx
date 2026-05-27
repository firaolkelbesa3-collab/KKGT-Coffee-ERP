import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/shared/PageHeader';
import { useAuth } from '@/lib/AuthContext';
import { useRole } from '@/lib/useRole';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Search, ShieldOff } from 'lucide-react';
import { format } from 'date-fns';
import TablePagination from '@/components/shared/TablePagination';

const ACTIONS = ['Created', 'Edited', 'Archived', 'Restored'];

function ActionBadge({ type }) {
  const map = {
    Created: 'bg-green-100 text-green-700',
    Edited: 'bg-blue-100 text-blue-700',
    Archived: 'bg-amber-100 text-amber-700',
    Restored: 'bg-purple-100 text-purple-700',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${map[type] || 'bg-muted text-muted-foreground'}`}>
      {type}
    </span>
  );
}

function ChangesCell({ raw }) {
  if (!raw) return <span className="text-muted-foreground">—</span>;
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch { return <span className="text-xs">{raw}</span>; }
  if (!Array.isArray(parsed) || parsed.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="space-y-0.5 text-[11px]">
      {parsed.slice(0, 5).map((c, i) => (
        <div key={i}>
          <span className="font-semibold">{c.field}:</span>{' '}
          <span className="line-through text-muted-foreground">{String(c.old_value ?? '∅').slice(0, 30)}</span>{' '}
          → <span className="text-foreground">{String(c.new_value ?? '∅').slice(0, 30)}</span>
        </div>
      ))}
      {parsed.length > 5 && <div className="text-muted-foreground italic">+{parsed.length - 5} more...</div>}
    </div>
  );
}

export default function ActivityLog() {
  const { user } = useAuth();
  const { isAdminOrSupervisor } = useRole();
  const [search, setSearch] = useState('');
  const [userFilter, setUserFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['activity-log'],
    queryFn: () => base44.entities.ActivityLog.list('-created_date', 1000),
    refetchInterval: 30000,
  });

  const userList = useMemo(() => {
    const s = new Set();
    logs.forEach(l => { if (l.user_email) s.add(l.user_email); });
    return Array.from(s).sort();
  }, [logs]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return logs.filter(l => {
      if (userFilter !== 'all' && l.user_email !== userFilter) return false;
      if (actionFilter !== 'all' && l.action_type !== actionFilter) return false;
      if (fromDate && l.created_date && l.created_date.slice(0, 10) < fromDate) return false;
      if (toDate && l.created_date && l.created_date.slice(0, 10) > toDate) return false;
      if (search) {
        const blob = `${l.user_email} ${l.action_type} ${l.screen_name} ${l.record_description} ${l.reason}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [logs, userFilter, actionFilter, fromDate, toDate, search]);

  if (!isAdminOrSupervisor) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
        <ShieldOff className="w-12 h-12 text-muted-foreground mb-3" />
        <h2 className="text-xl font-bold mb-1">Access Denied</h2>
        <p className="text-muted-foreground text-sm">This page is restricted to Admin or Supervisor roles.</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Activity Log" description="Audit trail of all create, edit, archive, and restore actions" />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end bg-muted/30 border border-border rounded-xl p-4 mb-5">
        <div className="space-y-1 flex-1 min-w-[200px]">
          <Label className="text-xs font-medium">Search</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-8"
              placeholder="Search description, screen, reason..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium">User</Label>
          <Select value={userFilter} onValueChange={setUserFilter}>
            <SelectTrigger className="h-8 w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              {userList.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium">Action</Label>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              {ACTIONS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium">From</Label>
          <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-8 w-36" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium">To</Label>
          <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-8 w-36" />
        </div>
        <Button variant="outline" size="sm" onClick={() => { setSearch(''); setUserFilter('all'); setActionFilter('all'); setFromDate(''); setToDate(''); setPage(1); }}>
          Clear
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="text-xs whitespace-nowrap">Date / Time</TableHead>
                <TableHead className="text-xs">User</TableHead>
                <TableHead className="text-xs">Action</TableHead>
                <TableHead className="text-xs">Screen</TableHead>
                <TableHead className="text-xs">Description</TableHead>
                <TableHead className="text-xs">Changes</TableHead>
                <TableHead className="text-xs">Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">No activity found for the selected filters.</TableCell></TableRow>
              ) : (
                filtered.slice((page - 1) * pageSize, page * pageSize).map(l => (
                  <TableRow key={l.id} className="hover:bg-muted/20">
                    <TableCell className="text-xs whitespace-nowrap">
                      {l.created_date ? format(new Date(l.created_date), 'dd/MM/yyyy HH:mm:ss') : '—'}
                    </TableCell>
                    <TableCell className="text-xs">{l.user_email}</TableCell>
                    <TableCell><ActionBadge type={l.action_type} /></TableCell>
                    <TableCell className="text-xs">{l.screen_name}</TableCell>
                    <TableCell className="text-xs max-w-[280px]">{l.record_description || '—'}</TableCell>
                    <TableCell><ChangesCell raw={l.changes} /></TableCell>
                    <TableCell className="text-xs italic text-muted-foreground max-w-[200px] truncate" title={l.reason}>
                      {l.reason || '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <TablePagination
        page={page}
        totalPages={Math.max(1, Math.ceil(filtered.length / pageSize))}
        total={filtered.length}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSize={setPageSize}
      />
    </div>
  );
}