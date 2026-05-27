import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, DollarSign, CheckCircle2, Clock, XCircle, Package } from 'lucide-react';

function fmt(n) {
  if (typeof n !== 'number') return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Card({ icon: Icon, label, value, sub, color, isLoading }) {
  if (isLoading) return <Skeleton className="h-28 rounded-xl flex-1 min-w-[150px]" />;
  return (
    <div className={`bg-card border rounded-xl p-4 flex-1 min-w-[150px] ${color.border}`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-2 rounded-lg ${color.bg}`}>
          <Icon className={`w-4 h-4 ${color.icon}`} />
        </div>
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <div className={`text-xl font-bold ${color.text}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1 leading-tight">{sub}</div>}
    </div>
  );
}

export default function PORSummaryCards({ summary, isLoading }) {
  const { totalPOs, totalValue, paidCount, paidAmt, partialCount, partialBalance, unpaidCount, unpaidAmt, awaitingCount } = summary;
  return (
    <div className="flex flex-wrap gap-3 mb-6">
      <Card icon={FileText} label="Total POs" value={isLoading ? '...' : totalPOs} sub="active purchases" color={{ border: 'border-green-200', bg: 'bg-green-50', icon: 'text-green-700', text: 'text-green-800' }} isLoading={isLoading} />
      <Card icon={DollarSign} label="Total Value" value={isLoading ? '...' : `${fmt(totalValue)} ETB`} sub="grand total" color={{ border: 'border-green-200', bg: 'bg-green-50', icon: 'text-green-700', text: 'text-green-800' }} isLoading={isLoading} />
      <Card icon={CheckCircle2} label="Fully Paid" value={isLoading ? '...' : paidCount} sub={`${fmt(paidAmt)} ETB paid`} color={{ border: 'border-green-200', bg: 'bg-green-50', icon: 'text-green-600', text: 'text-green-700' }} isLoading={isLoading} />
      <Card icon={Clock} label="Partially Paid" value={isLoading ? '...' : partialCount} sub={`${fmt(partialBalance)} ETB remaining`} color={{ border: 'border-orange-200', bg: 'bg-orange-50', icon: 'text-orange-600', text: 'text-orange-700' }} isLoading={isLoading} />
      <Card icon={XCircle} label="Unpaid" value={isLoading ? '...' : unpaidCount} sub={`${fmt(unpaidAmt)} ETB`} color={{ border: 'border-red-200', bg: 'bg-red-50', icon: 'text-red-600', text: 'text-red-700' }} isLoading={isLoading} />
      <Card icon={Package} label="Awaiting Receipt" value={isLoading ? '...' : awaitingCount} sub="pending" color={{ border: 'border-slate-200', bg: 'bg-slate-50', icon: 'text-slate-500', text: 'text-slate-700' }} isLoading={isLoading} />
    </div>
  );
}