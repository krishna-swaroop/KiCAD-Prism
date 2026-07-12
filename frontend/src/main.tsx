import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"
import prismFavicon from "./assets/branding/kicad-prism/kicad-prism-favicon.ico"

const faviconLink = document.querySelector("link[rel='icon']") ?? document.createElement("link")
faviconLink.setAttribute("rel", "icon")
faviconLink.setAttribute("type", "image/x-icon")
faviconLink.setAttribute("href", prismFavicon)
if (!faviconLink.parentNode) {
  document.head.appendChild(faviconLink)
}

// TEMP [crash-diag] — surface any uncaught error/rejection with a full stack so
// a blank-page crash prints its cause. Remove after diagnosing the tab-switch crash.
window.addEventListener("error", (e) => {
  console.error("[crash-diag] window error:", e.message, "\n", e.error?.stack ?? e.error ?? e);
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("[crash-diag] unhandled rejection:", e.reason?.stack ?? e.reason ?? e);
});

createRoot(document.getElementById("root")!).render(
  <App />
)
