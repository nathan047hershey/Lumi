/**
 * Unit checks for autofill engine helpers used by the reliability rewrite.
 * Usage: node scripts/test-autofill-engine.cjs
 */
const assert = require('assert');
const path = require('path');

async function main() {
    const enginePath = path.join(__dirname, '..', 'extension', 'lib', 'autofillEngine.js');
    const mod = await import('file:///' + enginePath.replace(/\\/g, '/'));
    const {
        pickNewQuestions,
        shouldAdvancePage,
        formFingerprint,
        mergeAnswers,
        useAnswersOnlyOnPage
    } = mod;

    // pickNewQuestions: only unanswered
    const all = [
        { id: '1', label: 'First name' },
        { id: '2', label: 'Why us?' },
        { id: '3', label: 'Salary' }
    ];
    const answered = [{ id: '1', label: 'First name', answer: 'Ada' }];
    const fresh = pickNewQuestions(all, answered);
    assert.strictEqual(fresh.length, 2);
    assert.ok(fresh.every((q) => q.id !== '1'));

    // shouldAdvancePage: fingerprint must change after Next
    assert.strictEqual(shouldAdvancePage({
        clickedNext: true,
        fingerprintBefore: 'pageA',
        fingerprintAfter: 'pageB',
        pages: 1,
        maxPages: 6
    }), true);
    assert.strictEqual(shouldAdvancePage({
        clickedNext: true,
        fingerprintBefore: 'pageA',
        fingerprintAfter: 'pageA',
        pages: 1,
        maxPages: 6
    }), false);

    // lastFp semantics: after filling page A, lastFp=A; new collect B must not equal A
    let lastFp = '';
    const page1 = formFingerprint({ url: 'https://x/1', fields: [{ id: 'a', label: 'Name' }] });
    lastFp = page1;
    const page2 = formFingerprint({ url: 'https://x/2', fields: [{ id: 'b', label: 'Why?' }] });
    assert.notStrictEqual(page1, page2);
    assert.notStrictEqual(page2, lastFp);
    // Simulate fixed loop: only stop when fp === lastFp AFTER fill (same page again)
    assert.ok(!(page2 === lastFp));

    const merged = mergeAnswers(
        [{ id: '1', answer: 'old', match_source: 'llm' }],
        [{ id: '1', answer: 'new', match_source: 'question_memory' }]
    );
    assert.strictEqual(merged.find((a) => a.id === '1').answer, 'new');

    assert.strictEqual(useAnswersOnlyOnPage(2), false);
    assert.strictEqual(useAnswersOnlyOnPage(2, { finalSubmitPass: true }), true);

    // ATS packs
    const packsPath = path.join(__dirname, '..', 'extension', 'content', 'atsPacks.js');
    require(packsPath);
    const kind = globalThis.LumiAtsPacks.atsSynonymKind('First Name', 'greenhouse');
    assert.strictEqual(kind, 'first_name');

    console.log('ok — autofill engine + ats packs checks passed');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
