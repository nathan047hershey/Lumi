/**
 * Pending CV regenerate → auto-rebid queue (chrome.storage.local).
 * Cap: 5. When full, drop the oldest pending entry.
 */
const STORAGE_KEY = 'bidderPendingCvRegen';
export const PENDING_CV_REGEN_CAP = 5;

export async function listPendingCvRegen() {
    try {
        const bag = await chrome.storage.local.get([STORAGE_KEY]);
        const list = Array.isArray(bag[STORAGE_KEY]) ? bag[STORAGE_KEY] : [];
        return list
            .filter((e) => e && Number.isInteger(Number(e.applicationId)) && Number(e.applicationId) > 0)
            .sort((a, b) => Number(a.enqueuedAt || 0) - Number(b.enqueuedAt || 0));
    } catch {
        return [];
    }
}

async function saveList(list) {
    await chrome.storage.local.set({ [STORAGE_KEY]: list });
    return list;
}

/**
 * Enqueue a CV regen job. Returns { entry, dropped }.
 * If count would exceed 5, drops the oldest pending (first in line).
 */
export async function enqueuePendingCvRegen(entry) {
    const appId = parseInt(entry?.applicationId, 10);
    if (!Number.isInteger(appId) || appId <= 0) {
        return { entry: null, dropped: [] };
    }
    let list = await listPendingCvRegen();
    // Dedup by applicationId — refresh metadata, keep earliest enqueuedAt.
    const existing = list.find((e) => Number(e.applicationId) === appId);
    if (existing) {
        list = list.map((e) => (
            Number(e.applicationId) === appId
                ? {
                    ...e,
                    ...entry,
                    applicationId: appId,
                    enqueuedAt: e.enqueuedAt || Date.now(),
                    status: 'pending'
                }
                : e
        ));
        await saveList(list);
        return { entry: list.find((e) => Number(e.applicationId) === appId), dropped: [] };
    }

    const next = {
        applicationId: appId,
        profileId: entry.profileId != null ? parseInt(entry.profileId, 10) : null,
        jobLinkId: entry.jobLinkId != null ? parseInt(entry.jobLinkId, 10) : null,
        company_name: entry.company_name || '',
        job_role: entry.job_role || '',
        job_url: entry.job_url || '',
        job_description: entry.job_description || '',
        reasons: Array.isArray(entry.reasons) ? entry.reasons.slice(0, 12) : [],
        enqueuedAt: Date.now(),
        status: 'pending' // pending | regenerating | ready | failed
    };
    list = [...list, next].sort((a, b) => Number(a.enqueuedAt) - Number(b.enqueuedAt));

    const dropped = [];
    while (list.length > PENDING_CV_REGEN_CAP) {
        dropped.push(list.shift()); // oldest / first pending
    }
    await saveList(list);
    return { entry: next, dropped };
}

export async function updatePendingCvRegen(applicationId, patch = {}) {
    const appId = parseInt(applicationId, 10);
    let list = await listPendingCvRegen();
    let found = null;
    list = list.map((e) => {
        if (Number(e.applicationId) !== appId) return e;
        found = { ...e, ...patch, applicationId: appId };
        return found;
    });
    await saveList(list);
    return found;
}

export async function removePendingCvRegen(applicationId) {
    const appId = parseInt(applicationId, 10);
    const list = await listPendingCvRegen();
    const next = list.filter((e) => Number(e.applicationId) !== appId);
    await saveList(next);
    return list.length - next.length;
}

export async function countPendingCvRegen() {
    const list = await listPendingCvRegen();
    return list.filter((e) => e.status === 'pending' || e.status === 'regenerating').length;
}
