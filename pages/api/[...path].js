export const config = {
    maxDuration: 300,
    api: {
        bodyParser: false,
        externalResolver: true,
        responseLimit: false
    }
};

// Static require so Next/Vercel NFT packs server/ into the serverless function.
// Dynamic createRequire(process.cwd()...) is invisible to the tracer and left
// /var/task/server missing on Vercel.
const vercelApi = require('../../server/vercelHandler.js');

function fail(res, payload) {
    const body = JSON.stringify(payload);
    res.statusCode = payload.status || 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(body);
}

export default async function handler(req, res) {
    try {
        if (typeof vercelApi !== 'function') {
            fail(res, { error: 'API handler missing', type: typeof vercelApi });
            return;
        }
        return await vercelApi(req, res);
    } catch (err) {
        console.error('[api bridge]', err);
        fail(res, {
            error: err && err.message ? err.message : String(err),
            node: process.version
        });
    }
}
