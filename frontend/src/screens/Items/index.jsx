import React, { useState, useEffect, useCallback } from 'react';
import { Package, Plus, Edit2, Trash2, AlertTriangle } from 'lucide-react';
import { itemApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
  Button, Input, Select, Textarea, Modal,
  SearchInput, EmptyState, PageLoader, ConfirmDialog,
} from '../../components/UI';
import { fmtCurrency } from '../../utils/helpers';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';

const GST_RATES = [0, 0.1, 0.25, 1.5, 3, 5, 12, 18, 28];

const emptyForm = () => ({
  name:'', sku:'', description:'', itemType:'goods', hsnSacCode:'', unit:'PCS',
  gstRate:0, salePrice:'', purchasePrice:'', mrp:'',
  trackInventory:true, openingStock:'', minStockAlert:'', category:'',
});

export default function ItemsScreen() {
  const { bizId } = useAuth();
  const [sp]      = useSearchParams();
  const [items,    setItems]    = useState([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [loading,  setLoading]  = useState(false);
  const [search,   setSearch]   = useState('');
  const [modal,    setModal]    = useState(false);
  const [editing,  setEditing]  = useState(null);
  const [form,     setForm]     = useState(emptyForm());
  const [saving,   setSaving]   = useState(false);
  const [delId,    setDelId]    = useState(null);
  const [deleting, setDeleting] = useState(false);
  const lowStockOnly = sp.get('lowStock') === 'true';
  const LIMIT = 20;

  const load = useCallback(async () => {
    if (!bizId) return;
    setLoading(true);
    try {
      const res = await itemApi.list(bizId, { search, page, limit: LIMIT, lowStock: lowStockOnly || undefined });
      setItems(res.data.data || []);
      setTotal(res.data.pagination?.total || 0);
    } catch {}
    finally { setLoading(false); }
  }, [bizId, search, page, lowStockOnly]);

  useEffect(() => { const t = setTimeout(load, search ? 350 : 0); return () => clearTimeout(t); }, [load]);

  const openNew  = () => { setEditing(null); setForm(emptyForm()); setModal(true); };
  const openEdit = async (item) => {
    try {
      const res = await itemApi.get(bizId, item.id);
      const it  = res.data.item;
      setForm({
        name: it.name||'', sku: it.sku||'', description: it.description||'',
        itemType: it.item_type||'goods', hsnSacCode: it.hsn_sac_code||'',
        unit: it.unit||'PCS', gstRate: it.gst_rate||0,
        salePrice: it.sale_price||'', purchasePrice: it.purchase_price||'', mrp: it.mrp||'',
        trackInventory: it.track_inventory !== false,
        openingStock: it.opening_stock||'', minStockAlert: it.min_stock_alert||'',
        category: it.category||'',
      });
      setEditing(it.id); setModal(true);
    } catch { toast.error('Could not load item'); }
  };

  const handleSave = async (e) => {
    e?.preventDefault();
    if (!form.name?.trim()) return toast.error('Item name is required');
    setSaving(true);
    try {
      const payload = { ...form, gstRate: parseFloat(form.gstRate)||0 };
      if (editing) await itemApi.update(bizId, editing, payload);
      else         await itemApi.create(bizId, payload);
      toast.success(editing ? 'Item updated' : 'Item created');
      setModal(false); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Error saving'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await itemApi.delete(bizId, delId);
      toast.success('Item deleted'); setDelId(null); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Cannot delete item'); }
    finally { setDeleting(false); }
  };

  const sf = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">
            {lowStockOnly ? 'Low Stock Items' : 'Items'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">{total} records</p>
        </div>
        <Button variant="primary" size="sm" icon={Plus} onClick={openNew}>Add Item</Button>
      </div>

      <SearchInput value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
        placeholder="Search name, SKU, HSN…" />

      <div className="card overflow-hidden">
        {loading ? <div className="py-16 flex justify-center"><PageLoader /></div>
        : items.length === 0 ? (
          <EmptyState icon={Package} title="No items found"
            description="Add products and services to use in invoices"
            action={<Button icon={Plus} onClick={openNew}>Add Item</Button>} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead><tr>
                  <th className="th">Name</th>
                  <th className="th hidden sm:table-cell">Type</th>
                  <th className="th hidden md:table-cell">HSN</th>
                  <th className="th text-right">Sale Price</th>
                  <th className="th text-right hidden sm:table-cell">Stock</th>
                  <th className="th hidden md:table-cell">GST</th>
                  <th className="th w-16" />
                </tr></thead>
                <tbody>
                  {items.map(it => {
                    const isLow = it.track_inventory && parseFloat(it.current_stock) <= parseFloat(it.min_stock_alert) && parseFloat(it.min_stock_alert) > 0;
                    return (
                      <tr key={it.id} className="tr-hover">
                        <td className="td">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-slate-100">{it.name}</p>
                            {isLow && <AlertTriangle size={12} className="text-amber-400 flex-shrink-0" />}
                          </div>
                          {it.sku && <p className="text-xs text-slate-500 font-mono">{it.sku}</p>}
                        </td>
                        <td className="td hidden sm:table-cell">
                          <span className={`badge ${it.item_type === 'goods' ? 'badge-blue' : 'badge-green'}`}>{it.item_type}</span>
                        </td>
                        <td className="td hidden md:table-cell text-slate-500 text-xs font-mono">{it.hsn_sac_code || '—'}</td>
                        <td className="td text-right font-mono text-slate-100">{fmtCurrency(it.sale_price)}</td>
                        <td className="td text-right hidden sm:table-cell">
                          {it.track_inventory ? (
                            <span className={`font-mono text-xs font-semibold ${isLow ? 'text-amber-400' : 'text-slate-300'}`}>
                              {it.current_stock} {it.unit}
                            </span>
                          ) : <span className="text-slate-600 text-xs">N/A</span>}
                        </td>
                        <td className="td hidden md:table-cell text-slate-400 text-xs">{it.gst_rate}%</td>
                        <td className="td">
                          <div className="flex gap-1">
                            <button onClick={() => openEdit(it)} className="p-1.5 rounded hover:bg-surface-600 text-slate-500 hover:text-slate-200"><Edit2 size={12} /></button>
                            <button onClick={() => setDelId(it.id)} className="p-1.5 rounded hover:bg-red-900/30 text-slate-500 hover:text-red-400"><Trash2 size={12} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
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

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Item' : 'Add Item'} size="lg"
        footer={<>
          <Button variant="ghost" onClick={() => setModal(false)}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={handleSave}>{editing ? 'Update' : 'Create'}</Button>
        </>}>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Item Name *" value={form.name}   onChange={e => sf('name', e.target.value)}   className="col-span-2" />
          <Input label="SKU"         value={form.sku}    onChange={e => sf('sku', e.target.value)} />
          <Select label="Type"       value={form.itemType} onChange={e => sf('itemType', e.target.value)}>
            <option value="goods">Goods</option>
            <option value="service">Service</option>
          </Select>
          <Input label="HSN/SAC Code" value={form.hsnSacCode} onChange={e => sf('hsnSacCode', e.target.value)} />
          <Input label="Unit"         value={form.unit}       onChange={e => sf('unit', e.target.value)} placeholder="PCS, KG, LTR…" />
          <Input label="Sale Price ₹"    type="number" value={form.salePrice}     onChange={e => sf('salePrice',    e.target.value)} />
          <Input label="Purchase Price ₹" type="number" value={form.purchasePrice} onChange={e => sf('purchasePrice', e.target.value)} />
          <div>
            <label className="text-xs font-medium text-slate-400 block mb-1">GST Rate</label>
            <select value={form.gstRate} onChange={e => sf('gstRate', e.target.value)} className="input">
              {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
            </select>
          </div>
          <Input label="Category" value={form.category} onChange={e => sf('category', e.target.value)} />
          <div className="col-span-2 flex items-center gap-2 py-1">
            <input type="checkbox" id="trackInv" checked={form.trackInventory}
              onChange={e => sf('trackInventory', e.target.checked)} className="accent-brand-500 w-4 h-4" />
            <label htmlFor="trackInv" className="text-sm text-slate-300 cursor-pointer">Track inventory</label>
          </div>
          {form.trackInventory && <>
            <Input label="Opening Stock" type="number" value={form.openingStock}    onChange={e => sf('openingStock',   e.target.value)} />
            <Input label="Min Stock Alert" type="number" value={form.minStockAlert} onChange={e => sf('minStockAlert', e.target.value)} />
          </>}
        </div>
      </Modal>

      <ConfirmDialog open={!!delId} onClose={() => setDelId(null)} onConfirm={handleDelete}
        loading={deleting} title="Delete Item" message="Delete this item? Cannot be deleted if used in invoices." confirmLabel="Delete" />
    </div>
  );
}
