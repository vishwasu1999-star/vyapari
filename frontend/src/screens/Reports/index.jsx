import React, { useState } from 'react';
import { BarChart3, Scale, TrendingUp, BookOpen, FileText, Receipt, ChevronRight } from 'lucide-react';
import TrialBalanceReport  from './TrialBalanceReport';
import ProfitLossReport    from './ProfitLossReport';
import BalanceSheetReport  from './BalanceSheetReport';
import DayBookReport       from './DayBookReport';
import GSTReport           from './GSTReport';

const REPORT_CARDS = [
  { id: 'trial',   icon: Scale,      label: 'Trial Balance',    desc: 'All accounts with debit/credit totals',  color: 'text-blue-400   bg-blue-900/20' },
  { id: 'pandl',   icon: TrendingUp, label: 'Profit & Loss',    desc: 'Income vs expenses over a period',       color: 'text-green-400  bg-green-900/20' },
  { id: 'balance', icon: BarChart3,  label: 'Balance Sheet',    desc: 'Assets = Liabilities + Equity snapshot', color: 'text-purple-400 bg-purple-900/20' },
  { id: 'daybook', icon: BookOpen,   label: 'Day Book',         desc: 'All transactions day by day',            color: 'text-amber-400  bg-amber-900/20' },
  { id: 'gst',     icon: Receipt,    label: 'GST Report',       desc: 'GSTR-1 output and input tax summary',    color: 'text-red-400    bg-red-900/20' },
];

export default function ReportsScreen() {
  const [active, setActive] = useState(null);

  if (active === 'trial')   return <TrialBalanceReport  onBack={() => setActive(null)} />;
  if (active === 'pandl')   return <ProfitLossReport    onBack={() => setActive(null)} />;
  if (active === 'balance') return <BalanceSheetReport  onBack={() => setActive(null)} />;
  if (active === 'daybook') return <DayBookReport       onBack={() => setActive(null)} />;
  if (active === 'gst')     return <GSTReport           onBack={() => setActive(null)} />;

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-white">Reports</h1>
        <p className="text-xs text-slate-500 mt-0.5">Financial statements and tax reports</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {REPORT_CARDS.map(({ id, icon: Icon, label, desc, color }) => (
          <button key={id} onClick={() => setActive(id)}
            className="card p-4 text-left hover:border-surface-500 transition-all duration-200 group">
            <div className="flex items-start justify-between">
              <div className={`p-2.5 rounded-xl ${color} mb-3`}>
                <Icon size={18} />
              </div>
              <ChevronRight size={16} className="text-slate-600 group-hover:text-slate-400 mt-1 transition-colors" />
            </div>
            <p className="text-sm font-semibold text-slate-100 mb-1">{label}</p>
            <p className="text-xs text-slate-500">{desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
