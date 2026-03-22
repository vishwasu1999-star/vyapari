// ============================================================
// TRIAL BALANCE REPORT
// ============================================================
import React, { useState } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { reportApi } from '../../services/api';
import { Button, PageLoader } from '../../components/UI';
import { fmtCurrency, fyDates, todayISO } from '../../utils/helpers';


function DateRange({ from, to, onFrom, onTo }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-500">From</label>
        <input type="date" value={from} onChange={e => onFrom(e.target.value)} className="input text-xs w-36" />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-500">To</label>
        <input type="date" value={to} onChange={e => onTo(e.target.value)} className="input text-xs w-36" />
      </div>
    </div>
  );
}

export function TrialBalanceReport({ onBack }) {
  const { bizId } = useAuth();
  const fy = fyDates();
  const [from, setFrom] = useState(fy.from);
  const [to,   setTo]   = useState(todayISO());

  const data = [];
const loading = false;
  const d = data;

  const groupBy = (arr, key) => arr.reduce((g, i) => { (g[i[key]] = g[i[key]] || []).push(i); return g; }, {});
  const groups  = d ? groupBy(d.accounts, 'accountType') : {};

  return (
    <div className="p-4 md:p-6 space-y-4 animate-fade-in">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onBack} className="p-2 hover:bg-surface-700 rounded-xl text-slate-400"><ArrowLeft size={18} /></button>
        <h1 className="text-xl font-bold text-slate-100 flex-1">Trial Balance</h1>
        <button onClick={() => window.print()} className="btn-outline text-xs"><Printer size={14} /> Print</button>
      </div>
      <div className="card p-3 flex items-center justify-between flex-wrap gap-3">
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
        {d && (
          <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${d.isBalanced ? 'bg-emerald-900/30 text-emerald-400' : 'bg-red-900/30 text-red-400'}`}>
            {d.isBalanced ? '✓ Balanced' : '✗ Not Balanced'}
          </span>
        )}
      </div>

      {loading ? <PageLoader /> : d && (
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead>
              <tr>
                <th className="th">Code</th>
                <th className="th">Account</th>
                <th className="th text-right">Opening Dr</th>
                <th className="th text-right">Opening Cr</th>
                <th className="th text-right">Period Dr</th>
                <th className="th text-right">Period Cr</th>
                <th className="th text-right">Closing Dr</th>
                <th className="th text-right">Closing Cr</th>
              </tr>
            </thead>
            <tbody>
              {['Asset','Liability','Equity','Income','Expense'].map(type => {
                const rows = groups[type] || [];
                if (!rows.length) return null;
                return (
                  <React.Fragment key={type}>
                    <tr><td colSpan={8} className="px-3 py-2 text-xs font-bold text-slate-400 uppercase bg-surface-700/30">{type}</td></tr>
                    {rows.map(acc => (
                      <tr key={acc.id} className="tr-hover">
                        <td className="td font-mono text-xs text-slate-500">{acc.code}</td>
                        <td className="td text-slate-300">{acc.name}</td>
                        <td className="td text-right font-mono text-xs">{acc.openingDr > 0 ? fmtCurrency(acc.openingDr) : '—'}</td>
                        <td className="td text-right font-mono text-xs">{acc.openingCr > 0 ? fmtCurrency(acc.openingCr) : '—'}</td>
                        <td className="td text-right font-mono text-xs">{acc.periodDebit  > 0 ? fmtCurrency(acc.periodDebit) : '—'}</td>
                        <td className="td text-right font-mono text-xs">{acc.periodCredit > 0 ? fmtCurrency(acc.periodCredit) : '—'}</td>
                        <td className="td text-right font-mono text-sm font-semibold">{acc.closingDr > 0 ? fmtCurrency(acc.closingDr) : '—'}</td>
                        <td className="td text-right font-mono text-sm font-semibold">{acc.closingCr > 0 ? fmtCurrency(acc.closingCr) : '—'}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
              <tr className="bg-surface-700/40">
                <td className="td font-bold text-slate-200 text-sm" colSpan={6}>TOTAL</td>
                <td className="td text-right font-bold font-mono text-brand-400 text-sm">{fmtCurrency(d.totalDebit)}</td>
                <td className="td text-right font-bold font-mono text-brand-400 text-sm">{fmtCurrency(d.totalCredit)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================
// PROFIT & LOSS
// ============================================================
export function ProfitLossReport({ onBack }) {
  const { bizId } = useAuth();
  const fy = fyDates();
  const [from, setFrom] = useState(fy.from);
  const [to,   setTo]   = useState(todayISO());
const data = [];
const loading = false;
  const d = data;

  return (
    <div className="p-4 md:p-6 space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 hover:bg-surface-700 rounded-xl text-slate-400"><ArrowLeft size={18} /></button>
        <h1 className="text-xl font-bold text-slate-100">Profit & Loss</h1>
      </div>
      <div className="card p-3"><DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} /></div>

      {loading ? <PageLoader /> : d && (
        <div className="grid md:grid-cols-2 gap-4">
          {/* Income */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-surface-700 bg-emerald-900/10">
              <p className="text-sm font-semibold text-emerald-400">INCOME</p>
            </div>
            <div className="divide-y divide-surface-700/50">
              {d.income.map(acc => (
                <div key={acc.code} className="flex justify-between px-4 py-2.5 text-sm">
                  <span className="text-slate-400">{acc.name}</span>
                  <span className="font-mono font-medium text-emerald-400">{fmtCurrency(acc.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between px-4 py-3 bg-emerald-900/10">
                <span className="font-bold text-emerald-300">Total Income</span>
                <span className="font-mono font-bold text-emerald-300">{fmtCurrency(d.totalIncome)}</span>
              </div>
            </div>
          </div>

          {/* Expenses */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-surface-700 bg-red-900/10">
              <p className="text-sm font-semibold text-red-400">EXPENSES</p>
            </div>
            <div className="divide-y divide-surface-700/50">
              {d.expenses.map(acc => (
                <div key={acc.code} className="flex justify-between px-4 py-2.5 text-sm">
                  <span className="text-slate-400">{acc.name}</span>
                  <span className="font-mono font-medium text-red-400">{fmtCurrency(acc.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between px-4 py-3 bg-red-900/10">
                <span className="font-bold text-red-300">Total Expenses</span>
                <span className="font-mono font-bold text-red-300">{fmtCurrency(d.totalExpenses)}</span>
              </div>
            </div>
          </div>

          {/* Net Profit summary */}
          <div className={`md:col-span-2 card p-6 flex items-center justify-between ${d.netProfit >= 0 ? 'border-emerald-800/50 bg-emerald-900/10' : 'border-red-800/50 bg-red-900/10'}`}>
            <p className={`text-lg font-bold ${d.netProfit >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
              {d.netProfit >= 0 ? 'Net Profit' : 'Net Loss'}
            </p>
            <p className={`text-3xl font-bold font-mono ${d.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {fmtCurrency(Math.abs(d.netProfit))}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// BALANCE SHEET
// ============================================================
export function BalanceSheetReport({ onBack }) {
  const { bizId } = useAuth();
  const [asOf, setAsOf] = useState(todayISO());

 const data = [];
const loading = false;
  const d = data;

  return (
    <div className="p-4 md:p-6 space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 hover:bg-surface-700 rounded-xl text-slate-400"><ArrowLeft size={18} /></button>
        <h1 className="text-xl font-bold text-slate-100 flex-1">Balance Sheet</h1>
      </div>
      <div className="card p-3 flex items-center gap-3">
        <label className="text-xs text-slate-500">As of</label>
        <input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} className="input text-xs w-40" />
        {d && (
          <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ml-auto ${d.isBalanced ? 'bg-emerald-900/30 text-emerald-400' : 'bg-red-900/30 text-red-400'}`}>
            {d.isBalanced ? '✓ Balanced' : '✗ Not Balanced'}
          </span>
        )}
      </div>

      {loading ? <PageLoader /> : d && (
        <div className="grid md:grid-cols-2 gap-4">
          <BSSection title="ASSETS" items={d.assets} total={d.totalAssets} color="blue" />
          <div className="space-y-4">
            <BSSection title="LIABILITIES" items={d.liabilities} total={d.totalLiabilities} color="red" />
            <BSSection title="EQUITY" items={d.equity} total={d.totalEquity} color="purple" />
          </div>
        </div>
      )}
    </div>
  );
}

