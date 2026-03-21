import React, { useState, useCallback } from 'react';
import { ArrowLeft, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { reportApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Button, PageLoader } from '../../components/UI';
import { fmtCurrency, fmtDate, fyDates, todayISO } from '../../utils/helpers';
import toast from 'react-hot-toast';

const VOUCHER_TYPE_COLOR = {
  Sales:    'badge-green',
  Purchase: 'badge-blue',
  Receipt:  'badge-green',
  Payment:  'badge-red',
  Journal:  'badge-slate',
  Contra:   'badge-amber',
};

function VoucherRow({ voucher }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className="tr-hover cursor-pointer" onClick={() => setOpen(p => !p)}>
        <td className="td">
          {open ? <ChevronDown size={13} className="text-slate-400" /> : <ChevronRight size={13} className="text-slate-400" />}
        </td>
        <td className="td text-slate-400">{fmtDate(voucher.voucher_date)}</td>
        <td className="td">
          <span className={`badge ${VOUCHER_TYPE_COLOR[voucher.voucher_type] || 'badge-slate'}`}>{voucher.voucher_type}</span>
        </td>
        <td className="td font-mono text-xs text-brand-400">{voucher.voucher_number}</td>
        <td className="td text-slate-300 max-w-[200px] truncate">{voucher.narration}</td>
        <td className="td text-right font-mono text-slate-100">{fmtCurrency(voucher.total_debit)}</td>
        <td className="td text-right font-mono text-slate-100">{fmtCurrency(voucher.total_credit)}</td>
      </tr>
      {open && voucher.entries?.map((e, i) => (
        <tr key={i} className="bg-surface-900/50">
          <td className="td" colSpan={2} />
          <td className="td" />
          <td className="td text-xs text-slate-500 font-mono" colSpan={2}>
            &nbsp;&nbsp;&nbsp;↳ {e.accountName}
            {e.narration && <span className="text-slate-600 ml-2">— {e.narration}</span>}
          </td>
          <td className="td text-right font-mono text-xs text-slate-400">{e.debit > 0 ? fmtCurrency(e.debit) : '—'}</td>
          <td className="td text-right font-mono text-xs text-slate-400">{e.credit > 0 ? fmtCurrency(e.credit) : '—'}</td>
        </tr>
      ))}
    </>
  );
}

export default function DayBookReport({ onBack }) {
  const { bizId }  = useAuth();
  const fy         = fyDates();
  const [from,     setFrom]    = useState(todayISO());
  const [to,       setTo]      = useState(todayISO());
  const [data,     setData]    = useState(null);
  const [loading,  setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!bizId) return;
    setLoading(true);
    try {
      const res = await reportApi.dayBook(bizId, { from, to });
      setData(res.data);
    } catch { toast.error('Failed to load day book'); }
    finally { setLoading(false); }
  }, [bizId, from, to]);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-surface-700 text-slate-400"><ArrowLeft size={16} /></button>
        <div>
          <h1 className="text-xl font-bold text-white">Day Book</h1>
          <p className="text-xs text-slate-500 mt-0.5">All transactions chronologically</p>
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
          <div className="grid grid-cols-2 gap-3">
            <div className="card p-3 text-center">
              <p className="text-xs text-slate-500 mb-1">Total Debit</p>
              <p className="text-lg font-bold font-mono text-blue-400">{fmtCurrency(data.totalDebit)}</p>
            </div>
            <div className="card p-3 text-center">
              <p className="text-xs text-slate-500 mb-1">Total Credit</p>
              <p className="text-lg font-bold font-mono text-brand-400">{fmtCurrency(data.totalCredit)}</p>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-surface-700">
              <h3 className="text-sm font-semibold text-slate-200">{data.vouchers?.length || 0} transactions</h3>
            </div>
            {!data.vouchers?.length ? (
              <p className="text-sm text-slate-500 text-center py-10">No transactions in this period</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th className="th w-8" />
                      <th className="th">Date</th>
                      <th className="th">Type</th>
                      <th className="th">Number</th>
                      <th className="th">Narration</th>
                      <th className="th text-right">Debit</th>
                      <th className="th text-right">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.vouchers.map(v => <VoucherRow key={v.id} voucher={v} />)}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {!data && !loading && (
        <div className="card p-10 text-center text-slate-500 text-sm">Select a date range and click Run Report</div>
      )}
    </div>
  );
}
