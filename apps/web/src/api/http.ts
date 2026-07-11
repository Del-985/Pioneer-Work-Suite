// apps/web/src/api/http.ts

import axios, {
  AxiosError,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";

import {
  hasCloudSession,
  invalidateCloudSession,
} from "./session";

// For v1, the backend API base URL remains fixed for desktop and Pages builds.
const API_BASE_URL = "https://pioneer-work-suite.onrender.com";

export const http = axios.create({
  baseURL: API_BASE_URL,
});

// Attach Authorization header if a cloud token is present.
http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (typeof window !== "undefined") {
    const token = window.localStorage.getItem("token");

    if (token) {
      config.headers = config.headers ?? {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  }

  return config;
});

/*
 * A rejected existing token must not leave the app reporting that cloud sync
 * is connected. Data APIs may still queue the attempted write locally, while
 * the session layer moves the UI into a reconnect-required state.
 */
http.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError<any>) => {
    const status = error?.response?.status;

    if ((status === 401 || status === 403) && hasCloudSession()) {
      const serverMessage = error?.response?.data?.error;

      invalidateCloudSession(
        typeof serverMessage === "string" && serverMessage.trim()
          ? serverMessage
          : "Your cloud session expired. Reconnect to resume syncing."
      );
    }

    return Promise.reject(error);
  }
);
