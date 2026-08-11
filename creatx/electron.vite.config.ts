import { resolve } from "node:path"
import react from "@vitejs/plugin-react"
import { defineConfig, externalizeDepsPlugin } from "electron-vite"

const internalPackages = [
  "@creatx/art-library-runtime",
  "@creatx/contracts",
  "@creatx/cline-adapter",
  "@creatx/cline-adapter/contracts",
  "@creatx/creative-skills",
  "@creatx/growth-runtime",
  "@creatx/image-runtime",
  "@creatx/image-runtime/queue",
  "@creatx/live-archive-runtime",
  "@creatx/model-settings",
  "@creatx/project-files",
  "@creatx/session-runtime",
  "@creatx/video-runtime",
  "@creatx/workbench",
  "@creatx/world-blueprint",
]

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: internalPackages })],
    build: {
      rollupOptions: {
        input: {
          main: resolve("apps/desktop/src/main.ts"),
          "cline-runtime": resolve("apps/desktop/src/cline-runtime.ts"),
          "douyin-bridge": resolve("apps/desktop/src/douyin-bridge.ts"),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ["@creatx/contracts"] })],
    build: {
      rollupOptions: {
        input: resolve("apps/desktop/src/preload.ts"),
        output: { format: "cjs", entryFileNames: "preload-[hash].cjs" },
      },
    },
  },
  renderer: {
    root: resolve("apps/desktop/renderer"),
    publicDir: resolve("apps/art-library/public"),
    plugins: [react()],
    build: { rollupOptions: { input: resolve("apps/desktop/renderer/index.html") } },
  },
})
