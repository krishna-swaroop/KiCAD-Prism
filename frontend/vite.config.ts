import { execFileSync } from "node:child_process"
import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

function git(...args: string[]): string | undefined {
  try {
    return execFileSync("git", args, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || undefined
  } catch {
    return undefined
  }
}

// Image builds pass PRISM_* as build args. A checkout built without them (the
// dev server, `npm run build`) asks git, so a bug report from a source build
// still names the commit it came from.
function dirty(): boolean {
  try {
    execFileSync("git", ["diff", "--quiet", "HEAD"], { stdio: "ignore" })
    return false
  } catch {
    return true
  }
}

const head = git("rev-parse", "HEAD")
const prismBuild = {
  release: process.env.PRISM_RELEASE || git("describe", "--tags", "--always", "--dirty") || "development",
  // Marked -dirty like the image builds, so a source build and an image built
  // from the same working tree report the same revision.
  revision: process.env.PRISM_REVISION || (head ? `${head}${dirty() ? "-dirty" : ""}` : "unknown"),
  buildDate: process.env.PRISM_BUILD_DATE || new Date().toISOString().replace(/\.\d+Z$/, "Z"),
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __PRISM_BUILD__: JSON.stringify(prismBuild),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        ws: true,
        // Forward the browser's origin so absolute URLs the API builds (the
        // OAuth redirect URI) point at the dev server, not the proxied port.
        xfwd: true,
      },
      // The OAuth surface is on the backend too: the provider flow KiCad's Remote
      // Symbols panel uses, and the session handoff behind "Continue as <user>".
      // vite.config.panel.ts has always proxied both; this one only had /api, so
      // every /oauth/* request through the dev server 404d.
      "/oauth": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
      // The Remote Symbols panel is a separate app the backend serves, and the
      // provider metadata points KiCad at PUBLIC_BASE_URL, which in dev is this
      // server. Without this, /remote-provider/panel hit the SPA catch-all and
      // KiCad opened the main web UI instead of the panel.
      "/remote-provider": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
      // The discovery document KiCad reads before anything else, to find
      // panel_url and the auth metadata. It is on the backend as well.
      "/.well-known": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/react-router") ||
            id.includes("node_modules/scheduler/")
          ) {
            return "framework"
          }
          if (
            id.includes("node_modules/react-markdown") ||
            id.includes("node_modules/remark-gfm") ||
            id.includes("node_modules/rehype-raw") ||
            id.includes("node_modules/github-markdown-css")
          ) {
            return "markdown-runtime"
          }
          if (
            id.includes("node_modules/@radix-ui/") ||
            id.includes("node_modules/radix-ui/") ||
            id.includes("node_modules/sonner")
          ) {
            return "ui-runtime"
          }
          if (
            id.includes("node_modules/@tiptap/") ||
            id.includes("node_modules/prosemirror-") ||
            id.includes("node_modules/linkifyjs") ||
            id.includes("node_modules/marked") ||
            id.includes("node_modules/orderedmap") ||
            id.includes("node_modules/rope-sequence") ||
            id.includes("node_modules/w3c-keyname")
          ) {
            return "editor-runtime"
          }
          if (id.includes("node_modules/lucide-react")) {
            return "icons-runtime"
          }
          if (id.includes("node_modules/online-3d-viewer")) {
            return "viewer3d-runtime"
          }
          if (id.includes("node_modules/three")) {
            return "three-runtime"
          }
          // System Builder's diagram canvas; loaded only with that tab.
          if (
            id.includes("node_modules/@xyflow/") ||
            id.includes("node_modules/d3-") ||
            id.includes("node_modules/zustand") ||
            id.includes("node_modules/classcat")
          ) {
            return "diagram-runtime"
          }
          if (id.includes("node_modules")) {
            return "vendor"
          }
        },
      },
    },
  },
})
