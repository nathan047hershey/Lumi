/**
 * Simplify-style captured Q&A packs — persisted locally so the user can
 * review / fix answers in the extension popup after a bid fill.
 */

const STORAGE_KEY = 'lumiCapturedPacks';
const LATEST_KEY = 'lumiCapturedLatest';
const MAX_PACKS = 25;

function normalizeAnswerRow(a) {
    if (!a || typeof a !== 'object') return null;
    const label = String(a.label || a.question || a.id || '').trim();
    const answer = String(a.answer ?? a.value ?? '').trim();
    if (!label && !answer) return null;
    return {
        id: a.id || '',
        label,
        kind: a.kind || '',
        type: a.type || a.answer_type || '',
        options: Array.isArray(a.options) ? a.options : undefined,
        answer,
        lane: a.lane || '',
        source: a.match_source || a.source || ''
    };
}

/** Merge scraped questions with generated answers into one editable list. */
export function mergeCapturedItems(questions = [], answers = []) {
    const byLabel = new Map();
    const keyOf = (row) => {
        const id = String(row?.id || '').trim();
        const lab = String(row?.label || row?.question || '').trim().toLowerCase();
        return id || lab || '';
    };

    for (const q of questions || []) {
        const k = keyOf(q);
        if (!k) continue;
        byLabel.set(k, {
            id: q.id || '',
            label: String(q.label || q.question || '').trim(),
            kind: q.kind || '',
            type: q.type || q.answer_type || '',
            options: Array.isArray(q.options) ? q.options : undefined,
            answer: '',
            lane: '',
            source: 'captured'
        });
    }

    for (const raw of answers || []) {
        const a = normalizeAnswerRow(raw);
        if (!a) continue;
        const k = keyOf(a) || a.label.toLowerCase();
        const prev = byLabel.get(k);
        if (prev) {
            byLabel.set(k, { ...prev, ...a, answer: a.answer || prev.answer });
        } else {
            byLabel.set(k, a);
        }
    }

    return [...byLabel.values()].filter((row) => row.label);
}

export async function saveCapturedQuestionsPack({
    applicationId,
    company = '',
    jobRole = '',
    url = '',
    questions = [],
    answers = []
} = {}) {
    const items = mergeCapturedItems(questions, answers);
    if (!items.length && !applicationId) return null;

    const pack = {
        applicationId: applicationId || null,
        company: String(company || ''),
        jobRole: String(jobRole || ''),
        url: String(url || ''),
        capturedAt: Date.now(),
        items
    };

    let prev = [];
    try {
        const data = await chrome.storage.local.get([STORAGE_KEY]);
        prev = Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
    } catch (_) { /* ignore */ }

    const next = [
        pack,
        ...prev.filter((p) => !(applicationId && p?.applicationId === applicationId))
    ].slice(0, MAX_PACKS);

    try {
        await chrome.storage.local.set({
            [STORAGE_KEY]: next,
            [LATEST_KEY]: pack
        });
    } catch (err) {
        console.warn('[capture] save failed', err);
    }
    return pack;
}

export async function getLatestCapturedPack() {
    try {
        const data = await chrome.storage.local.get([LATEST_KEY, STORAGE_KEY]);
        if (data[LATEST_KEY]?.items?.length) return data[LATEST_KEY];
        const list = data[STORAGE_KEY];
        return Array.isArray(list) && list[0] ? list[0] : null;
    } catch (_) {
        return null;
    }
}

export async function listCapturedPacks() {
    try {
        const data = await chrome.storage.local.get([STORAGE_KEY]);
        return Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
    } catch (_) {
        return [];
    }
}

export async function updateCapturedItemAnswer(applicationId, index, answer) {
    const packs = await listCapturedPacks();
    const packIdx = applicationId
        ? packs.findIndex((p) => p?.applicationId === applicationId)
        : 0;
    const resolvedIdx = packIdx >= 0 ? packIdx : (packs[0] ? 0 : -1);
    if (resolvedIdx < 0 || !packs[resolvedIdx]) return null;
    const pack = { ...packs[resolvedIdx], items: [...(packs[resolvedIdx].items || [])] };
    if (!pack.items[index]) return null;
    pack.items[index] = { ...pack.items[index], answer: String(answer || '').trim() };
    packs[resolvedIdx] = pack;
    await chrome.storage.local.set({
        [STORAGE_KEY]: packs,
        [LATEST_KEY]: pack
    });
    return pack;
}
