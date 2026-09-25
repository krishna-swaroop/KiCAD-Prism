import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  root: __dirname,
  base: "/remote-provider/assets/",
  build: {
    outDir: path.resolve(__dirname, "dist/remote_provider"),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, "panel.html"),
      output: {
        entryFileNames: "panel.js",
        // The panel entry bundle keeps fixed names (versioned server-side via
        // ?v=<digest>); every other asset gets a content hash so font/image
        // URLs inside panel.css are immutable and cache-safe forever.
        assetFileNames: (info) => {
          const name = info.names?.[0] ?? info.name ?? ""
          return name.endsWith(".css") ? "panel.css" : "[name]-[hash][extname]"
        },
        chunkFileNames: "panel-[name]-[hash].js",
      },
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
      "/oauth": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
})
