import React, { useState, useCallback } from 'react';
import { ArrowLeft, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';
import { reportApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Button, PageLoader } from '../../components/UI';
import { fmtCurrency, fyDates, todayISO } from '../../utils/helpers';
import toast from 'react-hot-toast';

export default function ProfitLossReport({ onBack }) {
  const { bizId }  = useAuth();
  const fy         = fyDates();
  const [from,     setFrom]    = useState(fy.from);
  const [to,       setTo]      = useState(todayISO());
  const [data,     setData]    = useState(null);
  const [loading,  setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!bizId) return;
    setLoading(true);
    try {
      const res = await reportApi.profitLoss(bizId, { from, to });
      setData(res.data);
    } catch { toast.error('Failed to load P&L'); }
    finally { setLoading(false); }
  }, [bizId, from, to]);

  const Section = ({ title, items, total, colorClass }) => (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-700">
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        <span className={`font-mono font-bold text-base ${colorClass}`}>{fmtCurrency(total)}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-slate-500 px-4 py-3">No entries</p>
      ) : (
        <table className="table-base">
          <tbody>
            {items.map((row, i) => (
              <tr key={i} className="tr-hover">
                <td className="td text-slate-400 text-xs w-16 font-mono">{row.code}</td>
                <td className="td text-slate-200">{row.name}</td>
                <td className="td text-xs text-slate-500 hidden sm:table-cell">{row.subType}</td>
                <td className="td text-right font-mono text-slate-100">{fmtCurrency(row.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-surface-700 text-slate-400"><ArrowLeft size={16} /></button>
        <div>
          <h1 className="text-xl font-bold text-white">Profit & Loss</h1>
          <p className="text-xs text-slate-500 mt-0.5">Income vs Expenses</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-slate-400 block mb-1">From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input" />
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input" />
        </div>
        <Button variant="primary" icon={RefreshCw} onClick={load} loading={loading}>Run Report</Button>
      </div>

      {loading && <PageLoader />}

      {data && !loading && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="card p-4 text-center">
              <p className="text-xs text-slate-500 mb-1">Total Income</p>
              <p className="text-2xl font-bold font-mono text-brand-400">{fmtCurrency(data.totalIncome)}</p>
            </div>
            <div className="card p-4 text-center">
              <p className="text-xs text-slate-500 mb-1">Total Expenses</p>
              <p className="text-2xl font-bold font-mono text-red-400">{fmtCurrency(data.totalExpenses)}</p>
            </div>
            <div className={`card p-4 text-center border-2 ${data.netProfit >= 0 ? 'border-brand-700' : 'border-red-700'}`}>
              <p className="text-xs text-slate-500 mb-1">{data.netProfit >= 0 ? 'Net Profit' : 'Net Loss'}</p>
              <p className={`text-2xl font-bold font-mono ${data.netProfit >= 0 ? 'text-brand-400' : 'text-red-400'}`}>
                {fmtCurrency(Math.abs(data.netProfit))}
              </p>
            </div>
          </div>

          <Section title="Income" items={data.income}   total={data.totalIncome}   colorClass="text-brand-400" />
          <Section title="Expenses" items={data.expenses} total={data.totalExpenses} colorClass="text-red-400" />

          {/* Net result row */}
          <div className={`card p-4 flex justify-between items-center ${data.netProfit >= 0 ? 'bg-brand-900/20 border-brand-800/40' : 'bg-red-900/20 border-red-800/40'}`}>
            <div className="flex items-center gap-2">
              {data.netProfit >= 0
                ? <TrendingUp size={18} className="text-brand-400" />
                : <TrendingDown size={18} className="text-red-400" />}
              <span className="text-sm font-semibold text-slate-100">{data.netProfit >= 0 ? 'Net Profit' : 'Net Loss'}</span>
            </div>
            <span className={`font-mono font-bold text-lg ${data.netProfit >= 0 ? 'text-brand-400' : 'text-red-400'}`}>
              {fmtCurrency(Math.abs(data.netProfit))}
            </span>
          </div>
        </>
      )}

      {!data && !loading && (
        <div className="card p-10 text-center text-slate-500 text-sm">Select a date range and click Run Report</div>
      )}
    </div>
  );
}
