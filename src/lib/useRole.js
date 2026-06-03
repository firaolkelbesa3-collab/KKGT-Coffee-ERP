import { useAuth } from '@/lib/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

// Role definitions
export const ROLES = {
  ADMIN: 'admin',
  SUPERVISOR: 'supervisor',
  PURCHASER: 'purchaser',
  WAREHOUSE_KEEPER: 'warehouse_keeper',
  PROCESS_MANAGER: 'process_manager',
  FINAL_REGISTRAR: 'final_registrar',
  EXPORT_MANAGER: 'export_manager',
};

// Admin/Supervisor always have full access — this is the canonical list
export const ADMIN_ROUTES = [
  '/', '/purchase-registration', '/warehouse-receipt', '/sample-log', '/processing-log',
  '/output-report', '/buyer-inspections', '/master-data', '/reports', '/profit-loss', '/export-contracts',
  '/materials-register', '/bag-ledger', '/stock-report', '/activity-log', '/permissions',
  '/notification-history', '/notification-settings', '/user-report', '/purchase-orders-report',
  '/warehouse-receipt-report', '/data-import', '/data-audit', '/user-management',
];

// System paths always included for every role (settings/notifications)
const SYSTEM_PATHS = ['/notification-history', '/notification-settings'];

// Hardcoded defaults — used when no DB record exists yet for a role
const DEFAULT_ROLE_ROUTES = {
  purchaser:        ['/', '/purchase-registration', '/warehouse-receipt', '/sample-log', '/stock-report', '/master-data', '/bag-ledger', '/reports', '/purchase-orders-report', '/warehouse-receipt-report'],
  warehouse_keeper: ['/', '/warehouse-receipt', '/sample-log', '/stock-report', '/bag-ledger', '/materials-register'],
  process_manager:  ['/', '/processing-log', '/stock-report'],
  final_registrar:  ['/', '/output-report', '/stock-report', '/export-contracts', '/buyer-inspections'],
  export_manager:   ['/', '/export-contracts', '/buyer-inspections', '/stock-report', '/materials-register', '/bag-ledger', '/sample-log', '/profit-loss'],
};

export function useRole() {
  const { user } = useAuth();
  const role = user?.role || null;

  const isAdmin = role === ROLES.ADMIN || role === ROLES.SUPERVISOR;

  // Fetch DB permissions — skip for admin (always full access)
  const { data: dbRecords = [] } = useQuery({
    queryKey: ['role-permissions'],
    queryFn: () => base44.entities.RolePermission.list(),
    staleTime: 30000,
    enabled: !!role && !isAdmin,
  });

  const getAllowedRoutes = () => {
    if (!role) return [];
    if (isAdmin) return ADMIN_ROUTES;

    // Look for a saved DB record for this role
    const rec = dbRecords.find(d => d.role === role);
    if (rec) {
      try {
        const parsed = JSON.parse(rec.allowed_paths);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return [...new Set([...parsed, ...SYSTEM_PATHS])];
        }
      } catch {
        // fall through to defaults
      }
    }

    // Fall back to hardcoded defaults
    const defaults = DEFAULT_ROLE_ROUTES[role] || [];
    return [...new Set([...defaults, ...SYSTEM_PATHS])];
  };

  const allowedRoutes = getAllowedRoutes();

  const canAccess = (path) => {
    if (!role) return false;
    return allowedRoutes.includes(path);
  };

  return {
    role,
    isAdmin,
    isSupervisor: role === ROLES.SUPERVISOR,
    isAdminOrSupervisor: isAdmin,
    canAccess,
    allowedRoutes,
    user,
  };
}