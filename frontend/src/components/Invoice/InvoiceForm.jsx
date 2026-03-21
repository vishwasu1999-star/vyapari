import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Save, ArrowLeft, Search, X, ChevronDown } from 'lucide-react';
import { invoiceApi, partyApi, itemApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Button, Input, Select, Textarea, Modal } from '../UI';
import { calcItemTax, calcInvoiceTotals, fmtCurrency, todayISO } from '../../utils/helpers';
import { INDIAN_STATES } from '../../utils/constants';
import toast from 'react-hot-toast';

const GST_RATES = [0, 0.1, 0.25, 1.5, 3, 5, 12, 18, 28];

const emptyLine = () => ({
  _id:            Math.random(),
  itemId:         null,
  itemName:       '',
  hsnSacCode:     '',
  unit:           'PCS',
  quantity:       1,
  rate:           0,
  discountPercent: 0,
  gstRate:        0,
  isTaxInclusive: false,
  // computed
  taxable: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, lineTotal: 0,
});

// ── Party search dropdown ──────────────────────────────────
function PartySearch({ bizId, value, onChange, partyType }) {
  const [query,   setQuery]   = useState(value?.name || '');
  const [results, setResults] = useState([]);
  const [open,    setOpen]    = useState(false);
  const timer = useRef();

  useEffect(() => {
    if (value?.name) setQuery(value.name);
  }, [value?.name]);

  const search = (q) => {
    setQuery(q);
    clearTimeout(timer.current);
    if (!q.trim()) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      try {
        const res = await partyApi.list(bizId, { search: q, type: partyType, limit: 8 });
        setResults(res.data.data || []);
        setOpen(true);
      } catch {}
    }, 300);
  };

  const select = (party) => {
    onChange(party);
    setQuery(party.name);
    setOpen(false);
  };

  const clear = () => { onChange(null); setQuery(''); setResults([]); };

  return (
    <div className="relative">
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          value={query}
          onChange={e => search(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          placeholder="Search or type party name…"
          className="input pl-8 pr-8"
        />
        {(query || value) && (
          <button onClick={clear} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
            <X size={13} />
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-surface-800 border border-surface-600 rounded-xl shadow-2xl overflow-hidden">
          {results.map(p => (
            <button key={p.id} onClick={() => select(p)}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-700 transition-colors text-left">
              <div>
                <p className="text-sm text-slate-100 font-medium">{p.name}</p>
                <p className="text-xs text-slate-500">{p.phone || p.gst_number || p.city || ''}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Item search per line ───────────────────────────────────
function ItemSearch({ bizId, value, onChange }) {
  const [query,   setQuery]   = useState(value || '');
  const [results, setResults] = useState([]);
  const [open,    setOpen]    = useState(false);
  const timer = useRef();

  const search = (q) => {
    setQuery(q);
    onChange({ itemName: q });
    clearTimeout(timer.current);
    if (!q.trim()) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      try {
        const res = await itemApi.list(bizId, { search: q, limit: 6 });
        setResults(res.data.data || []);
        setOpen(true);
      } catch {}
    }, 250);
  };

  const select = (item) => {
    setQuery(item.name);
    setOpen(false);
    onChange({
      itemId:     item.id,
      itemName:   item.name,
      hsnSacCode: item.hsn_sac_code || '',
      unit:       item.unit || 'PCS',
      rate:       parseFloat(item.sale_price) || 0,
      gstRate:    parseFloat(item.gst_rate)   || 0,
    });
  };

  return (
    <div className="relative">
      <input
        value={query}
        onChange={e => search(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        placeholder="Item name…"
        className="input text-xs py-1.5"
      />
      {open && results.length > 0 && (
        <div className="absolute z-50 top-full mt-1 left-0 min-w-[200px] w-full bg-surface-800 border border-surface-600 rounded-xl shadow-2xl overflow-hidden">
          {results.map(it => (
            <button key={it.id} onClick={() => select(it)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-surface-700 text-left">
              <div>
                <p className="text-xs text-slate-100 font-medium">{it.name}</p>
                <p className="text-xs text-slate-500">{it.hsn_sac_code || it.unit}</p>
              </div>
              <p className="text-xs font-mono text-brand-400 flex-shrink-0">{fmtCurrency(it.sale_price)}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Invoice Form ──────────────────────────────────────
export default function InvoiceForm({ invoiceType = 'sale' }) {
  const { bizId }   = useAuth();
  const navigate    = useNavigate();
  const isPurchase  = invoiceType === 'purchase';

  const [party,      setParty]      = useState(null);
  const [date,       setDate]       = useState(todayISO());
  const [dueDate,    setDueDate]    = useState('');
  const [refNum,     setRefNum]     = useState('');
  const [notes,      setNotes]      = useState('');
  const [interState, setInterState] = useState(false);
  const [pos,        setPos]        = useState('');
  const [lines,      setLines]      = useState([emptyLine()]);
  const [saving,     setSaving]     = useState(false);

  // Recalculate a line whenever rate/qty/gst/discount changes
  const recompute = useCallback((line) => {
    const tax = calcItemTax({
      rate:            parseFloat(line.rate)            || 0,
      qty:             parseFloat(line.quantity)        || 0,
      discountPercent: parseFloat(line.discountPercent) || 0,
      gstRate:         parseFloat(line.gstRate)         || 0,
      isInterState:    interState,
    });
    return { ...line, ...tax };
  }, [interState]);

  // Recompute all lines when inter-state changes
  useEffect(() => {
    setLines(prev => prev.map(recompute));
  }, [interState]);

  const updateLine = (idx, fields) => {
    setLines(prev => {
      const next = [...prev];
      next[idx]  = recompute({ ...next[idx], ...fields });
      return next;
    });
  };

  const addLine    = ()    => setLines(prev => [...prev, emptyLine()]);
  const removeLine = (idx) => setLines(prev => prev.filter((_, i) => i !== idx));

  const totals = calcInvoiceTotals(lines);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!date)                  return toast.error('Invoice date is required');
    if (!lines.some(l => l.itemName?.trim())) return toast.error('Add at least one item');

    try {
      setSaving(true);
      const payload = {
        invoiceType,
        invoiceDate: date,
        dueDate:     dueDate || null,
        referenceNumber: refNum || null,
        partyId:     party?.id || null,
        partyName:   party?.name || '',
        isInterState: interState,
        placeOfSupply: pos || '',
        notes,
        items: lines.filter(l => l.itemName?.trim()).map(l => ({
          itemId:          l.itemId   || null,
          itemName:        l.itemName,
          hsnSacCode:      l.hsnSacCode || null,
          unit:            l.unit,
          quantity:        parseFloat(l.quantity) || 1,
          rate:            parseFloat(l.rate)     || 0,
          discountPercent: parseFloat(l.discountPercent) || 0,
          gstRate:         parseFloat(l.gstRate)  || 0,
        })),
      };

      const res = await invoiceApi.create(bizId, payload);
      toast.success(`${isPurchase ? 'Purchase' : 'Invoice'} created!`);
      const inv = res.data.invoice;
      navigate(isPurchase ? `/purchases/${inv.id}` : `/sales/${inv.id}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save invoice');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-surface-700 text-slate-400">
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-lg font-bold text-white">
            {isPurchase ? 'Record Purchase' : 'New Invoice'}
          </h1>
          <p className="text-xs text-slate-500">All amounts in INR</p>
        </div>
      </div>

      {/* Top fields */}
      <div className="card p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Party */}
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-slate-400 block mb-1">
              {isPurchase ? 'Supplier' : 'Customer'}
            </label>
            <PartySearch
              bizId={bizId}
              value={party}
              onChange={setParty}
              partyType={isPurchase ? 'supplier' : 'customer'}
            />
          </div>

          <Input label="Invoice Date" type="date" value={date} onChange={e => setDate(e.target.value)} required />
          <Input label="Due Date"     type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          <Input label={isPurchase ? 'Supplier Invoice No.' : 'Reference No.'} value={refNum}
            onChange={e => setRefNum(e.target.value)} placeholder="Optional" />

          <div>
            <label className="text-xs font-medium text-slate-400 block mb-1">Place of Supply</label>
            <select value={pos} onChange={e => setPos(e.target.value)}
              className="input">
              <option value="">— Select state —</option>
              {INDIAN_STATES.map(s => (
                <option key={s.code} value={s.name}>{s.code} — {s.name}</option>
              ))}
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer w-fit">
          <div onClick={() => setInterState(p => !p)}
            className={`w-10 h-5 rounded-full flex items-center transition-colors ${interState ? 'bg-brand-600' : 'bg-surface-700'}`}>
            <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${interState ? 'translate-x-5' : ''}`} />
          </div>
          <span className="text-xs text-slate-400">Inter-state supply (IGST applies)</span>
        </label>
      </div>

      {/* Line Items */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">Items</h3>
          <button type="button" onClick={addLine}
            className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
            <Plus size={13} /> Add Row
          </button>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="th w-[220px]">Item</th>
                <th className="th">HSN/SAC</th>
                <th className="th">Unit</th>
                <th className="th">Qty</th>
                <th className="th">Rate</th>
                <th className="th">Disc %</th>
                <th className="th">GST %</th>
                <th className="th text-right">Total</th>
                <th className="th w-8" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => (
                <tr key={line._id} className="group">
                  <td className="td">
                    <ItemSearch bizId={bizId} value={line.itemName}
                      onChange={fields => updateLine(idx, fields)} />
                  </td>
                  <td className="td">
                    <input value={line.hsnSacCode} onChange={e => updateLine(idx, { hsnSacCode: e.target.value })}
                      className="input text-xs py-1.5 w-24" placeholder="HSN" />
                  </td>
                  <td className="td">
                    <input value={line.unit} onChange={e => updateLine(idx, { unit: e.target.value })}
                      className="input text-xs py-1.5 w-16" />
                  </td>
                  <td className="td">
                    <input type="number" min="0.001" step="0.001" value={line.quantity}
                      onChange={e => updateLine(idx, { quantity: e.target.value })}
                      className="input text-xs py-1.5 w-20 text-right" />
                  </td>
                  <td className="td">
                    <input type="number" min="0" step="0.01" value={line.rate}
                      onChange={e => updateLine(idx, { rate: e.target.value })}
                      className="input text-xs py-1.5 w-24 text-right" />
                  </td>
                  <td className="td">
                    <input type="number" min="0" max="100" step="0.01" value={line.discountPercent}
                      onChange={e => updateLine(idx, { discountPercent: e.target.value })}
                      className="input text-xs py-1.5 w-16 text-right" />
                  </td>
                  <td className="td">
                    <select value={line.gstRate} onChange={e => updateLine(idx, { gstRate: e.target.value })}
                      className="input text-xs py-1.5 w-20">
                      {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                    </select>
                  </td>
                  <td className="td text-right font-mono font-semibold text-brand-400 whitespace-nowrap">
                    {fmtCurrency(line.lineTotal || 0)}
                  </td>
                  <td className="td">
                    {lines.length > 1 && (
                      <button type="button" onClick={() => removeLine(idx)}
                        className="p-1 rounded hover:bg-red-900/30 text-slate-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden space-y-3 p-3">
          {lines.map((line, idx) => (
            <div key={line._id} className="bg-surface-900 rounded-xl p-3 space-y-2 border border-surface-700">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <ItemSearch bizId={bizId} value={line.itemName}
                    onChange={fields => updateLine(idx, fields)} />
                </div>
                {lines.length > 1 && (
                  <button type="button" onClick={() => removeLine(idx)} className="p-1.5 text-red-400">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Input label="Qty" type="number" value={line.quantity}
                  onChange={e => updateLine(idx, { quantity: e.target.value })} />
                <Input label="Rate" type="number" value={line.rate}
                  onChange={e => updateLine(idx, { rate: e.target.value })} />
                <div>
                  <label className="text-xs font-medium text-slate-400 block mb-1">GST %</label>
                  <select value={line.gstRate} onChange={e => updateLine(idx, { gstRate: e.target.value })} className="input">
                    {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                  </select>
                </div>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Taxable: {fmtCurrency(line.taxable || 0)}</span>
                <span className="font-semibold text-brand-400">Total: {fmtCurrency(line.lineTotal || 0)}</span>
              </div>
            </div>
          ))}
          <button type="button" onClick={addLine}
            className="w-full py-2.5 border border-dashed border-surface-600 rounded-xl text-sm text-brand-400 hover:border-brand-600 transition-colors flex items-center justify-center gap-2">
            <Plus size={14} /> Add Item
          </button>
        </div>
      </div>

      {/* Totals */}
      <div className="card p-4">
        <div className="flex justify-end">
          <div className="w-full max-w-sm space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-400">
              <span>Subtotal</span>
              <span className="font-mono">{fmtCurrency(totals.subtotal)}</span>
            </div>
            {totals.totalDiscount > 0 && (
              <div className="flex justify-between text-slate-400">
                <span>Discount</span>
                <span className="font-mono text-red-400">−{fmtCurrency(totals.totalDiscount)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-400">
              <span>Taxable Amount</span>
              <span className="font-mono">{fmtCurrency(totals.taxableAmount)}</span>
            </div>
            {interState ? (
              totals.igstAmount > 0 && (
                <div className="flex justify-between text-slate-400">
                  <span>IGST</span>
                  <span className="font-mono">{fmtCurrency(totals.igstAmount)}</span>
                </div>
              )
            ) : (
              <>
                {totals.cgstAmount > 0 && (
                  <div className="flex justify-between text-slate-400">
                    <span>CGST</span><span className="font-mono">{fmtCurrency(totals.cgstAmount)}</span>
                  </div>
                )}
                {totals.sgstAmount > 0 && (
                  <div className="flex justify-between text-slate-400">
                    <span>SGST</span><span className="font-mono">{fmtCurrency(totals.sgstAmount)}</span>
                  </div>
                )}
              </>
            )}
            {totals.roundOff !== 0 && (
              <div className="flex justify-between text-slate-500 text-xs">
                <span>Round Off</span><span className="font-mono">{fmtCurrency(totals.roundOff)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-white text-base pt-2 border-t border-surface-600">
              <span>Total</span>
              <span className="font-mono text-brand-400">{fmtCurrency(totals.totalAmount)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Notes */}
      <Textarea label="Notes / Terms" value={notes} onChange={e => setNotes(e.target.value)}
        placeholder="Thank you for your business…" />

      {/* Submit */}
      <div className="flex gap-3 justify-end pb-4">
        <Button type="button" variant="ghost" onClick={() => navigate(-1)}>Cancel</Button>
        <Button type="submit" variant="primary" icon={Save} loading={saving}>
          Save {isPurchase ? 'Purchase' : 'Invoice'}
        </Button>
      </div>
    </form>
  );
}
