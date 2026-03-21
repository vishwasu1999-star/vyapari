import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { TrendingUp, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button, Input } from '../../components/UI';
import toast from 'react-hot-toast';

// ============================================================
// LOGIN SCREEN
// ============================================================
export function LoginScreen() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const [form,    setForm]    = useState({ email: '', password: '' });
  const [show,    setShow]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors,  setErrors]  = useState({});

  const validate = () => {
    const e = {};
    if (!form.email)    e.email    = 'Email is required';
    if (!form.password) e.password = 'Password is required';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      await login(form.email, form.password);
      navigate('/dashboard');
    } catch (err) {
      const msg = err?.response?.data?.error || 'Login failed';
      toast.error(msg);
      setErrors({ password: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <h1 className="text-2xl font-bold text-slate-100 mb-1">Welcome back</h1>
      <p className="text-sm text-slate-500 mb-6">Sign in to your Vyapari account</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={form.email}
          onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
          error={errors.email}
          autoComplete="email"
        />
        <div className="flex flex-col gap-1">
          <Input
            label="Password"
            type={show ? 'text' : 'password'}
            placeholder="••••••••"
            value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            error={errors.password}
            autoComplete="current-password"
          />
          <button type="button" onClick={() => setShow(s => !s)}
            className="self-end text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1">
            {show ? <EyeOff size={12} /> : <Eye size={12} />} {show ? 'Hide' : 'Show'} password
          </button>
        </div>

        <Button type="submit" variant="primary" className="w-full" loading={loading}
          iconRight={ArrowRight}>
          Sign In
        </Button>
      </form>

      <p className="text-center text-sm text-slate-500 mt-6">
        Don't have an account?{' '}
        <Link to="/register" className="text-brand-400 hover:text-brand-300 font-semibold">Register free</Link>
      </p>

      {/* Demo hint */}
      <div className="mt-4 p-3 bg-surface-700/40 rounded-xl border border-surface-700 text-xs text-slate-500 text-center">
        Demo: <span className="font-mono text-slate-400">demo@vyapari.app</span> / <span className="font-mono text-slate-400">Password@123</span>
      </div>
    </AuthShell>
  );
}

// ============================================================
// REGISTER SCREEN
// ============================================================
export function RegisterScreen() {
  const { register } = useAuth();
  const navigate     = useNavigate();
  const [form,    setForm]    = useState({ name: '', email: '', password: '', confirm: '' });
  const [show,    setShow]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors,  setErrors]  = useState({});

  const validate = () => {
    const e = {};
    if (!form.name.trim())        e.name     = 'Name is required';
    if (!form.email)              e.email    = 'Email is required';
    if (form.password.length < 8) e.password = 'Minimum 8 characters';
    if (!/[A-Z]/.test(form.password)) e.password = 'Must include an uppercase letter';
    if (!/[0-9]/.test(form.password)) e.password = 'Must include a number';
    if (form.password !== form.confirm) e.confirm = 'Passwords do not match';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      await register(form.name, form.email, form.password);
      toast.success('Account created!');
      navigate('/onboarding');
    } catch (err) {
      const msg = err?.response?.data?.error || 'Registration failed';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const f = (k) => ({ value: form[k], onChange: e => setForm(p => ({ ...p, [k]: e.target.value })), error: errors[k] });

  return (
    <AuthShell>
      <h1 className="text-2xl font-bold text-slate-100 mb-1">Create account</h1>
      <p className="text-sm text-slate-500 mb-6">Start managing your business finances for free</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Full Name"       type="text"     placeholder="Rajesh Kumar"         {...f('name')} />
        <Input label="Email"           type="email"    placeholder="you@example.com"       {...f('email')} autoComplete="email" />
        <Input label="Password"        type={show ? 'text' : 'password'} placeholder="Min 8 chars, 1 uppercase, 1 number" {...f('password')} autoComplete="new-password" />
        <Input label="Confirm Password" type={show ? 'text' : 'password'} placeholder="Repeat password" {...f('confirm')} />

        <button type="button" onClick={() => setShow(s => !s)}
          className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1">
          {show ? <EyeOff size={12} /> : <Eye size={12} />} {show ? 'Hide' : 'Show'} passwords
        </button>

        <Button type="submit" variant="primary" className="w-full" loading={loading} iconRight={ArrowRight}>
          Create Account
        </Button>
      </form>

      <p className="text-center text-sm text-slate-500 mt-6">
        Already registered?{' '}
        <Link to="/login" className="text-brand-400 hover:text-brand-300 font-semibold">Sign in</Link>
      </p>
    </AuthShell>
  );
}

// ============================================================
// SHARED WRAPPER
// ============================================================
function AuthShell({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-950 p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-glow">
            <TrendingUp size={20} className="text-white" />
          </div>
          <div>
            <span className="text-xl font-bold text-slate-100">Vyapari</span>
            <span className="block text-[10px] text-slate-500">Business Accounting</span>
          </div>
        </div>

        <div className="card p-6 animate-slide-up">{children}</div>
      </div>
    </div>
  );
}
