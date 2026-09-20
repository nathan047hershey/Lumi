/**
 * Vercel / Next.js API entry — Express as a Node request listener.
 * serverless-http expects a Lambda event, not Vercel's (req, res), so it
 * never writes the real response and the function hits the runtime limit.
 * Full workers (Chrome, RabbitMQ, WS, IMAP) stay on the VPS (`node server`).
 */
'use strict';

const path = require('path');

try {
    require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch { /* optional */ }

const { app, ensureReady } = require('./index');

let readyPromise = null;

function whenReady() {
    if (!readyPromise) {
        readyPromise = ensureReady().then(() => {
            console.log('[vercel] database ready');
        });
    }
    return readyPromise;
}

module.exports = async function vercelApi(req, res) {
    await whenReady();
    await new Promise((resolve, reject) => {
        let settled = false;
        const done = () => {
            if (settled) return;
            settled = true;
            resolve();
        };
        res.on('finish', done);
        res.on('close', done);
        res.on('error', (err) => {
            if (settled) return;
            settled = true;
            reject(err);
        });
        try {
            app(req, res);
        } catch (err) {
            if (settled) return;
            settled = true;
            reject(err);
        }
    });
};
