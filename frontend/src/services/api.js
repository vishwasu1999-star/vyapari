import axios from "axios";

const API_URL = "https://vyapari11.onrender.com";

const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Attach token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ✅ EXPORT ALL (FINAL PERMANENT FIX)
export const authApi = api;
export const businessApi = api;
export const partyApi = api;
export const invoiceApi = api;
export const itemApi = api;
export const expenseApi = api;
export const reportApi = api;
export const accountApi = api;   // ✅ THIS FIXES CURRENT ERROR
export const paymentApi = api;
export const userApi = api;

export default api;
