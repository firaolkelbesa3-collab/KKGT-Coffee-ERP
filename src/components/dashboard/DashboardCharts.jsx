import { useMemo } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { TrendingUp, BarChart3, Wallet } from 'lucide-react';

// Brand palette
const COFFEE = '#6F4E37';
const AMBER = '#C8873E';
const AMBER_LT = '#E0A458';
const LEAF = '#5E8C3A';
const TYPE_COLORS = ['#6F4E37', '#C8873E', '#5E8C3A', '#8B6F47', '#A9772F', '#4E342E'];

function fmtKg(n) {
  if (n == null || isNaN(n)) return '0';
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
}
function fmtEtb(n) {
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
function sumPayments(record) {
  try {
    const arr = JSON.parse(record.payment_history || '[]');
    return arr.reduce((s, p) => s + (Number(p.amount_etb) || 0), 0);
  } catch { return Number(record.total_paid_etb) || 0; }
}

function ChartCard({ icon: Icon, title, subtitle, children }) {
  return (
    <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

/**
 * Interactive dashboard charts (recharts), brand-colored:
 *  1. Dispatch vs Received KG over last 6 months (area, full width)
 *  2. Received KG by coffee type (horizontal bar)
 *  3. Payment status — Paid vs Outstanding (donut)
 *
 * Prop-driven from data the Dashboard already fetches — additive, no new queries.
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

  const payment = useMemo(() => {
    let grand = 0, paid = 0;
    purchaseRecords.forEach(p => {
      if (p.archived) return;
      grand += Number(p.grand_total_etb) || 0;
      paid += sumPayments(p);
    });
    const outstanding = Math.max(0, grand - paid);
    return { paid, outstanding, grand };
  }, [purchaseRecords]);

  const paymentData = [
    { name: 'Paid', value: Math.round(payment.paid) },
    { name: 'Outstanding', value: Math.round(payment.outstanding) },
  ];
  const paidPct = payment.grand > 0 ? Math.round((payment.paid / payment.grand) * 100) : 0;

  const hasTrend = monthlyTrend.some(d => d.dispatched > 0 || d.received > 0);
  const hasTypes = byCoffeeType.length > 0;
  const hasPayment = payment.grand > 0;
  if (!hasTrend && !hasTypes && !hasPayment) return null;

  return (
    <div className="space-y-5">
      {/* Trend — full width */}
      {hasTrend && (
        <ChartCard icon={TrendingUp} title="Dispatch vs Received" subtitle="Last 6 months (KG)">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={monthlyTrend} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="gDispatch" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COFFEE} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={COFFEE} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gReceived" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={AMBER} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={AMBER} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#999" />
              <YAxis tick={{ fontSize: 11 }} stroke="#999" tickFormatter={fmtKg} width={56} />
              <Tooltip formatter={(v) => `${fmtKg(v)} KG`} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="dispatched" name="Dispatched" stroke={COFFEE} strokeWidth={2.5} fill="url(#gDispatch)" />
              <Area type="monotone" dataKey="received" name="Received" stroke={AMBER} strokeWidth={2.5} fill="url(#gReceived)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* By coffee type */}
        {hasTypes && (
          <ChartCard icon={BarChart3} title="Received by Coffee Type" subtitle="Top types (KG)">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byCoffeeType} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="#999" tickFormatter={fmtKg} />
                <YAxis type="category" dataKey="type" tick={{ fontSize: 11 }} stroke="#999" width={110} />
                <Tooltip formatter={(v) => `${fmtKg(v)} KG`} contentStyle={{ borderRadius: 8, fontSize: 12 }} cursor={{ fill: '#6F4E3708' }} />
                <Bar dataKey="kg" name="Received KG" radius={[0, 6, 6, 0]} barSize={18}>
                  {byCoffeeType.map((_, i) => <Cell key={i} fill={TYPE_COLORS[i % TYPE_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/* Payment status donut */}
        {hasPayment && (
          <ChartCard icon={Wallet} title="Supplier Payments" subtitle="Paid vs outstanding (ETB)">
            <div className="relative">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={paymentData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={62}
                    outerRadius={92}
                    paddingAngle={2}
                    stroke="none"
                  >
                    <Cell fill={COFFEE} />
                    <Cell fill={AMBER_LT} />
                  </Pie>
                  <Tooltip formatter={(v) => `${fmtEtb(v)} ETB`} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              {/* Center label */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ paddingBottom: 28 }}>
                <span className="text-2xl font-bold text-foreground tabular-nums">{paidPct}%</span>
                <span className="text-[11px] text-muted-foreground">paid</span>
              </div>
            </div>
          </ChartCard>
        )}
      </div>
    </div>
  );
}
