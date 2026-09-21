/**
 * Lumi Auto Bidder runtime prefs (AFK, CAPTCHA keys, auto-submit, …).
 * Stored in localStorage; synced to the extension via BIDDER_SAVE_PREFS.
 */
import { sendBidderExtensionCommand } from './bidderExtensionBridge.js';

export const LUMI_PREFS_KEY = 'lumi_bidder_prefs';
export const LUMI_CAPSOLVER_KEY = 'lumi_capsolver_api_key';
export const LUMI_TWOCAPTCHA_KEY = 'lumi_twocaptcha_api_key';
export const LUMI_TWOCAPTCHA_KEY_ALT = 'lumi_2captcha_api_key';

/** @typedef {object} LumiBidderPrefs
 * @property {boolean} stayInApp
 * @property {boolean} unattended
 * @property {boolean} captchaHelper
 * @property {boolean} autoSubmit
 * @property {boolean} autoNext
 * @property {boolean} captchaFocus
 * @property {boolean} uploadCoverLetter
 * @property {boolean} soundEnabled
 * @property {boolean} requirePacketBeforeProcess  Pre-generate & review answers before Process.
 * @property {boolean} reviewOnlyMode  Fill forms but never auto-submit (Swooped-style review).
 * @property {number} humanAssistWaitSec  Seconds to wait after notify when help is needed; then skip.
 * @property {string} capsolverApiKey
 * @property {string} twocaptchaApiKey
 */

export const DEFAULT_LUMI_BIDDER_PREFS = {
    stayInApp: true,
    unattended: true,
    captchaHelper: true,
    /** Off by default — fill + park for review; enable explicitly for hands-free. */
    autoSubmit: false,
    autoNext: false,
    captchaFocus: false,
    uploadCoverLetter: false,
    soundEnabled: true,
    requirePacketBeforeProcess: true,
    reviewOnlyMode: false,
    /** Notify → wait this long for Resume / CAPTCHA solve → then skip job. */
    humanAssistWaitSec: 90,
    /** Max seconds to wait for apply form fields before skip. */
    formWaitSec: 6,
    /** Gap between opening jobs (ms). */
    openGapMs: 500,
    /** Seconds after fill before after_fill screenshot. */
    screenshotSettleSec: 0,
    /** Parallel apply tabs. */
    maxTabs: 3,
    capsolverApiKey: '',
    twocaptchaApiKey: ''
};

/** Clamp human-assist wait (seconds). 0 = skip immediately after notify. */
export function clampHumanAssistWaitSec(value, fallback = DEFAULT_LUMI_BIDDER_PREFS.humanAssistWaitSec) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(600, Math.round(n)));
}

export function clampFormWaitSec(value, fallback = DEFAULT_LUMI_BIDDER_PREFS.formWaitSec) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(3, Math.min(30, Math.round(n)));
}

export function clampOpenGapMs(value, fallback = DEFAULT_LUMI_BIDDER_PREFS.openGapMs) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(10000, Math.round(n)));
}

export function clampScreenshotSettleSec(value, fallback = DEFAULT_LUMI_BIDDER_PREFS.screenshotSettleSec) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(8, Math.round(n)));
}

export function clampMaxTabs(value, fallback = DEFAULT_LUMI_BIDDER_PREFS.maxTabs) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(1, Math.min(5, Math.round(n)));
}

/** One-click Jobright-style hands-free preset. */
export const HANDS_FREE_LUMI_PREFS = {
    stayInApp: true,
    unattended: true,
    captchaHelper: true,
    autoSubmit: true,
    autoNext: true,
    captchaFocus: false,
    uploadCoverLetter: false,
    soundEnabled: true
};

/** Free CAPTCHA only — Buster + NopeCHA; no paid solver API keys. */
export const FREE_HELPERS_LUMI_PREFS = {
    ...HANDS_FREE_LUMI_PREFS,
    captchaHelper: true,
    capsolverApiKey: '',
    twocaptchaApiKey: ''
};

function readJson(key) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function readStr(key) {
    try {
        return localStorage.getItem(key) || '';
    } catch {
        return '';
    }
}

