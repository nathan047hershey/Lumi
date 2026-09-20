'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Layout from '@/components/Layout';
import { FullscreenLoader } from '@/components/Loader';

function homeFor(user, additionalRoles) {
    if (!user) return '/login';
    if (user.role === 'admin' || additionalRoles.includes('admin')) return '/admin/settings';
    if (user.role === 'caller' || additionalRoles.includes('caller')) return '/caller/settings';
    if (user.role === 'manager' || additionalRoles.includes('manager')) return '/manager/settings';
    if (user.role === 'developer' || additionalRoles.includes('developer')) return '/developer/settings';
    return '/user/settings';
}

export function RoleLayout({ children, adminOnly = false, managerOnly = false }) {
    const { user, additionalRoles, loading } = useAuth();
    const router = useRouter();
    const hasAdmin = user && (user.role === 'admin' || additionalRoles.includes('admin'));
    const hasManager = user && (user.role === 'manager' || additionalRoles.includes('manager') || hasAdmin);
    const allowed = user && (!adminOnly || hasAdmin) && (!managerOnly || hasManager);

    useEffect(() => {
        if (loading) return;
        if (!user) router.replace('/login');
        else if (!allowed) router.replace('/user/settings');
    }, [loading, user, allowed, router]);

    if (loading || !allowed) {
        return <FullscreenLoader message="Loading your workspace..." />;
    }
    return <Layout>{children}</Layout>;
}

export function HomeRedirect() {
    const { user, additionalRoles, loading } = useAuth();
    const router = useRouter();
    useEffect(() => {
        if (!loading) router.replace(homeFor(user, additionalRoles));
    }, [loading, user, additionalRoles, router]);
    return <FullscreenLoader message="Loading your workspace..." />;
}
