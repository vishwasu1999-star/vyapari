import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ShoppingCart } from 'lucide-react';
import { invoiceApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Button, StatusBadge, SearchInput, EmptyState, PageLoader } from '../../components/UI';
import { fmtCurrency, fmtDate, fyDates, todayISO } from '../../utils/helpers';
import InvoiceForm   from '../../components/Invoice/InvoiceForm';
import InvoiceDetail from '../../components/Invoice/InvoiceDetail';
import { useSearchParams } from 'react-router-dom';

export default function PurchasesScreen() {
  const navigate  = useNavigate();
  const [sp]      = useSearchParams();
  const { bizId } = useAuth();
  const view      = sp.get('view');

  if (view === 'new') return <InvoiceForm invoiceType="purchase" />;

  const [invoices, setInvoices] = useState([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [loading,  setLoading]  = useState(false);
  const [search,   setSearch]   = useState('');
  const LIMIT = 20;

  const load = useCallback(async () => {
    if (!bizId) return;
    setLoading(true);
    try {
      const res = await invoiceApi.list(bizId, {
        type: 'purchase', page, limit: LIMIT, search,
        from: fyDates().from, to: todayISO(),
      });
      setInvoices(res.data.data || []);
      setTotal(res.data.pagination?.total || 0);
    } catch {}
    finally { setLoading(false); }
  }, [bizId, page, search]);

  useEffect(() => { const t = setTimeout(load, search ? 350 : 0); return () => clearTimeout(t); }, [load]);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Purchases</h1>
          <p className="text-xs text-slate-500 mt-0.5">{total} records</p>
        </div>
        <Button variant="primary" size="sm" icon={Plus} onClick={() => navigate('/purchases?view=new')}>Record Purchase</Button>
      </div>

      <SearchInput value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search supplier or invoice…" />

      <div className="card overflow-hidden">
        {loading ? <div className="py-16 flex justify-center"><PageLoader /></div>
        : invoices.length === 0 ? (
          <EmptyState icon={ShoppingCart} title="No purchases yet" description="Record your first purchase"
            action={<Button icon={Plus} onClick={() => navigate('/purchases?view=new')}>Record Purchase</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr>
                <th className="th">Invoice #</th>
                <th className="th">Supplier</th>
                <th className="th hidden sm:table-cell">Date</th>
                <th className="th text-right">Amount</th>
                <th className="th">Status</th>
              </tr></thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id} className="tr-hover cursor-pointer" onClick={() => navigate(`/purchases/${inv.id}`)}>
                    <td className="td font-mono text-xs text-brand-400">{inv.invoice_number}</td>
                    <td className="td truncate max-w-[160px]">{inv.party_name || '—'}</td>
                    <td className="td text-slate-400 hidden sm:table-cell">{fmtDate(inv.invoice_date)}</td>
                    <td className="td text-right font-mono">{fmtCurrency(inv.total_amount)}</td>
                    <td className="td"><StatusBadge status={inv.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {Math.ceil(total / LIMIT) > 1 && (
              <div className="flex gap-1 justify-end px-4 py-3 border-t border-surface-700">
                <Button variant="ghost" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
                <Button variant="ghost" size="sm" disabled={page >= Math.ceil(total / LIMIT)} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
