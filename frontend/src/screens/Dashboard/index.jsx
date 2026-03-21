import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, TrendingDown, Clock, AlertCircle,
  Plus, ArrowRight, Package, RefreshCw, FileText,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, BarChart, Bar,
} from 'recharts';
import { reportApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { fmtCurrency, fmtDate } from '../../utils/helpers';
import { StatCard, PageLoader, StatusBadge, Button, EmptyState } from '../../components/UI';

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-800 border border-surface-600 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-slate-400 mb-1">{label}</p>
      <p className="text-brand-400 font-semibold font-mono">{fmtCurrency(payload[0]?.value)}</p>
    </div>
  );
};

export default function DashboardScreen() {
  const { bizId }    = useAuth();
  const navigate     = useNavigate();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!bizId) return;
    try {
      setLoading(true);
      const res = await reportApi.dashboard(bizId);
      setData(res.data);
    } catch (e) {
      console.error('Dashboard load failed:', e);
    } finally {
      setLoading(false);
    }
  }, [bizId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <PageLoader />;

  if (!data) return (
    <EmptyState icon={FileText} title="Could not load dashboard"
      description="Check your connection and try again"
      action={<Button onClick={load} icon={RefreshCw}>Retry</Button>} />
  );

  const {
    salesThisMonth, purchasesThisMonth, receivables, payables,
    overdueInvoices, recentSales, lowStock, monthlySales,
  } = data;

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Dashboard</h1>
          <p className="text-xs text-slate-500 mt-0.5">Business at a glance</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={load} disabled={loading} />
          <Button variant="primary" size="sm" icon={Plus} onClick={() => navigate('/sales?view=new')}>
            New Invoice
          </Button>
        </div>
      </div>

      {/* ── Stat cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Sales This Month"
          value={fmtCurrency(salesThisMonth?.total || 0)}
          sub={`${salesThisMonth?.count || 0} invoices`}
          icon={TrendingUp}
          color="brand"
        />
        <StatCard
          label="Purchases"
          value={fmtCurrency(purchasesThisMonth?.total || 0)}
          sub={`${purchasesThisMonth?.count || 0} invoices`}
          icon={TrendingDown}
          color="blue"
        />
        <StatCard
          label="Receivables"
          value={fmtCurrency(receivables?.total || 0)}
          sub={`${receivables?.count || 0} unpaid`}
          icon={Clock}
          color="amber"
        />
        <StatCard
          label="Payables"
          value={fmtCurrency(payables?.total || 0)}
          sub={`${payables?.count || 0} pending`}
          icon={AlertCircle}
          color="red"
        />
      </div>

      {/* ── Overdue alert ───────────────────────────────────── */}
      {overdueInvoices?.count > 0 && (
        <div className="flex items-center gap-3 p-3 bg-red-950/50 border border-red-800/40 rounded-xl">
          <AlertCircle size={15} className="text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-300 flex-1">
            <strong>{overdueInvoices.count}</strong> overdue invoice(s) —{' '}
            <strong>{fmtCurrency(overdueInvoices.total)}</strong> outstanding
          </p>
          <Button variant="outline" size="sm" onClick={() => navigate('/sales?status=overdue')}>
            View
          </Button>
        </div>
      )}

      {/* ── Charts ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Monthly Sales */}
        <div className="card p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold text-slate-200 mb-4">Monthly Sales (last 6 months)</h3>
          {monthlySales?.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={monthlySales} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="grad1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false}
                  tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="sales" stroke="#10b981" strokeWidth={2}
                  fill="url(#grad1)" dot={{ r: 3, fill: '#10b981' }} activeDot={{ r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-44 flex items-center justify-center text-slate-500 text-sm">
              No sales data yet
            </div>
          )}
        </div>

        {/* Low Stock */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-200">Low Stock Alert</h3>
            <button onClick={() => navigate('/items?lowStock=true')} className="text-brand-400 hover:text-brand-300">
              <ArrowRight size={14} />
            </button>
          </div>
          {!lowStock?.length ? (
            <div className="flex flex-col items-center py-8 text-center">
              <Package size={22} className="text-slate-600 mb-2" />
              <p className="text-xs text-slate-500">All stock levels are OK</p>
            </div>
          ) : (
            <div className="space-y-2">
              {lowStock.map(item => (
                <div key={item.id} className="flex items-center justify-between py-1.5 border-b border-surface-700/50 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-200 truncate">{item.name}</p>
                    <p className="text-xs text-slate-500">{item.unit}</p>
                  </div>
                  <div className="text-right ml-3 flex-shrink-0">
                    <p className="text-xs font-mono font-bold text-red-400">{item.current_stock}</p>
                    <p className="text-xs text-slate-600">min {item.min_stock_alert}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Recent Sales ────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-700">
          <h3 className="text-sm font-semibold text-slate-200">Recent Sales</h3>
          <button onClick={() => navigate('/sales')}
            className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1 transition-colors">
            View all <ArrowRight size={12} />
          </button>
        </div>

        {!recentSales?.length ? (
          <div className="py-12 text-center">
            <p className="text-sm text-slate-500 mb-2">No invoices yet</p>
            <button onClick={() => navigate('/sales?view=new')}
              className="text-xs text-brand-400 hover:text-brand-300 underline">
              Create your first invoice →
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="th">Invoice #</th>
                  <th className="th">Party</th>
                  <th className="th hidden sm:table-cell">Date</th>
                  <th className="th text-right">Amount</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentSales.map(inv => (
                  <tr key={inv.id} className="tr-hover cursor-pointer"
                    onClick={() => navigate(`/sales/${inv.id}`)}>
                    <td className="td font-mono text-xs text-brand-400">{inv.invoice_number}</td>
                    <td className="td max-w-[140px] truncate">{inv.party_name || '—'}</td>
                    <td className="td text-slate-400 hidden sm:table-cell">{fmtDate(inv.invoice_date)}</td>
                    <td className="td text-right font-mono font-semibold text-slate-100">{fmtCurrency(inv.total_amount)}</td>
                    <td className="td"><StatusBadge status={inv.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
