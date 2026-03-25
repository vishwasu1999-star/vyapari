import axios from "axios";

const API_URL = "https://vyapari11.onrender.com";

const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// ✅ ADD THIS (IMPORTANT)
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token"); // or accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
