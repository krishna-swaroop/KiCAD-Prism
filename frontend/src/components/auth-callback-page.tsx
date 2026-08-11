import { useEffect, useState } from "react";

import { exchangeOidcAuthCode } from "@/lib/auth";
import type { User } from "@/types/auth";

interface AuthCallbackPageProps {
  onLoginSuccess: (user: User) => void;
}

export function AuthCallbackPage({ onLoginSuccess }: AuthCallbackPageProps) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
        window.history.replaceState(null, "", "/");
        onLoginSuccess(user);
      } catch (err) {
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
