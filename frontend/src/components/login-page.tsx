import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useState } from 'react';

interface LoginPageProps {
    onLoginSuccess: (user: any) => void;
    devMode?: boolean;
}

export function LoginPage({ onLoginSuccess, devMode = false }: LoginPageProps) {
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleSuccess = async (credentialResponse: CredentialResponse) => {
        try {
            setIsLoading(true);
            setError(null);

            if (!credentialResponse.credential) {
                setError('No credentials received from Google');
                return;
            }

            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: credentialResponse.credential }),
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.detail || 'Login failed');
            }

            const data = await res.json();
            onLoginSuccess(data);
        } catch (err: any) {
            setError(err.message || 'Login Failed');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDevBypass = () => {
        window.history.replaceState(null, '', '/');
        onLoginSuccess({ name: 'Dev User', email: 'dev@pixxel.co.in' });
    };

    return (
        <div className="flex items-center justify-center h-screen bg-slate-50 dark:bg-slate-900">
            <Card className="w-[400px]">
                <CardHeader className="text-center">
                    <div className="flex items-center justify-center gap-2 mb-2">
                        <div className="h-8 w-8 bg-primary rounded-md"></div>
                        <CardTitle className="text-2xl">KiCAD Prism</CardTitle>
                    </div>
                    <CardDescription>Sign in to access KiCAD projects</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-4">
                    <GoogleLogin
                        onSuccess={handleSuccess}
                        onError={() => setError('Google Sign-in failed')}
                        useOneTap
                        auto_select
                    />

                    {isLoading && (
                        <p className="text-sm text-muted-foreground">Signing in...</p>
                    )}

                    {error && (
                        <div className="text-center">
                            <p className="text-sm text-red-500">{error}</p>
                        </div>
                    )}

                    {/* Dev Bypass - only shown when devMode is true */}
                    {devMode && (
                        <>
                            <div className="relative w-full">
                                <div className="absolute inset-0 flex items-center">
                                    <span className="w-full border-t" />
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-background px-2 text-muted-foreground">
                                        Development Mode
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={handleDevBypass}
                                className="text-xs text-blue-500 underline hover:text-blue-600 transition-colors"
                            >
                                Skip Authentication (Dev Bypass)
                            </button>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
