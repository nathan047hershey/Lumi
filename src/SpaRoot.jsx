'use client';

import { BrowserRouter } from '@/next/router';
import App from './App';
import { AuthProvider } from './context/AuthContext';

/**
 * Existing Vite SPA mounted inside Next.js.
 * React Router keeps the current route table; Next owns the shell/build.
 */
export default function SpaRoot() {
    return (
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <AuthProvider>
                <App />
            </AuthProvider>
        </BrowserRouter>
    );
}
