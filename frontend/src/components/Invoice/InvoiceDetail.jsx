import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Printer, Share2, CheckCircle, XCircle,
  Edit2, RefreshCw, Download,
} from 'lucide-react';
import { invoiceApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { fmtCurrency, fmtDate, statusBadge } from '../../utils/helpers';
import { Button, PageLoader, StatusBadge, Modal, ConfirmDialog, InfoBox } from '../UI';
import toast from 'react-hot-toast';

// ── Invoice print template ─────────────────────────────────
function InvoicePrint({ invoice, ref: printRef }) {
  const b = invoice;
  const isInterState = b.is_inter_state;

  return (
    <div ref={printRef} className="bg-white text-gray-900 p-8 max-w-4xl mx-auto text-sm font-sans print-only hidden print:block">
      {/* Header */}
      <div className="flex justify-between items-start mb-6 pb-4 border-b-2 border-gray-200">
        <div>
          {b.business_logo && <img src={b.business_logo} alt="logo" className="h-12 mb-2" />}
          <h1 className="text-xl font-bold text-gray-900">{b.business_name}</h1>
          {b.business_legal_name && <p className="text-xs text-gray-500">{b.business_legal_name}</p>}
          <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{b.business_address}</p>
          <p className="text-xs text-gray-600">{b.business_city} — {b.business_pincode}</p>
          {b.business_gst && <p className="text-xs text-gray-600 mt-1">GSTIN: {b.business_gst}</p>}
          {b.business_phone && <p className="text-xs text-gray-600">Ph: {b.business_phone}</p>}
        </div>
        <div className="text-right">
          <h2 className="text-2xl font-bold uppercase text-gray-700">Tax Invoice</h2>
          <p className="text-xs text-gray-600 mt-1">Invoice No: <strong>{b.invoice_number}</strong></p>
          <p className="text-xs text-gray-600">Date: <strong>{fmtDate(b.invoice_date)}</strong></p>
          {b.due_date && <p className="text-xs text-gray-600">Due: <strong>{fmtDate(b.due_date)}</strong></p>}
        </div>
      </div>

      {/* Bill To */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        <div className="bg-gray-50 rounded p-3">
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">Bill To</h3>
          <p className="font-semibold text-gray-900">{b.party_name}</p>
          {b.party_address && <p className="text-xs text-gray-600 mt-0.5 whitespace-pre-wrap">{b.party_address}</p>}
          {b.party_city && <p className="text-xs text-gray-600">{b.party_city}{b.party_state ? `, ${b.party_state}` : ''}</p>}
          {b.party_gst && <p className="text-xs text-gray-600 mt-1">GSTIN: {b.party_gst}</p>}
          {b.party_phone && <p className="text-xs text-gray-600">Ph: {b.party_phone}</p>}
        </div>
        <div className="bg-gray-50 rounded p-3">
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">Supply Info</h3>
          <p className="text-xs text-gray-600">Place of Supply: <strong>{b.place_of_supply || b.party_state || '—'}</strong></p>
          <p className="text-xs text-gray-600">Tax Type: <strong>{isInterState ? 'IGST (Inter-state)' : 'CGST + SGST (Intra-state)'}</strong></p>
          {b.reference_number && <p className="text-xs text-gray-600 mt-1">Ref: {b.reference_number}</p>}
        </div>
      </div>

      {/* Items table */}
      <table className="w-full text-xs mb-4">
        <thead>
          <tr className="bg-gray-100">
            <th className="text-left py-2 px-2 border">#</th>
            <th className="text-left py-2 px-2 border">Description</th>
            <th className="text-center py-2 px-2 border">HSN</th>
            <th className="text-right py-2 px-2 border">Qty</th>
            <th className="text-center py-2 px-2 border">Unit</th>
            <th className="text-right py-2 px-2 border">Rate</th>
            <th className="text-right py-2 px-2 border">Taxable</th>
            {isInterState ? (
              <th className="text-right py-2 px-2 border">IGST</th>
            ) : (
              <>
                <th className="text-right py-2 px-2 border">CGST</th>
                <th className="text-right py-2 px-2 border">SGST</th>
              </>
            )}
            <th className="text-right py-2 px-2 border">Total</th>
          </tr>
        </thead>
        <tbody>
          {(b.items || []).map((item, i) => (
            <tr key={item.id} className="border-b">
              <td className="py-1.5 px-2 border">{i + 1}</td>
              <td className="py-1.5 px-2 border">
                <p className="font-medium">{item.item_name}</p>
                {item.description && <p className="text-gray-500 text-xs">{item.description}</p>}
              </td>
              <td className="py-1.5 px-2 border text-center text-gray-500">{item.hsn_sac_code || '—'}</td>
              <td className="py-1.5 px-2 border text-right">{item.quantity}</td>
              <td className="py-1.5 px-2 border text-center">{item.unit}</td>
              <td className="py-1.5 px-2 border text-right">₹{parseFloat(item.rate).toFixed(2)}</td>
              <td className="py-1.5 px-2 border text-right">₹{parseFloat(item.taxable_amount).toFixed(2)}</td>
              {isInterState ? (
                <td className="py-1.5 px-2 border text-right">
                  <p>₹{parseFloat(item.igst_amount).toFixed(2)}</p>
                  <p className="text-gray-400">({item.igst_rate}%)</p>
                </td>
              ) : (
                <>
                  <td className="py-1.5 px-2 border text-right">
                    <p>₹{parseFloat(item.cgst_amount).toFixed(2)}</p>
                    <p className="text-gray-400">({item.cgst_rate}%)</p>
                  </td>
                  <td className="py-1.5 px-2 border text-right">
                    <p>₹{parseFloat(item.sgst_amount).toFixed(2)}</p>
                    <p className="text-gray-400">({item.sgst_rate}%)</p>
                  </td>
                </>
              )}
              <td className="py-1.5 px-2 border text-right font-semibold">₹{parseFloat(item.total).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="flex justify-end mb-6">
        <div className="w-64 space-y-1">
          {[
            ['Subtotal',       b.subtotal],
            b.total_discount > 0 && ['Discount', -b.total_discount],
            ['Taxable Amount', b.taxable_amount],
            b.cgst_amount > 0 && ['CGST', b.cgst_amount],
            b.sgst_amount > 0 && ['SGST', b.sgst_amount],
            b.igst_amount > 0 && ['IGST', b.igst_amount],
            b.round_off != 0 && ['Round Off', b.round_off],
          ].filter(Boolean).map(([label, val]) => (
            <div key={label} className="flex justify-between text-xs">
              <span className="text-gray-600">{label}</span>
              <span>₹{parseFloat(val).toFixed(2)}</span>
            </div>
          ))}
          <div className="flex justify-between font-bold text-sm border-t border-gray-300 pt-1">
            <span>Grand Total</span>
            <span>₹{parseFloat(b.total_amount).toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Amount in words */}
      <p className="text-xs text-gray-600 italic mb-4">{b.amount_in_words}</p>

      {/* Notes */}
      {b.notes && <div className="bg-gray-50 rounded p-3 text-xs text-gray-600 mb-4"><strong>Notes:</strong> {b.notes}</div>}

      <div className="text-center text-xs text-gray-400 mt-8 border-t pt-3">
        Thank you for your business! — Generated by Vyapari
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────
export default function InvoiceDetail() {
  const { id }       = useParams();
  const { bizId }    = useAuth();
  const navigate     = useNavigate();
  const printRef     = useRef();
  const [invoice,  setInvoice]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [marking,  setMarking]  = useState(false);
  const [cancelDialog, setCancelDialog] = useState(false);
  const [cancelling, setCancelling]     = useState(false);
  const isPurchase = invoice?.invoice_type === 'purchase';

  const load = async () => {
    try {
      setLoading(true);
      const res = await invoiceApi.get(bizId, id);
      setInvoice(res.data.invoice);
    } catch {
      toast.error('Invoice not found');
      navigate(-1);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (bizId && id) load(); }, [bizId, id]);

  const markPaid = async () => {
    try {
      setMarking(true);
      await invoiceApi.update(bizId, id, { status: 'paid' });
      await load();
      toast.success('Marked as paid');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error');
    } finally {
      setMarking(false);
    }
  };

  const handleCancel = async () => {
    try {
      setCancelling(true);
      await invoiceApi.cancel(bizId, id, 'Cancelled by user');
      await load();
      toast.success('Invoice cancelled');
      setCancelDialog(false);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error');
    } finally {
      setCancelling(false);
    }
  };

  const handlePrint = () => window.print();

  const handleWhatsApp = () => {
    if (!invoice) return;
    const text = encodeURIComponent(
      `*${invoice.business_name}*\n` +
      `Invoice No: ${invoice.invoice_number}\n` +
      `Date: ${fmtDate(invoice.invoice_date)}\n` +
      `Customer: ${invoice.party_name}\n` +
      `Amount: ${fmtCurrency(invoice.total_amount)}\n` +
      `Status: ${invoice.status.toUpperCase()}\n\n` +
      `Thank you for your business!`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  if (loading) return <PageLoader />;
  if (!invoice) return null;

  const { class: badgeClass, label: badgeLabel } = statusBadge(invoice.status);
  const canMarkPaid = ['unpaid', 'partial'].includes(invoice.status);
  const canCancel   = !['cancelled', 'paid'].includes(invoice.status);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-surface-700 text-slate-400">
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white font-mono">{invoice.invoice_number}</h1>
              <span className={badgeClass}>{badgeLabel}</span>
            </div>
            <p className="text-xs text-slate-500">{fmtDate(invoice.invoice_date)} · {invoice.party_name}</p>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap no-print">
          <Button variant="ghost"   size="sm" icon={Share2}   onClick={handleWhatsApp}>WhatsApp</Button>
          <Button variant="ghost"   size="sm" icon={Printer}  onClick={handlePrint}>Print</Button>
          {canMarkPaid && (
            <Button variant="success" size="sm" icon={CheckCircle} onClick={markPaid} loading={marking}>
              Mark Paid
            </Button>
          )}
          {canCancel && (
            <Button variant="danger" size="sm" icon={XCircle} onClick={() => setCancelDialog(true)}>
              Cancel
            </Button>
          )}
        </div>
      </div>

      {/* ── Invoice card ───────────────────────────────────── */}
      <div className="card p-5 space-y-5">
        {/* Business + Party header */}
        <div className="grid grid-cols-2 gap-4 pb-4 border-b border-surface-700">
          <div>
            <p className="text-xs text-slate-500 mb-1">From</p>
            <p className="text-sm font-semibold text-slate-100">{invoice.business_name}</p>
            {invoice.business_gst && <p className="text-xs text-slate-400 font-mono">GSTIN: {invoice.business_gst}</p>}
            {invoice.business_address && <p className="text-xs text-slate-500 mt-0.5">{invoice.business_address}</p>}
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">{isPurchase ? 'Supplier' : 'Bill To'}</p>
            <p className="text-sm font-semibold text-slate-100">{invoice.party_name || '—'}</p>
            {invoice.party_gst && <p className="text-xs text-slate-400 font-mono">GSTIN: {invoice.party_gst}</p>}
            {invoice.party_address && <p className="text-xs text-slate-500 mt-0.5">{invoice.party_address}</p>}
          </div>
        </div>

        {/* Details row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          {[
            ['Date',           fmtDate(invoice.invoice_date)],
            ['Due Date',       invoice.due_date ? fmtDate(invoice.due_date) : '—'],
            ['Tax Type',       invoice.is_inter_state ? 'IGST' : 'CGST+SGST'],
            ['Place of Supply', invoice.place_of_supply || '—'],
          ].map(([k, v]) => (
            <div key={k} className="bg-surface-900 rounded-lg p-2.5">
              <p className="text-slate-500 mb-0.5">{k}</p>
              <p className="text-slate-200 font-medium">{v}</p>
            </div>
          ))}
        </div>

        {/* Items table */}
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="table-base">
            <thead>
              <tr>
                <th className="th">Item</th>
                <th className="th hidden sm:table-cell">HSN</th>
                <th className="th text-right">Qty</th>
                <th className="th text-right">Rate</th>
                <th className="th text-right hidden sm:table-cell">Taxable</th>
                <th className="th text-right">Tax</th>
                <th className="th text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {(invoice.items || []).map(item => (
                <tr key={item.id} className="tr-hover">
                  <td className="td">
                    <p className="font-medium text-slate-100">{item.item_name}</p>
                    {item.description && <p className="text-xs text-slate-500">{item.description}</p>}
                  </td>
                  <td className="td text-slate-500 hidden sm:table-cell">{item.hsn_sac_code || '—'}</td>
                  <td className="td text-right font-mono">{item.quantity} {item.unit}</td>
                  <td className="td text-right font-mono">{fmtCurrency(item.rate)}</td>
                  <td className="td text-right font-mono hidden sm:table-cell">{fmtCurrency(item.taxable_amount)}</td>
                  <td className="td text-right font-mono text-slate-400">
                    {fmtCurrency(parseFloat(item.cgst_amount || 0) + parseFloat(item.sgst_amount || 0) + parseFloat(item.igst_amount || 0))}
                  </td>
                  <td className="td text-right font-mono font-semibold text-slate-100">{fmtCurrency(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="flex justify-end pt-2">
          <div className="w-full max-w-xs space-y-1.5 text-sm">
            {[
              ['Subtotal',       invoice.subtotal],
              invoice.total_discount > 0 && ['Discount', `-${fmtCurrency(invoice.total_discount)}`],
              ['Taxable Amount', invoice.taxable_amount],
              invoice.cgst_amount > 0 && ['CGST', invoice.cgst_amount],
              invoice.sgst_amount > 0 && ['SGST', invoice.sgst_amount],
              invoice.igst_amount > 0 && ['IGST', invoice.igst_amount],
              Math.abs(invoice.round_off) > 0.001 && ['Round Off', invoice.round_off],
            ].filter(Boolean).map(([label, val]) => (
              <div key={label} className="flex justify-between text-slate-400">
                <span>{label}</span>
                <span className="font-mono">{typeof val === 'string' ? val : fmtCurrency(val)}</span>
              </div>
            ))}
            <div className="flex justify-between font-bold text-white text-base pt-2 border-t border-surface-600">
              <span>Grand Total</span>
              <span className="font-mono text-brand-400">{fmtCurrency(invoice.total_amount)}</span>
            </div>
            {parseFloat(invoice.balance_due) > 0 && (
              <div className="flex justify-between text-amber-400 text-xs">
                <span>Balance Due</span>
                <span className="font-mono">{fmtCurrency(invoice.balance_due)}</span>
              </div>
            )}
          </div>
        </div>

        {invoice.amount_in_words && (
          <p className="text-xs text-slate-500 italic pt-1 border-t border-surface-700">
            {invoice.amount_in_words}
          </p>
        )}

        {invoice.notes && (
          <div className="bg-surface-900 rounded-lg p-3 text-xs text-slate-400">
            <span className="font-semibold text-slate-300">Notes: </span>{invoice.notes}
          </div>
        )}
      </div>

      {/* Cancel dialog */}
      <ConfirmDialog
        open={cancelDialog}
        onClose={() => setCancelDialog(false)}
        onConfirm={handleCancel}
        loading={cancelling}
        title="Cancel Invoice"
        message={`Cancel invoice ${invoice.invoice_number}? This cannot be undone.`}
        confirmLabel="Cancel Invoice"
      />

      {/* Hidden print version */}
      <InvoicePrint invoice={invoice} ref={printRef} />
    </div>
  );
}
