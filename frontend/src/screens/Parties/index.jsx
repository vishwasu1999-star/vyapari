import React, { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Edit2, Trash2, Phone, Mail, MapPin } from 'lucide-react';
import { partyApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
  Button, Input, Select, Textarea, Modal, SearchInput,
  EmptyState, PageLoader, ConfirmDialog,
} from '../../components/UI';
import { fmtCurrency } from '../../utils/helpers';
import { INDIAN_STATES } from '../../utils/constants';
import toast from 'react-hot-toast';

const emptyForm = () => ({
  name:'', partyType:'customer', gstNumber:'', phone:'', email:'',
  addressLine1:'', city:'', state:'', stateCode:'', pincode:'',
  openingBalance:'', openingBalanceType:'Dr', creditLimit:'', creditDays:'', notes:'',
});

export default function PartiesScreen() {
  const { bizId } = useAuth();
  const [parties,    setParties]    = useState([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [loading,    setLoading]    = useState(false);
  const [search,     setSearch]     = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [modal,      setModal]      = useState(false);
  const [editing,    setEditing]    = useState(null);
  const [form,       setForm]       = useState(emptyForm());
  const [saving,     setSaving]     = useState(false);
  const [delId,      setDelId]      = useState(null);
  const [deleting,   setDeleting]   = useState(false);
  const LIMIT = 20;

  const load = useCallback(async () => {
    if (!bizId) return;
    setLoading(true);
    try {
      const res = await partyApi.list(bizId, { search, type: typeFilter || undefined, page, limit: LIMIT });
      setParties(res.data.data || []);
      setTotal(res.data.pagination?.total || 0);
    } catch {}
    finally { setLoading(false); }
  }, [bizId, search, typeFilter, page]);

  useEffect(() => { const t = setTimeout(load, search ? 350 : 0); return () => clearTimeout(t); }, [load]);

  const openNew  = () => { setEditing(null); setForm(emptyForm()); setModal(true); };
  const openEdit = async (party) => {
    try {
      const res = await partyApi.get(bizId, party.id);
      const p   = res.data.party;
      setForm({
        name: p.name||'', partyType: p.party_type||'customer', gstNumber: p.gst_number||'',
        phone: p.phone||'', email: p.email||'', addressLine1: p.address_line1||'',
        city: p.city||'', state: p.state||'', stateCode: p.state_code||'', pincode: p.pincode||'',
        openingBalance: p.opening_balance||'', openingBalanceType: p.opening_balance_type||'Dr',
        creditLimit: p.credit_limit||'', creditDays: p.credit_days||'', notes: p.notes||'',
      });
      setEditing(p.id); setModal(true);
    } catch { toast.error('Could not load party'); }
  };

  const handleSave = async (e) => {
    e?.preventDefault();
    if (!form.name?.trim()) return toast.error('Party name is required');
    setSaving(true);
    try {
      if (editing) await partyApi.update(bizId, editing, form);
      else         await partyApi.create(bizId, form);
      toast.success(editing ? 'Party updated' : 'Party created');
      setModal(false); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Error saving'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!delId) return;
    setDeleting(true);
    try {
      await partyApi.delete(bizId, delId);
      toast.success('Party deleted'); setDelId(null); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Cannot delete'); }
    finally { setDeleting(false); }
  };

  const sf = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Parties</h1>
          <p className="text-xs text-slate-500 mt-0.5">{total} records</p>
        </div>
        <Button variant="primary" size="sm" icon={Plus} onClick={openNew}>Add Party</Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <SearchInput className="flex-1 min-w-[200px]" value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search name, phone, GST…" />
        <Select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }} className="w-36">
          <option value="">All Types</option>
          <option value="customer">Customers</option>
          <option value="supplier">Suppliers</option>
        </Select>
      </div>

      <div className="card overflow-hidden">
        {loading ? <div className="py-16 flex justify-center"><PageLoader /></div>
        : parties.length === 0 ? (
          <EmptyState icon={Users} title="No parties found"
            description="Add customers and suppliers" action={<Button icon={Plus} onClick={openNew}>Add Party</Button>} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead><tr>
                  <th className="th">Name</th>
                  <th className="th hidden sm:table-cell">Type</th>
                  <th className="th hidden md:table-cell">Contact</th>
                  <th className="th hidden lg:table-cell">GST</th>
                  <th className="th text-right hidden sm:table-cell">Outstanding</th>
                  <th className="th w-16" />
                </tr></thead>
                <tbody>
                  {parties.map(p => (
                    <tr key={p.id} className="tr-hover">
                      <td className="td">
                        <p className="font-medium text-slate-100">{p.name}</p>
                        {p.city && <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5"><MapPin size={9} />{p.city}</p>}
                      </td>
                      <td className="td hidden sm:table-cell">
                        <span className={`badge ${p.party_type === 'customer' ? 'badge-blue' : 'badge-amber'}`}>{p.party_type}</span>
                      </td>
                      <td className="td hidden md:table-cell text-slate-400 text-xs">
                        {p.phone && <p className="flex items-center gap-1"><Phone size={9} />{p.phone}</p>}
                        {p.email && <p className="flex items-center gap-1 mt-0.5"><Mail size={9} />{p.email}</p>}
                      </td>
                      <td className="td hidden lg:table-cell text-slate-500 text-xs font-mono">{p.gst_number || '—'}</td>
                      <td className="td text-right hidden sm:table-cell">
                        {parseFloat(p.outstanding_receivable||0) > 0 &&
                          <p className="text-xs font-mono text-amber-400">{fmtCurrency(p.outstanding_receivable)}</p>}
                        {parseFloat(p.outstanding_payable||0) > 0 &&
                          <p className="text-xs font-mono text-red-400">{fmtCurrency(p.outstanding_payable)}</p>}
                        {!parseFloat(p.outstanding_receivable||0) && !parseFloat(p.outstanding_payable||0) &&
                          <span className="text-slate-600 text-xs">—</span>}
                      </td>
                      <td className="td">
                        <div className="flex gap-1">
                          <button onClick={() => openEdit(p)} className="p-1.5 rounded hover:bg-surface-600 text-slate-500 hover:text-slate-200"><Edit2 size={12} /></button>
                          <button onClick={() => setDelId(p.id)} className="p-1.5 rounded hover:bg-red-900/30 text-slate-500 hover:text-red-400"><Trash2 size={12} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {Math.ceil(total / LIMIT) > 1 && (
              <div className="flex gap-1 justify-end px-4 py-3 border-t border-surface-700">
                <Button variant="ghost" size="sm" disabled={page === 1}                onClick={() => setPage(p => p-1)}>Prev</Button>
                <Button variant="ghost" size="sm" disabled={page * LIMIT >= total}     onClick={() => setPage(p => p+1)}>Next</Button>
              </div>
            )}
          </>
        )}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Party' : 'Add Party'} size="lg"
        footer={<>
          <Button variant="ghost" onClick={() => setModal(false)}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={handleSave}>{editing ? 'Update' : 'Create'}</Button>
        </>}>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Party Name *" value={form.name} onChange={e => sf('name', e.target.value)} className="col-span-2" />
          <Select label="Type" value={form.partyType} onChange={e => sf('partyType', e.target.value)}>
            <option value="customer">Customer</option>
            <option value="supplier">Supplier</option>
            <option value="both">Both</option>
          </Select>
          <Input label="GST Number" value={form.gstNumber} onChange={e => sf('gstNumber', e.target.value.toUpperCase())} placeholder="27XXXXX0000X0XX" />
          <Input label="Phone" value={form.phone}  onChange={e => sf('phone', e.target.value)} />
          <Input label="Email" type="email" value={form.email}  onChange={e => sf('email', e.target.value)} />
          <Input label="Address" value={form.addressLine1} onChange={e => sf('addressLine1', e.target.value)} className="col-span-2" />
          <Input label="City" value={form.city} onChange={e => sf('city', e.target.value)} />
          <div>
            <label className="text-xs font-medium text-slate-400 block mb-1">State</label>
            <select value={form.state} onChange={e => {
              const s = INDIAN_STATES.find(st => st.name === e.target.value);
              sf('state', e.target.value); if (s) sf('stateCode', s.code);
            }} className="input">
              <option value="">— Select state —</option>
              {INDIAN_STATES.map(s => <option key={s.code} value={s.name}>{s.code} — {s.name}</option>)}
            </select>
          </div>
          <Input label="Opening Balance" type="number" value={form.openingBalance} onChange={e => sf('openingBalance', e.target.value)} />
          <Select label="Balance Type" value={form.openingBalanceType} onChange={e => sf('openingBalanceType', e.target.value)}>
            <option value="Dr">Debit (Party owes us)</option>
            <option value="Cr">Credit (We owe party)</option>
          </Select>
          <Input label="Credit Limit ₹" type="number" value={form.creditLimit} onChange={e => sf('creditLimit', e.target.value)} />
          <Input label="Credit Days"    type="number" value={form.creditDays}  onChange={e => sf('creditDays',  e.target.value)} />
        </div>
        <Textarea label="Notes" value={form.notes} onChange={e => sf('notes', e.target.value)} className="mt-4" rows={2} />
      </Modal>

      <ConfirmDialog open={!!delId} onClose={() => setDelId(null)} onConfirm={handleDelete}
        loading={deleting} title="Delete Party" message="Delete this party? This cannot be undone." confirmLabel="Delete" />
    </div>
  );
}
