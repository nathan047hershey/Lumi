/**
 * Keep the extension linked to the Lumi API.
 * Never open a WebSocket unless the API is reachable and advertises a socket URL.
 * Vercel / Next / down local servers use HTTP /extension/version polling only.
 */
import { getSettings, saveSettings, normalizeBaseUrl } from './api.js';

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

/** Prefer an open Lumi desk tab (especially Vercel) over stale localhost :9017 settings. */
export async function adoptDeskUrlsFromTabs() {
    let tabs = [];
    try {
        tabs = await chrome.tabs.query({});
    } catch {
        return null;
    }
    for (const tab of tabs) {
        try {
            const u = new URL(tab.url || '');
            if (!/^https?:$/i.test(u.protocol)) continue;
            const host = u.hostname.toLowerCase();
            if (host.endsWith('.vercel.app') || host.endsWith('.vercel.sh') || host === 'neptunemart.space' || host.endsWith('.neptunemart.space')) {
                const origin = `${u.protocol}//${u.hostname}`;
                const patch = {
                    apiBaseUrl: `${origin}/api`,
                    frontendBaseUrl: origin
                };
                await saveSettings(patch);
                return patch;
            }
        } catch { /* next tab */ }
    }
    return null;
}

function isHttpOnlyLiveHost(apiBaseUrl) {
    const base = String(apiBaseUrl || '');
    if (!base) return true;
    if (/vercel\.app|vercel\.sh|neptunemart\.space|netlify\.app|cloudflare\.pages/i.test(base)) return true;
    if (/:(3000)(?:\/|$)/.test(base)) return true;
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
            if (status === 'update_available') chrome.runtime.reload();
        });
    } catch { /* unpacked */ }
    try {
        chrome.notifications.create('lumi-update', {
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'Lumi update',
            message: `Server has v${serverVersion} (this copy is v${local}). Re-download the extension zip from Lumi if you load unpacked.`
        });
    } catch { /* ignore */ }
}

async function fetchVersion(apiBaseUrl) {
    const url = versionUrlFromApi(apiBaseUrl);
    if (!url) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
        const res = await fetch(url, { method: 'GET', cache: 'no-store', signal: controller.signal });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

function usePortLink() {
    httpOnlyMode = true;
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
    if (socket) {
        try { socket.close(); } catch { /* ignore */ }
        socket = null;
    }
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    return mark('connected', { lumiLiveMode: 'port', lumiLiveError: '' });
}

function scheduleReconnect() {
    if (httpOnlyMode) return;
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectLiveLink().catch(() => {});
    }, 30000);
}

/**
 * Open WS only when:
 * - host is not serverless, AND
 * - /extension/version is reachable, AND
 * - version payload includes a socket URL (local Express advertises it; Vercel returns null)
 */
export async function connectLiveLink() {
    // Auto-fix stale localhost when the Vercel desk is open.
    const adopted = await adoptDeskUrlsFromTabs();
    const settings = await getSettings();
    const api = normalizeBaseUrl(adopted?.apiBaseUrl || settings.apiBaseUrl);

    if (isHttpOnlyLiveHost(api)) {
        // Vercel cannot hold /extension/live. The open Chrome port is the link.
        await usePortLink();
        return;
    }

    if (socket && (socket.readyState === 0 || socket.readyState === 1)) return;

    const version = await fetchVersion(api);
    if (!version) {
        await mark('offline', { lumiLiveMode: 'ws', lumiLiveError: 'version endpoint unreachable' });
        scheduleReconnect();
        return;
    }
    await onServerVersion(version.version || '', true);

    if (!version.socket || version.liveMode === 'http') {
        await usePortLink();
        return;
    }

    const url = version.socket.startsWith('ws') ? version.socket : wsUrlFromApi(api);
    if (!url) {
        await usePortLink();
        return;
    }
    try {
        socket = new WebSocket(url);
    } catch (err) {
        await mark('offline', { lumiLiveError: err?.message || String(err) });
        await usePortLink();
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
        if (msg?.version) onServerVersion(msg.version, true).catch(() => {});
    };
    socket.onerror = () => {
        mark('offline', { lumiLiveMode: 'ws-error' });
    };
    socket.onclose = () => {
        socket = null;
        if (!opened) {
            usePortLink().catch(() => {});
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
        if (httpOnlyMode) return;
        if (socket && socket.readyState === 1) {
            try { socket.send(JSON.stringify({ type: 'ping', version: LOCAL_VER() })); } catch { /* ignore */ }
        }
    }, 25000);
}
