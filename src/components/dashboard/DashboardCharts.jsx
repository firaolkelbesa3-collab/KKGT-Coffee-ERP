import { useMemo } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { TrendingUp, BarChart3 } from 'lucide-react';

const GREEN = '#6F4E37';
const ORANGE = '#C8873E';
const AMBER = '#E0A458';

function fmtKg(n) {
  if (n == null || isNaN(n)) return '0';
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function monthKey(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key) {
  const [y, m] = key.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

/**
 * Two calm, ERP-appropriate charts for the dashboard.
 *  1. Dispatched vs warehouse-received KG over the last 6 months (area).
 *  2. Received KG by coffee type (horizontal bar).
 *
 * Fully prop-driven from data the Dashboard already fetches — additive, no
 * new queries, can't affect existing dashboard logic.
 */
export default function DashboardCharts({ purchaseRecords = [], receipts = [] }) {
  const monthlyTrend = useMemo(() => {
    const map = {};
    purchaseRecords.forEach(p => {
      const k = monthKey(p.purchase_date || p.created_date);
      if (!k) return;
      map[k] = map[k] || { month: k, dispatched: 0, received: 0 };
      map[k].dispatched += Number(p.net_dispatch_weight_kg) || 0;
    });
    receipts.forEach(r => {
      const k = monthKey(r.received_date || r.created_date);
      if (!k) return;
      map[k] = map[k] || { month: k, dispatched: 0, received: 0 };
      map[k].received += Number(r.warehouse_received_net_kg) || 0;
    });
    return Object.values(map)
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-6)
      .map(d => ({ ...d, label: monthLabel(d.month) }));
  }, [purchaseRecords, receipts]);

  const byCoffeeType = useMemo(() => {
    const map = {};
    receipts.forEach(r => {
      const type = r.coffee_type || 'Unspecified';
      map[type] = (map[type] || 0) + (Number(r.warehouse_received_net_kg) || 0);
    });
    return Object.entries(map)
      .map(([type, kg]) => ({ type, kg }))
      .sort((a, b) => b.kg - a.kg)
      .slice(0, 6);
  }, [receipts]);

  const hasTrend = monthlyTrend.some(d => d.dispatched > 0 || d.received > 0);
  const hasTypes = byCoffeeType.length > 0;

  if (!hasTrend && !hasTypes) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Monthly trend */}
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <TrendingUp className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Dispatch vs Received</h3>
            <p className="text-xs text-muted-foreground">Last 6 months (KG)</p>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={monthlyTrend} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="gDispatch" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={GREEN} stopOpacity={0.25} />
                <stop offset="100%" stopColor={GREEN} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gReceived" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ORANGE} stopOpacity={0.25} />
                <stop offset="100%" stopColor={ORANGE} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#999" />
            <YAxis tick={{ fontSize: 11 }} stroke="#999" tickFormatter={fmtKg} width={56} />
            <Tooltip formatter={(v) => `${fmtKg(v)} KG`} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="dispatched" name="Dispatched" stroke={GREEN} strokeWidth={2} fill="url(#gDispatch)" />
            <Area type="monotone" dataKey="received" name="Received" stroke={ORANGE} strokeWidth={2} fill="url(#gReceived)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* By coffee type */}
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <BarChart3 className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Received by Coffee Type</h3>
            <p className="text-xs text-muted-foreground">Top types (KG)</p>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={byCoffeeType} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11 }} stroke="#999" tickFormatter={fmtKg} />
            <YAxis type="category" dataKey="type" tick={{ fontSize: 11 }} stroke="#999" width={110} />
            <Tooltip formatter={(v) => `${fmtKg(v)} KG`} contentStyle={{ borderRadius: 8, fontSize: 12 }} cursor={{ fill: '#6F4E3708' }} />
            <Bar dataKey="kg" name="Received KG" fill={GREEN} radius={[0, 6, 6, 0]} barSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
