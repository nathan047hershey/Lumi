'use client';

import { Suspense } from 'react';
import { AuthProvider } from '@/context/AuthContext';

export default function Providers({ children }) {
    return (
        <AuthProvider>
            <Suspense fallback={null}>{children}</Suspense>
        </AuthProvider>
    );
}
