import { useCallback, useEffect, useState } from "react";

import { LogTerminal } from "@/panel/components/LogTerminal";
import {
  installBridge,
  uninstallBridge,
  waitForSession,
  getSourceInfo,
  triggerRemoteLogin,
  setLogCallback,
  hasSession,
} from "@/panel/lib/kicad-bridge";
import { getCategories, isAuthError, setApiToken } from "@/panel/lib/panel-api";
import type { PanelComponent } from "@/panel/lib/panel-api";
import {
  emptyCategoryBrowse,
  emptyFinderView,
  type CategoryBrowseState,
} from "@/panel/lib/view-state";

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
  const [finderView, setFinderView] = useState(emptyFinderView);
  const [categoryView, setCategoryView] = useState<CategoryBrowseState>(
    () => emptyCategoryBrowse(""),
  );
  const [logEntries, setLogEntries] = useState<string[]>([]);
  const [sessionReady, setSessionReady] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const appendLog = useCallback((msg: string) => {
    const stamp = new Date().toLocaleTimeString();
    setLogEntries((prev) => [...prev, `[${stamp}] ${msg}`]);
  }, []);

  const clearLog = useCallback(() => setLogEntries([]), []);

  const testAuthAndRoute = useCallback(async (signal?: AbortSignal) => {
    try {
      // This succeeds if we have a valid cookie session or valid token.
      await getCategories(signal);
      if (signal?.aborted) return;
      appendLog("Session authenticated — entering finder.");
      setScreen({ kind: "finder" });
    } catch (err) {
      if (signal?.aborted) return;
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
    setLogCallback(appendLog);
    installBridge();
    const sessionWait = new AbortController();

    (async () => {
      try {
        // 1. Start waiting for KiCad session in background
        waitForSession({ signal: sessionWait.signal }).then(async () => {
          if (sessionWait.signal.aborted) return;
          setSessionReady(true);
          appendLog("KiCad session ready.");
          try {
            const sourceInfo = await getSourceInfo();
            if (sessionWait.signal.aborted) return;
            const params = (sourceInfo.parameters || {}) as Record<string, unknown>;
            if (params.token) {
              setApiToken(params.token as string);
              appendLog("Extracted token from KiCad session.");
              // We got a new token, try routing again just in case we were stuck on login
              void testAuthAndRoute(sessionWait.signal);
            }
            if (params.auth_type === "oauth2" && !params.authenticated) {
              appendLog("KiCad reports authentication required.");
              // Only override to login if currently in finder (could wait for search failure)
            }
          } catch (e) {
            if (sessionWait.signal.aborted) return;
            appendLog(`Source info error: ${(e as Error).message}`);
          }
        }).catch((err) => {
          if (sessionWait.signal.aborted || (err as Error).name === "AbortError") return;
          appendLog(`KiCad init error: ${(err as Error).message}`);
        });

        // 2. Immediately check if we have a valid cookie session via the API
        await testAuthAndRoute(sessionWait.signal);
      } catch (err) {
        if (sessionWait.signal.aborted) return;
        appendLog(`Init error: ${(err as Error).message}`);
      }
    })();

    return () => {
      sessionWait.abort();
      uninstallBridge();
    };
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

  const goToCategory = useCallback((name: string, total?: number | null) => {
    setCategoryView((prev) =>
      prev.name === name ? prev : emptyCategoryBrowse(name, total ?? null),
    );
    setScreen({ kind: "category", name });
  }, []);

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
      <main className="flex flex-1 flex-col px-3 py-3">
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
            viewState={categoryView}
            onViewStateChange={setCategoryView}
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
