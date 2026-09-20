export const config = {
    maxDuration: 300,
    api: {
        bodyParser: false,
        externalResolver: true,
        responseLimit: false
    }
};

function fail(res, payload) {
    const body = JSON.stringify(payload);
    res.statusCode = payload.status || 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(body);
}

function loadVercelApi() {
    if (typeof process.getBuiltinModule !== 'function') {
        throw new Error('Node is too old for getBuiltinModule: ' + process.version);
    }
    const nodeModule = process.getBuiltinModule('module');
    const nodePath = process.getBuiltinModule('path');
    const nodeFs = process.getBuiltinModule('fs');
    const nodeRequire = nodeModule.createRequire(nodePath.join(process.cwd(), 'package.json'));
    const candidates = [
        nodePath.join(process.cwd(), 'server', 'vercelHandler.js'),
        // NFT / includeFiles sometimes place traced files next to the route output.
        nodePath.join(__dirname, '..', '..', 'server', 'vercelHandler.js'),
        nodePath.join(__dirname, 'server', 'vercelHandler.js')
    ];
    const tried = [];
    for (const serverFile of candidates) {
        tried.push(serverFile);
        if (!nodeFs.existsSync(serverFile)) continue;
        const vercelApi = nodeRequire(serverFile);
        if (typeof vercelApi === 'function') return vercelApi;
    }
    const err = new Error('Cannot find server/vercelHandler.js');
    err.tried = tried;
    err.cwd = process.cwd();
    err.dirname = typeof __dirname !== 'undefined' ? __dirname : null;
    throw err;
}

export default async function handler(req, res) {
    try {
        const vercelApi = loadVercelApi();
        return await vercelApi(req, res);
    } catch (err) {
        console.error('[api bridge]', err);
        fail(res, {
            error: err && err.message ? err.message : String(err),
            node: process.version,
            cwd: process.cwd(),
            tried: err && err.tried ? err.tried : undefined
        });
    }
}
