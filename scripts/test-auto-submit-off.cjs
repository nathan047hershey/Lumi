/**
 * Regression tests: Auto-submit OFF must never allow submit gates.
 * Also covers prefs defaults + Process payload mapping.
 *
 * Usage: node scripts/test-auto-submit-off.cjs
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');

async function loadModule(rel) {
    const abs = path.join(__dirname, '..', rel);
    return import('file:///' + abs.replace(/\\/g, '/'));
}

function readJsSnippet(rel, pattern) {
    const abs = path.join(__dirname, '..', rel);
    const src = fs.readFileSync(abs, 'utf8');
    assert.ok(pattern.test(src), `Expected ${pattern} in ${rel}`);
    return src;
}

async function main() {
    const verify = await loadModule('extension/lib/fillVerify.js');
    const { canAutoSubmit, isFillIncomplete, normalizeFillStats } = verify;

    // --- canAutoSubmit gates ---
    assert.strictEqual(
        canAutoSubmit({ requiredComplete: true, filled: 10 }, { autoSubmit: false }),
        false,
        'autoSubmit false → never submit'
    );
    assert.strictEqual(
        canAutoSubmit({ requiredComplete: true, filled: 10 }, {}),
        false,
        'missing prefs.autoSubmit → never submit'
    );
    assert.strictEqual(
        canAutoSubmit({ requiredComplete: true, filled: 10 }, { autoSubmit: true }),
        true,
        'complete + autoSubmit true → allow'
    );
    assert.strictEqual(
        canAutoSubmit(
            { requiredComplete: false, requiredTotal: 5, requiredOk: 2, missingRequired: ['Phone'] },
            { autoSubmit: true }
        ),
        false,
        'incomplete required → block even if autoSubmit on'
    );

    // --- normalize: incomplete stays incomplete ---
    const n = normalizeFillStats({
        filled: 8,
        requiredComplete: false,
        requiredTotal: 6,
        requiredOk: 3,
        missingRequired: ['LinkedIn', 'Country']
    });
    assert.strictEqual(n.requiredComplete, false);
    assert.strictEqual(isFillIncomplete(n), true);

    // --- source defaults must be OFF ---
    const prefsSrc = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'lib', 'bidderQueue.js'),
        'utf8'
    );
    assert.ok(
        /autoSubmit:\s*false/.test(prefsSrc),
        'BIDDER_DEFAULTS.autoSubmit must be false'
    );
    assert.ok(
        /const autoSubmit = data\.bidderAutoSubmit === true/.test(prefsSrc),
        'getBidderPrefs must require explicit true'
    );

    const appPrefs = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'lib', 'lumiBidderPrefs.js'),
        'utf8'
    );
    // DEFAULT_LUMI_BIDDER_PREFS.autoSubmit: false (not the HANDS_FREE preset)
    const defaultBlock = appPrefs.match(
        /export const DEFAULT_LUMI_BIDDER_PREFS = \{[\s\S]*?autoSubmit:\s*(true|false)/
    );
    assert.ok(defaultBlock, 'DEFAULT_LUMI_BIDDER_PREFS found');
    assert.strictEqual(defaultBlock[1], 'false', 'app default autoSubmit must be false');

    // Process payload: reviewOnlyMode forces false
    const { processQueuePrefsPayload, prefsToExtensionPatch } = await loadModule(
        'src/lib/lumiBidderPrefs.js'
    );
    const payloadOff = processQueuePrefsPayload({
        autoSubmit: false,
        reviewOnlyMode: false
    });
    assert.strictEqual(payloadOff.autoSubmit, false);

    const payloadReview = processQueuePrefsPayload({
        autoSubmit: true,
        reviewOnlyMode: true
    });
    assert.strictEqual(payloadReview.autoSubmit, false, 'reviewOnlyMode must force autoSubmit off');

    const extPatch = prefsToExtensionPatch({
        autoSubmit: false,
        reviewOnlyMode: false
    });
    assert.strictEqual(extPatch.bidderAutoSubmit, false);

    const extReview = prefsToExtensionPatch({
        autoSubmit: true,
        reviewOnlyMode: true
    });
    assert.strictEqual(extReview.bidderAutoSubmit, false);

    // --- background must suppress submitClicked when autoSubmit off ---
    readJsSnippet(
        'extension/background.js',
        /submitted = !!fillStats\?\.submitClicked && !!prefs\.autoSubmit/
    );
    readJsSnippet(
        'extension/background.js',
        /canAutoSubmit\(reStats, \{ autoSubmit: !!prefs\.autoSubmit \}\)/
    );

    // --- content engine only submits when payload.autoSubmit ---
    readJsSnippet(
        'extension/content/bidderFill.js',
        /if \(ready && autoSubmit\)/
    );

    console.log('ok — auto-submit OFF gates + defaults passed');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
