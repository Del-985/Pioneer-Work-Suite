import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL;

// Central axios instance for the whole app
export const http = axios.create({
  baseURL: API_BASE_URL,
});

// Attach Authorization header if we have a token
http.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = window.localStorage.getItem("token");
    if (token) {
      config.headers = config.headers ?? {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});