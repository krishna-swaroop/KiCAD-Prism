import { useEffect, useState } from "react";
import { Binary, Loader2 } from "lucide-react";

import prismLogoHorizontal from "@/assets/branding/kicad-prism/kicad-prism-logo-horizontal.svg";
import prismLogoMark from "@/assets/branding/kicad-prism/kicad-prism-icon.svg";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { changeOwnPassword, loginWithPassword, startOidcLogin } from "@/lib/auth";
import type { AuthConfig, User } from "@/types/auth";

interface LoginPageProps {
  authConfig: AuthConfig;
  devMode?: boolean;
  workspaceName?: string;
  initialError?: string | null;
  onLoginSuccess?: (user: User) => void;
}

const RELEASE_CACHE_KEY = "kicad_prism_latest_release_tag";
const RELEASE_CACHE_TIME_KEY = "kicad_prism_latest_release_tag_fetched_at";
const RELEASE_CACHE_TTL_MS = 15 * 60 * 1000;
const DEFAULT_GITHUB_REPO = "krishna-swaroop/KiCAD-Prism";

export function LoginPage({
  authConfig,
  devMode = false,
  workspaceName = "KiCAD Prism",
  initialError = null,
  onLoginSuccess,
}: LoginPageProps) {
  const [error, setError] = useState<string | null>(initialError);
  const [isLoading, setIsLoading] = useState(false);
  const [releaseTag, setReleaseTag] = useState("...");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  // When an admin-set password must be replaced, we keep the user on this page
  // and swap the form to a "set a new password" step before entering the app.
  const [mustChange, setMustChange] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pendingUser, setPendingUser] = useState<User | null>(null);

  useEffect(() => {
    setError(initialError);
  }, [initialError]);

  useEffect(() => {
    const cachedTag = window.sessionStorage.getItem(RELEASE_CACHE_KEY);
    const cachedFetchedAt = window.sessionStorage.getItem(RELEASE_CACHE_TIME_KEY);
    if (cachedTag && cachedFetchedAt) {
      const fetchedAt = Number(cachedFetchedAt);
      if (Number.isFinite(fetchedAt) && Date.now() - fetchedAt < RELEASE_CACHE_TTL_MS) {
        setReleaseTag(cachedTag);
        return;
      }
    }

    const controller = new AbortController();
    const repo = import.meta.env.VITE_GITHUB_REPO || DEFAULT_GITHUB_REPO;

    const loadLatestRelease = async () => {
      try {
        const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
          headers: {
            Accept: "application/vnd.github+json",
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Failed to load release metadata");
        }

        const payload = (await response.json()) as { tag_name?: string; name?: string };
        const tag = payload.tag_name || payload.name || "Unavailable";
        setReleaseTag(tag);
        window.sessionStorage.setItem(RELEASE_CACHE_KEY, tag);
        window.sessionStorage.setItem(RELEASE_CACHE_TIME_KEY, String(Date.now()));
      } catch {
        if (!controller.signal.aborted) {
          setReleaseTag("Unavailable");
        }
      }
    };

    void loadLatestRelease();

    return () => {
      controller.abort();
    };
  }, []);

  const handleSignIn = async () => {
    setIsLoading(true);
    setError(null);
    try {
      window.location.href = await startOidcLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start sign-in");
      setIsLoading(false);
    }
  };

  const handlePasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordSubmitting(true);
    setError(null);
    try {
      const result = await loginWithPassword(email, password, rememberMe);
      const user: User = {
        email: result.email,
        name: result.name,
        picture: result.picture,
        role: result.role,
      };
      if (result.must_change_password) {
        // Session is issued, but force a password change before entering. Keep
        // the just-used password: the change call re-verifies it as "current".
        setPendingUser(user);
        setMustChange(true);
      } else {
        onLoginSuccess?.(user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const handleSetNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }
    setPasswordSubmitting(true);
    setError(null);
    try {
      // The session already authenticates this call; the current password is
      // the one just used to sign in.
      await changeOwnPassword(password, newPassword);
      if (pendingUser) onLoginSuccess?.(pendingUser);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set a new password");
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const handleDevBypass = () => {
    window.history.replaceState(null, "", "/");
    window.location.reload();
  };

  return (
    <div className="grid min-h-screen bg-background text-foreground lg:grid-cols-[minmax(0,1.15fr)_minmax(420px,560px)]">
      <section className="relative hidden border-r bg-card lg:flex lg:flex-col lg:justify-between lg:p-10">
        <div className="relative z-10 flex items-center gap-3">
          <img src={prismLogoHorizontal} alt="KiCAD Prism" className="h-10 w-auto" />
        </div>

        <div className="relative z-10 max-w-xl space-y-6">
          <div className="space-y-3">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-primary">{workspaceName}</p>
            <h1 className="text-5xl font-semibold tracking-tight">Visualizing KiCAD Projects.</h1>
            <p className="max-w-lg text-base text-muted-foreground">
              A web-based platform for viewing, reviewing, and collaborating on KiCAD projects.
            </p>
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-3 text-xs text-muted-foreground">
          <Binary className="h-3.5 w-3.5" />
          <span>Release {releaseTag}</span>
        </div>
      </section>

      <section className="relative flex items-center justify-center px-6 py-8 sm:px-10">
        <div className="w-full max-w-xl space-y-6 rounded-2xl border border-border/70 bg-card/70 p-5 backdrop-blur-sm sm:p-7">
          <div className="flex items-center justify-center gap-3 lg:hidden">
            <img src={prismLogoMark} alt="KiCAD Prism" className="h-10 w-10" />
            <p className="text-2xl font-semibold tracking-tight">{workspaceName}</p>
          </div>

          <Card className="relative overflow-hidden border-primary/40 bg-card ring-1 ring-primary/30">
            <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-border/80" />
            <CardHeader className="space-y-2 pb-7">
              <CardTitle className="text-2xl">{mustChange ? "Set a new password" : "Sign In"}</CardTitle>
              <CardDescription>
                {mustChange
                  ? "Your account requires a new password before you continue."
                  : authConfig.oidc_enabled && authConfig.password_auth_enabled
                    ? `Sign in with ${authConfig.oidc_provider_name || "SSO"} or your email and password.`
                    : authConfig.password_auth_enabled
                      ? "Sign in with your email and password."
                      : `Sign in with ${authConfig.oidc_provider_name || "your organization SSO"}.`}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5 pb-7">
              {mustChange ? (
                <form className="space-y-4" onSubmit={(e) => void handleSetNewPassword(e)}>
                  <div className="space-y-1.5">
                    <Label htmlFor="new-password">New password</Label>
                    <Input
                      id="new-password"
                      type="password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="confirm-password">Confirm new password</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={passwordSubmitting}>
                    {passwordSubmitting ? "Saving…" : "Set password and continue"}
                  </Button>
                </form>
              ) : (
                <>
                  {authConfig.oidc_enabled && (
                    <Button className="w-full" onClick={() => void handleSignIn()} disabled={isLoading || passwordSubmitting}>
                      {isLoading
                        ? `Redirecting to ${authConfig.oidc_provider_name || "SSO"}...`
                        : `Continue with ${authConfig.oidc_provider_name || "SSO"}`}
                    </Button>
                  )}

                  {authConfig.oidc_enabled && authConfig.password_auth_enabled && (
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="h-px flex-1 bg-border" />
                      <span>or</span>
                      <span className="h-px flex-1 bg-border" />
                    </div>
                  )}

                  {authConfig.password_auth_enabled && (
                    <form className="space-y-4" onSubmit={(e) => void handlePasswordSignIn(e)}>
                      <div className="space-y-1.5">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          autoComplete="username"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="password">Password</Label>
                        <Input
                          id="password"
                          type="password"
                          autoComplete="current-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                        />
                      </div>
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                        <Checkbox
                          checked={rememberMe}
                          onCheckedChange={(checked) => setRememberMe(checked === true)}
                        />
                        Remember me on this device
                      </label>
                      <Button type="submit" className="w-full" disabled={passwordSubmitting || isLoading}>
                        {passwordSubmitting ? "Signing in…" : "Sign in"}
                      </Button>
                    </form>
                  )}
                </>
              )}

              {isLoading && (
                <div className="flex items-center justify-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Redirecting…</span>
                </div>
              )}

              {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}

              {devMode && !mustChange && (
                <Button variant="outline" className="w-full" onClick={handleDevBypass}>
                  <Binary className="mr-2 h-4 w-4" />
                  Skip Authentication (Dev Mode)
                </Button>
              )}
            </CardContent>
          </Card>

          <p className="text-center text-xs text-muted-foreground">
            Restricted Access  |  Contact your administrator for access.
          </p>
        </div>
      </section>
    </div>
  );
}
