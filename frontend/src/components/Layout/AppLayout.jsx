import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FileText, ShoppingCart, Users, Package,
  BarChart3, Settings, LogOut, ChevronDown, Menu, X,
  Wallet, BookOpen, Building2, PlusCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { classNames } from '../../utils/helpers';
import toast from 'react-hot-toast';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/sales',     label: 'Sales',     icon: FileText },
  { to: '/purchases', label: 'Purchases', icon: ShoppingCart },
  { to: '/parties',   label: 'Parties',   icon: Users },
  { to: '/items',     label: 'Items',     icon: Package },
  { to: '/expenses',  label: 'Expenses',  icon: Wallet },
  { to: '/vouchers',  label: 'Vouchers',  icon: BookOpen },
  { to: '/reports',   label: 'Reports',   icon: BarChart3 },
  { to: '/settings',  label: 'Settings',  icon: Settings },
];

const BOTTOM_NAV = [
  { to: '/dashboard', label: 'Home',    icon: LayoutDashboard },
  { to: '/sales',     label: 'Sales',   icon: FileText },
  { to: '/parties',   label: 'Parties', icon: Users },
  { to: '/reports',   label: 'Reports', icon: BarChart3 },
  { to: '/settings',  label: 'More',    icon: Settings },
];

// ── Sidebar ────────────────────────────────────────────────
const Sidebar = ({ collapsed, onToggle }) => {
  const { user, activeBiz, businesses, switchBusiness, logout } = useAuth();
  const [bizOpen, setBizOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
    toast.success('Logged out');
  };

  return (
    <aside className={classNames(
      'hidden md:flex flex-col bg-surface-900 border-r border-surface-700 transition-all duration-200 flex-shrink-0',
      collapsed ? 'w-16' : 'w-56'
    )}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-3 py-4 border-b border-surface-700">
        <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center flex-shrink-0 shadow-glow">
          <span className="text-white font-black text-sm">V</span>
        </div>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white truncate">Vyapari</p>
            <p className="text-xs text-slate-500 truncate">{activeBiz?.name || 'No business'}</p>
          </div>
        )}
        <button onClick={onToggle} className="p-1 rounded hover:bg-surface-700 text-slate-500">
          <Menu size={15} />
        </button>
      </div>

      {/* Business switcher */}
      {!collapsed && businesses.length > 0 && (
        <div className="px-2 py-2 border-b border-surface-700">
          <button
            onClick={() => setBizOpen(p => !p)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-700 transition-colors"
          >
            <Building2 size={13} className="text-slate-400" />
            <span className="flex-1 text-xs text-slate-300 truncate text-left">{activeBiz?.name}</span>
            <ChevronDown size={11} className={classNames('text-slate-500 transition-transform', bizOpen && 'rotate-180')} />
          </button>
          {bizOpen && (
            <div className="mt-1 space-y-0.5 pl-1">
              {businesses.map(b => (
                <button key={b.id} onClick={() => { switchBusiness(b); setBizOpen(false); }}
                  className={classNames('w-full text-left text-xs px-2 py-1.5 rounded hover:bg-surface-700 truncate',
                    b.id === activeBiz?.id ? 'text-brand-400' : 'text-slate-400')}
                >{b.name}</button>
              ))}
              <button onClick={() => navigate('/businesses/new')}
                className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-surface-700 text-slate-500 flex items-center gap-1.5">
                <PlusCircle size={11} /> Add business
              </button>
            </div>
          )}
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to}
            className={({ isActive }) => classNames(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              isActive ? 'bg-brand-900/40 text-brand-400 border border-brand-800/40' : 'text-slate-400 hover:bg-surface-700 hover:text-slate-200'
            )}>
            <Icon size={15} className="flex-shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      {!collapsed && (
        <div className="px-2 py-3 border-t border-surface-700">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <div className="w-7 h-7 bg-brand-700 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-bold">{user?.name?.[0]?.toUpperCase()}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-200 truncate">{user?.name}</p>
              <p className="text-xs text-slate-500 truncate">{user?.email}</p>
            </div>
            <button onClick={handleLogout} className="p-1.5 rounded hover:bg-surface-700 text-slate-500 hover:text-red-400">
              <LogOut size={13} />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
};

// ── Mobile Drawer ──────────────────────────────────────────
const MobileDrawer = ({ open, onClose }) => {
  const { user, activeBiz, businesses, switchBusiness, logout } = useAuth();
  const navigate = useNavigate();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute left-0 top-0 bottom-0 w-64 bg-surface-900 border-r border-surface-700 flex flex-col animate-slide-up">
        <div className="flex items-center justify-between px-4 py-4 border-b border-surface-700">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-brand-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-black text-xs">V</span>
            </div>
            <p className="text-sm font-bold text-white">{activeBiz?.name || 'Vyapari'}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-surface-700 text-slate-400"><X size={16} /></button>
        </div>

        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} onClick={onClose}
              className={({ isActive }) => classNames(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive ? 'bg-brand-900/30 text-brand-400' : 'text-slate-400 hover:bg-surface-700'
              )}>
              <Icon size={16} />{label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-3 border-t border-surface-700">
          <div className="flex items-center gap-2 px-2">
            <div className="w-7 h-7 bg-brand-700 rounded-full flex items-center justify-center">
              <span className="text-white text-xs font-bold">{user?.name?.[0]?.toUpperCase()}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-200 truncate">{user?.name}</p>
            </div>
            <button onClick={async () => { await logout(); navigate('/login'); }}
              className="p-1.5 rounded hover:bg-surface-700 text-red-400">
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Bottom Nav ─────────────────────────────────────────────
const BottomNav = () => (
  <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface-900 border-t border-surface-700 flex safe-area-inset-bottom">
    {BOTTOM_NAV.map(({ to, label, icon: Icon }) => (
      <NavLink key={to} to={to}
        className={({ isActive }) => classNames(
          'flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs transition-colors',
          isActive ? 'text-brand-400' : 'text-slate-500'
        )}>
        <Icon size={19} />
        <span className="font-medium">{label}</span>
      </NavLink>
    ))}
  </nav>
);

// ── Main Layout ────────────────────────────────────────────
export const AppLayout = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(p => !p)} />
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile topbar */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-surface-900 border-b border-surface-700 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-brand-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-black text-xs">V</span>
            </div>
            <p className="text-sm font-bold text-white">Vyapari</p>
          </div>
          <button onClick={() => setDrawerOpen(true)} className="p-2 rounded-lg hover:bg-surface-700 text-slate-400">
            <Menu size={18} />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto pb-20 md:pb-0 bg-surface-950">
          <div className="max-w-7xl mx-auto px-3 py-3 md:px-6 md:py-5">
            {children}
          </div>
        </main>

        <BottomNav />
      </div>
    </div>
  );
};