function BSSection({ title, items, total, color }) {
  const colors = { blue: 'text-blue-400 bg-blue-900/10', red: 'text-red-400 bg-red-900/10', purple: 'text-purple-400 bg-purple-900/10' };
  return (
    <div className="card overflow-hidden">
      <div className={`px-4 py-3 border-b border-surface-700 ${colors[color]?.split(' ')[1]}`}>
        <p className={`text-sm font-bold ${colors[color]?.split(' ')[0]}`}>{title}</p>
      </div>
      <div className="divide-y divide-surface-700/50">
        {items.map((item, i) => (
          <div key={i} className="flex justify-between px-4 py-2.5 text-sm">
            <div>
              <span className="text-slate-400">{item.name}</span>
              {item.subType && <p className="text-[10px] text-slate-600">{item.subType}</p>}
            </div>
            <span className="font-mono font-medium text-slate-200">{fmtCurrency(item.balance)}</span>
          </div>
        ))}
        <div className={`flex justify-between px-4 py-3 ${colors[color]?.split(' ')[1]}`}>
          <span className={`font-bold ${colors[color]?.split(' ')[0]}`}>Total {title}</span>
          <span className={`font-mono font-bold ${colors[color]?.split(' ')[0]}`}>{fmtCurrency(total)}</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// GST REPORT
// ============================================================
export function GSTReport({ onBack }) {
  const { bizId } = useAuth();
  const fy = fyDates();
  const [from, setFrom] = useState(fy.from);
  const [to,   setTo]   = useState(todayISO());

  const data = [];
const loading = false;
  const d = data;

  return (
    <div className="p-4 md:p-6 space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 hover:bg-surface-700 rounded-xl text-slate-400"><ArrowLeft size={18} /></button>
        <h1 className="text-xl font-bold text-slate-100">GST Report</h1>
      </div>
      <div className="card p-3"><DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} /></div>

      {loading ? <PageLoader /> : d && (
        <div className="space-y-4">
          {/* Net Payable summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Output GST', val: d.totOutput?.totalTax,    color: 'text-amber-400' },
              { label: 'Input ITC',  val: d.totInput?.totalTax,     color: 'text-blue-400' },
              { label: 'Net Payable',val: d.netPayable?.total,       color: d.netPayable?.total >= 0 ? 'text-red-400' : 'text-emerald-400' },
              { label: 'Taxable',    val: d.totOutput?.taxableAmount, color: 'text-slate-200' },
            ].map(c => (
              <div key={c.label} className="card p-4">
                <p className="text-xs text-slate-500 mb-1">{c.label}</p>
                <p className={`text-lg font-bold font-mono ${c.color}`}>{fmtCurrency(c.val || 0)}</p>
              </div>
            ))}
          </div>

          {/* Output Tax */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-surface-700 bg-amber-900/10">
              <p className="text-sm font-semibold text-amber-400">OUTPUT TAX (Sales)</p>
            </div>
            <table className="table-base">
              <thead><tr>
                <th className="th">GST Rate</th>
                <th className="th text-right">Taxable</th>
                <th className="th text-right">CGST</th>
                <th className="th text-right">SGST</th>
                <th className="th text-right">IGST</th>
                <th className="th text-right">Total Tax</th>
              </tr></thead>
              <tbody>
                {(d.outputGST || []).map((row, i) => (
                  <tr key={i} className="tr-hover">
                    <td className="td"><span className="badge-amber">{row.gstRate}%</span></td>
                    <td className="td text-right font-mono">{fmtCurrency(row.taxableAmount)}</td>
                    <td className="td text-right font-mono text-xs">{fmtCurrency(row.cgst)}</td>
                    <td className="td text-right font-mono text-xs">{fmtCurrency(row.sgst)}</td>
                    <td className="td text-right font-mono text-xs">{fmtCurrency(row.igst)}</td>
                    <td className="td text-right font-mono font-semibold text-amber-400">{fmtCurrency(row.totalTax)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Input Tax */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-surface-700 bg-blue-900/10">
              <p className="text-sm font-semibold text-blue-400">INPUT TAX CREDIT (Purchases)</p>
            </div>
            <table className="table-base">
              <thead><tr>
                <th className="th">GST Rate</th>
                <th className="th text-right">Taxable</th>
                <th className="th text-right">CGST</th>
                <th className="th text-right">SGST</th>
                <th className="th text-right">IGST</th>
                <th className="th text-right">ITC</th>
              </tr></thead>
              <tbody>
                {(d.inputGST || []).map((row, i) => (
                  <tr key={i} className="tr-hover">
                    <td className="td"><span className="badge-blue">{row.gstRate}%</span></td>
                    <td className="td text-right font-mono">{fmtCurrency(row.taxableAmount)}</td>
                    <td className="td text-right font-mono text-xs">{fmtCurrency(row.cgst)}</td>
                    <td className="td text-right font-mono text-xs">{fmtCurrency(row.sgst)}</td>
                    <td className="td text-right font-mono text-xs">{fmtCurrency(row.igst)}</td>
                    <td className="td text-right font-mono font-semibold text-blue-400">{fmtCurrency(row.totalTax)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// DAY BOOK
// ============================================================
export function DayBookReport({ onBack, isCashBook }) {
  const { bizId } = useAuth();
  const [from, setFrom] = useState(todayISO());
  const [to,   setTo]   = useState(todayISO());

 const data = [];
const loading = false;
  const d = data;
  const vouchers = d?.vouchers || d?.entries || [];

  return (
    <div className="p-4 md:p-6 space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 hover:bg-surface-700 rounded-xl text-slate-400"><ArrowLeft size={18} /></button>
        <h1 className="text-xl font-bold text-slate-100">{isCashBook ? 'Cash Book' : 'Day Book'}</h1>
      </div>
      <div className="card p-3"><DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} /></div>

      {loading ? <PageLoader /> : (
        <div className="space-y-3">
          {vouchers.length ? vouchers.map(v => (
            <div key={v.id} className="card p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold text-slate-200">{v.narration || v.voucher_narration}</p>
                  <p className="text-xs text-slate-500">{v.voucher_type || v.voucherType} · {v.voucher_number || v.voucherNum}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">{v.date ? new Date(v.date).toLocaleDateString('en-IN') : ''}</p>
                  <p className="text-sm font-bold font-mono text-emerald-400">{fmtCurrency(v.total_debit || v.debit || 0)}</p>
                </div>
              </div>
              {v.entries?.length > 0 && (
                <div className="border-t border-surface-700/50 pt-2 space-y-1">
                  {v.entries.map((e, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-slate-500">{e.accountName}</span>
                      <div className="flex gap-4">
                        {e.debit  > 0 && <span className="font-mono text-slate-300">Dr {fmtCurrency(e.debit)}</span>}
                        {e.credit > 0 && <span className="font-mono text-slate-400">Cr {fmtCurrency(e.credit)}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )) : (
            <div className="card p-12 text-center text-slate-600">No entries found for selected date range</div>
          )}
        </div>
      )}
    </div>
  );
}

export default { TrialBalanceReport, ProfitLossReport, BalanceSheetReport, GSTReport, DayBookReport };
