import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"
import { ErrorBoundary } from "./components/error-boundary.tsx"
import prismFavicon from "./assets/branding/kicad-prism/kicad-prism-favicon.ico"

const faviconLink = document.querySelector("link[rel='icon']") ?? document.createElement("link")
faviconLink.setAttribute("rel", "icon")
faviconLink.setAttribute("type", "image/x-icon")
faviconLink.setAttribute("href", prismFavicon)
if (!faviconLink.parentNode) {
  document.head.appendChild(faviconLink)
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* Last resort only. Anything that reaches here has already cost the
        reviewer the whole window, so the boundaries that matter are the ones
        around each panel further down the tree. */}
    <ErrorBoundary label="KiCAD Prism">
      <App />
    </ErrorBoundary>
  </StrictMode>
)
