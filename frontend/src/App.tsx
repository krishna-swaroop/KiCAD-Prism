import { Suspense, lazy, useCallback, useDeferredValue, useEffect, useRef, useState, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import type { User, AuthConfig } from './types/auth';
import { Button } from '@/components/ui/button';
import { Toaster } from 'sonner';
import { Search } from 'lucide-react';
import { ApiHttpError, fetchApi } from '@/lib/api';
import { fetchAuthConfig, fetchCurrentUser, isAuthCallbackPath, stashCurrentLocation } from '@/lib/auth';
import { IS_APPLE_PLATFORM } from '@/lib/shortcuts';
import { insideKiCad } from '@/lib/kicad-host';
import { roleLabel } from '@/lib/roles';
import { useHotkeys } from '@/hooks/use-hotkeys';
import { useSignedInUser } from '@/hooks/use-signed-in-user';
import { CommandPalette } from '@/components/command-palette';
import { TopSearch } from '@/components/top-search';
import { KeyboardShortcutsDialog } from '@/components/keyboard-shortcuts-dialog';
import { RoleAuthorityPopover } from '@/components/role-authority-popover';
import { SessionExpiredBanner, SESSION_BANNER_HEIGHT } from '@/components/session-expired-banner';
import { HelpDialogHost } from '@/features/bug-report/help-dialog-host';
import { HelpMenu } from '@/features/bug-report/help-menu';
import prismLogoMark from './assets/branding/kicad-prism/kicad-prism-icon.svg';

const LoginPage = lazy(() =>
    import('./components/login-page').then((module) => ({ default: module.LoginPage }))
);
const AuthCallbackPage = lazy(() =>
    import('./components/auth-callback-page').then((module) => ({ default: module.AuthCallbackPage }))
);
const Workspace = lazy(() =>
    import('./components/workspace').then((module) => ({ default: module.Workspace }))
);
const KiCadPartPage = lazy(() =>
    import('@/features/supply/kicad-part-page').then((module) => ({ default: module.KiCadPartPage }))
);
const ProjectDetailPage = lazy(() =>
    import('./pages/ProjectDetailPage').then((module) => ({ default: module.ProjectDetailPage }))
);

function RouteFallback() {
    return (
        <div className="flex items-center justify-center h-full min-h-[16rem] bg-background">
            <div className="text-muted-foreground">Loading...</div>
        </div>
    );
}

function FullScreenMessage({ message, isError = false }: { message: string; isError?: boolean }) {
    return (
        <div className="flex items-center justify-center h-screen bg-background">
            <div className={isError ? "text-destructive" : "text-muted-foreground"}>{message}</div>
        </div>
    );
}

/** A lazily loaded page, with the route fallback while its chunk loads. */
const suspended = (page: ReactNode) => <Suspense fallback={<RouteFallback />}>{page}</Suspense>;

/** The app inside KiCad's Remote Symbols webview: the part the panel opened, alone. */
function InsideKiCad({ user }: { user: User }) {
    const params = new URLSearchParams(window.location.search);
    return (
        <BrowserRouter useTransitions={false}>
            <Toaster richColors position="top-right" />
            <div className="min-h-app-viewport bg-background text-foreground">
                {suspended(<KiCadPartPage partId={params.get('part')} componentId={params.get('component')} user={user} />)}
            </div>
        </BrowserRouter>
    );
}

function PasswordChangeGate({
    authConfig,
    user,
    onSignOut,
    onChanged,
}: {
    authConfig: AuthConfig;
    user: User;
    onSignOut: () => void;
    onChanged: (user: User) => void;
}) {
    return (
        <Suspense fallback={<RouteFallback />}>
            <LoginPage
                authConfig={authConfig}
                workspaceName={authConfig.workspace_name}
                restoredUser={user}
                onSignOut={onSignOut}
                onLoginSuccess={onChanged}
            />
        </Suspense>
    );
}

function App() {
    const [user, setUser] = useSignedInUser();
    // The mount effect reads auth once; `setUser` never changes, so it is read through a ref rather than re-running the effect.
    const signIn = useRef(setUser);
    const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [authError, setAuthError] = useState<string | null>(null);
    const [workspaceSearchQuery, setWorkspaceSearchQuery] = useState("");
    const deferredWorkspaceSearchQuery = useDeferredValue(workspaceSearchQuery);
    const isAuthCallbackRoute = typeof window !== "undefined" && isAuthCallbackPath();
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    // Set when a data endpoint 401s mid-session. The app stays mounted so the
    // user keeps their context; the banner routes them through sign-in.
    const [sessionExpired, setSessionExpired] = useState(false);

    /**
     * Screens mark their own search box with `data-shortcut-search`. "/" focuses
     * the innermost one, so pressing it in the Library Manager reaches the
     * catalog filter rather than the global project search in the header.
     */
    const focusSearchField = useCallback(() => {
        const candidates = document.querySelectorAll<HTMLElement>('[data-shortcut-search]');
        const target = candidates[candidates.length - 1];
        if (!target) return;
        target.focus();
        if (target instanceof HTMLInputElement) target.select();
    }, []);

    useHotkeys([
        { combo: 'mod+k', handler: () => setPaletteOpen(true), allowInInputs: true },
        { combo: 'shift+/', handler: () => setShortcutsOpen(true) },
        { combo: '/', handler: focusSearchField },
    ]);

    // Fetch auth configuration on mount
    useEffect(() => {
        const controller = new AbortController();
        const loadAuthState = async () => {
            try {
                const config = await fetchAuthConfig(controller.signal);
                if (controller.signal.aborted) {
                    return;
                }

                setAuthConfig(config);
                setAuthError(null);
                try {
                    const currentUser = await fetchCurrentUser(controller.signal);
                    if (controller.signal.aborted) {
                        return;
                    }
                    signIn.current(currentUser);
                    setAuthError(null);
                } catch (err) {
                    if (controller.signal.aborted) {
                        return;
                    }
                    if (err instanceof ApiHttpError && (err.status === 401 || err.status === 403)) {
                        signIn.current(null);
                        setAuthError(config.auth_enabled && err.status === 403 ? err.message : null);
                        return;
                    }
                    throw err;
                }
            } catch (err) {
                if (controller.signal.aborted) {
                    return;
                }
                console.error('Failed to fetch auth config:', err);
                signIn.current(null);
                setAuthError('Failed to initialize authentication');
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            }
        };

        void loadAuthState();
        return () => controller.abort();
    }, []);

    useEffect(() => {
        const handleAuthError = (event: Event) => {
            const customEvent = event as CustomEvent<{ status?: number; url?: string }>;
            const status = customEvent.detail?.status;
            const url = customEvent.detail?.url ?? "";
            if (status === 401 && !url.includes('/api/auth/')) {
                // A data endpoint rejected the session mid-work. Do not tear the
                // workspace down: stash the current URL so sign-in returns here,
                // and let the session-expired banner explain what happened.
                stashCurrentLocation();
                setSessionExpired(true);
                return;
            }
            if (status === 401) {
                setUser(null);
                return;
            }
            if (status === 403 && url.includes('/api/auth/me')) {
                setUser(null);
            }
        };
        window.addEventListener('kicad-prism-auth-error', handleAuthError);
        return () => window.removeEventListener('kicad-prism-auth-error', handleAuthError);
    }, [setUser]);

    const handleLogout = () => {
        void fetchApi('/api/auth/logout', { method: 'POST' }).finally(() => {
            setUser(null);
            setAuthError(null);
            setSessionExpired(false);
        });
    };

    const handleAuthCodeSuccess = (currentUser: User) => {
        setUser(currentUser);
        setAuthError(null);
        setSessionExpired(false);
    };

    // Show loading state while fetching auth config
    if (loading) {
        return <FullScreenMessage message="Loading..." />;
    }

    if (!authConfig) {
        return <FullScreenMessage message={authError || 'Failed to load authentication configuration.'} isError />;
    }

    if (authConfig.auth_enabled && !user && isAuthCallbackRoute) {
        return (
            <Suspense fallback={<RouteFallback />}>
                <AuthCallbackPage onLoginSuccess={handleAuthCodeSuccess} />
            </Suspense>
        );
    }
    // If auth is enabled and no user, show login page. The backend refuses to start
    // with incomplete auth configuration, so there is no misconfigured state to
    // detect here any more.
    if (authConfig.auth_enabled && !user) {
        return (
            <Suspense fallback={<RouteFallback />}>
                <LoginPage
                    authConfig={authConfig}
                    devMode={authConfig.dev_mode}
                    workspaceName={authConfig.workspace_name}
                    initialError={authError}
                    onLoginSuccess={(signedIn) => {
                        setUser(signedIn);
                        setAuthError(null);
                        setSessionExpired(false);
                    }}
                />
            </Suspense>
        );
    }

    if (!user) {
        return <FullScreenMessage message={authError || 'Failed to resolve current user.'} isError />;
    }

    // The server refuses everything but the change itself while a temporary
    // password stands, so a restored session goes straight to that form.
    if (user.must_change_password) {
        return (
            <PasswordChangeGate
                authConfig={authConfig}
                user={user}
                onSignOut={handleLogout}
                onChanged={handleAuthCodeSuccess}
            />
        );
    }

    // Inside KiCad's Remote Symbols webview only the part the panel opened is shown: KiCad keeps every navigation there, and
    // the workspace has no way back to the panel.
    if (insideKiCad()) {
        return <InsideKiCad user={user} />;
    }

    // User is authenticated or auth is disabled - show app
    return (
        /*
         * Location updates render at normal priority, not as a transition.
         *
         * The router's default wraps them in `startTransition`, which makes
         * them interruptible. That is fine while the URL only records where
         * you are, but the comparison keeps its tab, selection and layer
         * visibility there, so a click on a tab *is* a location update. With
         * a change selected the board viewer is busy applying route focus and
         * republishing layers, and those normal-priority updates restarted the
         * pending transition on every pass: the address bar moved to the new
         * tab, the screen never did, and only an unrelated plain state update
         * -- Escape clearing the selection -- let it through.
         */
        <BrowserRouter useTransitions={false}>
            {/* The banner sits in normal flow and route layouts subtract its
                height through --app-chrome-offset, so it never covers the
                sticky header underneath it. */}
            <div
                style={sessionExpired
                    ? ({ '--app-chrome-offset': SESSION_BANNER_HEIGHT } as React.CSSProperties)
                    : undefined}
            >
            {sessionExpired ? (
                <SessionExpiredBanner
                    key={user.email}
                    authConfig={authConfig}
                    email={user.email}
                    onReauthenticated={(restored) => { setUser(restored); setSessionExpired(false); }}
                    onFullSignIn={() => { stashCurrentLocation(); setUser(null); }}
                />
            ) : null}
            <Toaster richColors position="top-right" />
            <HelpDialogHost authConfig={authConfig} />
            <CommandPalette
                open={paletteOpen}
                onOpenChange={setPaletteOpen}
                user={user}
                onShowShortcuts={() => setShortcutsOpen(true)}
                onLogout={handleLogout}
            />
            <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
            <Routes>
                <Route path="/" element={
                    <div className="min-h-app-viewport bg-background text-foreground">
                        <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-10">
                            <div className="grid h-16 grid-cols-[auto_1fr_auto] items-center gap-4 px-3 md:px-4">
                                <div className="flex items-center gap-2 text-primary">
                                    <img src={prismLogoMark} alt="KiCAD Prism Logo" className="h-7 w-7 object-contain" />
                                    <span className="text-xl font-bold tracking-tight text-foreground">KiCAD Prism</span>
                                </div>

                                <div className="flex justify-center">
                                    <TopSearch value={workspaceSearchQuery} onChange={setWorkspaceSearchQuery} role={user?.role} />
                                </div>

                                <div className="flex items-center gap-4">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setPaletteOpen(true)}
                                        aria-label="Open command palette"
                                        className="hidden gap-1.5 text-muted-foreground lg:inline-flex"
                                    >
                                        {/* The label already carries ⌘ on Apple platforms, so the
                                            Command icon that used to sit here rendered the glyph twice.
                                            A search icon says what the button does; the shortcut says
                                            how to skip it. */}
                                        <Search className="h-3.5 w-3.5" />
                                        {IS_APPLE_PLATFORM ? '⌘K' : 'Ctrl K'}
                                    </Button>
                                    <HelpMenu />
                                    {user && user.email !== 'guest@local' && (
                                        <>
                                            <span className="text-sm text-muted-foreground">
                                                Welcome, {user.name} (<RoleAuthorityPopover role={user.role} />)
                                            </span>
                                            <Button variant="ghost" size="sm" onClick={handleLogout}>Logout</Button>
                                        </>
                                    )}
                                    {user && user.email === 'guest@local' && (
                                        <span className="text-sm text-muted-foreground">{roleLabel(user.role)} · sign-in off</span>
                                    )}
                                </div>
                            </div>
                        </header>

                        <main className="h-app-main">
                            <Suspense fallback={<RouteFallback />}>
                                <Workspace
                                    searchQuery={deferredWorkspaceSearchQuery}
                                    user={user}
                                />
                            </Suspense>
                        </main>
                    </div>
                } />
                <Route
                    path="/project/:projectId"
                    element={suspended(<ProjectDetailPage user={user} />)}
                />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </div>
        </BrowserRouter>
    );
}

export default App;