/** @returns {LumiBidderPrefs} */
export function loadLumiBidderPrefs() {
    const stored = readJson(LUMI_PREFS_KEY) || {};
    const capsolverApiKey = String(
        stored.capsolverApiKey != null ? stored.capsolverApiKey : readStr(LUMI_CAPSOLVER_KEY)
    ).trim();
    const twocaptchaApiKey = String(
        stored.twocaptchaApiKey != null
            ? stored.twocaptchaApiKey
            : (readStr(LUMI_TWOCAPTCHA_KEY) || readStr(LUMI_TWOCAPTCHA_KEY_ALT))
    ).trim();
    return {
        ...DEFAULT_LUMI_BIDDER_PREFS,
        ...stored,
        capsolverApiKey,
        twocaptchaApiKey,
        stayInApp: stored.stayInApp != null ? !!stored.stayInApp : DEFAULT_LUMI_BIDDER_PREFS.stayInApp,
        unattended: stored.unattended != null ? !!stored.unattended : DEFAULT_LUMI_BIDDER_PREFS.unattended,
        captchaHelper: stored.captchaHelper != null ? !!stored.captchaHelper : DEFAULT_LUMI_BIDDER_PREFS.captchaHelper,
        autoSubmit: stored.autoSubmit != null ? !!stored.autoSubmit : DEFAULT_LUMI_BIDDER_PREFS.autoSubmit,
        autoNext: stored.autoNext != null ? !!stored.autoNext : DEFAULT_LUMI_BIDDER_PREFS.autoNext,
        captchaFocus: stored.captchaFocus != null
            ? !!stored.captchaFocus
            : (stored.unattended != null ? !stored.unattended : DEFAULT_LUMI_BIDDER_PREFS.captchaFocus),
        uploadCoverLetter: !!stored.uploadCoverLetter,
        soundEnabled: stored.soundEnabled != null ? !!stored.soundEnabled : DEFAULT_LUMI_BIDDER_PREFS.soundEnabled,
        requirePacketBeforeProcess: stored.requirePacketBeforeProcess != null
            ? !!stored.requirePacketBeforeProcess
            : DEFAULT_LUMI_BIDDER_PREFS.requirePacketBeforeProcess,
        reviewOnlyMode: !!stored.reviewOnlyMode,
        humanAssistWaitSec: clampHumanAssistWaitSec(
            stored.humanAssistWaitSec,
            DEFAULT_LUMI_BIDDER_PREFS.humanAssistWaitSec
        ),
        formWaitSec: clampFormWaitSec(stored.formWaitSec, DEFAULT_LUMI_BIDDER_PREFS.formWaitSec),
        openGapMs: clampOpenGapMs(stored.openGapMs, DEFAULT_LUMI_BIDDER_PREFS.openGapMs),
        screenshotSettleSec: clampScreenshotSettleSec(
            stored.screenshotSettleSec,
            DEFAULT_LUMI_BIDDER_PREFS.screenshotSettleSec
        ),
        maxTabs: clampMaxTabs(stored.maxTabs, DEFAULT_LUMI_BIDDER_PREFS.maxTabs)
    };
}

/** Persist prefs + legacy key slots used by Process payload. */
export function persistLumiBidderPrefs(prefs) {
    const prev = loadLumiBidderPrefs();
    const next = { ...prev, ...prefs };
    // Keep keys unless:
    //  - clearCaptchaApiKeys: true (user clicked Clear), or
    //  - replaceCaptchaApiKeys: true (user is pasting replacements; empty allowed mid-edit)
    // Non-empty new values always win (replace wrong keys).
    const explicitClear = prefs && prefs.clearCaptchaApiKeys === true;
    const replacing = prefs && prefs.replaceCaptchaApiKeys === true;
    if (!explicitClear && !replacing) {
        if (!String(next.capsolverApiKey || '').trim() && String(prev.capsolverApiKey || '').trim()) {
            next.capsolverApiKey = prev.capsolverApiKey;
        }
        if (!String(next.twocaptchaApiKey || '').trim() && String(prev.twocaptchaApiKey || '').trim()) {
            next.twocaptchaApiKey = prev.twocaptchaApiKey;
        }
    }
    delete next.clearCaptchaApiKeys;
    delete next.replaceCaptchaApiKeys;
    try {
        localStorage.setItem(LUMI_PREFS_KEY, JSON.stringify({
            stayInApp: !!next.stayInApp,
            unattended: !!next.unattended,
            captchaHelper: !!next.captchaHelper,
            autoSubmit: !!next.autoSubmit,
            autoNext: !!next.autoNext,
            captchaFocus: !!next.captchaFocus,
            uploadCoverLetter: !!next.uploadCoverLetter,
            soundEnabled: !!next.soundEnabled,
            requirePacketBeforeProcess: next.requirePacketBeforeProcess != null
                ? !!next.requirePacketBeforeProcess
                : DEFAULT_LUMI_BIDDER_PREFS.requirePacketBeforeProcess,
            reviewOnlyMode: !!next.reviewOnlyMode,
            humanAssistWaitSec: clampHumanAssistWaitSec(next.humanAssistWaitSec),
            formWaitSec: clampFormWaitSec(next.formWaitSec),
            openGapMs: clampOpenGapMs(next.openGapMs),
            screenshotSettleSec: clampScreenshotSettleSec(next.screenshotSettleSec),
            maxTabs: clampMaxTabs(next.maxTabs),
            capsolverApiKey: String(next.capsolverApiKey || ''),
            twocaptchaApiKey: String(next.twocaptchaApiKey || '')
        }));
        localStorage.setItem(LUMI_CAPSOLVER_KEY, String(next.capsolverApiKey || ''));
        localStorage.setItem(LUMI_TWOCAPTCHA_KEY, String(next.twocaptchaApiKey || ''));
    } catch (_) { /* ignore */ }
    return next;
}

