import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useRole } from '@/lib/useRole';
import PageHeader from '@/components/shared/PageHeader';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, FileText, FileSpreadsheet, Bell } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';

const PAGE_SIZE = 50;

const TYPE_LABELS = {
  new_purchase: '📦 New Purchase',
  new_purchase_supervisor: '📦 New Purchase (Supervisor)',
  payment_recorded: '💰 Payment Recorded',
  fully_paid: '✅ Fully Paid',
  warehouse_confirmed: '✅ Warehouse Confirmed',
  warehouse_receipt_supervisor: '🏭 Warehouse Receipt',
  large_shrinkage: '⚠️ Large Shrinkage',
  low_stock: '⚠️ Low Stock',
  stock_empty: '🔴 Stock Empty',
  output_report: '📊 Output Report',
  high_reject_rate: '⚠️ High Reject Rate',
  export_contract: '🚢 Export Contract',
  negative_profit: '🔴 Negative Profit',
  weekly_payment_summary: '📋 Weekly Summary',
};

const SEVERITY_BADGE = {
  info:     'bg-green-100 text-green-700',
  warning:  'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

function fmtDate(d) {
  if (!d) return '—';
  try { return format(new Date(d), 'dd/MM/yyyy HH:mm'); } catch { return d; }
}

export default function NotificationHistory() {
  const { user } = useAuth();
  const { isAdminOrSupervisor } = useRole();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications-history', user?.email],
    queryFn: () => user
      ? (isAdminOrSupervisor
          ? base44.entities.Notification.list('-created_date', 1000)
          : base44.entities.Notification.filter({ recipient_email: user.email }, '-created_date', 500))
      : [],
    enabled: !!user,
    staleTime: 30000,
  });

  const markRead = async (n) => {
    if (!n.is_read) await base44.entities.Notification.update(n.id, { is_read: true });
    if (n.link_path) navigate(n.link_path);
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return notifications.filter(n => {
      if (typeFilter !== 'all' && n.type !== typeFilter) return false;
      if (statusFilter === 'unread' && n.is_read) return false;
      if (statusFilter === 'read' && !n.is_read) return false;
      if (fromDate && n.created_date && n.created_date.slice(0, 10) < fromDate) return false;
      if (toDate && n.created_date && n.created_date.slice(0, 10) > toDate) return false;
      if (q) {
        const blob = `${n.title} ${n.message} ${n.type} ${n.recipient_email}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [notifications, typeFilter, statusFilter, fromDate, toDate, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const unreadCount = filtered.filter(n => !n.is_read).length;

  const exportXLSX = () => {
    const wb = XLSX.utils.book_new();
    const headers = ['Date', 'Type', 'Title', 'Message', 'Severity', 'Status', 'Recipient'];
    const rows = filtered.map(n => [
      fmtDate(n.created_date),
      TYPE_LABELS[n.type] || n.type,
      n.title,
      n.message,
      n.severity || 'info',
      n.is_read ? 'Read' : 'Unread',
      n.recipient_email,
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = headers.map(() => ({ wch: 30 }));
    XLSX.utils.book_append_sheet(wb, ws, 'Notifications');
    XLSX.writeFile(wb, `CoffeeERP_Notifications_${format(new Date(), 'yyyyMMdd')}.xlsx`);
  };

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    const pw = doc.internal.pageSize.getWidth();
    doc.setFillColor(18, 100, 51);
    doc.rect(0, 0, pw, 18, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text('Coffee ERP — Notification History', 12, 12);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, pw - 12, 12, { align: 'right' });
    const headers = ['Date', 'Type', 'Title', 'Message', 'Severity', 'Status'];
    const colW = (pw - 24) / headers.length;
    let y = 26;
    doc.setFillColor(240, 103, 33);
    doc.rect(12, y, pw - 24, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    headers.forEach((h, i) => doc.text(h.toUpperCase(), 13 + i * colW, y + 5));
    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 30, 30);
    filtered.slice(0, 200).forEach((n, ri) => {
      if (y > doc.internal.pageSize.getHeight() - 14) { doc.addPage(); y = 14; }
      if (ri % 2 === 0) { doc.setFillColor(248, 253, 248); doc.rect(12, y, pw - 24, 6, 'F'); }
      const cells = [
        fmtDate(n.created_date),
        (TYPE_LABELS[n.type] || n.type || '').replace(/[^\w\s—]/g, '').trim().slice(0, 22),
        (n.title || '').slice(0, 35),
        (n.message || '').slice(0, 50),
        n.severity || 'info',
        n.is_read ? 'Read' : 'Unread',
      ];
      cells.forEach((c, i) => doc.text(String(c), 13 + i * colW, y + 4.5));
      y += 6;
    });
    doc.save(`CoffeeERP_Notifications_${format(new Date(), 'yyyyMMdd')}.pdf`);
  };

  return (
    <div>
      <PageHeader title="Notification History" description="All notifications sent — filter, search, and export">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportPDF} className="gap-1.5">
            <FileText className="w-3.5 h-3.5" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={exportXLSX} className="gap-1.5">
            <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
          </Button>
        </div>
      </PageHeader>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Total', value: notifications.length, color: 'text-foreground' },
          { label: 'Unread', value: unreadCount, color: 'text-orange-600' },
          { label: 'In Filter', value: filtered.length, color: 'text-primary' },
          { label: 'Pages', value: totalPages, color: 'text-muted-foreground' },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end bg-muted/30 border border-border rounded-xl p-4 mb-5">
        <div className="flex-1 min-w-[200px] space-y-1">
          <Label className="text-xs font-medium">Search</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input className="pl-8 h-8" placeholder="Search title, message, type..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium">Type</Label>
          <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setPage(1); }}>
            <SelectTrigger className="h-8 w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium">Status</Label>
          <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="unread">Unread</SelectItem>
              <SelectItem value="read">Read</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium">From</Label>
          <Input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setPage(1); }} className="h-8 w-36" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium">To</Label>
          <Input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setPage(1); }} className="h-8 w-36" />
        </div>
        <Button variant="outline" size="sm" onClick={() => { setSearch(''); setTypeFilter('all'); setStatusFilter('all'); setFromDate(''); setToDate(''); setPage(1); }}>
          Clear
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="text-xs w-8"></TableHead>
                <TableHead className="text-xs whitespace-nowrap">Date</TableHead>
                <TableHead className="text-xs">Type</TableHead>
                <TableHead className="text-xs">Title</TableHead>
                <TableHead className="text-xs">Message</TableHead>
                <TableHead className="text-xs">Severity</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Time Ago</TableHead>
                {isAdminOrSupervisor && <TableHead className="text-xs">Recipient</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-16 text-muted-foreground">
                    <Bell className="w-8 h-8 mx-auto mb-3 opacity-30" />
                    <p>No notifications found.</p>
                  </TableCell>
                </TableRow>
              ) : paginated.map(n => (
                <TableRow
                  key={n.id}
                  onClick={() => markRead(n)}
                  className={`cursor-pointer hover:bg-primary/5 ${n.is_read ? 'bg-gray-50/70' : 'bg-white'}`}
                >
                  <TableCell>
                    {!n.is_read && (
                      <span className="block w-2 h-2 rounded-full mx-auto" style={{ backgroundColor: '#C8873E' }} />
                    )}
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{fmtDate(n.created_date)}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{TYPE_LABELS[n.type] || n.type}</TableCell>
                  <TableCell className={`text-xs max-w-[200px] ${n.is_read ? 'text-muted-foreground' : 'font-semibold text-foreground'}`}>{n.title}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[300px] truncate" title={n.message}>{n.message}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${SEVERITY_BADGE[n.severity] || SEVERITY_BADGE.info}`}>
                      {n.severity || 'info'}
                    </span>
                  </TableCell>
                  <TableCell>
                    {n.is_read
                      ? <span className="text-[10px] text-muted-foreground">Read</span>
                      : <span className="text-[10px] font-bold" style={{ color: '#C8873E' }}>Unread</span>
                    }
                  </TableCell>
                  <TableCell className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {n.created_date ? formatDistanceToNow(new Date(n.created_date), { addSuffix: true }) : '—'}
                  </TableCell>
                  {isAdminOrSupervisor && <TableCell className="text-xs text-muted-foreground">{n.recipient_email}</TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
          <span>Page {page} of {totalPages} ({filtered.length} records)</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}