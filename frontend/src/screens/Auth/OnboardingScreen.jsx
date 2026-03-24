import React, { useState, useEffect } from "react";
import { useNavigate } from 'react-router-dom';
import { Building2, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { businessApi } from '../../services/api';
import { Button, Input, Select } from '../../components/UI';
import { INDIAN_STATES } from '../../utils/constants';
import toast from 'react-hot-toast';

export default function OnboardingScreen() {

  // 🚀 AUTO SKIP LOGIN + ONBOARDING
  useEffect(() => {
    window.location.href = "/dashboard";
  }, []);

  const { addBusiness } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
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
    if (!form.name.trim()) {
      toast.error('Business name is required');
      return;
    }

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
      <div className="w-full max-w-lg">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 bg-brand-600/20 rounded-2xl">
            <Building2 size={24} className="text-brand-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Set up your business</h1>
            <p className="text-sm text-slate-500">Step {step} of 2</p>
          </div>
        </div>

        <div className="card p-6">
          <p className="text-center text-white">Redirecting to Dashboard...</p>
        </div>
      </div>
    </div>
  );
}
