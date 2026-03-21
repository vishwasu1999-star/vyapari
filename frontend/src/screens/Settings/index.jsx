import React, { useState, useEffect } from 'react';
import {
  Building2, Save, User, LogOut, Database,
  ChevronRight, Shield, Bell,
} from 'lucide-react';
import { businessApi, authApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Button, Input, Select, Modal } from '../../components/UI';
import { INDIAN_STATES } from '../../utils/constants';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

function Section({ title, icon: Icon, children }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-700">
        {Icon && <Icon size={15} className="text-slate-400" />}
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export default function SettingsScreen() {
  const { bizId, user, activeBiz, logout } = useAuth();
  const navigate = useNavigate();
  const [bizForm,  setBizForm]  = useState({});
  const [savingBiz, setSavingBiz] = useState(false);
  const [pwdModal, setPwdModal] = useState(false);
  const [pwd,      setPwd]      = useState({ current: '', newPwd: '', confirm: '' });
  const [savingPwd, setSavingPwd] = useState(false);

  useEffect(() => {
    if (!bizId) return;
    businessApi.get(bizId).then(res => {
      const b = res.data.business;
      setBizForm({
        name:               b.name || '',
        legalName:          b.legal_name || '',
        gstNumber:          b.gst_number || '',
        panNumber:          b.pan_number || '',
        phone:              b.phone || '',
        email:              b.email || '',
        addressLine1:       b.address_line1 || '',
        city:               b.city || '',
        state:              b.state || '',
        stateCode:          b.state_code || '',
        pincode:            b.pincode || '',
        saleInvoicePrefix:  b.sale_invoice_prefix || 'INV',
        purchasePrefix:     b.purchase_prefix || 'PUR',
        isGstRegistered:    b.is_gst_registered !== false,
      });
    }).catch(() => {});
  }, [bizId]);

  const saveBusiness = async (e) => {
    e?.preventDefault();
    if (!bizForm.name?.trim()) return toast.error('Business name required');
    setSavingBiz(true);
    try {
      await businessApi.update(bizId, bizForm);
      toast.success('Business settings saved');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Save failed');
    } finally { setSavingBiz(false); }
  };

  const changePassword = async (e) => {
    e?.preventDefault();
    if (!pwd.current || !pwd.newPwd) return toast.error('All fields required');
    if (pwd.newPwd !== pwd.confirm) return toast.error('Passwords do not match');
    if (pwd.newPwd.length < 8)      return toast.error('Password must be at least 8 characters');
    setSavingPwd(true);
    try {
      await authApi.changePassword({ currentPassword: pwd.current, newPassword: pwd.newPwd });
      toast.success('Password changed — please log in again');
      setPwdModal(false);
      setTimeout(async () => { await logout(); navigate('/login'); }, 1500);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to change password');
    } finally { setSavingPwd(false); }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
    toast.success('Logged out');
  };

  const sf = (k, v) => setBizForm(f => ({ ...f, [k]: v }));

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-white">Settings</h1>
        <p className="text-xs text-slate-500 mt-0.5">Business and account settings</p>
      </div>

      {/* Business Settings */}
      <Section title="Business Information" icon={Building2}>
        <form onSubmit={saveBusiness} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Business Name *" value={bizForm.name || ''} onChange={e => sf('name', e.target.value)} />
            <Input label="Legal Name"      value={bizForm.legalName || ''} onChange={e => sf('legalName', e.target.value)} />
            <Input label="GSTIN"           value={bizForm.gstNumber || ''}
              onChange={e => sf('gstNumber', e.target.value.toUpperCase())} placeholder="27XXXXX0000X0XX" />
            <Input label="PAN Number"      value={bizForm.panNumber || ''}
              onChange={e => sf('panNumber', e.target.value.toUpperCase())} />
            <Input label="Phone"           value={bizForm.phone || ''}  onChange={e => sf('phone', e.target.value)} />
            <Input label="Email"           value={bizForm.email || ''}  onChange={e => sf('email', e.target.value)} type="email" />
            <Input label="Address"         value={bizForm.addressLine1 || ''} onChange={e => sf('addressLine1', e.target.value)} className="col-span-1 sm:col-span-2" />
            <Input label="City"            value={bizForm.city || ''}   onChange={e => sf('city', e.target.value)} />
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1">State</label>
              <select value={bizForm.state || ''} onChange={e => {
                const s = INDIAN_STATES.find(st => st.name === e.target.value);
                sf('state', e.target.value);
                if (s) sf('stateCode', s.code);
              }} className="input">
                <option value="">— Select state —</option>
                {INDIAN_STATES.map(s => <option key={s.code} value={s.name}>{s.code} — {s.name}</option>)}
              </select>
            </div>
            <Input label="Pincode" value={bizForm.pincode || ''} onChange={e => sf('pincode', e.target.value)} />
          </div>

          <div className="border-t border-surface-700 pt-4">
            <h4 className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wider">Invoice Numbering</h4>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Sale Invoice Prefix"   value={bizForm.saleInvoicePrefix || ''} onChange={e => sf('saleInvoicePrefix', e.target.value.toUpperCase())} placeholder="INV" />
              <Input label="Purchase Invoice Prefix" value={bizForm.purchasePrefix || ''} onChange={e => sf('purchasePrefix', e.target.value.toUpperCase())} placeholder="PUR" />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={bizForm.isGstRegistered !== false}
                onChange={e => sf('isGstRegistered', e.target.checked)}
                className="accent-brand-500 w-4 h-4" />
              <span className="text-sm text-slate-300">GST Registered Business</span>
            </label>
            <Button type="submit" variant="primary" icon={Save} loading={savingBiz}>Save Changes</Button>
          </div>
        </form>
      </Section>

      {/* Account */}
      <Section title="Account" icon={User}>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm text-slate-200 font-medium">{user?.name}</p>
              <p className="text-xs text-slate-500">{user?.email}</p>
            </div>
          </div>
          <div className="flex gap-3 pt-2 border-t border-surface-700">
            <Button variant="outline" size="sm" icon={Shield} onClick={() => setPwdModal(true)}>Change Password</Button>
            <Button variant="danger"  size="sm" icon={LogOut}  onClick={handleLogout}>Sign Out</Button>
          </div>
        </div>
      </Section>

      {/* Data */}
      <Section title="Data & Storage" icon={Database}>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-surface-700">
            <div>
              <p className="text-sm text-slate-200 font-medium">Offline Mode</p>
              <p className="text-xs text-slate-500">Data is cached locally via IndexedDB for offline use</p>
            </div>
            <span className="badge badge-green">Active</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm text-slate-200 font-medium">Auto Sync</p>
              <p className="text-xs text-slate-500">Syncs pending changes every 30 seconds when online</p>
            </div>
            <span className="badge badge-green">On</span>
          </div>
        </div>
      </Section>

      {/* Version */}
      <div className="text-center py-4">
        <p className="text-xs text-slate-600">Vyapari v1.0.0 — Made for Indian businesses</p>
      </div>

      {/* Change password modal */}
      <Modal open={pwdModal} onClose={() => setPwdModal(false)} title="Change Password" size="sm"
        footer={<>
          <Button variant="ghost" onClick={() => setPwdModal(false)}>Cancel</Button>
          <Button variant="primary" loading={savingPwd} onClick={changePassword}>Change Password</Button>
        </>}>
        <form onSubmit={changePassword} className="space-y-3">
          <Input label="Current Password" type="password" value={pwd.current}
            onChange={e => setPwd(p => ({ ...p, current: e.target.value }))} />
          <Input label="New Password" type="password" value={pwd.newPwd}
            onChange={e => setPwd(p => ({ ...p, newPwd: e.target.value }))}
            helper="Min 8 characters, one uppercase, one digit" />
          <Input label="Confirm New Password" type="password" value={pwd.confirm}
            onChange={e => setPwd(p => ({ ...p, confirm: e.target.value }))}
            error={pwd.confirm && pwd.newPwd !== pwd.confirm ? 'Passwords do not match' : ''} />
        </form>
      </Modal>
    </div>
  );
}
