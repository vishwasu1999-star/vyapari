import React, { useState, useEffect } from "react";
import { useNavigate } from 'react-router-dom';
import { Building2, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { businessApi } from '../../services/api';
import { Button, Input, Select } from '../../components/UI';
import { INDIAN_STATES } from '../../utils/constants';
import toast from 'react-hot-toast';

export default function OnboardingScreen() {
   useEffect(() => {
  if (window.location.pathname === "/login") {
    window.location.href = "/dashboard";
  }
}, []);                                                                       
  const { addBusiness } = useAuth();
  const navigate = useNavigate();
  const [step,    setStep]    = useState(1);
  const [loading, setLoading] = useState(false);
  const [form,    setForm]    = useState({
    name: '', legalName: '', businessType: 'proprietorship',
    gstNumber: '', panNumber: '',
    addressLine1: '', city: '', state: '', stateCode: '', pincode: '',
    phone: '', email: '',
  });

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const setStateCode = (e) => {
    const s = INDIAN_STATES.find(s => s.name === e.target.value);
    setForm(f => ({ ...f, state: e.target.value, stateCode: s?.code || '' }));
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error('Business name is required'); return; }
    setLoading(true);
    try {
      const { data } = await businessApi.create(form);
      addBusiness(data.business);
      toast.success('Business created!');
      navigate('/dashboard');
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to create business');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg animate-slide-up">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 bg-brand-600/20 rounded-2xl">
            <Building2 size={24} className="text-brand-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Set up your business</h1>
            <p className="text-sm text-slate-500">Step {step} of 2 — {step === 1 ? 'Business info' : 'Address & contact'}</p>
          </div>
        </div>

        {/* Progress */}
        <div className="flex gap-2 mb-8">
          {[1,2].map(s => (
            <div key={s} className={`h-1 flex-1 rounded-full transition-all ${s <= step ? 'bg-brand-500' : 'bg-surface-700'}`} />
          ))}
        </div>

        <div className="card p-6">
          {step === 1 ? (
            <div className="space-y-4">
              <Input label="Business Name *" placeholder="Shree Ram Traders" value={form.name} onChange={set('name')} />
              <Input label="Legal / Registered Name" placeholder="Same as above if not different" value={form.legalName} onChange={set('legalName')} />
              <Select label="Business Type" value={form.businessType} onChange={set('businessType')}>
                <option value="proprietorship">Proprietorship</option>
                <option value="partnership">Partnership</option>
                <option value="llp">LLP</option>
                <option value="pvt_ltd">Private Limited</option>
                <option value="ltd">Public Limited</option>
                <option value="huf">HUF</option>
                <option value="trust">Trust</option>
                <option value="other">Other</option>
              </Select>
              <Input label="GST Number" placeholder="27AABCU9603R1ZM" value={form.gstNumber} onChange={e => setForm(f => ({ ...f, gstNumber: e.target.value.toUpperCase() }))} />
              <Input label="PAN Number"  placeholder="AABCU9603R" value={form.panNumber} onChange={e => setForm(f => ({ ...f, panNumber: e.target.value.toUpperCase() }))} />
              <Button variant="primary" className="w-full" iconRight={ArrowRight} onClick={() => setStep(2)}>
                Continue
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Input label="Address"     placeholder="123, Main Market" value={form.addressLine1} onChange={set('addressLine1')} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="City"    placeholder="Pune"   value={form.city}    onChange={set('city')} />
                <Input label="Pincode" placeholder="411001" value={form.pincode} onChange={set('pincode')} />
              </div>
              <Select label="State" value={form.state} onChange={setStateCode}>
                <option value="">Select state</option>
                {INDIAN_STATES.map(s => <option key={s.code} value={s.name}>{s.name}</option>)}
              </Select>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Phone"  type="tel"   placeholder="9876543210" value={form.phone} onChange={set('phone')} />
                <Input label="Email"  type="email" placeholder="info@business.com" value={form.email} onChange={set('email')} />
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1">Back</Button>
                <Button variant="primary" onClick={handleSubmit} loading={loading} className="flex-1">
                  Create Business
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
