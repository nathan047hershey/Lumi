/**
 * Package the Lumi Chrome extension folder as a ZIP for "Load unpacked" install.
 */
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const SKIP_DIRS = new Set(['fixtures', 'node_modules', '.git']);
const SKIP_FILES = /\.(crx|zip|map)$/i;

function resolveExtRoot() {
    const candidates = [
        path.join(process.cwd(), 'extension'),
        path.join(__dirname, '..', '..', 'extension'),
        path.join(__dirname, '..', 'extension')
    ];
    for (const root of candidates) {
        if (fs.existsSync(path.join(root, 'manifest.json'))) return root;
    }
    return candidates[0];
}

const EXT_ROOT = resolveExtRoot();

function readManifestVersion() {
    try {
        const raw = fs.readFileSync(path.join(resolveExtRoot(), 'manifest.json'), 'utf8');
        return JSON.parse(raw).version || '0';
    } catch {
        return '0';
    }
}

function addDirToZip(zip, dir, zipPrefix = '') {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
        if (SKIP_DIRS.has(name)) continue;
        const abs = path.join(dir, name);
        const rel = zipPrefix ? `${zipPrefix}/${name}` : name;
        const st = fs.statSync(abs);
        if (st.isDirectory()) {
            addDirToZip(zip, abs, rel);
        } else if (!SKIP_FILES.test(name)) {
            zip.addLocalFile(abs, zipPrefix);
        }
    }
}

function buildExtensionZipBuffer() {
    const root = resolveExtRoot();
    if (!fs.existsSync(path.join(root, 'manifest.json'))) {
        throw new Error(`Extension source not found (looked under ${root}; cwd=${process.cwd()})`);
    }
    const zip = new AdmZip();
    addDirToZip(zip, root);
    const buf = zip.toBuffer();
    if (!buf || !buf.length) {
        throw new Error('Extension zip was empty');
    }
    return buf;
}

module.exports = {
    get EXT_ROOT() {
        return resolveExtRoot();
    },
    readManifestVersion,
    buildExtensionZipBuffer
};
