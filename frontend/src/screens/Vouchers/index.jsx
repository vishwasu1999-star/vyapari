import React, { useState, useEffect, useCallback } from 'react';
import { BookOpen, Plus, ChevronRight, ChevronDown } from 'lucide-react';
import { voucherApi, accountApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Button, Input, Select, Textarea, Modal, EmptyState, PageLoader } from '../../components/UI';
import { fmtCurrency, fmtDate, todayISO } from '../../utils/helpers';
import toast from 'react-hot-toast';

const VOUCHER_TYPES = ['Journal', 'Receipt', 'Payment', 'Contra'];

const emptyEntry = () => ({ accountId: '', debit: '', credit: '', narration: '' });

export default function VouchersScreen() {
  const { bizId }   = useAuth();
  const [vouchers,  setVouchers]  = useState([]);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(1);
  const [loading,   setLoading]   = useState(false);
  const [modal,     setModal]     = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [accounts,  setAccounts]  = useState([]);
  const [expanded,  setExpanded]  = useState({});
  const [form, setForm] = useState({ voucherType: 'Journal', date: todayISO(), narration: '', entries: [emptyEntry(), emptyEntry()] });
  const LIMIT = 20;

  const load = useCallback(async () => {
    if (!bizId) return;
    setLoading(true);
    try {
      const res = await voucherApi.list(bizId, { page, limit: LIMIT });
      setVouchers(res.data.data || []);
      setTotal(res.data.pagination?.total || 0);
    } catch {}
    finally { setLoading(false); }
  }, [bizId, page]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!bizId) return;
    accountApi.list(bizId).then(res => setAccounts(res.data.accounts || [])).catch(() => {});
  }, [bizId]);

  const totalDr = form.entries.reduce((s, e) => s + (parseFloat(e.debit) || 0), 0);
  const totalCr = form.entries.reduce((s, e) => s + (parseFloat(e.credit) || 0), 0);
  const balanced = Math.abs(totalDr - totalCr) < 0.01 && totalDr > 0;

  const addEntry    = () => setForm(f => ({ ...f, entries: [...f.entries, emptyEntry()] }));
  const removeEntry = (i) => setForm(f => ({ ...f, entries: f.entries.filter((_, idx) => idx !== i) }));
  const setEntry    = (i, k, v) => setForm(f => ({ ...f, entries: f.entries.map((e, idx) => idx === i ? { ...e, [k]: v } : e) }));

  const handleSave = async (e) => {
    e?.preventDefault();
    if (!balanced) return toast.error('Voucher must be balanced (Dr = Cr)');
    setSaving(true);
    try {
      await voucherApi.create(bizId, {
        voucherType: form.voucherType,
        date: form.date,
        narration: form.narration,
        entries: form.entries.filter(e => e.accountId).map(e => ({
          accountId: e.accountId,
          debit:     parseFloat(e.debit)  || 0,
          credit:    parseFloat(e.credit) || 0,
          narration: e.narration || null,
        })),
      });
      toast.success('Voucher created');
      setModal(false);
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Error saving voucher'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Vouchers</h1>
          <p className="text-xs text-slate-500 mt-0.5">Manual journal entries</p>
        </div>
        <Button variant="primary" size="sm" icon={Plus}
          onClick={() => { setForm({ voucherType: 'Journal', date: todayISO(), narration: '', entries: [emptyEntry(), emptyEntry()] }); setModal(true); }}>
          New Voucher
        </Button>
      </div>

      <div className="card overflow-hidden">
        {loading ? <div className="py-16 flex justify-center"><PageLoader /></div>
        : vouchers.length === 0 ? (
          <EmptyState icon={BookOpen} title="No vouchers" description="Create manual journal entries" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead><tr>
                  <th className="th w-8" />
                  <th className="th">Date</th>
                  <th className="th">Type</th>
                  <th className="th hidden sm:table-cell">Number</th>
                  <th className="th">Narration</th>
                  <th className="th text-right">Debit</th>
                  <th className="th text-right">Credit</th>
                </tr></thead>
                <tbody>
                  {vouchers.map(v => (
                    <React.Fragment key={v.id}>
                      <tr className="tr-hover cursor-pointer" onClick={() => setExpanded(p => ({ ...p, [v.id]: !p[v.id] }))}>
                        <td className="td">{expanded[v.id] ? <ChevronDown size={12} className="text-slate-400" /> : <ChevronRight size={12} className="text-slate-400" />}</td>
                        <td className="td text-slate-400 whitespace-nowrap">{fmtDate(v.voucher_date)}</td>
                        <td className="td"><span className="badge badge-blue">{v.voucher_type}</span></td>
                        <td className="td hidden sm:table-cell font-mono text-xs text-brand-400">{v.voucher_number}</td>
                        <td className="td text-slate-300 max-w-[180px] truncate">{v.narration || '—'}</td>
                        <td className="td text-right font-mono">{fmtCurrency(v.total_debit)}</td>
                        <td className="td text-right font-mono">{fmtCurrency(v.total_credit)}</td>
                      </tr>
                      {expanded[v.id] && v.entries?.map((e, i) => (
                        <tr key={i} className="bg-surface-900/40">
                          <td colSpan={2} />
                          <td className="td" />
                          <td className="td text-xs text-slate-500 font-mono" colSpan={2}>↳ {e.accountName}</td>
                          <td className="td text-right font-mono text-xs text-slate-400">{e.debit > 0 ? fmtCurrency(e.debit) : '—'}</td>
                          <td className="td text-right font-mono text-xs text-slate-400">{e.credit > 0 ? fmtCurrency(e.credit) : '—'}</td>
                        </tr>
                      ))}
                    </React.Fragment>
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

      <Modal open={modal} onClose={() => setModal(false)} title="New Voucher" size="xl"
        footer={<>
          <Button variant="ghost" onClick={() => setModal(false)}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={handleSave} disabled={!balanced}>
            {balanced ? 'Save Voucher' : `Unbalanced (Dr ${fmtCurrency(totalDr)} / Cr ${fmtCurrency(totalCr)})`}
          </Button>
        </>}>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Select label="Type" value={form.voucherType} onChange={e => setForm(f => ({ ...f, voucherType: e.target.value }))}>
              {VOUCHER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
            <Input label="Date *" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            <Input label="Narration" value={form.narration} onChange={e => setForm(f => ({ ...f, narration: e.target.value }))} className="col-span-1" />
          </div>

          {/* Entry rows */}
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-slate-400 px-1">
              <div className="col-span-4">Account</div>
              <div className="col-span-2 text-right">Debit (Dr)</div>
              <div className="col-span-2 text-right">Credit (Cr)</div>
              <div className="col-span-3">Narration</div>
              <div className="col-span-1" />
            </div>
            {form.entries.map((entry, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-4">
                  <select value={entry.accountId} onChange={e => setEntry(i, 'accountId', e.target.value)} className="input text-xs py-1.5">
                    <option value="">— Select account —</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <input type="number" min="0" value={entry.debit} placeholder="0.00"
                    onChange={e => setEntry(i, 'debit', e.target.value)}
                    className="input text-xs py-1.5 text-right" />
                </div>
                <div className="col-span-2">
                  <input type="number" min="0" value={entry.credit} placeholder="0.00"
                    onChange={e => setEntry(i, 'credit', e.target.value)}
                    className="input text-xs py-1.5 text-right" />
                </div>
                <div className="col-span-3">
                  <input value={entry.narration} placeholder="Line note"
                    onChange={e => setEntry(i, 'narration', e.target.value)}
                    className="input text-xs py-1.5" />
                </div>
                <div className="col-span-1 flex justify-center">
                  {form.entries.length > 2 && (
                    <button onClick={() => removeEntry(i)} className="p-1 text-slate-600 hover:text-red-400">✕</button>
                  )}
                </div>
              </div>
            ))}
            <button onClick={addEntry} className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1 mt-1">
              <Plus size={12} /> Add row
            </button>
          </div>

          {/* Balance indicator */}
          <div className={`flex items-center justify-between p-3 rounded-lg text-xs border ${balanced ? 'border-brand-800/40 bg-brand-900/20 text-brand-300' : 'border-amber-800/40 bg-amber-900/20 text-amber-300'}`}>
            <span>Total Debit: <strong className="font-mono">{fmtCurrency(totalDr)}</strong></span>
            <span className="font-semibold">{balanced ? '✓ Balanced' : '⚠ Not balanced'}</span>
            <span>Total Credit: <strong className="font-mono">{fmtCurrency(totalCr)}</strong></span>
          </div>
        </div>
      </Modal>
    </div>
  );
}
