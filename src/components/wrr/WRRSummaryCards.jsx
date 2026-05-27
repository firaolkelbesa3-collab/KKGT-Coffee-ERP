import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Warehouse, Weight, TrendingDown, TrendingUp } from 'lucide-react';

function Card({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="bg-card rounded-xl border border-border p-4 flex items-start gap-3">
      <div className={`p-2 rounded-lg ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <p className="text-xl font-bold text-foreground">{value}</p>
        {sub && <p className="text-xs mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function WRRSummaryCards({ receipts, loading }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
    );
  }

  const totalReceipts = receipts.length;
  const totalReceivedKg = receipts.reduce((s, r) => s + (r.warehouse_received_net_kg || 0), 0);
  // Loss in transit = dispatched - received (what was sent minus what arrived)
  const totalLossKg = receipts.reduce((s, r) => {
    const loss = (r.net_dispatch_weight_kg || 0) - (r.warehouse_received_net_kg || 0);
    return s + (loss > 0 ? loss : 0); // only positive loss
  }, 0);
  const totalGainKg = receipts.reduce((s, r) => {
    const gain = (r.warehouse_received_net_kg || 0) - (r.net_dispatch_weight_kg || 0);
    return s + (gain > 0 ? gain : 0); // only positive gain
  }, 0);
  const grnPending = receipts.filter(r => !r.grn_code).length;

  const fmt = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card icon={Warehouse} label="Total Receipts" value={totalReceipts.toLocaleString()} color="bg-blue-100 text-blue-600" />
      <Card icon={Weight} label="Total Received KG" value={fmt(totalReceivedKg)} color="bg-green-100 text-green-600" />
      <Card
        icon={TrendingDown}
        label="Total Loss KG"
        value={fmt(totalLossKg)}
        sub="Loss in transit (dispatched - received)"
        color="bg-red-100 text-red-600"
      />
      <Card
        icon={TrendingUp}
        label="Total Gain KG"
        value={fmt(totalGainKg)}
        sub="Where received exceeded dispatched"
        color="bg-green-100 text-green-600"
      />
    </div>
  );
}