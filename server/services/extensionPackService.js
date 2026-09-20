/**
 * Package the Lumi Chrome extension folder as a ZIP for "Load unpacked" install.
 */
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const EXT_ROOT = path.join(__dirname, '..', '..', 'extension');
const SKIP_DIRS = new Set(['fixtures', 'node_modules', '.git']);
const SKIP_FILES = /\.(crx|zip|map)$/i;

function readManifestVersion() {
    try {
        const raw = fs.readFileSync(path.join(EXT_ROOT, 'manifest.json'), 'utf8');
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
    if (!fs.existsSync(path.join(EXT_ROOT, 'manifest.json'))) {
        throw new Error('Extension source not found');
    }
    const zip = new AdmZip();
    addDirToZip(zip, EXT_ROOT);
    return zip.toBuffer();
}

module.exports = {
    EXT_ROOT,
    readManifestVersion,
    buildExtensionZipBuffer
};
