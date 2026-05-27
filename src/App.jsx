import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ProtectedRoute from '@/components/ProtectedRoute';
import PendingApproval from '@/components/PendingApproval';
import Login from '@/pages/Login';
import AppLayout from '@/components/layout/AppLayout';
import Dashboard from '@/pages/Dashboard';
import MasterData from '@/pages/MasterData';
import PurchaseRegistration from '@/pages/PurchaseRegistration.jsx';
import WarehouseReceiptPage from '@/pages/WarehouseReceipt';
import SampleLogPage from '@/pages/SampleLogPage';
import ProcessingLogPage from '@/pages/ProcessingLogPage';
import OutputReportPage from '@/pages/OutputReportPage';
import Reports from '@/pages/Reports';
import ExportContracts from '@/pages/ExportContracts';
import StockReport from '@/pages/StockReport.jsx';
import NotificationSettings from '@/pages/NotificationSettings';
import BuyerInspections from '@/pages/BuyerInspections.jsx';
import MaterialsRegister from '@/pages/MaterialsRegister.jsx';
import BagLedger from '@/pages/BagLedger.jsx';
import ActivityLog from '@/pages/ActivityLog.jsx';
import NotificationHistory from '@/pages/NotificationHistory.jsx';
import Permissions from '@/pages/Permissions.jsx';
import UserActivityReport from '@/pages/UserActivityReport';
import PurchaseOrdersReport from '@/pages/PurchaseOrdersReport';
import WarehouseReceiptReport from '@/pages/WarehouseReceiptReport';
import DataImport from '@/pages/DataImport.jsx';

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
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
