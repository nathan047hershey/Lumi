/**
 * Keep the extension linked to the Lumi API.
 * Local Express (:9017) uses WebSocket /extension/live.
 * Vercel / Next serverless has no persistent WS — poll /extension/version over HTTP instead.
 */
import { getSettings } from './api.js';

const LOCAL_VER = () => chrome.runtime.getManifest()?.version || '0';

function cmpVer(a, b) {
    const pa = String(a || '0').split('.').map((n) => parseInt(n, 10) || 0);
    const pb = String(b || '0').split('.').map((n) => parseInt(n, 10) || 0);
    const n = Math.max(pa.length, pb.length);
    for (let i = 0; i < n; i++) {
        const d = (pa[i] || 0) - (pb[i] || 0);
        if (d) return d;
    }
    return 0;
}

/** True when the API host cannot offer a long-lived /extension/live socket. */
function isHttpOnlyLiveHost(apiBaseUrl) {
    const base = String(apiBaseUrl || '');
    if (!base) return true;
    if (/vercel\.app|vercel\.sh|netlify\.app|cloudflare\.pages/i.test(base)) return true;
    // Next.js local / production UI on :3000 proxies API under /api — no WS upgrade.
    if (/:(3000)(?:\/|$)/.test(base) || /\/api\/?$/.test(base)) return true;
    return false;
}

function wsUrlFromApi(apiBaseUrl) {
    const base = String(apiBaseUrl || '').replace(/\/+$/, '').replace(/\/api$/i, '');
    if (base.startsWith('https://')) return `wss://${base.slice(8)}/extension/live`;
    if (base.startsWith('http://')) return `ws://${base.slice(7)}/extension/live`;
    return '';
}

function versionUrlFromApi(apiBaseUrl) {
    const base = String(apiBaseUrl || '').replace(/\/+$/, '');
    if (!base) return '';
    return `${base}/extension/version`;
}

let socket = null;
let reconnectTimer = null;
let httpOnlyMode = false;
let pollTimer = null;

async function mark(status, extra = {}) {
    try {
        await chrome.storage.local.set({
            lumiLiveStatus: status,
            lumiLiveAt: Date.now(),
            ...extra
        });
    } catch { /* ignore */ }
}

async function onServerVersion(serverVersion, live = false) {
    const local = LOCAL_VER();
    const newer = cmpVer(serverVersion, local) > 0;
    await mark(live || (socket && socket.readyState === 1) ? 'connected' : 'offline', {
        lumiServerVersion: serverVersion || '',
        lumiUpdateAvailable: newer,
        lumiLiveError: ''
    });
    if (!newer) return;
    try {
        chrome.runtime.requestUpdateCheck((status) => {
            if (status === 'update_available') {
                chrome.runtime.reload();
            }
        });
    } catch { /* unpacked installs ignore this */ }
    try {
        chrome.notifications.create('lumi-update', {
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'Lumi update',
            message: `Server has v${serverVersion} (this copy is v${local}). Re-download the extension zip from Lumi if you load unpacked.`
        });
    } catch { /* ignore */ }
}

async function pollVersionHttp() {
    const settings = await getSettings();
    const url = versionUrlFromApi(settings.apiBaseUrl);
    if (!url) {
        await mark('offline', { lumiLiveError: 'API URL not set' });
        return;
    }
    try {
        const res = await fetch(url, { method: 'GET', cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        await onServerVersion(data?.version || '', true);
    } catch (err) {
        await mark('offline', {
            lumiLiveError: err?.message || String(err),
            lumiLiveMode: 'http'
        });
    }
}

function startHttpPoll() {
    httpOnlyMode = true;
    if (socket) {
        try { socket.close(); } catch { /* ignore */ }
        socket = null;
    }
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    pollVersionHttp().catch(() => {});
    if (!pollTimer) {
        pollTimer = setInterval(() => {
            pollVersionHttp().catch(() => {});
        }, 60000);
    }
}

function scheduleReconnect() {
    if (httpOnlyMode) return;
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectLiveLink().catch(() => {});
    }, 30000);
}

export async function connectLiveLink() {
    const settings = await getSettings();
    const api = settings.apiBaseUrl;

    // Serverless / Next hosts: never open WS (avoids ERR_CONNECTION_REFUSED spam).
    if (isHttpOnlyLiveHost(api)) {
        startHttpPoll();
        return;
    }

    const url = wsUrlFromApi(api);
    if (!url) {
        startHttpPoll();
        return;
    }
    if (socket && (socket.readyState === 0 || socket.readyState === 1)) return;

    try {
        socket = new WebSocket(url);
    } catch (err) {
        await mark('offline', { lumiLiveError: err?.message || String(err) });
        startHttpPoll();
        return;
    }

    let opened = false;
    socket.onopen = () => {
        opened = true;
        httpOnlyMode = false;
        mark('connected', { lumiLiveMode: 'ws', lumiLiveError: '' });
        try { socket.send(JSON.stringify({ type: 'hello', version: LOCAL_VER() })); } catch { /* ignore */ }
    };
    socket.onmessage = (ev) => {
        let msg = null;
        try { msg = JSON.parse(ev.data); } catch { msg = null; }
        const ver = msg?.version;
        if (ver) onServerVersion(ver, true).catch(() => {});
    };
    socket.onerror = () => {
        // Browser still logs the failed handshake once; we fall back to HTTP.
        mark('offline', { lumiLiveMode: 'ws-error' });
    };
    socket.onclose = () => {
        socket = null;
        if (!opened) {
            // Connection refused / no WS server — switch to HTTP polling permanently for this session.
            startHttpPoll();
            return;
        }
        mark('offline');
        scheduleReconnect();
    };
}

export function startLiveLink() {
    connectLiveLink().catch(() => {});
    try {
        chrome.alarms.create('lumi-live-link', { periodInMinutes: 1 });
        chrome.alarms.onAlarm.addListener((alarm) => {
            if (alarm?.name === 'lumi-live-link') connectLiveLink().catch(() => {});
        });
    } catch { /* alarms optional */ }
    setInterval(() => {
        if (httpOnlyMode) {
            pollVersionHttp().catch(() => {});
            return;
        }
        if (socket && socket.readyState === 1) {
            try { socket.send(JSON.stringify({ type: 'ping', version: LOCAL_VER() })); } catch { /* ignore */ }
        } else {
            connectLiveLink().catch(() => {});
        }
    }, 25000);
}
