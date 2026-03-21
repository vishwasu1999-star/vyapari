import React, { useState, useEffect, useCallback } from 'react';
import { Wallet, Plus } from 'lucide-react';
import { expenseApi, accountApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
  Button, Input, Select, Textarea, Modal,
  EmptyState, PageLoader,
} from '../../components/UI';
import { fmtCurrency, fmtDate, fyDates, todayISO } from '../../utils/helpers';
import toast from 'react-hot-toast';

const CATEGORIES = ['Rent', 'Salaries', 'Electricity', 'Transport', 'Telephone', 'Office Supplies', 'Professional Fees', 'Bank Charges', 'Advertisement', 'Repairs', 'Insurance', 'Miscellaneous'];

export default function ExpensesScreen() {
  const { bizId }    = useAuth();
  const [expenses,   setExpenses]   = useState([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [loading,    setLoading]    = useState(false);
  const [modal,      setModal]      = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [accounts,   setAccounts]   = useState([]);
  const [from,       setFrom]       = useState(fyDates().from);
  const [to,         setTo]         = useState(todayISO());
  const [form, setForm] = useState({
    expenseDate: todayISO(), category: 'Miscellaneous', description: '',
    amount: '', gstAmount: '', paymentMode: 'cash',
    expenseAccountId: '', payAccountId: '',
  });
  const LIMIT = 20;

  const load = useCallback(async () => {
    if (!bizId) return;
    setLoading(true);
    try {
      const res = await expenseApi.list(bizId, { from, to, page, limit: LIMIT });
      setExpenses(res.data.data || []);
      setTotal(res.data.pagination?.total || 0);
    } catch {}
    finally { setLoading(false); }
  }, [bizId, from, to, page]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!bizId) return;
    accountApi.list(bizId, { type: 'Expense' }).then(res => setAccounts(res.data.accounts || [])).catch(() => {});
  }, [bizId]);

  const openModal = () => {
    setForm({ expenseDate: todayISO(), category: 'Miscellaneous', description: '', amount: '', gstAmount: '0', paymentMode: 'cash', expenseAccountId: '', payAccountId: '' });
    setModal(true);
  };

  const handleSave = async (e) => {
    e?.preventDefault();
    if (!form.description?.trim()) return toast.error('Description is required');
    if (!form.amount)              return toast.error('Amount is required');
    setSaving(true);
    try {
      await expenseApi.create(bizId, form);
      toast.success('Expense recorded');
      setModal(false);
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Error saving'); }
    finally { setSaving(false); }
  };

  const sf = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Expenses</h1>
          <p className="text-xs text-slate-500 mt-0.5">{total} records</p>
        </div>
        <Button variant="primary" size="sm" icon={Plus} onClick={openModal}>Add Expense</Button>
      </div>

      <div className="card p-3 flex flex-wrap gap-3">
        <div>
          <label className="text-xs text-slate-400 block mb-1">From</label>
          <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} className="input" />
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">To</label>
          <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }} className="input" />
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? <div className="py-16 flex justify-center"><PageLoader /></div>
        : expenses.length === 0 ? (
          <EmptyState icon={Wallet} title="No expenses found"
            action={<Button icon={Plus} onClick={openModal}>Add Expense</Button>} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead><tr>
                  <th className="th">Date</th>
                  <th className="th">Description</th>
                  <th className="th hidden sm:table-cell">Category</th>
                  <th className="th hidden sm:table-cell">Mode</th>
                  <th className="th text-right">Amount</th>
                </tr></thead>
                <tbody>
                  {expenses.map(exp => (
                    <tr key={exp.id} className="tr-hover">
                      <td className="td text-slate-400 whitespace-nowrap">{fmtDate(exp.expense_date)}</td>
                      <td className="td text-slate-200 max-w-[200px] truncate">{exp.description}</td>
                      <td className="td hidden sm:table-cell">
                        <span className="badge badge-slate">{exp.category}</span>
                      </td>
                      <td className="td hidden sm:table-cell text-slate-500 text-xs capitalize">{exp.payment_mode}</td>
                      <td className="td text-right font-mono text-slate-100">{fmtCurrency(exp.total_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {Math.ceil(total / LIMIT) > 1 && (
              <div className="flex gap-1 justify-end px-4 py-3 border-t border-surface-700">
                <Button variant="ghost" size="sm" disabled={page === 1}            onClick={() => setPage(p => p-1)}>Prev</Button>
                <Button variant="ghost" size="sm" disabled={page * LIMIT >= total} onClick={() => setPage(p => p+1)}>Next</Button>
              </div>
            )}
          </>
        )}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Record Expense" size="md"
        footer={<>
          <Button variant="ghost" onClick={() => setModal(false)}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={handleSave}>Save Expense</Button>
        </>}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Date *" type="date" value={form.expenseDate} onChange={e => sf('expenseDate', e.target.value)} />
            <Select label="Category" value={form.category} onChange={e => sf('category', e.target.value)}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
          <Input label="Description *" value={form.description} onChange={e => sf('description', e.target.value)} placeholder="e.g. Monthly office rent" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Amount ₹ *" type="number" min="0" value={form.amount} onChange={e => sf('amount', e.target.value)} />
            <Input label="GST Amount ₹" type="number" min="0" value={form.gstAmount} onChange={e => sf('gstAmount', e.target.value)} />
            <Select label="Payment Mode" value={form.paymentMode} onChange={e => sf('paymentMode', e.target.value)}>
              <option value="cash">Cash</option>
              <option value="bank">Bank Transfer</option>
              <option value="upi">UPI</option>
              <option value="cheque">Cheque</option>
            </Select>
            <Select label="Expense Account" value={form.expenseAccountId} onChange={e => sf('expenseAccountId', e.target.value)}>
              <option value="">— Auto select —</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </Select>
          </div>
        </div>
      </Modal>
    </div>
  );
}
