/** Detect Lumi app tabs (localhost, LAN IP, or configured base URL). */

export function isPrivateLanHost(host) {
    const h = String(host || '').trim().toLowerCase();
    if (!h || h === 'localhost' || h === '127.0.0.1') return true;
    return /^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)
        || /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)
        || /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(h);
}

const APP_PORTS = new Set(['5173', '3000', '4173', '9017']);

export function isAppUrl(url, frontendBaseUrl = '') {
    const raw = String(url || '').trim();
    if (!raw) return false;
    if (frontendBaseUrl && raw.startsWith(String(frontendBaseUrl).replace(/\/+$/, ''))) return true;
    try {
        const u = new URL(raw);
        const host = u.hostname.toLowerCase();
        if (host.endsWith('.vercel.app') || host.endsWith('.vercel.sh') || host.endsWith('neptunemart.space')) {
            return true;
        }
        const port = u.port || (u.protocol === 'https:' ? '443' : '80');
        if (!APP_PORTS.has(port)) return false;
        if (port === '9017' && isPrivateLanHost(u.hostname)) return true;
        if (port === '9017' && u.hostname === '51.68.138.192') return true;
        return isPrivateLanHost(u.hostname);
    } catch (_) {
        return /localhost:5173|127\.0\.0\.1:5173|localhost:3000|127\.0\.0\.1:3000|vercel\.app/i.test(raw);
    }
}

export function isAllowedAppOrigin(originOrUrl) {
    return isAppUrl(originOrUrl);
}

/** chrome.tabs.query URL patterns — `*` host matches LAN IPs. */
export const APP_TAB_QUERY_PATTERNS = [
    'http://localhost:5173/*',
    'http://127.0.0.1:5173/*',
    'http://localhost:3000/*',
    'http://127.0.0.1:3000/*',
    'http://localhost:4173/*',
    'http://127.0.0.1:4173/*',
    'http://localhost:9017/*',
    'http://127.0.0.1:9017/*',
    'http://*:5173/*',
    'http://*:3000/*',
    'http://*:4173/*',
    'http://*:9017/*',
    'https://*.vercel.app/*',
    'https://*.vercel.sh/*'
];

export function appOpenHint(frontendBaseUrl = '') {
    const base = String(frontendBaseUrl || '').replace(/\/+$/, '');
    if (base) return base;
    return 'https://YOUR-APP.vercel.app (or http://127.0.0.1:3000 locally)';
}
