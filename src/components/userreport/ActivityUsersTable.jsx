import React from 'react';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, AlertTriangle } from 'lucide-react';
import { isToday, parseISO, differenceInDays } from 'date-fns';

const ROLE_LABELS = {
  admin: 'Admin',
  supervisor: 'Supervisor',
  purchaser: 'Purchaser',
  warehouse_keeper: 'Warehouse',
  process_manager: 'Processing',
  final_registrar: 'Output',
  export_manager: 'Export',
};

const ROLE_COLORS = {
  admin: 'bg-purple-100 text-purple-700',
  supervisor: 'bg-blue-100 text-blue-700',
  purchaser: 'bg-green-100 text-green-700',
  warehouse_keeper: 'bg-amber-100 text-amber-700',
  process_manager: 'bg-orange-100 text-orange-700',
  final_registrar: 'bg-cyan-100 text-cyan-700',
  export_manager: 'bg-rose-100 text-rose-700',
};

function fmt(n, dec = 0) {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function LastActiveLabel({ ts }) {
  if (!ts) return <span className="text-muted-foreground text-xs">Never</span>;
  const date = parseISO(ts.slice(0, 10));
  if (isToday(date)) {
    return <span className="text-green-600 text-xs font-medium">Today</span>;
  }
  const days = differenceInDays(new Date(), date);
  if (days === 1) return <span className="text-orange-600 text-xs">Yesterday</span>;
  return <span className="text-muted-foreground text-xs">{days} days ago</span>;
}

function StatusBadge({ lastActive, dateRange }) {
  if (!lastActive) return <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500">Inactive</span>;
  const today = new Date().toISOString().slice(0, 10);
  if (lastActive.slice(0, 10) === today) return <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700">Active</span>;
  const days = differenceInDays(new Date(), parseISO(lastActive.slice(0, 10)));
  if (days <= 7) return <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-100 text-orange-700">Recent</span>;
  return <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500">Inactive</span>;
}

export default function ActivityUsersTable({ users, isLoading, onViewDetail }) {
  const COLS = ['#', 'User', 'Purchases', 'Payments', 'Warehouse', 'Processing', 'Output', 'Total ETB Handled', 'Last Active', 'Status', 'Report'];

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              {COLS.map(c => (
                <TableHead key={c} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{c}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array(5).fill(0).map((_, i) => (
                <TableRow key={i}>
                  {COLS.map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>)}
                </TableRow>
              ))
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COLS.length} className="text-center py-12 text-muted-foreground">No users found.</TableCell>
              </TableRow>
            ) : users.map((u, i) => (
              <TableRow key={u.email} className="hover:bg-muted/30">
                <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                <TableCell>
                  <div className="font-medium text-sm">{u.name}</div>
                  <div className="text-[11px] text-muted-foreground">{u.email}</div>
                  {u.role && (
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${ROLE_COLORS[u.role] || 'bg-muted text-muted-foreground'}`}>
                      {ROLE_LABELS[u.role] || u.role}
                    </span>
                  )}
                </TableCell>
                <TableCell className={`text-right font-medium ${u.purchasesCreated > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>{u.purchasesCreated}</TableCell>
                <TableCell className={`text-right font-medium ${u.paymentsRecorded > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>{u.paymentsRecorded}</TableCell>
                <TableCell className={`text-right font-medium ${u.warehouseReceipts > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>{u.warehouseReceipts}</TableCell>
                <TableCell className={`text-right font-medium ${u.processingEntries > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>{u.processingEntries}</TableCell>
                <TableCell className={`text-right font-medium ${u.outputReports > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>{u.outputReports}</TableCell>
                <TableCell className="text-right font-semibold text-sm">
                  {u.totalEtbHandled > 0 ? (
                    u.totalEtbHandled > 1000000000 ? (
                      <div className="flex items-center justify-end gap-1 text-red-600" title="Unusually high amount - possible string concatenation error">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>{fmt(u.totalEtbHandled)}</span>
                      </div>
                    ) : (
                      fmt(u.totalEtbHandled)
                    )
                  ) : <span className="text-muted-foreground font-normal">—</span>}
                </TableCell>
                <TableCell className="whitespace-nowrap"><LastActiveLabel ts={u.lastActive} /></TableCell>
                <TableCell><StatusBadge lastActive={u.lastActive} /></TableCell>
                <TableCell>
                  <Button size="sm" className="bg-orange-600 hover:bg-orange-700 text-white gap-1.5 text-xs" onClick={() => onViewDetail(u)}>
                    <FileText className="w-3.5 h-3.5" /> Report
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}