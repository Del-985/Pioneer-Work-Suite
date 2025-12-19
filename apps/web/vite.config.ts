// apps/web/vite.config.ts
/// <reference types="vite/client" />

import { defineConfig } from "vite";
// If your project uses "@vitejs/plugin-react-swc" instead, just change this import.
import react from "@vitejs/plugin-react";

const isTauri = !!process.env.TAURI_PLATFORM;

export default defineConfig(() => ({
  plugins: [react()],

  // IMPORTANT: make assets load correctly inside the packaged Tauri app.
  // - In Tauri builds, we use a relative base "./" so index.html references
  //   "assets/..." instead of "/assets/...".
  // - In normal web builds, we keep the usual SPA base "/".
  base: isTauri ? "./" : "/",

  server: {
    port: 5173,
    strictPort: true,
    host: "127.0.0.1",
  },

  build: {
    // Tauri webview targets (pulled from Tauri docs)
    target: isTauri
      ? ["es2021", "chrome97", "safari13"]
      : "esnext",

    minify: process.env.TAURI_DEBUG ? false : "esbuild",
    sourcemap: !!process.env.TAURI_DEBUG,

    outDir: "dist",
    emptyOutDir: true,
  },
}));