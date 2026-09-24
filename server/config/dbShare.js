'use strict';

const fs = require('fs');
const path = require('path');
const { DB_PATH } = require('./paths');

const PATHNAME = 'lumi/database.sqlite';

let loadedEtag = null;
let pushAllowed = false;
let pushChain = Promise.resolve();

function enabled() {
    return !!(process.env.VERCEL && process.env.BLOB_READ_WRITE_TOKEN);
}

function blobApi() {
    return require('@vercel/blob');
}

async function pullSharedDatabase() {
    if (!enabled()) return false;
    let blob;
    try {
        blob = blobApi();
    } catch (err) {
        console.warn('[db-share] @vercel/blob missing:', err.message);
        return false;
    }
    try {
        const result = await blob.get(PATHNAME, { access: 'private', useCache: false });
        if (!result || result.statusCode !== 200 || !result.stream) {
            pushAllowed = true;
            console.log('[db-share] no shared database yet');
            return false;
        }
        const buf = Buffer.from(await new Response(result.stream).arrayBuffer());
        if (buf.length < 100) {
            pushAllowed = true;
            return false;
        }
        fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
        fs.writeFileSync(DB_PATH, buf);
        loadedEtag = result.blob?.etag || null;
        pushAllowed = true;
        console.log('[db-share] loaded shared database', buf.length, 'bytes');
        return true;
    } catch (err) {
        if (err && (err.name === 'BlobNotFoundError' || /not found/i.test(String(err.message || '')))) {
            pushAllowed = true;
            console.log('[db-share] no shared database yet');
            return false;
        }
        pushAllowed = false;
        console.warn('[db-share] pull failed:', err.message);
        return false;
    }
}

function noteDatabaseSaved(buffer) {
    if (!enabled() || !pushAllowed || !buffer) return;
    const copy = Buffer.from(buffer);
    pushChain = pushChain.then(() => pushBuffer(copy)).catch((err) => {
        console.warn('[db-share] push failed:', err.message);
    });
}

async function pushBuffer(buffer) {
    const blob = blobApi();
    const options = {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/octet-stream',
        cacheControlMaxAge: 60
    };
    if (loadedEtag) options.ifMatch = loadedEtag;
    try {
        const result = await blob.put(PATHNAME, buffer, options);
        loadedEtag = result.etag || loadedEtag;
        console.log('[db-share] saved shared database', buffer.length, 'bytes');
    } catch (err) {
        const msg = String(err?.message || err);
        if (/precondition|412|condition|does not match/i.test(msg)) {
            console.warn('[db-share] remote database is newer; left it in place');
            return;
        }
        throw err;
    }
}

function flushSharedDatabase() {
    return pushChain;
}

module.exports = {
    pullSharedDatabase,
    noteDatabaseSaved,
    flushSharedDatabase
};
