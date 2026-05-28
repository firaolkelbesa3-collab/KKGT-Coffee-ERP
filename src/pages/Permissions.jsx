import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import RoleGuard from '@/components/RoleGuard';
import { Save, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/supabaseClient';

// All screens with their paths
const SCREENS = [
  { label: 'Dashboard',             path: '/' },
  { label: 'Purchase Registration', path: '/purchase-registration' },
  { label: 'Warehouse Receipt',     path: '/warehouse-receipt' },
  { label: 'Sample Log',            path: '/sample-log' },
  { label: 'Processing Log',        path: '/processing-log' },
  { label: 'Output Report',         path: '/output-report' },
  { label: 'Export Contracts',      path: '/export-contracts' },
  { label: 'Buyer Inspections',     path: '/buyer-inspections' },
  { label: 'Stock Report',          path: '/stock-report' },
  { label: 'Materials Register',    path: '/materials-register' },
  { label: 'Bag Ledger',            path: '/bag-ledger' },
  { label: 'Reports',               path: '/reports' },
  { label: 'Master Data',           path: '/master-data' },
  { label: 'Activity Log',          path: '/activity-log' },
  { label: 'Purchase Orders Report', path: '/purchase-orders-report' },
];

const ROLES = [
  { key: 'purchaser',        label: 'Purchaser' },
  { key: 'warehouse_keeper', label: 'Warehouse' },
  { key: 'process_manager',  label: 'Processing' },
  { key: 'final_registrar',  label: 'Output' },
  { key: 'export_manager',   label: 'Export' },
];

const DEFAULT_PERMISSIONS = {
  purchaser:        ['/', '/purchase-registration', '/warehouse-receipt', '/sample-log', '/stock-report', '/master-data', '/bag-ledger', '/reports', '/purchase-orders-report'],
  warehouse_keeper: ['/', '/warehouse-receipt', '/sample-log', '/stock-report', '/bag-ledger', '/materials-register'],
  process_manager:  ['/', '/processing-log', '/stock-report'],
  final_registrar:  ['/', '/output-report', '/stock-report', '/export-contracts', '/buyer-inspections'],
  export_manager:   ['/', '/export-contracts', '/buyer-inspections', '/stock-report', '/materials-register', '/bag-ledger', '/sample-log'],
};

const SYSTEM_PATHS = ['/notification-history', '/notification-settings'];

function buildInitialState(dbRecords) {
  const state = {};
  ROLES.forEach(r => {
    const rec = dbRecords.find(d => d.role === r.key);
    if (rec) {
      try {
        const parsed = JSON.parse(rec.allowed_paths);
        state[r.key] = new Set(parsed);
      } catch {
        state[r.key] = new Set(DEFAULT_PERMISSIONS[r.key] || []);
      }
    } else {
      state[r.key] = new Set(DEFAULT_PERMISSIONS[r.key] || []);
    }
  });
  return state;
}

export default function PermissionsPage() {
  const queryClient = useQueryClient();
  const [permissions, setPermissions] = useState(null);
  const [saved, setSaved] = useState(false);

  const { data: dbRecords = [], isLoading } = useQuery({
    queryKey: ['role-permissions'],
    queryFn: () => base44.entities.RolePermission.list(),
    staleTime: 0,
  });

  useEffect(() => {
    if (!isLoading) {
      setPermissions(buildInitialState(dbRecords));
    }
  }, [isLoading, dbRecords]);

  const saveMutation = useMutation({
    mutationFn: async (perms) => {
      for (const role of ROLES) {
        const paths = [...new Set([...perms[role.key], ...SYSTEM_PATHS])];
        const existing = dbRecords.find(d => d.role === role.key);
        const payload = { role: role.key, allowed_paths: JSON.stringify(paths) };
        if (existing) {
          await base44.entities.RolePermission.update(existing.id, payload);
        } else {
          await base44.entities.RolePermission.create(payload);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['role-permissions'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      toast.success('Permissions saved — Navigation will update for each role immediately.', {
        duration: 3000,
        dismissible: true,
      });
    },
  });

  const toggle = (role, path) => {
    setPermissions(prev => {
      const next = { ...prev, [role]: new Set(prev[role]) };
      if (next[role].has(path)) next[role].delete(path);
      else next[role].add(path);
      return next;
    });
  };

  if (isLoading || !permissions) {
    return (
      <RoleGuard allowedRoles={['admin', 'supervisor']}>
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard allowedRoles={['admin', 'supervisor']}>
      <div>
        <PageHeader title="Permissions" description="Control which screens each role can access. Admin always has full access.">
          <Button
            onClick={() => saveMutation.mutate(permissions)}
            disabled={saveMutation.isPending}
            className="gap-2"
          >
            {saved ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Save className="w-4 h-4" />}
            {saveMutation.isPending ? 'Saving...' : saved ? 'Saved!' : 'Save Permissions'}
          </Button>
        </PageHeader>

        <div className="rounded-xl border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider w-56">Screen</th>
                <th className="text-center px-4 py-3 font-semibold text-xs uppercase tracking-wider text-primary w-28">
                  Admin<br /><span className="text-[10px] font-normal text-muted-foreground normal-case">(always full)</span>
                </th>
                {ROLES.map(r => (
                  <th key={r.key} className="text-center px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground w-28">{r.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SCREENS.map((screen, idx) => (
                <tr key={screen.path} className={`border-b border-border last:border-0 ${idx % 2 === 0 ? '' : 'bg-muted/20'} hover:bg-muted/30 transition-colors`}>
                  <td className="px-4 py-3 font-medium text-foreground">{screen.label}</td>
                  <td className="text-center px-4 py-3">
                    <input type="checkbox" checked disabled className="w-4 h-4 accent-primary cursor-not-allowed opacity-60" />
                  </td>
                  {ROLES.map(r => (
                    <td key={r.key} className="text-center px-4 py-3">
                      <input
                        type="checkbox"
                        checked={permissions[r.key]?.has(screen.path) ?? false}
                        onChange={() => toggle(r.key, screen.path)}
                        className="w-4 h-4 accent-primary cursor-pointer"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted-foreground mt-3">
          Changes take effect immediately after saving. Users currently logged in will see the updated navigation on their next page load.
        </p>
      </div>
    </RoleGuard>
  );
}
