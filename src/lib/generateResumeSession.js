/**
 * In-flight Customize Resume / Regenerate job that survives leaving
 * /user/generate. The HTTP request is not tied to the React tree, so
 * navigating to Job Links (or switching profiles) does not abort it.
 * Coming back to the same profile reattaches the spinner or the result.
 */

const INFLIGHT_KEY = 'job_apply_generate_inflight_v1';
const DRAFT_KEY = 'job_apply_generate_draft_v1';

const listeners = new Set();
let job = null;

function notify() {
    listeners.forEach((fn) => {
        try { fn(job); } catch (_) { /* ignore subscriber errors */ }
    });
}

function persistInflight() {
    try {
        if (!job || job.status === 'idle') {
            sessionStorage.removeItem(INFLIGHT_KEY);
            return;
        }
        sessionStorage.setItem(INFLIGHT_KEY, JSON.stringify({
            kind: job.kind,
            profileId: job.profileId,
            startedAt: job.startedAt,
            status: job.status,
            errorMessage: job.errorMessage || null,
            formSnapshot: job.formSnapshot || null,
            result: job.status === 'done' ? job.result : null
        }));
    } catch (_) { /* quota / private mode */ }
}

/** Keep the Generate form in sessionStorage while the HTTP call runs. */
function mergeFormIntoDraft(profileId, formSnapshot, extra = {}) {
    if (!formSnapshot && !extra.result) return;
    try {
        let draft = {};
        const raw = sessionStorage.getItem(DRAFT_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') draft = parsed;
        }
        const snap = formSnapshot || {};
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
            ...draft,
            profileId,
            jobDescription: snap.jobDescription ?? draft.jobDescription ?? '',
            companyName: snap.companyName ?? draft.companyName ?? '',
            jobRole: snap.jobRole ?? draft.jobRole ?? '',
            jobUrl: snap.jobUrl ?? draft.jobUrl ?? '',
            coreSkills: Array.isArray(snap.coreSkills) ? snap.coreSkills : (draft.coreSkills || []),
            selectedFont: snap.selectedFont || draft.selectedFont || 'Arial',
            ...extra,
            savedAt: Date.now()
        }));
    } catch (_) { /* ignore */ }
}

function mergeResultIntoDraft(profileId, data, formSnapshot = null) {
    if (!data) return;
    try {
        let draft = {};
        const raw = sessionStorage.getItem(DRAFT_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') draft = parsed;
        }
        const snap = formSnapshot || job?.formSnapshot || {};
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
            ...draft,
            profileId,
            jobDescription: snap.jobDescription ?? draft.jobDescription ?? '',
            companyName: data.company_name || snap.companyName || draft.companyName || '',
            jobRole: data.job_role || snap.jobRole || draft.jobRole || '',
            jobUrl: data.job_url || snap.jobUrl || draft.jobUrl || '',
            coreSkills: Array.isArray(snap.coreSkills) ? snap.coreSkills : (draft.coreSkills || []),
            result: data,
            applicationId: data.application_id || draft.applicationId || null,
            selectedFont: (data.font_family && data.font_family !== '__random__')
                ? data.font_family
                : (snap.selectedFont || draft.selectedFont || 'Arial'),
            savedAt: Date.now()
        }));
    } catch (_) { /* ignore */ }
}

export function getGenerateSession() {
    return job;
}

export function restoreGenerateSessionFromStorage() {
    if (job) return job;
    try {
        const raw = sessionStorage.getItem(INFLIGHT_KEY);
        if (!raw) return null;
        const snap = JSON.parse(raw);
        if (!snap || typeof snap !== 'object') return null;
        if (snap.status === 'running') {
            // Full page reload cancelled the HTTP request. SPA navigation
            // keeps `job` in memory and never hits this branch.
            job = {
                ...snap,
                status: 'interrupted',
                promise: null,
                result: null
            };
            persistInflight();
            return job;
        }
        if (snap.status === 'done' && snap.result) {
            job = { ...snap, promise: null };
            return job;
        }
    } catch (_) { /* ignore */ }
    return job;
}

export function subscribeGenerateSession(fn) {
    listeners.add(fn);
    fn(job);
    return () => listeners.delete(fn);
}

export function startGenerateSession({ kind, profileId, run, formSnapshot = null }) {
    if (job?.status === 'running') return job;
    const startedAt = Date.now();
    const pid = String(profileId);
    const snap = formSnapshot && typeof formSnapshot === 'object'
        ? {
            jobDescription: formSnapshot.jobDescription || '',
            companyName: formSnapshot.companyName || '',
            jobRole: formSnapshot.jobRole || '',
            jobUrl: formSnapshot.jobUrl || '',
            coreSkills: Array.isArray(formSnapshot.coreSkills) ? formSnapshot.coreSkills : [],
            selectedFont: formSnapshot.selectedFont || 'Arial'
        }
        : null;
    job = {
        kind: kind === 'regenerate' ? 'regenerate' : 'generate',
        profileId: pid,
        startedAt,
        status: 'running',
        formSnapshot: snap,
        result: null,
        errorMessage: null,
        promise: null
    };
    // Flush job fields immediately so navigating away mid-generate
    // still restores company / role / JD / stacks on return.
    mergeFormIntoDraft(pid, snap);
    persistInflight();
    notify();
    const promise = Promise.resolve()
        .then(() => run())
        .then((result) => {
            if (!job || job.startedAt !== startedAt) return result;
            job = {
                ...job,
                status: 'done',
                result,
                errorMessage: null
            };
            mergeResultIntoDraft(pid, result, snap);
            persistInflight();
            notify();
            return result;
        })
        .catch((err) => {
            if (!job || job.startedAt !== startedAt) throw err;
            const errorMessage = err?.response?.data?.error || err?.message || 'Failed to generate resume.';
            job = {
                ...job,
                status: 'error',
                errorMessage,
                result: null
            };
            // Keep the form draft even when generate fails.
            mergeFormIntoDraft(pid, snap);
            persistInflight();
            notify();
            throw err;
        });
    job.promise = promise;
    return job;
}

/** Job form fields captured when Customize Resume started (survives leave/return). */
export function getGenerateFormSnapshot() {
    return job?.formSnapshot || null;
}

export function clearGenerateSession() {
    job = null;
    persistInflight();
    notify();
}

export function isGenerateRunningFor(profileId) {
    return job?.status === 'running' && String(job.profileId) === String(profileId);
}

export function isGenerateRunning() {
    return job?.status === 'running';
}
