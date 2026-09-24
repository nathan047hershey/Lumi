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
    require('dotenv').config({
        path: path.join(__dirname, 'local.env'),
        override: true
    });
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
        const finishSharedDb = () => {
            const { flushSharedDatabase } = require('./config/dbShare');
            const { flushPendingCvKicks } = require('./services/jobLinkScraper');
            const work = (async () => {
                await flushSharedDatabase();
                await flushPendingCvKicks();
                await flushSharedDatabase();
            })();
            Promise.race([
                work,
                new Promise((resolve) => setTimeout(resolve, 90000))
            ]).finally(done);
        };
        res.on('finish', finishSharedDb);
        res.on('close', finishSharedDb);
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
