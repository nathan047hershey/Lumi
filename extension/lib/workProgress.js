/**
 * Shared work/phase progress for popup monitor + autofill timing.
 * Stored in chrome.storage.local so the popup can poll while the SW works.
 */

const KEY = 'lumiWorkProgress';

export async function setWorkProgress(patch) {
    const prev = await getWorkProgress();
    const next = {
        ...prev,
        ...patch,
        updatedAt: Date.now()
    };
    if (!next.startedAt) next.startedAt = Date.now();
    if (patch?.phase && patch.phase !== prev?.phase) {
        next.phaseStartedAt = Date.now();
    } else if (!next.phaseStartedAt) {
        next.phaseStartedAt = next.startedAt;
    }
    await chrome.storage.local.set({ [KEY]: next });
    return next;
}

export async function clearWorkProgress() {
    await chrome.storage.local.remove(KEY);
}

export async function getWorkProgress() {
    try {
        const { [KEY]: row } = await chrome.storage.local.get(KEY);
        return row && typeof row === 'object' ? row : null;
    } catch {
        return null;
    }
}

export function formatElapsed(ms) {
    const n = Math.max(0, Math.round(Number(ms) || 0) / 1000);
    if (n < 60) return `${n.toFixed(n < 10 ? 1 : 0)}s`;
    const m = Math.floor(n / 60);
    const s = Math.round(n % 60);
    return `${m}m ${s}s`;
}
