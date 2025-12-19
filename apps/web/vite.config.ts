// apps/web/vite.config.ts
/// <reference types="vite/client" />

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

const isTauri = !!process.env.TAURI_PLATFORM;

export default defineConfig(() => ({
  plugins: [react()],

  // For normal web builds: base "/"
  // For Tauri desktop builds: base "./" so assets resolve correctly
  base: isTauri ? "./" : "/",

  server: {
    port: 5173,
    strictPort: true,
    host: "127.0.0.1",
  },

  build: {
    // Tauri's recommended targets when bundling for desktop
    target: isTauri
      ? ["es2021", "chrome97", "safari13"]
      : "esnext",

    minify: process.env.TAURI_DEBUG ? false : "esbuild",
    sourcemap: !!process.env.TAURI_DEBUG,

    outDir: "dist",
    emptyOutDir: true,
  },
}));