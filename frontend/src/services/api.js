import axios from "axios";

const API_URL = "https://vyapari11.onrender.com";

const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// ✅ token attach
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ✅ ADD THIS LINE (VERY IMPORTANT)
export const authApi = api;

export default api;
