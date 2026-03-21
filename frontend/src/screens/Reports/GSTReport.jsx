import React, { useState, useCallback } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { reportApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Button, PageLoader } from '../../components/UI';
import { fmtCurrency, fyDates, todayISO } from '../../utils/helpers';
import toast from 'react-hot-toast';

const GSTTable = ({ title, rows, badgeColor }) => (
  <div className="card overflow-hidden">
    <div className="px-4 py-3 border-b border-surface-700">
      <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
    </div>
    {!rows?.length ? (
      <p className="text-xs text-slate-500 px-4 py-3 text-center">No data for this period</p>
    ) : (
      <div className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th className="th">GST Rate</th>
              <th className="th text-right">Taxable Amount</th>
              <th className="th text-right">CGST</th>
              <th className="th text-right">SGST</th>
              <th className="th text-right">IGST</th>
              <th className="th text-right">Total Tax</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const totalTax = (row.cgst || 0) + (row.sgst || 0) + (row.igst || 0) + (row.cess || 0);
              return (
                <tr key={i} className="tr-hover">
                  <td className="td">
                    <span className={`badge ${badgeColor}`}>{parseFloat(row.gstRate)}%</span>
                    {row.isInterState && <span className="badge badge-slate ml-1 text-xs">IGST</span>}
                  </td>
                  <td className="td text-right font-mono">{fmtCurrency(row.taxableAmount)}</td>
                  <td className="td text-right font-mono text-slate-400">{fmtCurrency(row.cgst)}</td>
                  <td className="td text-right font-mono text-slate-400">{fmtCurrency(row.sgst)}</td>
                  <td className="td text-right font-mono text-slate-400">{fmtCurrency(row.igst)}</td>
                  <td className="td text-right font-mono font-semibold text-slate-100">{fmtCurrency(totalTax)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}
  </div>
);

export default function GSTReport({ onBack }) {
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
      const res = await reportApi.gst(bizId, { from, to });
      setData(res.data);
    } catch { toast.error('Failed to load GST report'); }
    finally { setLoading(false); }
  }, [bizId, from, to]);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-surface-700 text-slate-400"><ArrowLeft size={16} /></button>
        <div>
          <h1 className="text-xl font-bold text-white">GST Report</h1>
          <p className="text-xs text-slate-500 mt-0.5">Output tax, Input credit and Net payable</p>
        </div>
      </div>

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
          {/* Summary strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Output Tax (Sales)',  value: data.totOutput?.totalTax,   color: 'text-red-400' },
              { label: 'Input Credit (Purch)',value: data.totInput?.totalTax,    color: 'text-brand-400' },
              { label: 'Net GST Payable',     value: data.netPayable?.total,     color: data.netPayable?.total >= 0 ? 'text-amber-400' : 'text-brand-400' },
              { label: 'Taxable Turnover',    value: data.totOutput?.taxableAmount, color: 'text-blue-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="card p-3 text-center">
                <p className="text-xs text-slate-500 mb-1">{label}</p>
                <p className={`text-base font-bold font-mono ${color}`}>{fmtCurrency(value || 0)}</p>
              </div>
            ))}
          </div>

          <GSTTable title="Output GST (on Sales)"    rows={data.outputGST} badgeColor="badge-red" />
          <GSTTable title="Input GST Credit (Purch)" rows={data.inputGST}  badgeColor="badge-green" />

          {/* Net payable breakdown */}
          <div className="card p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-200 mb-2">GSTR-3B Summary — Net Payable</h3>
            {[
              ['CGST Payable', (data.netPayable?.cgst || 0)],
              ['SGST Payable', (data.netPayable?.sgst || 0)],
              ['IGST Payable', (data.netPayable?.igst || 0)],
            ].map(([label, val]) => (
              <div key={label} className="flex justify-between items-center py-1.5 border-b border-surface-700">
                <span className="text-sm text-slate-400">{label}</span>
                <span className={`font-mono font-semibold ${val > 0 ? 'text-amber-400' : 'text-brand-400'}`}>{fmtCurrency(val)}</span>
              </div>
            ))}
            <div className="flex justify-between items-center pt-1">
              <span className="text-sm font-bold text-slate-100">Total Net GST Payable</span>
              <span className={`font-mono font-bold text-lg ${(data.netPayable?.total || 0) > 0 ? 'text-amber-400' : 'text-brand-400'}`}>
                {fmtCurrency(data.netPayable?.total || 0)}
              </span>
            </div>
          </div>
        </>
      )}

      {!data && !loading && (
        <div className="card p-10 text-center text-slate-500 text-sm">Select a period and click Run Report</div>
      )}
    </div>
  );
}
