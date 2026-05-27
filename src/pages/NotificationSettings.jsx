import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import PageHeader from '@/components/shared/PageHeader';
import { useQueryClient } from '@tanstack/react-query';

const ALL_TYPES = [
  { key: 'new_purchase', label: '📦 New Purchase Registered', roles: ['warehouse_keeper'], critical: false },
  { key: 'new_purchase_supervisor', label: '📦 New Purchase (Supervisor)', roles: ['admin', 'supervisor'], critical: false },
  { key: 'payment_recorded', label: '💰 Payment Recorded', roles: ['admin', 'supervisor'], critical: false },
  { key: 'fully_paid', label: '✅ Supplier Fully Paid', roles: ['admin', 'supervisor'], critical: false },
  { key: 'weekly_payment_summary', label: '📋 Weekly Payment Summary', roles: ['admin', 'supervisor'], critical: false },
  { key: 'warehouse_confirmed', label: '✅ Warehouse Receipt Confirmed', roles: ['purchaser', 'admin'], critical: false },
  { key: 'warehouse_receipt_supervisor', label: '🏭 Receipt Confirmed (Supervisor)', roles: ['admin', 'supervisor'], critical: false },
  { key: 'large_shrinkage', label: '⚠️ Large Shrinkage Alert', roles: ['admin', 'supervisor'], critical: true },
  { key: 'low_stock', label: '⚠️ Low Stock Warning', roles: ['warehouse_keeper', 'admin'], critical: false },
  { key: 'stock_empty', label: '🔴 Stock Empty Alert', roles: ['warehouse_keeper', 'admin', 'supervisor'], critical: true },
];

export default function NotificationSettings() {
  const { user } = useAuth();
  const [disabled, setDisabled] = useState([]);
  const [saving, setSaving] = useState(false);
  const [settingsId, setSettingsId] = useState(null);
  const queryClient = useQueryClient();
  const isSupervisor = user?.role === 'admin' || user?.role === 'supervisor';

  useEffect(() => {
    if (!user) return;
    base44.entities.NotificationSettings.filter({ user_email: user.email }).then(rows => {
      if (rows.length > 0) {
        setSettingsId(rows[0].id);
        try { setDisabled(JSON.parse(rows[0].disabled_types || '[]')); } catch {}
      }
    });
  }, [user]);

  const toggle = (key, isCritical) => {
    if (isCritical && isSupervisor) return; // supervisors can't turn off critical
    setDisabled(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const payload = { user_email: user.email, disabled_types: JSON.stringify(disabled) };
    if (settingsId) await base44.entities.NotificationSettings.update(settingsId, payload);
    else { const r = await base44.entities.NotificationSettings.create(payload); setSettingsId(r.id); }
    setSaving(false);
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const relevantTypes = ALL_TYPES.filter(t => !t.roles.length || t.roles.some(r => r === user?.role) || isSupervisor);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <PageHeader title="Notification Settings" description="Control which notifications you receive" />

      <div className="bg-card border border-border rounded-xl divide-y divide-border">
        {relevantTypes.map(t => {
          const isDisabled = disabled.includes(t.key);
          const locked = t.critical && isSupervisor;
          return (
            <div key={t.key} className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="text-sm font-medium">{t.label}</p>
                {locked && <p className="text-xs text-destructive mt-0.5">Critical — cannot be disabled for supervisors</p>}
              </div>
              <button
                onClick={() => toggle(t.key, t.critical)}
                disabled={locked}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  !isDisabled ? 'bg-primary' : 'bg-muted-foreground/30'
                } ${locked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${!isDisabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="h-9 px-6 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}