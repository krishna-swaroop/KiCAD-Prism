import { Suspense, lazy, useCallback, useDeferredValue, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import type { User, AuthConfig } from './types/auth';
import { Button } from '@/components/ui/button';
import { Toaster } from 'sonner';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { ApiHttpError, fetchApi } from '@/lib/api';
import { fetchAuthConfig, fetchCurrentUser, isAuthCallbackPath } from '@/lib/auth';
import { IS_APPLE_PLATFORM } from '@/lib/shortcuts';
import { useHotkeys } from '@/hooks/use-hotkeys';
import { CommandPalette } from '@/components/command-palette';
import { KeyboardShortcutsDialog } from '@/components/keyboard-shortcuts-dialog';
import { RoleAuthorityPopover } from '@/components/role-authority-popover';
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

function App() {
    const [user, setUser] = useState<User | null>(null);
    const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [authError, setAuthError] = useState<string | null>(null);
    const [workspaceSearchQuery, setWorkspaceSearchQuery] = useState("");
    const deferredWorkspaceSearchQuery = useDeferredValue(workspaceSearchQuery);
    const isAuthCallbackRoute = typeof window !== "undefined" && isAuthCallbackPath();
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);

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

    const loadCurrentUser = async (config: AuthConfig, signal?: AbortSignal) => {
        try {
            const currentUser = await fetchCurrentUser(signal);
            if (signal?.aborted) {
                return;
            }
            setUser(currentUser);
            setAuthError(null);
        } catch (err) {
            if (signal?.aborted) {
                return;
            }
            if (err instanceof ApiHttpError && (err.status === 401 || err.status === 403)) {
                setUser(null);
                setAuthError(config.auth_enabled && err.status === 403 ? err.message : null);
                return;
            }
            throw err;
        }
    };

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
                await loadCurrentUser(config, controller.signal);
            } catch (err) {
                if (controller.signal.aborted) {
                    return;
                }
                console.error('Failed to fetch auth config:', err);
                setUser(null);
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
    }, []);

    const handleLogout = () => {
        void fetchApi('/api/auth/logout', { method: 'POST' }).finally(() => {
            setUser(null);
            setAuthError(null);
        });
    };

    const handleAuthCodeSuccess = (currentUser: User) => {
        setUser(currentUser);
        setAuthError(null);
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
    // with incomplete OIDC configuration, so there is no misconfigured state to
    // detect here any more.
    if (authConfig.auth_enabled && !user) {
        return (
            <Suspense fallback={<RouteFallback />}>
                <LoginPage
                    authConfig={authConfig}
                    devMode={authConfig.dev_mode}
                    workspaceName={authConfig.workspace_name}
                    initialError={authError}
                    onLoginSuccess={handleAuthCodeSuccess}
                />
            </Suspense>
        );
    }

    if (!user) {
        return <FullScreenMessage message={authError || 'Failed to resolve current user.'} isError />;
    }

    // User is authenticated or auth is disabled - show app
    return (
        <BrowserRouter>
            <Toaster richColors position="top-right" />
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
                    <div className="min-h-screen bg-background text-foreground">
                        <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-10">
                            <div className="grid h-16 grid-cols-[auto_1fr_auto] items-center gap-4 px-3 md:px-4">
                                <div className="flex items-center gap-2 text-primary">
                                    <img src={prismLogoMark} alt="KiCAD Prism Logo" className="h-7 w-7 object-contain" />
                                    <span className="text-xl font-bold tracking-tight text-foreground">KiCAD Prism</span>
                                </div>

                                <div className="flex justify-center">
                                    <div className="relative w-full max-w-2xl">
                                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                        <Input
                                            data-shortcut-search
                                            value={workspaceSearchQuery}
                                            onChange={(event) => setWorkspaceSearchQuery(event.target.value)}
                                            placeholder="Search projects by name, description, and metadata"
                                            className="pl-10 pr-10"
                                        />
                                        <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 border bg-muted px-1 text-[11px] text-muted-foreground">
                                            /
                                        </kbd>
                                    </div>
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
                                    {user && user.email !== 'guest@local' && (
                                        <>
                                            <span className="text-sm text-muted-foreground">
                                                Welcome, {user.name} (<RoleAuthorityPopover role={user.role} />)
                                            </span>
                                            <Button variant="ghost" size="sm" onClick={handleLogout}>Logout</Button>
                                        </>
                                    )}
                                    {user && user.email === 'guest@local' && (
                                        <span className="text-sm text-muted-foreground">Viewing as Guest</span>
                                    )}
                                </div>
                            </div>
                        </header>

                        <main className="h-[calc(100vh-4rem)]">
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
                    element={
                        <Suspense fallback={<RouteFallback />}>
                            <ProjectDetailPage user={user} />
                        </Suspense>
                    }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;
