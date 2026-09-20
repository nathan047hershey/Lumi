/**
 * Tiny WebSocket server so the Lumi extension stays linked to this API.
 * No extra npm package — Chrome's extension service worker connects to /extension/live.
 */
'use strict';

const crypto = require('crypto');
const { readManifestVersion } = require('./extensionPackService');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const clients = new Set();

function sendText(socket, obj) {
    if (!socket || socket.destroyed) return;
    const payload = Buffer.from(JSON.stringify(obj));
    const len = payload.length;
    let header;
    if (len < 126) {
        header = Buffer.from([0x81, len]);
    } else if (len < 65536) {
        header = Buffer.alloc(4);
        header[0] = 0x81;
        header[1] = 126;
        header.writeUInt16BE(len, 2);
    } else {
        header = Buffer.alloc(10);
        header[0] = 0x81;
        header[1] = 127;
        header.writeBigUInt64BE(BigInt(len), 2);
    }
    try {
        socket.write(Buffer.concat([header, payload]));
    } catch (_) { /* ignore */ }
}

function helloPayload() {
    return {
        type: 'hello',
        version: readManifestVersion(),
        ts: Date.now()
    };
}

function broadcast(obj) {
    for (const socket of clients) sendText(socket, obj);
}

function handleClientBuffer(socket, state, chunk) {
    state.buf = state.buf ? Buffer.concat([state.buf, chunk]) : chunk;
    while (state.buf && state.buf.length >= 2) {
        const b0 = state.buf[0];
        const b1 = state.buf[1];
        const opcode = b0 & 0x0f;
        const masked = (b1 & 0x80) !== 0;
        let len = b1 & 0x7f;
        let offset = 2;
        if (len === 126) {
            if (state.buf.length < 4) return;
            len = state.buf.readUInt16BE(2);
            offset = 4;
        } else if (len === 127) {
            if (state.buf.length < 10) return;
            len = Number(state.buf.readBigUInt64BE(2));
            offset = 10;
        }
        const maskLen = masked ? 4 : 0;
        if (state.buf.length < offset + maskLen + len) return;
        let payload = state.buf.subarray(offset + maskLen, offset + maskLen + len);
        if (masked) {
            const mask = state.buf.subarray(offset, offset + 4);
            payload = Buffer.from(payload);
            for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
        }
        state.buf = state.buf.subarray(offset + maskLen + len);
        if (opcode === 0x8) {
            socket.end();
            return;
        }
        if (opcode === 0x9) {
            // ping → pong
            const pong = Buffer.alloc(2 + payload.length);
            pong[0] = 0x8a;
            pong[1] = payload.length;
            payload.copy(pong, 2);
            socket.write(pong);
            continue;
        }
        if (opcode === 0x1) {
            let msg = null;
            try { msg = JSON.parse(payload.toString('utf8')); } catch { msg = null; }
            if (msg && (msg.type === 'ping' || msg.type === 'hello')) {
                sendText(socket, { type: 'pong', ...helloPayload() });
            }
        }
    }
}

function attachExtensionLiveSocket(httpServer) {
    if (!httpServer || httpServer.__lumiLiveAttached) return;
    httpServer.__lumiLiveAttached = true;
    httpServer.on('upgrade', (req, socket) => {
        const path = String(req.url || '').split('?')[0];
        if (path !== '/extension/live') {
            socket.destroy();
            return;
        }
        const key = req.headers['sec-websocket-key'];
        if (!key) {
            socket.destroy();
            return;
        }
        const accept = crypto.createHash('sha1').update(String(key) + GUID).digest('base64');
        socket.write(
            'HTTP/1.1 101 Switching Protocols\r\n'
            + 'Upgrade: websocket\r\n'
            + 'Connection: Upgrade\r\n'
            + `Sec-WebSocket-Accept: ${accept}\r\n`
            + '\r\n'
        );
        const state = { buf: null };
        clients.add(socket);
        sendText(socket, helloPayload());
        socket.on('data', (chunk) => handleClientBuffer(socket, state, chunk));
        socket.on('close', () => clients.delete(socket));
        socket.on('error', () => clients.delete(socket));
    });
}

module.exports = {
    attachExtensionLiveSocket,
    broadcastExtension: broadcast,
    extensionClientCount: () => clients.size
};
