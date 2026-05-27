import React from 'react';
import { useRole } from '@/lib/useRole';
import { ShieldOff } from 'lucide-react';

export default function RoleGuard({ allowedRoles, children }) {
  const { role } = useRole();

  if (!role) return null;

  const allowed = allowedRoles.includes(role);
  if (!allowed) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-destructive/10 rounded-full p-4">
              <ShieldOff className="w-8 h-8 text-destructive" />
            </div>
          </div>
          <h2 className="text-xl font-display font-bold text-foreground mb-2">Access Denied</h2>
          <p className="text-sm text-muted-foreground">You do not have permission to view this page.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}