/**
 * Resolve API base URL.
 * - Next dev: `/api` proxy → Express :9017
 * - Next production (Vercel / next start): `/api` (same app, Express inside Next)
 * - Express serving the UI on :9017: same origin
 */
export function resolveApiBaseUrl() {
    const env = String(process.env.NEXT_PUBLIC_API_URL || '').trim().replace(/\/+$/, '');
    if (env) return env;

    if (process.env.NODE_ENV === 'development') return '/api';

    if (typeof window === 'undefined') return '/api';

    const { protocol, hostname, port } = window.location;
    // UI served by Express itself.
    if (port === '9017' || port === '8001') return '';

    // Next.js hosts the API under /api so it doesn't collide with /admin, /user pages.
    if (
        port === '5173' || port === '3000' || port === '4173'
        || hostname.endsWith('.vercel.app')
        || hostname.endsWith('.vercel.sh')
    ) {
        return '/api';
    }

    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
        return `${protocol}//${hostname}:9017`;
    }

    return '/api';
}
