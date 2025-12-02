import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL;

if (!API_BASE_URL) {
  // Not fatal for build, but will make API calls fail at runtime.
  // This is just a warning in the console.
  console.warn(
    "VITE_API_URL is not set. API requests from the frontend will fail until it is configured."
  );
}

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