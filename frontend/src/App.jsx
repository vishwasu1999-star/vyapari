import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppLayout } from './components/Layout/AppLayout';
import { startBackgroundSync } from './services/syncEngine';
import { PageLoader } from './components/UI';

// Screens
import { LoginScreen, RegisterScreen } from './screens/Auth';
import OnboardingScreen from './screens/Auth/OnboardingScreen';
import DashboardScreen  from './screens/Dashboard';
import SalesScreen      from './screens/Sales';
import PurchasesScreen  from './screens/Purchases';
import PartiesScreen    from './screens/Parties';
import ItemsScreen      from './screens/Items';
import ExpensesScreen   from './screens/Expenses';
import VouchersScreen   from './screens/Vouchers';
import ReportsScreen    from './screens/Reports';
import SettingsScreen   from './screens/Settings';
import InvoiceDetail    from './components/Invoice/InvoiceDetail';

// ── Protected wrapper ──────────────────────────────────────
function RequireAuth({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

// ── App shell with layout ──────────────────────────────────
function AppShell() {
  const { bizId } = useAuth();

  useEffect(() => {
    if (bizId) startBackgroundSync(bizId, 30000);
  }, [bizId]);

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}

// ── Router ─────────────────────────────────────────────────
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3500,
            style: {
              background: '#1e293b',
              color: '#f1f5f9',
              border: '1px solid #334155',
              borderRadius: '12px',
              fontSize: '13px',
            },
            success: { iconTheme: { primary: '#10b981', secondary: '#f1f5f9' } },
            error:   { iconTheme: { primary: '#ef4444', secondary: '#f1f5f9' } },
          }}
        />

        <Routes>
          {/* ── Public ──────────────────────────────────── */}
          <Route path="/login"      element={<LoginScreen />} />
          <Route path="/register"   element={<RegisterScreen />} />
          <Route path="/onboarding" element={<RequireAuth><OnboardingScreen /></RequireAuth>} />

          {/* ── Protected app ───────────────────────────── */}
          <Route element={<RequireAuth><AppShell /></RequireAuth>}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard"     element={<DashboardScreen />} />

            {/* Sales */}
            <Route path="sales"         element={<SalesScreen />} />
            <Route path="sales/:id"     element={<InvoiceDetail />} />

            {/* Purchases */}
            <Route path="purchases"     element={<PurchasesScreen />} />
            <Route path="purchases/:id" element={<InvoiceDetail />} />

            {/* Core modules */}
            <Route path="parties"       element={<PartiesScreen />} />
            <Route path="items"         element={<ItemsScreen />} />
            <Route path="expenses"      element={<ExpensesScreen />} />
            <Route path="vouchers"      element={<VouchersScreen />} />
            <Route path="reports"       element={<ReportsScreen />} />
            <Route path="settings"      element={<SettingsScreen />} />
          </Route>

          {/* ── Catch-all ───────────────────────────────── */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
