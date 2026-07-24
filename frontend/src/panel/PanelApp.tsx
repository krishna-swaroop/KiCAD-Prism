import { useCallback, useEffect, useRef, useState } from "react";

import { LogTerminal } from "@/panel/components/LogTerminal";
import {
  installBridge,
  waitForSession,
  getSourceInfo,
  triggerRemoteLogin,
  setLogCallback,
  hasSession,
} from "@/panel/lib/kicad-bridge";
import { getCategories, isAuthError, setApiToken } from "@/panel/lib/panel-api";
import type { PanelComponent } from "@/panel/lib/panel-api";
import type { FinderViewState } from "@/panel/lib/view-state";

import { PanelLoginScreen } from "@/panel/screens/PanelLoginScreen";
import { SymbolFinderScreen } from "@/panel/screens/SymbolFinderScreen";
import { CategoryListScreen } from "@/panel/screens/CategoryListScreen";
import { PartDetailScreen } from "@/panel/screens/PartDetailScreen";

type DetailReturnTarget =
  | { kind: "finder" }
  | { kind: "category"; name: string };

type Screen =
  | { kind: "login" }
  | { kind: "finder" }
  | { kind: "category"; name: string }
  | {
      kind: "detail";
      componentId: string;
      prefetched: PanelComponent | null;
      returnTo: DetailReturnTarget;
    };

export function PanelApp() {
  const [screen, setScreen] = useState<Screen>({ kind: "login" });
  const [finderView, setFinderView] = useState<FinderViewState>({
    query: "",
    searchResults: [],
  });
  const [logEntries, setLogEntries] = useState<string[]>([]);
  const [sessionReady, setSessionReady] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const initializedRef = useRef(false);

  const appendLog = useCallback((msg: string) => {
    const stamp = new Date().toLocaleTimeString();
    setLogEntries((prev) => [...prev, `[${stamp}] ${msg}`]);
  }, []);

  const clearLog = useCallback(() => setLogEntries([]), []);

  const testAuthAndRoute = useCallback(async () => {
    try {
      // This succeeds if we have a valid cookie session or valid token.
      await getCategories(undefined);
      appendLog("Session authenticated — entering finder.");
      setScreen({ kind: "finder" });
    } catch (err) {
      if (isAuthError(err)) {
        appendLog("Session not authenticated.");
        setScreen({ kind: "login" });
      } else {
        // API reachable but failed (e.g. network error, empty results). We still enter the app.
        appendLog(`API reachable — entering finder. (${(err as Error).message})`);
        setScreen({ kind: "finder" });
      }
    }
  }, [appendLog]);

  // ─── Initialize bridge ──────────────────────────────────────────

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    setLogCallback(appendLog);
    installBridge();

    (async () => {
      try {
        // 1. Start waiting for KiCad session in background
        waitForSession().then(async () => {
          setSessionReady(true);
          appendLog("KiCad session ready.");
          try {
            const sourceInfo = await getSourceInfo();
            const params = (sourceInfo.parameters || {}) as Record<string, unknown>;
            if (params.token) {
              setApiToken(params.token as string);
              appendLog("Extracted token from KiCad session.");
              // We got a new token, try routing again just in case we were stuck on login
              testAuthAndRoute();
            }
            if (params.auth_type === "oauth2" && !params.authenticated) {
              appendLog("KiCad reports authentication required.");
              // Only override to login if currently in finder (could wait for search failure)
            }
          } catch (e) {
            appendLog(`Source info error: ${(e as Error).message}`);
          }
        }).catch((err) => {
          appendLog(`KiCad init error: ${(err as Error).message}`);
        });

        // 2. Immediately check if we have a valid cookie session via the API
        await testAuthAndRoute();
      } catch (err) {
        appendLog(`Init error: ${(err as Error).message}`);
      }
    })();
  }, [appendLog, testAuthAndRoute]);

  // ─── Login handler ──────────────────────────────────────────────

  const handleLogin = useCallback(async () => {
    if (!hasSession()) {
      setLoginError("KiCad session not ready yet.");
      return;
    }
    setLoginLoading(true);
    setLoginError(null);
    try {
      const response = await triggerRemoteLogin();
      const params = (response.parameters || {}) as Record<string, unknown>;

      if (params.token) {
        setApiToken(params.token as string);
        appendLog("Extracted token from KiCad session after login.");
      }

      if (params.started) {
        appendLog("Login flow started in system browser.");
        setLoginError(null);
        // KiCad will reload the panel after auth completes
      } else if (params.authenticated) {
        appendLog("Already authenticated.");
        setScreen({ kind: "finder" });
      } else {
        appendLog(`Login response: ${JSON.stringify(params)}`);
      }
    } catch (err) {
      const msg = (err as Error).message;
      appendLog(`Login failed: ${msg}`);
      setLoginError(msg);
    } finally {
      setLoginLoading(false);
    }
  }, [appendLog]);

  // ─── Navigation helpers ─────────────────────────────────────────

  const goToFinder = useCallback(() => setScreen({ kind: "finder" }), []);
  const goToLogin = useCallback(() => setScreen({ kind: "login" }), []);

  const goToCategory = useCallback(
    (name: string) => setScreen({ kind: "category", name }),
    []
  );

  const goToDetailFromFinder = useCallback((comp: PanelComponent) => {
    setScreen({
      kind: "detail",
      componentId: comp.id,
      prefetched: comp,
      returnTo: { kind: "finder" },
    });
  }, []);

  const goToDetailFromCategory = useCallback(
    (comp: PanelComponent) => {
      if (screen.kind !== "category") return;
      setScreen({
        kind: "detail",
        componentId: comp.id,
        prefetched: comp,
        returnTo: { kind: "category", name: screen.name },
      });
    },
    [screen]
  );

  const goBackFromDetail = useCallback(() => {
    setScreen((current) => {
      if (current.kind !== "detail") return current;
      const { returnTo } = current;
      if (returnTo.kind === "category") {
        return { kind: "category", name: returnTo.name };
      }
      return { kind: "finder" };
    });
  }, []);

  // ─── Render ─────────────────────────────────────────────────────

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[460px] flex-col">
      {/* Main content area */}
      <main className="flex-1 px-3 py-3">
        {screen.kind === "login" && (
          <PanelLoginScreen
            onLogin={handleLogin}
            isLoading={loginLoading}
            error={loginError}
            sessionReady={sessionReady}
          />
        )}

        {screen.kind === "finder" && (
          <SymbolFinderScreen
            viewState={finderView}
            onViewStateChange={setFinderView}
            onSelectCategory={goToCategory}
            onSelectComponent={goToDetailFromFinder}
            onAuthRequired={goToLogin}
            appendLog={appendLog}
          />
        )}

        {screen.kind === "category" && (
          <CategoryListScreen
            category={screen.name}
            onBack={goToFinder}
            onSelectComponent={goToDetailFromCategory}
            onAuthRequired={goToLogin}
            appendLog={appendLog}
          />
        )}

        {screen.kind === "detail" && (
          <PartDetailScreen
            componentId={screen.componentId}
            prefetched={screen.prefetched}
            onBack={goBackFromDetail}
            appendLog={appendLog}
          />
        )}
      </main>

      {/* Log terminal — always at bottom */}
      <div className="px-3 pb-3">
        <LogTerminal entries={logEntries} onClear={clearLog} />
      </div>
    </div>
  );
}
