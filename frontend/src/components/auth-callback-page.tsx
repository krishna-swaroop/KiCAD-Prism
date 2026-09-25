import { useEffect, useRef, useState } from "react";

import { consumeStashedLoginNext, exchangeOidcAuthCode } from "@/lib/auth";
import type { User } from "@/types/auth";

interface AuthCallbackPageProps {
  onLoginSuccess: (user: User) => void;
}

export function AuthCallbackPage({ onLoginSuccess }: AuthCallbackPageProps) {
  const [error, setError] = useState<string | null>(null);
  // The authorization code is single-use: guard against the effect re-running
  // because App re-rendered and handed us a new `onLoginSuccess` identity, and
  // against StrictMode's dev-only double effect invocation.
  const startedRef = useRef(false);

  // The once-only guard below is the cancellation strategy: a per-run cancelled
  // flag would be flipped by StrictMode's cleanup while this single exchange is
  // still in flight, silently dropping the login in dev. Late setState after
  // unmount is a no-op in React 18.
  // react-doctor-disable-next-line react-doctor/no-set-state-after-await-in-effect
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const run = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get("code");
      const state = urlParams.get("state");
      const oauthError = urlParams.get("error");

      if (oauthError) {
        setError(`Authentication failed: ${oauthError}`);
        return;
      }

      if (!code) {
        setError("No authorization code received from the identity provider.");
        return;
      }
      if (!state) {
        setError("Authentication failed: the identity provider did not return a state value.");
        return;
      }

      // State, nonce, and the PKCE verifier are verified by the backend against the
      // HttpOnly transaction cookie it set when this login started.
      try {
        const user = await exchangeOidcAuthCode(code, state);
        const next = consumeStashedLoginNext();
        if (next) {
          window.location.assign(next);
          return;
        }
        window.history.replaceState(null, "", "/");
        onLoginSuccess(user);
      } catch (err) {
        // Deliberately unguarded: `startedRef` makes this effect run at most
        // once per mount, and a cancellation flag would break StrictMode dev
        // (cleanup would cancel the only real exchange). Late setState after
        // unmount is a no-op in React 18.
        // react-doctor-disable-next-line react-doctor/no-set-state-after-await-in-effect
        setError(err instanceof Error ? err.message : "Authentication failed");
      }
    };

    void run();
  }, [onLoginSuccess]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center">
        <h2 className="mb-3 text-xl font-semibold text-foreground">Authenticating...</h2>
        {error ? (
          <>
            <p className="mb-4 text-sm text-destructive">{error}</p>
            <button
              className="rounded-md border px-4 py-2 text-sm text-foreground"
              onClick={() => {
                window.history.replaceState(null, "", "/");
                window.location.reload();
              }}
            >
              Return to Login
            </button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Exchanging OIDC authorization code.</p>
        )}
      </div>
    </div>
  );
}
