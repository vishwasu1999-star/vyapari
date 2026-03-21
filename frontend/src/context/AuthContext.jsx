import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi, businessApi } from '../services/api';
import toast from 'react-hot-toast';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user,       setUser]       = useState(null);
  const [businesses, setBusinesses] = useState([]);
  const [activeBiz,  setActiveBiz]  = useState(null);  // currently selected business
  const [loading,    setLoading]    = useState(true);

  // ── Restore session from localStorage ──────────────────────
  useEffect(() => {
    const restore = async () => {
      const token = localStorage.getItem('accessToken');
      if (!token) { setLoading(false); return; }

      try {
        const { data } = await authApi.me();
        setUser(data.user);
        if (data.user.businesses?.length) {
          setBusinesses(data.user.businesses);
          // Restore last used business
          const lastBizId = localStorage.getItem('activeBizId');
          const found = data.user.businesses.find(b => b.id === lastBizId)
                     || data.user.businesses[0];
          setActiveBiz(found);
        }
      } catch {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
      } finally {
        setLoading(false);
      }
    };
    restore();
  }, []);

  // ── Login ──────────────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    const { data } = await authApi.login(email, password);
    localStorage.setItem('accessToken',  data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    setUser(data.user);

    // Fetch businesses
    const bizRes = await businessApi.list();
    setBusinesses(bizRes.data.businesses || []);
    if (bizRes.data.businesses?.length) {
      const biz = bizRes.data.businesses[0];
      setActiveBiz(biz);
      localStorage.setItem('activeBizId', biz.id);
    }
    return data.user;
  }, []);

  // ── Register ───────────────────────────────────────────────
  const register = useCallback(async (name, email, password) => {
    const { data } = await authApi.register({ name, email, password });
    localStorage.setItem('accessToken',  data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    setUser(data.user);
    return data.user;
  }, []);

  // ── Logout ─────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try {
      await authApi.logout(localStorage.getItem('refreshToken'));
    } catch { /* ignore */ }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('activeBizId');
    setUser(null);
    setBusinesses([]);
    setActiveBiz(null);
  }, []);

  // ── Switch business ────────────────────────────────────────
  const switchBusiness = useCallback((biz) => {
    setActiveBiz(biz);
    localStorage.setItem('activeBizId', biz.id);
  }, []);

  // ── Add new business to list ───────────────────────────────
  const addBusiness = useCallback((biz) => {
    setBusinesses(prev => [...prev, biz]);
    setActiveBiz(biz);
    localStorage.setItem('activeBizId', biz.id);
  }, []);

  const value = {
    user, businesses, activeBiz,
    loading, isAuthenticated: !!user,
    login, register, logout, switchBusiness, addBusiness,
    bizId: activeBiz?.id || null,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
