import { lazy, Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { queryClientInstance, asyncPersister } from '@/lib/query-client'
import OfflineIndicator from '@/components/OfflineIndicator'
import PWAUpdatePrompt from '@/components/PWAUpdatePrompt'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ProtectedRoute from '@/components/ProtectedRoute';
import PendingApproval from '@/components/PendingApproval';
import Login from '@/pages/Login';
import AppLayout from '@/components/layout/AppLayout';

// Route pages are lazy-loaded so the first paint downloads only the shell +
// the current route, not all 21 pages. Cuts initial JS dramatically on slow
// connections. Each becomes its own chunk fetched on navigation.
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const MasterData = lazy(() => import('@/pages/MasterData'));
const PurchaseRegistration = lazy(() => import('@/pages/PurchaseRegistration.jsx'));
const WarehouseReceiptPage = lazy(() => import('@/pages/WarehouseReceipt'));
const SampleLogPage = lazy(() => import('@/pages/SampleLogPage'));
const ProcessingLogPage = lazy(() => import('@/pages/ProcessingLogPage'));
const OutputReportPage = lazy(() => import('@/pages/OutputReportPage'));
const Reports = lazy(() => import('@/pages/Reports'));
const ExportContracts = lazy(() => import('@/pages/ExportContracts'));
const StockReport = lazy(() => import('@/pages/StockReport.jsx'));
const NotificationSettings = lazy(() => import('@/pages/NotificationSettings'));
const BuyerInspections = lazy(() => import('@/pages/BuyerInspections.jsx'));
const MaterialsRegister = lazy(() => import('@/pages/MaterialsRegister.jsx'));
const BagLedger = lazy(() => import('@/pages/BagLedger.jsx'));
const ActivityLog = lazy(() => import('@/pages/ActivityLog.jsx'));
const NotificationHistory = lazy(() => import('@/pages/NotificationHistory.jsx'));
const Permissions = lazy(() => import('@/pages/Permissions.jsx'));
const UserActivityReport = lazy(() => import('@/pages/UserActivityReport'));
const PurchaseOrdersReport = lazy(() => import('@/pages/PurchaseOrdersReport'));
const WarehouseReceiptReport = lazy(() => import('@/pages/WarehouseReceiptReport'));
const DataImport = lazy(() => import('@/pages/DataImport.jsx'));
const DataAudit = lazy(() => import('@/pages/DataAudit.jsx'));
const ProfitLoss = lazy(() => import('@/pages/ProfitLoss.jsx'));
const UserManagement = lazy(() => import('@/pages/UserManagement.jsx'));

const RouteFallback = () => (
  <div className="flex items-center justify-center py-24">
    <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
  </div>
);

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Suspense fallback={<RouteFallback />}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/pending-approval" element={<PendingApproval />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/master-data" element={<MasterData />} />
          <Route path="/purchase-registration" element={<PurchaseRegistration />} />
          <Route path="/warehouse-receipt" element={<WarehouseReceiptPage />} />
          <Route path="/sample-log" element={<SampleLogPage />} />
          <Route path="/processing-log" element={<ProcessingLogPage />} />
          <Route path="/output-report" element={<OutputReportPage />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/profit-loss" element={<ProfitLoss />} />
          <Route path="/buyer-inspections" element={<BuyerInspections />} />
          <Route path="/export-contracts" element={<ExportContracts />} />
          <Route path="/materials-register" element={<MaterialsRegister />} />
          <Route path="/bag-ledger" element={<BagLedger />} />
          <Route path="/stock-report" element={<StockReport />} />
          <Route path="/notification-settings" element={<NotificationSettings />} />
          <Route path="/activity-log" element={<ActivityLog />} />
          <Route path="/notification-history" element={<NotificationHistory />} />
          <Route path="/permissions" element={<Permissions />} />
          <Route path="/user-report" element={<UserActivityReport />} />
          <Route path="/purchase-orders-report" element={<PurchaseOrdersReport />} />
          <Route path="/warehouse-receipt-report" element={<WarehouseReceiptReport />} />
          <Route path="/data-import" element={<DataImport />} />
          <Route path="/data-audit" element={<DataAudit />} />
          <Route path="/user-management" element={<UserManagement />} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
    </Suspense>
  );
};


function App() {
  return (
    <AuthProvider>
      <PersistQueryClientProvider
        client={queryClientInstance}
        persistOptions={{
          persister: asyncPersister,
          maxAge: 1000 * 60 * 60 * 24, // 24h — drop cache older than this
        }}
      >
        <Router>
          <AuthenticatedApp />
        </Router>
        <OfflineIndicator />
        <PWAUpdatePrompt />
        <Toaster />
      </PersistQueryClientProvider>
    </AuthProvider>
  )
}

export default App
