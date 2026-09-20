/**
 * Build a Chrome Web Store upload zip from ./extension
 * Usage: node scripts/pack-extension-store.cjs
 */
const fs = require('fs');
const path = require('path');
const { buildExtensionZipBuffer, readManifestVersion } = require('../server/services/extensionPackService');

const outDir = path.join(__dirname, '..', 'dist');
const version = readManifestVersion();
const outFile = path.join(outDir, `lumi-auto-bidder-chrome-store-v${version}.zip`);

fs.mkdirSync(outDir, { recursive: true });
const buf = buildExtensionZipBuffer();
fs.writeFileSync(outFile, buf);
console.log(`Wrote ${outFile} (${buf.length} bytes)`);
console.log('Upload this zip at https://chrome.google.com/webstore/devconsole');
