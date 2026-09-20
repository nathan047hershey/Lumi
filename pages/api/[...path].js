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

export default async function handler(req, res) {
    try {
        if (typeof process.getBuiltinModule !== 'function') {
            fail(res, { error: 'Node is too old for getBuiltinModule', node: process.version });
            return;
        }
        const nodeModule = process.getBuiltinModule('module');
        const nodePath = process.getBuiltinModule('path');
        const nodeRequire = nodeModule.createRequire(nodePath.join(process.cwd(), 'package.json'));
        const serverFile = nodePath.join(process.cwd(), 'server', 'vercelHandler.js');
        const vercelApi = nodeRequire(serverFile);
        if (typeof vercelApi !== 'function') {
            fail(res, { error: 'API handler missing', type: typeof vercelApi, node: process.version });
            return;
        }
        return await vercelApi(req, res);
    } catch (err) {
        console.error('[api bridge]', err);
        fail(res, {
            error: err && err.message ? err.message : String(err),
            node: process.version,
            cwd: process.cwd()
        });
    }
}
