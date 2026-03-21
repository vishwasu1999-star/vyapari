import React, { useState, useCallback } from 'react';
import { ArrowLeft, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { reportApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Button, PageLoader } from '../../components/UI';
import { fmtCurrency, todayISO } from '../../utils/helpers';
import toast from 'react-hot-toast';

const Section = ({ title, items, total, colorClass }) => (
  <div className="card overflow-hidden">
    <div className="flex items-center justify-between px-4 py-3 border-b border-surface-700">
      <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
      <span className={`font-mono font-bold ${colorClass}`}>{fmtCurrency(total)}</span>
    </div>
    {items.length === 0 ? (
      <p className="text-xs text-slate-500 px-4 py-3">No entries</p>
    ) : (
      <table className="table-base">
        <tbody>
          {items.map((row, i) => (
            <tr key={i} className="tr-hover">
              <td className="td text-xs font-mono text-slate-400 w-16">{row.code}</td>
              <td className="td text-slate-200">{row.name}</td>
              <td className="td text-xs text-slate-500 hidden sm:table-cell">{row.subType}</td>
              <td className="td text-right font-mono text-slate-100">
                {fmtCurrency(row.balance)}
                <span className="text-xs text-slate-500 ml-1">{row.side}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
);

export default function BalanceSheetReport({ onBack }) {
  const { bizId }  = useAuth();
  const [asOf,     setAsOf]    = useState(todayISO());
  const [data,     setData]    = useState(null);
  const [loading,  setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!bizId) return;
    setLoading(true);
    try {
      const res = await reportApi.balanceSheet(bizId, { asOf });
      setData(res.data);
    } catch { toast.error('Failed to load balance sheet'); }
    finally { setLoading(false); }
  }, [bizId, asOf]);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-surface-700 text-slate-400"><ArrowLeft size={16} /></button>
        <div>
          <h1 className="text-xl font-bold text-white">Balance Sheet</h1>
          <p className="text-xs text-slate-500 mt-0.5">Assets = Liabilities + Equity</p>
        </div>
      </div>

      <div className="card p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-slate-400 block mb-1">As of Date</label>
          <input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} className="input" />
        </div>
        <Button variant="primary" icon={RefreshCw} onClick={load} loading={loading}>Run Report</Button>
      </div>

      {loading && <PageLoader />}

      {data && !loading && (
        <>
          {/* Balance check banner */}
          <div className={`flex items-center gap-2 p-3 rounded-xl border text-sm ${
            data.isBalanced
              ? 'bg-brand-900/20 border-brand-800/40 text-brand-300'
              : 'bg-red-900/20 border-red-800/40 text-red-300'
          }`}>
            {data.isBalanced
              ? <><CheckCircle size={15} /> Balance sheet is balanced (Assets = Liabilities + Equity)</>
              : <><AlertCircle size={15} /> Balance sheet is NOT balanced — check your entries</>
            }
          </div>

          {/* Summary row */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total Assets',      value: data.totalAssets,      color: 'text-blue-400' },
              { label: 'Total Liabilities', value: data.totalLiabilities, color: 'text-red-400' },
              { label: 'Total Equity',      value: data.totalEquity,       color: 'text-brand-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="card p-3 text-center">
                <p className="text-xs text-slate-500 mb-1">{label}</p>
                <p className={`text-lg font-bold font-mono ${color}`}>{fmtCurrency(value)}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-4">
              <Section title="Assets" items={data.assets} total={data.totalAssets} colorClass="text-blue-400" />
            </div>
            <div className="space-y-4">
              <Section title="Liabilities"    items={data.liabilities} total={data.totalLiabilities} colorClass="text-red-400" />
              <Section title="Equity & Capital" items={data.equity}     total={data.totalEquity}       colorClass="text-brand-400" />
            </div>
          </div>

          {/* Net profit line */}
          <div className="card p-4 flex justify-between items-center">
            <span className="text-sm font-semibold text-slate-200">
              {data.netProfit >= 0 ? 'Net Profit (Current Period)' : 'Net Loss (Current Period)'}
            </span>
            <span className={`font-mono font-bold ${data.netProfit >= 0 ? 'text-brand-400' : 'text-red-400'}`}>
              {fmtCurrency(Math.abs(data.netProfit))}
            </span>
          </div>
        </>
      )}

      {!data && !loading && (
        <div className="card p-10 text-center text-slate-500 text-sm">Select a date and click Run Report</div>
      )}
    </div>
  );
}
