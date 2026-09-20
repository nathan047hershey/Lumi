const os = require('os');

function isPrivateLanHost(host) {
    const h = String(host || '').trim().toLowerCase();
    if (!h) return false;
    if (h === 'localhost' || h === '127.0.0.1') return true;
    return /^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)
        || /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)
        || /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(h);
}

function listLanIPv4() {
    const out = [];
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name] || []) {
            if (net.family !== 'IPv4' || net.internal) continue;
            out.push(net.address);
        }
    }
    return [...new Set(out)];
}

function parseExtraOrigins(raw) {
    return String(raw || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

function isAllowedCorsOrigin(origin) {
    if (!origin) return true;
    if (origin.startsWith('chrome-extension://')) return true;

    const extras = parseExtraOrigins(process.env.LUMI_CORS_ORIGINS);
    if (extras.includes(origin) || extras.some((e) => origin.startsWith(e))) return true;

    try {
        const u = new URL(origin);
        if (isPrivateLanHost(u.hostname)) return true;
        if (listLanIPv4().includes(u.hostname)) return true;
        if (process.env.PUBLIC_HOST && u.hostname === process.env.PUBLIC_HOST) return true;
        if (u.hostname.endsWith('.neptunemart.space')) return true;
        // Vercel preview + production frontends
        if (u.hostname.endsWith('.vercel.app') || u.hostname.endsWith('.vercel.sh')) return true;
    } catch (_) { /* ignore */ }

    return origin === 'http://localhost:5173'
        || origin === 'http://localhost:3000'
        || origin === 'http://127.0.0.1:5173'
        || origin === 'http://127.0.0.1:3000'
        || origin === 'http://localhost:4173'
        || origin === 'http://127.0.0.1:4173';
}

module.exports = {
    isPrivateLanHost,
    listLanIPv4,
    isAllowedCorsOrigin
};
