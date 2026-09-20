/**
 * Local smoke test for extension ↔ Next API before Vercel / Web Store launch.
 * Usage: node scripts/test-extension-local.cjs
 */
const http = require('http');

const BASE = process.env.LUMI_LOCAL_BASE || 'http://127.0.0.1:3000';

function get(path) {
    return new Promise((resolve, reject) => {
        const url = `${BASE}${path}`;
        const req = http.get(url, (res) => {
            let body = '';
            res.on('data', (c) => { body += c; });
            res.on('end', () => {
                resolve({ status: res.statusCode, body, headers: res.headers });
            });
        });
        req.on('error', reject);
        req.setTimeout(8000, () => {
            req.destroy(new Error('timeout'));
        });
    });
}

function post(path, json, token) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(json || {});
        const u = new URL(`${BASE}${path}`);
        const req = http.request({
            hostname: u.hostname,
            port: u.port,
            path: u.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data),
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            }
        }, (res) => {
            let body = '';
            res.on('data', (c) => { body += c; });
            res.on('end', () => resolve({ status: res.statusCode, body }));
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

async function main() {
    const results = [];
    const check = (name, ok, detail) => {
        results.push({ name, ok, detail });
        console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
    };

    try {
        const health = await get('/api/health');
        check('GET /api/health', health.status === 200, health.body.slice(0, 120));
    } catch (e) {
        check('GET /api/health', false, e.message);
    }

    try {
        const ver = await get('/api/extension/version');
        const j = JSON.parse(ver.body);
        check(
            'GET /api/extension/version',
            ver.status === 200 && !!j.version && j.liveMode === 'http',
            `version=${j.version} liveMode=${j.liveMode} socket=${j.socket}`
        );
    } catch (e) {
        check('GET /api/extension/version', false, e.message);
    }

    try {
        const login = await post('/api/auth/login', { username: 'admin', password: 'admin123' });
        const j = JSON.parse(login.body);
        const token = j.token || j.data?.token;
        check('POST /api/auth/login', login.status === 200 && !!token, token ? 'token ok' : login.body.slice(0, 160));

        if (token) {
            const info = await new Promise((resolve, reject) => {
                const u = new URL(`${BASE}/api/user/extension/info`);
                const req = http.request({
                    hostname: u.hostname,
                    port: u.port,
                    path: u.pathname,
                    method: 'GET',
                    headers: { Authorization: `Bearer ${token}` }
                }, (res) => {
                    let body = '';
                    res.on('data', (c) => { body += c; });
                    res.on('end', () => resolve({ status: res.statusCode, body }));
                });
                req.on('error', reject);
                req.end();
            });
            check('GET /api/user/extension/info', info.status === 200, info.body.slice(0, 160));

            const dl = await new Promise((resolve, reject) => {
                const u = new URL(`${BASE}/api/user/extension/download`);
                const req = http.request({
                    hostname: u.hostname,
                    port: u.port,
                    path: u.pathname,
                    method: 'GET',
                    headers: { Authorization: `Bearer ${token}` }
                }, (res) => {
                    const chunks = [];
                    res.on('data', (c) => chunks.push(c));
                    res.on('end', () => {
                        const buf = Buffer.concat(chunks);
                        resolve({
                            status: res.statusCode,
                            len: buf.length,
                            type: res.headers['content-type'],
                            magic: buf.slice(0, 2).toString('hex')
                        });
                    });
                });
                req.on('error', reject);
                req.end();
            });
            check(
                'GET /api/user/extension/download',
                dl.status === 200 && dl.len > 1000 && (dl.type || '').includes('zip'),
                `len=${dl.len} type=${dl.type}`
            );
        }
    } catch (e) {
        check('auth/extension package', false, e.message);
    }

    const failed = results.filter((r) => !r.ok);
    console.log('');
    if (failed.length) {
        console.log(`FAILED ${failed.length}/${results.length} checks — fix before Vercel / Web Store.`);
        process.exit(1);
    }
    console.log(`ALL ${results.length} CHECKS PASSED — ready for manual Chrome load + Vercel deploy.`);
    console.log('');
    console.log('Manual Chrome steps:');
    console.log('  1. chrome://extensions → Developer mode → Load unpacked → select lumi/extension');
    console.log('  2. Popup API:   http://127.0.0.1:3000/api');
    console.log('  3. Popup Front: http://127.0.0.1:3000');
    console.log('  4. Log in (admin/admin123) → open Auto Bidder → Check');
    process.exit(0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
