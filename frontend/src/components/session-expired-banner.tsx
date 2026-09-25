import { useState } from "react";
import { TriangleAlert, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginWithPassword, startOidcLogin, stashCurrentLocation } from "@/lib/auth";
import type { AuthConfig, User } from "@/types/auth";

/**
 * Height of the banner. App.tsx feeds the same value into --app-chrome-offset
 * so viewport-sized route layouts shrink by exactly this much; keeping one
 * constant is what stops the banner from covering the header it sits above.
 */
export const SESSION_BANNER_HEIGHT = "2.5rem";

interface SessionExpiredBannerProps {
    authConfig: AuthConfig;
    /** Signed-in address, prefilled so re-auth is one password away. */
    email: string;
    /** Session restored in place — the app was never unmounted. */
    onReauthenticated: (user: User) => void;
    /** Escape hatch to the full login page for flows this bar cannot carry. */
    onFullSignIn: () => void;
}

/**
 * Mid-session 401 notice.
 *
 * Password sign-in is completed here, in a dialog over the still-mounted app,
 * so nothing is unmounted and no reload happens — the reason the app is kept
 * alive on a 401 in the first place. OIDC cannot work that way: it is a
 * full-page redirect to the identity provider, so that path says so plainly
 * rather than promising the page survives.
 */
export function SessionExpiredBanner({
    authConfig,
    email,
    onReauthenticated,
    onFullSignIn,
}: SessionExpiredBannerProps) {
    const passwordAuth = Boolean(authConfig.password_auth_enabled);
    const [dialogOpen, setDialogOpen] = useState(false);
    // The same: a sign-in field the user may correct. App.tsx keys the banner
    // on the account it is for, so a different account gets a different form.
    // react-doctor-disable-next-line react-doctor/no-derived-useState
    const [emailValue, setEmailValue] = useState(email);
    const [password, setPassword] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const startRedirectSignIn = async () => {
        setSubmitting(true);
        try {
            stashCurrentLocation();
            window.location.href = await startOidcLogin();
        } catch (reason) {
            setSubmitting(false);
            toast.error(reason instanceof Error ? reason.message : "Failed to start sign-in");
        }
    };

    const submitPassword = async (event: React.FormEvent) => {
        event.preventDefault();
        setSubmitting(true);
        setError(null);
        try {
            const result = await loginWithPassword(emailValue, password, false);
            if (result.must_change_password) {
                // A forced password change needs the full login page; this bar
                // has nowhere to put that flow.
                onFullSignIn();
                return;
            }
            setPassword("");
            setDialogOpen(false);
            onReauthenticated({
                email: result.email,
                name: result.name,
                picture: result.picture,
                role: result.role,
            });
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Sign-in failed");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            <div
                role="status"
                style={{ height: SESSION_BANNER_HEIGHT }}
                className="border-warning/30 bg-warning/10 text-warning flex shrink-0 items-center justify-between gap-3 border-b px-4 text-xs"
            >
                <span className="flex min-w-0 items-center gap-2">
                    <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                        {passwordAuth
                            ? "Your session expired. Sign in to carry on — this page stays exactly as it is."
                            : "Your session expired. Signing in redirects you to your identity provider and reloads this page."}
                    </span>
                </span>
                <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    disabled={submitting}
                    onClick={() => (passwordAuth ? setDialogOpen(true) : void startRedirectSignIn())}
                >
                    {submitting && !dialogOpen ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Sign in
                </Button>
            </div>

            <Dialog open={dialogOpen} onOpenChange={(next) => { if (!submitting) setDialogOpen(next); }}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Sign in again</DialogTitle>
                        <DialogDescription>
                            Your session expired. Signing in here restores it without leaving the page,
                            so anything you have open stays open.
                        </DialogDescription>
                    </DialogHeader>
                    <form className="space-y-4" onSubmit={(event) => void submitPassword(event)}>
                        <div className="space-y-2">
                            <Label htmlFor="session-reauth-email">Email</Label>
                            <Input
                                id="session-reauth-email"
                                type="email"
                                autoComplete="username"
                                value={emailValue}
                                onChange={(event) => setEmailValue(event.target.value)}
                                disabled={submitting}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="session-reauth-password">Password</Label>
                            <Input
                                id="session-reauth-password"
                                type="password"
                                autoComplete="current-password"
                                autoFocus
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                disabled={submitting}
                            />
                        </div>
                        {error ? <p className="text-destructive text-xs">{error}</p> : null}
                        <DialogFooter>
                            <Button type="button" variant="outline" disabled={submitting} onClick={onFullSignIn}>
                                Use the full sign-in page
                            </Button>
                            <Button type="submit" disabled={submitting || !emailValue || !password}>
                                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                Sign in
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}
