import axios from 'axios';
import toast  from 'react-hot-toast';

// ============================================================
// AXIOS INSTANCE
// ============================================================
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Request interceptor: attach access token ───────────────
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (err) => Promise.reject(err)
);

// ── Response interceptor: handle 401 → refresh token ───────
let isRefreshing = false;
let failedQueue  = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else       prom.resolve(token);
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const originalRequest = err.config;

    if (err.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) {
        isRefreshing = false;
        window.location.href = '/login';
        return Promise.reject(err);
      }

      try {
        const { data } = await axios.post('/api/auth/refresh', { refreshToken });
        localStorage.setItem('accessToken',  data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);
        api.defaults.headers.common.Authorization = `Bearer ${data.accessToken}`;
        processQueue(null, data.accessToken);
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(originalRequest);
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        window.location.href = '/login';
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    // Display error toast for server errors (except 401 handled above)
    if (err.response?.status >= 500) {
      toast.error('Server error. Please try again.');
    }

    return Promise.reject(err);
  }
);

// ============================================================
// AUTH
// ============================================================
export const authApi = {
  register: (data)          => api.post('/auth/register', data),
  login:    (email, pass)   => api.post('/auth/login', { email, password: pass }),
  logout:   (refreshToken)  => api.post('/auth/logout', { refreshToken }),
  refresh:  (refreshToken)  => api.post('/auth/refresh', { refreshToken }),
  me:       ()              => api.get('/auth/me'),
  changePassword: (data)    => api.put('/auth/change-password', data),
};

// ============================================================
// BUSINESSES
// ============================================================
export const businessApi = {
  list:   ()           => api.get('/businesses'),
  get:    (id)         => api.get(`/businesses/${id}`),
  create: (data)       => api.post('/businesses', data),
  update: (id, data)   => api.put(`/businesses/${id}`, data),
};

// ============================================================
// PARTIES
// ============================================================
export const partyApi = {
  list:   (bId, params) => api.get(`/businesses/${bId}/parties`, { params }),
  get:    (bId, id)     => api.get(`/businesses/${bId}/parties/${id}`),
  create: (bId, data)   => api.post(`/businesses/${bId}/parties`, data),
  update: (bId, id, d)  => api.put(`/businesses/${bId}/parties/${id}`, d),
  delete: (bId, id)     => api.delete(`/businesses/${bId}/parties/${id}`),
};

// ============================================================
// ITEMS
// ============================================================
export const itemApi = {
  list:        (bId, params) => api.get(`/businesses/${bId}/items`, { params }),
  get:         (bId, id)     => api.get(`/businesses/${bId}/items/${id}`),
  create:      (bId, data)   => api.post(`/businesses/${bId}/items`, data),
  update:      (bId, id, d)  => api.put(`/businesses/${bId}/items/${id}`, d),
  delete:      (bId, id)     => api.delete(`/businesses/${bId}/items/${id}`),
  adjustStock: (bId, id, d)  => api.patch(`/businesses/${bId}/items/${id}/stock`, d),
};

// ============================================================
// INVOICES
// ============================================================
export const invoiceApi = {
  list:    (bId, params) => api.get(`/businesses/${bId}/invoices`, { params }),
  summary: (bId, params) => api.get(`/businesses/${bId}/invoices/summary`, { params }),
  get:     (bId, id)     => api.get(`/businesses/${bId}/invoices/${id}`),
  create:  (bId, data)   => api.post(`/businesses/${bId}/invoices`, data),
  update:  (bId, id, d)  => api.patch(`/businesses/${bId}/invoices/${id}`, d),
  cancel:  (bId, id, r)  => api.delete(`/businesses/${bId}/invoices/${id}`, { data: { reason: r } }),
  pdfData: (bId, id)     => api.get(`/businesses/${bId}/invoices/${id}/pdf-data`),
};

// ============================================================
// PAYMENTS
// ============================================================
export const paymentApi = {
  list:   (bId, params) => api.get(`/businesses/${bId}/payments`, { params }),
  get:    (bId, id)     => api.get(`/businesses/${bId}/payments/${id}`),
  create: (bId, data)   => api.post(`/businesses/${bId}/payments`, data),
};

// ============================================================
// ACCOUNTS
// ============================================================
export const accountApi = {
  list:   (bId, params) => api.get(`/businesses/${bId}/accounts`, { params }),
  get:    (bId, id)     => api.get(`/businesses/${bId}/accounts/${id}`),
  create: (bId, data)   => api.post(`/businesses/${bId}/accounts`, data),
  update: (bId, id, d)  => api.put(`/businesses/${bId}/accounts/${id}`, d),
};

// ============================================================
// VOUCHERS
// ============================================================
export const voucherApi = {
  list:   (bId, params) => api.get(`/businesses/${bId}/vouchers`, { params }),
  get:    (bId, id)     => api.get(`/businesses/${bId}/vouchers/${id}`),
  create: (bId, data)   => api.post(`/businesses/${bId}/vouchers`, data),
};

// ============================================================
// EXPENSES
// ============================================================
export const expenseApi = {
  list:   (bId, params) => api.get(`/businesses/${bId}/expenses`, { params }),
  create: (bId, data)   => api.post(`/businesses/${bId}/expenses`, data),
};

// ============================================================
// REPORTS
// ============================================================
export const reportApi = {
  dashboard:     (bId)         => api.get(`/businesses/${bId}/reports/dashboard`),
  trialBalance:  (bId, params) => api.get(`/businesses/${bId}/reports/trial-balance`, { params }),
  profitLoss:    (bId, params) => api.get(`/businesses/${bId}/reports/profit-loss`, { params }),
  balanceSheet:  (bId, params) => api.get(`/businesses/${bId}/reports/balance-sheet`, { params }),
  dayBook:       (bId, params) => api.get(`/businesses/${bId}/reports/day-book`, { params }),
  gst:           (bId, params) => api.get(`/businesses/${bId}/reports/gst`, { params }),
  cashBook:      (bId, params) => api.get(`/businesses/${bId}/reports/cash-book`, { params }),
  accountLedger: (bId, accId, params) => api.get(`/businesses/${bId}/reports/account-ledger/${accId}`, { params }),
};

export default api;
