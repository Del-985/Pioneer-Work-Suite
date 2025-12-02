import axios from "axios";

// For v1, we hardcode the backend API base URL.
// This avoids any env/config issues in GitHub Pages.
const API_BASE_URL = "https://pioneer-work-suite.onrender.com";

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