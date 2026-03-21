import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, FileText, Filter, X } from 'lucide-react';
import { invoiceApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
  Button, StatusBadge, SearchInput, Select,
  EmptyState, PageLoader, StatCard,
} from '../../components/UI';
import { fmtCurrency, fmtDate, fyDates, todayISO } from '../../utils/helpers';
import InvoiceForm from '../../components/Invoice/InvoiceForm';
import InvoiceDetail from '../../components/Invoice/InvoiceDetail';

export default function SalesScreen() {
  const navigate    = useNavigate();
  const [sp]        = useSearchParams();
  const { bizId }   = useAuth();
  const view        = sp.get('view');

  // Sub-views
  if (view === 'new') return <InvoiceForm invoiceType="sale" />;

  const [invoices, setInvoices] = useState([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [loading,  setLoading]  = useState(false);
  const [search,   setSearch]   = useState('');
  const [status,   setStatus]   = useState(sp.get('status') || '');
  const [from,     setFrom]     = useState(fyDates().from);
  const [to,       setTo]       = useState(todayISO());
  const [summary,  setSummary]  = useState(null);
  const [showFilters, setShowFilters] = useState(false);

  const LIMIT = 20;

  const load = useCallback(async () => {
    if (!bizId) return;
    setLoading(true);
    try {
      const [listRes, summRes] = await Promise.all([
        invoiceApi.list(bizId, { type: 'sale', page, limit: LIMIT, search, status, from, to }),
        invoiceApi.summary(bizId, { type: 'sale', from, to }),
      ]);
      setInvoices(listRes.data.data || []);
      setTotal(listRes.data.pagination?.total || 0);
      setSummary(summRes.data.summary);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [bizId, page, search, status, from, to]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(load, search ? 350 : 0);
    return () => clearTimeout(t);
  }, [load]);

  const pages = Math.ceil(total / LIMIT);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Sales Invoices</h1>
          <p className="text-xs text-slate-500 mt-0.5">{total} invoices</p>
        </div>
        <Button variant="primary" size="sm" icon={Plus} onClick={() => navigate('/sales?view=new')}>
          New Invoice
        </Button>
      </div>

      {/* Summary stats */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total"     value={fmtCurrency(summary.total_amount)}   color="brand" />
          <StatCard label="Paid"      value={fmtCurrency(summary.amount_paid)}    color="brand" />
          <StatCard label="Pending"   value={fmtCurrency(summary.balance_due)}    color="amber" />
          <StatCard label="Tax"       value={fmtCurrency(summary.total_tax)}      color="blue" />
        </div>
      )}

      {/* Filters bar */}
      <div className="card p-3">
        <div className="flex gap-2 flex-wrap">
          <SearchInput
            className="flex-1 min-w-[160px]"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search invoice # or party…"
          />
          <button onClick={() => setShowFilters(p => !p)}
            className={`btn-outline text-xs flex items-center gap-1.5 ${showFilters ? 'bg-surface-700' : ''}`}>
            <Filter size={13} /> Filters
            {status && <span className="w-1.5 h-1.5 rounded-full bg-brand-400" />}
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 pt-3 border-t border-surface-700">
            <Select label="Status" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
              <option value="">All</option>
              <option value="unpaid">Unpaid</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
              <option value="cancelled">Cancelled</option>
            </Select>
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1">From</label>
              <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} className="input" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1">To</label>
              <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }} className="input" />
            </div>
            <div className="flex items-end">
              <Button variant="ghost" size="sm" icon={X}
                onClick={() => { setStatus(''); setFrom(fyDates().from); setTo(todayISO()); setSearch(''); }}>
                Clear
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="py-16 flex justify-center"><PageLoader /></div>
        ) : invoices.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No invoices found"
            description={search || status ? 'Try adjusting your filters' : 'Create your first invoice to get started'}
            action={!search && !status && (
              <Button icon={Plus} onClick={() => navigate('/sales?view=new')}>Create Invoice</Button>
            )}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th className="th">Invoice #</th>
                    <th className="th">Party</th>
                    <th className="th hidden md:table-cell">Date</th>
                    <th className="th hidden md:table-cell">Due</th>
                    <th className="th text-right">Amount</th>
                    <th className="th text-right hidden sm:table-cell">Balance</th>
                    <th className="th">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => (
                    <tr key={inv.id} className="tr-hover cursor-pointer"
                      onClick={() => navigate(`/sales/${inv.id}`)}>
                      <td className="td font-mono text-xs text-brand-400 font-semibold">{inv.invoice_number}</td>
                      <td className="td max-w-[150px] truncate text-slate-200">{inv.party_name || '—'}</td>
                      <td className="td text-slate-400 hidden md:table-cell">{fmtDate(inv.invoice_date)}</td>
                      <td className="td text-slate-400 hidden md:table-cell">{inv.due_date ? fmtDate(inv.due_date) : '—'}</td>
                      <td className="td text-right font-mono text-slate-100">{fmtCurrency(inv.total_amount)}</td>
                      <td className="td text-right font-mono text-amber-400 hidden sm:table-cell">
                        {parseFloat(inv.balance_due) > 0 ? fmtCurrency(inv.balance_due) : '—'}
                      </td>
                      <td className="td"><StatusBadge status={inv.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-surface-700">
                <p className="text-xs text-slate-500">
                  Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}
                </p>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" disabled={page === 1}    onClick={() => setPage(p => p - 1)}>Prev</Button>
                  <Button variant="ghost" size="sm" disabled={page === pages} onClick={() => setPage(p => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
