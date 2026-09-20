/**
 * Keep the extension linked to the Lumi API over a WebSocket.
 * When the server version is newer, ask Chrome to update (same path as store extensions).
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

function wsUrlFromApi(apiBaseUrl) {
    const base = String(apiBaseUrl || '').replace(/\/+$/, '');
    if (base.startsWith('https://')) return `wss://${base.slice(8)}/extension/live`;
    if (base.startsWith('http://')) return `ws://${base.slice(7)}/extension/live`;
    return '';
}

let socket = null;
let reconnectTimer = null;

async function mark(status, extra = {}) {
    try {
        await chrome.storage.local.set({
            lumiLiveStatus: status,
            lumiLiveAt: Date.now(),
            ...extra
        });
    } catch { /* ignore */ }
}

async function onServerVersion(serverVersion) {
    const local = LOCAL_VER();
    const newer = cmpVer(serverVersion, local) > 0;
    await mark(socket && socket.readyState === 1 ? 'connected' : 'offline', {
        lumiServerVersion: serverVersion || '',
        lumiUpdateAvailable: newer
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
            message: `Server has v${serverVersion} (this copy is v${local}). Chrome will update Lumi if it was installed with the auto-update policy.`
        });
    } catch { /* ignore */ }
}

function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectLiveLink().catch(() => {});
    }, 15000);
}

export async function connectLiveLink() {
    const settings = await getSettings();
    const url = wsUrlFromApi(settings.apiBaseUrl);
    if (!url) return;
    if (socket && (socket.readyState === 0 || socket.readyState === 1)) return;
    try {
        socket = new WebSocket(url);
    } catch (err) {
        await mark('offline', { lumiLiveError: err?.message || String(err) });
        scheduleReconnect();
        return;
    }
    socket.onopen = () => {
        mark('connected');
        try { socket.send(JSON.stringify({ type: 'hello', version: LOCAL_VER() })); } catch { /* ignore */ }
    };
    socket.onmessage = (ev) => {
        let msg = null;
        try { msg = JSON.parse(ev.data); } catch { msg = null; }
        const ver = msg?.version;
        if (ver) onServerVersion(ver).catch(() => {});
    };
    socket.onerror = () => {
        mark('offline');
    };
    socket.onclose = () => {
        socket = null;
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
        if (socket && socket.readyState === 1) {
            try { socket.send(JSON.stringify({ type: 'ping', version: LOCAL_VER() })); } catch { /* ignore */ }
        } else {
            connectLiveLink().catch(() => {});
        }
    }, 25000);
}
