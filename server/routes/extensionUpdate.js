/**
 * Public extension update feed (Chrome update protocol) + version JSON.
 * Chrome auto-update uses GET /extension/update.xml and GET /extension/lumi.crx.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { readManifestVersion, EXT_ROOT } = require('../services/extensionPackService');

const CRX_CANDIDATES = [
    path.join(EXT_ROOT, '..', 'extension.crx'),
    path.join(__dirname, '..', 'keys', 'lumi.crx')
];

function findCrx() {
    return CRX_CANDIDATES.find((p) => fs.existsSync(p)) || null;
}

function readExtensionId() {
    const idFile = path.join(__dirname, '..', 'keys', 'extension-id.txt');
    try {
        const id = fs.readFileSync(idFile, 'utf8').trim();
        if (/^[a-p]{32}$/.test(id)) return id;
    } catch { /* ignore */ }
    return '';
}

function publicBase(req) {
    const host = String(req.headers.host || '127.0.0.1:9017').split(',')[0].trim();
    const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim()
        || (host.includes('localhost') || host.startsWith('127.') ? 'http' : 'https');
    return `${proto}://${host}`;
}

function isServerlessOrNextHost(host) {
    const h = String(host || '');
    if (/\.vercel\.app|\.vercel\.sh/i.test(h)) return true;
    // Next.js dev/prod on :3000 — no Express upgrade for /extension/live
    if (/:(3000)(?:$|,)/.test(h) || /^localhost:3000$/i.test(h) || /^127\.0\.0\.1:3000$/i.test(h)) {
        return true;
    }
    return false;
}

function registerExtensionUpdateRoutes(app) {
    app.get('/extension/version', (req, res) => {
        const version = readManifestVersion();
        const crx = findCrx();
        const base = publicBase(req);
        const wsHost = String(req.headers.host || '').split(',')[0].trim();
        const httpOnly = isServerlessOrNextHost(wsHost);
        res.json({
            version,
            id: readExtensionId() || null,
            crx: !!crx,
            updateXml: `${base}/api/extension/update.xml`,
            socket: httpOnly ? null : `ws://${wsHost}/extension/live`,
            liveMode: httpOnly ? 'http' : 'ws'
        });
    });

    app.get('/extension/update.xml', (req, res) => {
        const version = readManifestVersion();
        const id = readExtensionId();
        const codebase = `${publicBase(req)}/extension/lumi.crx`;
        const appId = id || 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
        const xml = `<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='${appId}'>
    <updatecheck codebase='${codebase}' version='${version}' />
  </app>
</gupdate>
`;
        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.send(xml);
    });

    app.get('/extension/lumi.crx', (req, res) => {
        const crx = findCrx();
        if (!crx) {
            return res.status(404).type('text/plain').send('CRX not packed yet. Run scripts/pack-lumi-extension.ps1 on the server.');
        }
        res.setHeader('Content-Type', 'application/x-chrome-extension');
        res.setHeader('Cache-Control', 'no-store');
        res.sendFile(crx);
    });
}

module.exports = { registerExtensionUpdateRoutes };
