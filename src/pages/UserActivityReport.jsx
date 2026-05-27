import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRole } from '@/lib/useRole';
import { Navigate } from 'react-router-dom';
import PageHeader from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Download, FileSpreadsheet, Search } from 'lucide-react';
import ActivityDateFilter from '@/components/userreport/ActivityDateFilter';
import ActivitySummaryCards from '@/components/userreport/ActivitySummaryCards';
import ActivityUsersTable from '@/components/userreport/ActivityUsersTable';
import UserDetailPanel from '@/components/userreport/UserDetailPanel';
import { exportUserReportPDF, exportUserReportExcel } from '@/lib/userReportExport';
import { format, startOfWeek, endOfWeek } from 'date-fns';

function getThisWeekRange() {
  const now = new Date();
  const from = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const to = format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  return { from, to };
}

export default function UserActivityReport() {
  const { isAdmin } = useRole();

  const [dateRange, setDateRange] = useState(getThisWeekRange());
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);

  // Fetch all data sources
  const { data: activityLogs = [], isLoading: loadingActivity } = useQuery({
    queryKey: ['activity-log'],
    queryFn: () => base44.entities.ActivityLog.list('-created_date', 2000),
  });
  const { data: purchases = [], isLoading: loadingPurchases } = useQuery({
    queryKey: ['purchase-records'],
    queryFn: () => base44.entities.PurchaseRecord.list('-created_date', 1000),
  });
  const { data: receipts = [], isLoading: loadingReceipts } = useQuery({
    queryKey: ['warehouse-receipts'],
    queryFn: () => base44.entities.WarehouseReceipt.list('-created_date', 1000),
  });
  const { data: processingLogs = [], isLoading: loadingProcessing } = useQuery({
    queryKey: ['processing-logs'],
    queryFn: () => base44.entities.ProcessingLog.list('-created_date', 1000),
  });
  const { data: outputReports = [], isLoading: loadingOutput } = useQuery({
    queryKey: ['output-reports'],
    queryFn: () => base44.entities.OutputReport.list('-created_date', 1000),
  });
  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
  });

  const isLoading = loadingActivity || loadingPurchases || loadingReceipts || loadingProcessing || loadingOutput || loadingUsers;

  const { from, to } = dateRange;

  const inRange = (dateStr) => {
    if (!dateStr) return false;
    const d = dateStr.slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  };

  // Build per-user activity stats from ActivityLog (which has user_email + screen_name)
  const userStats = useMemo(() => {
    const map = {};

    // Index users
    users.forEach(u => {
      if (!u.email) return;
      map[u.email] = {
        email: u.email,
        name: u.full_name || u.email,
        role: u.role,
        purchasesCreated: 0,
        paymentsRecorded: 0,
        warehouseReceipts: 0,
        processingEntries: 0,
        outputReports: 0,
        totalEtbHandled: 0,
        lastActive: null,
        actions: 0,
      };
    });

    // Count by activity log entries in date range
    activityLogs.forEach(log => {
      if (!log.user_email) return;
      const dateStr = log.created_date || '';
      if (!inRange(dateStr)) return;

      const email = log.user_email;
      if (!map[email]) {
        map[email] = {
          email,
          name: email,
          role: null,
          purchasesCreated: 0,
          paymentsRecorded: 0,
          warehouseReceipts: 0,
          processingEntries: 0,
          outputReports: 0,
          totalEtbHandled: 0,
          lastActive: null,
          actions: 0,
        };
      }

      const u = map[email];
      u.actions++;

      // Track last active
      const logTs = log.created_date;
      if (!u.lastActive || logTs > u.lastActive) u.lastActive = logTs;

      const screen = log.screen_name || '';
      const action = log.action_type || '';

      if (screen.includes('Purchase') && action === 'Created') u.purchasesCreated++;
      if (screen.includes('Warehouse') && action === 'Created') u.warehouseReceipts++;
      if (screen.includes('Processing') && action === 'Created') u.processingEntries++;
      if (screen.includes('Output') && action === 'Created') u.outputReports++;
    });

    // Count payments from PurchaseRecord payment_history entries (created_by is user email from base44)
    purchases.forEach(p => {
      if (!p.payment_history) return;
      try {
        const payments = JSON.parse(p.payment_history);
        if (!Array.isArray(payments)) return;
        payments.forEach(pay => {
          const dateStr = pay.payment_date || '';
          if (!inRange(dateStr)) return;
          const email = pay.recorded_by || p.created_by || null;
          if (!email) return;
          if (!map[email]) {
            map[email] = { email, name: email, role: null, purchasesCreated: 0, paymentsRecorded: 0, warehouseReceipts: 0, processingEntries: 0, outputReports: 0, totalEtbHandled: 0, lastActive: null, actions: 0 };
          }
          map[email].paymentsRecorded++;
          // FIX: Wrap amount with Number() to prevent string concatenation
          map[email].totalEtbHandled += Number(pay.amount_etb || 0);
        });
      } catch { }
    });

    return Object.values(map).filter(u => u.email);
  }, [activityLogs, purchases, users, from, to]);

  // Filter by search
  const filteredStats = useMemo(() => {
    const q = search.toLowerCase();
    let list = userStats;
    if (q) list = list.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
    return [...list].sort((a, b) => {
      if (!a.lastActive && !b.lastActive) return 0;
      if (!a.lastActive) return 1;
      if (!b.lastActive) return -1;
      return b.lastActive.localeCompare(a.lastActive);
    });
  }, [userStats, search]);

  // Summary cards
  const summary = useMemo(() => {
    const active = userStats.filter(u => u.actions > 0).length;
    const totalPurchases = userStats.reduce((s, u) => s + u.purchasesCreated, 0);
    const totalPayments = userStats.reduce((s, u) => s + u.paymentsRecorded, 0);
    const totalWarehouse = userStats.reduce((s, u) => s + u.warehouseReceipts, 0);
    return { active, totalPurchases, totalPayments, totalWarehouse };
  }, [userStats]);

  // Get detail data for selected user
  const selectedUserData = useMemo(() => {
    if (!selectedUser) return null;
    const email = selectedUser.email;

    const userPurchases = purchases.filter(p => p.created_by === email && inRange(p.purchase_date || p.created_date || ''));
    const userReceipts = receipts.filter(r => r.created_by === email && inRange(r.received_date || r.created_date || ''));
    const userProcessing = processingLogs.filter(l => l.created_by === email && inRange(l.date || l.created_date || ''));
    const userOutputs = outputReports.filter(o => o.created_by === email && inRange(o.date || o.created_date || ''));

    // Payments — from payment_history where recorded_by = email
    const userPayments = [];
    purchases.forEach(p => {
      if (!p.payment_history) return;
      try {
        const payments = JSON.parse(p.payment_history);
        if (!Array.isArray(payments)) return;
        payments.forEach(pay => {
          const dateStr = pay.payment_date || '';
          if (!inRange(dateStr)) return;
          const byEmail = pay.recorded_by || p.created_by;
          if (byEmail !== email) return;
          userPayments.push({ ...pay, supplier_name: p.supplier_name, coffee_code: p.coffee_code });
        });
      } catch { }
    });

    return { userPurchases, userReceipts, userProcessing, userOutputs, userPayments };
  }, [selectedUser, purchases, receipts, processingLogs, outputReports, from, to]);

  const handleExportPDF = () => exportUserReportPDF({ filteredStats, summary, dateRange });
  const handleExportExcel = () => exportUserReportExcel({ filteredStats, purchases, receipts, processingLogs, outputReports, dateRange });

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <div>
      <PageHeader title="User Activity Report" description="Track what each staff member has done in the app">
        <Button variant="outline" onClick={handleExportExcel} className="gap-2">
          <FileSpreadsheet className="w-4 h-4" /> Export Excel
        </Button>
        <Button onClick={handleExportPDF} className="gap-2 bg-orange-600 hover:bg-orange-700 text-white">
          <Download className="w-4 h-4" /> Export PDF
        </Button>
      </PageHeader>

      <ActivityDateFilter dateRange={dateRange} onChange={setDateRange} />

      <ActivitySummaryCards summary={summary} isLoading={isLoading} />

      <div className="flex items-center gap-3 mb-4 mt-6">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by username..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <span className="text-sm text-muted-foreground">{filteredStats.length} user{filteredStats.length !== 1 ? 's' : ''}</span>
      </div>

      <ActivityUsersTable
        users={filteredStats}
        isLoading={isLoading}
        onViewDetail={setSelectedUser}
        today={format(new Date(), 'yyyy-MM-dd')}
        dateRange={dateRange}
      />

      {selectedUser && selectedUserData && (
        <UserDetailPanel
          user={selectedUser}
          data={selectedUserData}
          dateRange={dateRange}
          onClose={() => setSelectedUser(null)}
        />
      )}
    </div>
  );
}