// apps/web/vite.config.ts
/// <reference types="vite/client" />

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

// Are we building for Tauri (desktop)?
const isTauri = !!process.env.TAURI_PLATFORM;

// IMPORTANT: GitHub Pages project base.
// If the repo is `Pioneer-Work-Suite`, Pages serves at
//   https://del-985.github.io/Pioneer-Work-Suite/
// so our base must include that subpath.
const GH_REPO_BASE = "/Pioneer-Work-Suite/";

export default defineConfig(() => ({
  plugins: [react()],

  // For desktop (Tauri): use relative base so files load from the bundle.
  // For web (GitHub Pages): point at the repo subpath.
  base: isTauri ? "./" : GH_REPO_BASE,

  server: {
    port: 5173,
    strictPort: true,
    host: "127.0.0.1",
  },

  build: {
    target: isTauri
      ? ["es2021", "chrome97", "safari13"]
      : "esnext",

    minify: process.env.TAURI_DEBUG ? false : "esbuild",
    sourcemap: !!process.env.TAURI_DEBUG,

    outDir: "dist",
    emptyOutDir: true,
  },
}));