import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  plugins: [react()],
  base: "/Pioneer-Work-Suite/", // 👈 important for GitHub Pages
});