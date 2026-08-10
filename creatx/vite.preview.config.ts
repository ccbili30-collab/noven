import { resolve } from "node:path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  root: resolve("apps/desktop/renderer"),
  base: "./",
  publicDir: resolve("apps/art-library/public"),
  plugins: [react()],
  build: {
    outDir: resolve("out/web-preview"),
    emptyOutDir: true,
    rollupOptions: { input: resolve("apps/desktop/renderer/preview.html") },
  },
})
