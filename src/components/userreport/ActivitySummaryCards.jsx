import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, ShoppingCart, CreditCard, PackageCheck } from 'lucide-react';

const cards = [
  { key: 'active', label: 'Total Active Users', icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
  { key: 'totalPurchases', label: 'Purchases Created', icon: ShoppingCart, color: 'text-green-600', bg: 'bg-green-50' },
  { key: 'totalPayments', label: 'Payments Recorded', icon: CreditCard, color: 'text-orange-600', bg: 'bg-orange-50' },
  { key: 'totalWarehouse', label: 'Warehouse Receipts', icon: PackageCheck, color: 'text-purple-600', bg: 'bg-purple-50' },
];

export default function ActivitySummaryCards({ summary, isLoading }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(c => (
        <div key={c.key} className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
          <div className={`rounded-lg ${c.bg} p-3`}>
            <c.icon className={`w-5 h-5 ${c.color}`} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{c.label}</p>
            {isLoading ? (
              <Skeleton className="h-7 w-12 mt-1" />
            ) : (
              <p className="text-2xl font-bold text-foreground">{summary[c.key] ?? 0}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}