/** Map app prefs → chrome.storage field names used by getBidderPrefs. */
export function prefsToExtensionPatch(prefs) {
    const p = { ...DEFAULT_LUMI_BIDDER_PREFS, ...prefs };
    const waitSec = clampHumanAssistWaitSec(p.humanAssistWaitSec);
    return {
        bidderStayInApp: !!p.stayInApp,
        bidderUnattended: !!p.unattended,
        bidderCaptchaHelper: true,
        // Same budget drives CAPTCHA helper wait + AFK grace + manual-assist skip.
        bidderHumanAssistWaitSec: waitSec,
        bidderCaptchaHelperWaitSec: waitSec,
        bidderCaptchaGraceSec: waitSec,
        bidderAutoSubmit: p.reviewOnlyMode ? false : !!p.autoSubmit,
        bidderAutoNext: !!p.autoNext,
        bidderCaptchaFocus: p.unattended ? false : !!p.captchaFocus,
        bidderUploadCoverLetter: !!p.uploadCoverLetter,
        bidderSoundEnabled: !!p.soundEnabled,
        bidderFormWaitMs: clampFormWaitSec(p.formWaitSec) * 1000,
        bidderOpenGapMs: clampOpenGapMs(p.openGapMs),
        bidderScreenshotSettleSec: clampScreenshotSettleSec(p.screenshotSettleSec),
        bidderMaxTabs: clampMaxTabs(p.maxTabs),
        // Clear paid solver keys — free NopeCHA/Buster path only.
        bidderCapsolverApiKey: '',
        bidderTwocaptchaApiKey: '',
        bidderDisabledFillLessons: (() => {
            try {
                const raw = localStorage.getItem('lumi_disabled_fill_lessons');
                return raw ? JSON.parse(raw) : {};
            } catch {
                return {};
            }
        })()
    };
}

/**
 * Save locally and push to Lumi extension (best-effort).
 * @returns {Promise<{ prefs: LumiBidderPrefs, synced: boolean, error?: string }>}
 */
export async function saveLumiBidderPrefs(patch) {
    const prefs = persistLumiBidderPrefs(patch);
    const extensionPatch = prefsToExtensionPatch(prefs);
    try {
        await sendBidderExtensionCommand('JOB_APPLY_BIDDER_SAVE_PREFS', 8000, {
            prefs: extensionPatch
        });
        return { prefs, synced: true };
    } catch (err) {
        return {
            prefs,
            synced: false,
            error: err?.message || 'Could not sync to Lumi extension'
        };
    }
}

/** Payload fragment for PROCESS_READY_QUEUE from current prefs. */
export function processQueuePrefsPayload(prefs = loadLumiBidderPrefs()) {
    const p = { ...DEFAULT_LUMI_BIDDER_PREFS, ...prefs };
    const autoSubmit = p.reviewOnlyMode ? false : !!p.autoSubmit;
    let disabledFillLessons = {};
    try {
        const raw = localStorage.getItem('lumi_disabled_fill_lessons');
        if (raw) disabledFillLessons = JSON.parse(raw) || {};
    } catch {
        disabledFillLessons = {};
    }
    return {
        stayInApp: !!p.stayInApp,
        unattended: !!p.unattended,
        autoSubmit,
        autoNext: !!p.autoNext,
        humanAssistWaitSec: clampHumanAssistWaitSec(p.humanAssistWaitSec),
        captchaGraceSec: clampHumanAssistWaitSec(p.humanAssistWaitSec),
        captchaHelper: true,
        captchaHelperWaitSec: clampHumanAssistWaitSec(p.humanAssistWaitSec),
        // Paid CapSolver / 2Captcha APIs disabled — free helpers only.
        uploadCoverLetter: !!p.uploadCoverLetter,
        formWaitMs: clampFormWaitSec(p.formWaitSec) * 1000,
        openGapMs: clampOpenGapMs(p.openGapMs),
        screenshotSettleSec: clampScreenshotSettleSec(p.screenshotSettleSec),
        maxTabs: clampMaxTabs(p.maxTabs),
        disabledFillLessons
    };
}
