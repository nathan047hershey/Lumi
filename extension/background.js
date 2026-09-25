import {
    getSettings,
    saveSettings,
    listProfiles,
    generateResume,
    regenerateResume,
    generateAnswers,
    generateCoverLetter,
    techstacksToCoreSkills,
    inferCoreSkillsFromJd,
    resumeDownloadUrl,
    fetchResumeBase64,
    buildUploadResumeFilename,
    listBidderReady,
    getBidderStatus,
    markApplicationApplied,
    markJobLinkExpired,
    clearFalseApplicationSuccess,
    getBidderApplication,
    getBidderApplicationByJobUrl,
    getLatestBidderApplication,
    logBidCourseFill,
    generateBidderAnswers,
    checkoutApplicationCheck,
    checkBidderCv,
    logBidderFieldAttempts,
    interpretBidderInstruction,
    listBidderFillLessons,
    saveBidderFillLesson,
    upsertQuestionMemory
} from './lib/api.js';
import {
    saveCapturedQuestionsPack,
    getLatestCapturedPack,
    updateCapturedItemAnswer
} from './lib/capturedQuestions.js';
import {
    setWorkProgress,
    clearWorkProgress,
    getWorkProgress
} from './lib/workProgress.js';
import { startLiveLink } from './lib/liveLink.js';
import {
    enqueuePendingCvRegen,
    updatePendingCvRegen,
    removePendingCvRegen,
    listPendingCvRegen,
    PENDING_CV_REGEN_CAP
} from './lib/cvPendingRegen.js';
import {
    BIDDER_DEFAULTS,
    acquireQueueLock,
    releaseQueueLock,
    setQueueState,
    setAppRunState,
    getQueueState,
    getBidderPrefs,
    saveBidderPrefs,
    logCourseEvent,
    uploadScreenshot,
    setFileInputViaDebugger,
    downloadResumeToCvLibrary,
    openCvFolderPicker,
    getCvFolderStatus,
    savePackage,
    detectSubmitSuccess,
    detectSubmitSuccessDetail,
    pollDetectSubmitSuccess,
    finalizeSubmitSuccessIfDetected,
    clearFalseSuccessOutlines,
    uploadSuccessProofScreenshot,
    detectCaptchaOrLogin,
    waitForCaptchaOrLoginCleared,
    clickFormNextIfAny,
    ensureUsDialCodeTrusted,
    attachPageDebugger,
    releasePageDebugger,
    releaseAllPageDebuggers,
    assistRecaptchaCheckbox,
    captchaStrategyForVendor,
    vendorLabel,
    isBlockingCaptchaWall,
    tryFillOutlookEmailOtp,
    fillEmailSecurityCode,
    detectEmailSecurityCodePage,
    clickPostOtpSubmit,
    emailOtpInputsFilled,
    probeCaptchaHelpers
} from './lib/bidderQueue.js';
import {
    isAppUrl,
    isAllowedAppOrigin,
    APP_TAB_QUERY_PATTERNS,
    appOpenHint
} from './lib/appOrigin.js';
import { appendUiMessage, getUiMessageLog } from './lib/uiMessageLog.js';
import {
    saveFillLesson,
    lessonsForHost as fillLessonsForHost,
    matchLesson as matchFillLesson
} from './lib/fillLessons.js';
import {
    looksLikeCreateAccountPage,
    looksLikeLoginPage,
    generateAtsPassword,
    upsertApplyLesson,
    lessonsForHost
} from './lib/applyGate.js';
import {
    assistCaptchaHelpers,
    assistCaptchaHelpersWithRetry,
    detectCaptchaSolved
} from './lib/captchaAssist.js';
import { resolveBidderAts, detectAtsFromUrl, isAshbyJobDescriptionUrl, ashbyApplicationUrl } from './lib/atsDetect.js';
import { analyzeJobClosedPage } from './lib/jobClosedPage.js';
import {
    AUTOFILL_ENGINE,
    AUTOFILL_RETRY_PER_PAGE,
    BID_HARD_LIMIT_MS,
    bidLimitMsForAts,
    formWaitMsForAts,
    normalizeFillStats,
    isFillIncomplete,
    canAutoSubmit,
    engineLabelForAts,
    formFingerprint,
    formFieldCount,
    formHasUsableFields,
    formHasIdentityFields,
    formHasCoreIdentity,
    formReadyForProfileFill,
    maxPagesForAts,
    mergeAnswers,
    lessonFillsToAnswers,
    pickNewQuestions,
    settleMsForAts,
    shouldAdvancePage,
    shouldRefillPage,
    useAnswersOnlyOnPage
} from './lib/autofillEngine.js';
import { solveCaptchaOnTab, resolveSolverProvider } from './lib/captchaSolver.js';
import { SUBMIT_SUCCESS_POLL_MS } from './lib/fillVerify.js';

const GENERATING_KEY = 'generating';
const FILLING_KEY = 'filling';
const FILLING_AT_KEY = 'fillingAt';

/** Prevent concurrent Mode-2 autofill on the same tab (begin→end→begin loop). */
const inflightPendingFillTabs = new Map();

/**
 * Optional cover letter DOCX for upload.
 * Default OFF — never invent a CL or put a resume into the CL slot.
 * Only runs when opts.uploadCoverLetter is true, or the form marks CL as required.
 */
async function maybePrepareCoverLetterFile({
    form,
    profileId,
    jobDescription,
    resumeHtml,
    companyName,
    jobRole,
    settings,
    uploadCoverLetter = false
}) {
    const fileInputs = form?.fileInputs || [];
    const coverInputs = fileInputs.filter((f) => {
        const hay = `${f.label || ''} ${f.kind || ''}`.toLowerCase();
        return f.kind === 'cover_letter' || /\b(cover[\s_-]*letter|covering[\s_-]*letter)\b/.test(hay);
    });
    if (!coverInputs.length || !profileId) return null;

    const required = coverInputs.some((f) => f.required || f.required === true
        || /\*/.test(String(f.label || ''))
        || /\brequired\b/i.test(String(f.label || '')));
    // Skip optional CL unless user explicitly enabled upload.
    if (!uploadCoverLetter && !required) return null;

    try {
        const gen = await generateCoverLetter({
            profile_id: profileId,
            job_description: jobDescription || '',
            resume_html: resumeHtml || '',
            company_name: companyName || '',
            job_role: jobRole || ''
        });
        const fname = gen?.cover_letter_filename;
        if (!fname) return null;
        // Hard gate: never treat a resume_*.docx as a cover letter.
        if (/^resume_/i.test(fname) || !/cover/i.test(fname)) {
            console.warn('[autofill] refusing non-cover-letter filename for CL slot', fname);
            return null;
        }
        return await fetchResumeBase64(settings.apiBaseUrl, fname, settings.token);
    } catch (err) {
        console.warn('[autofill] cover letter generate failed', err);
        return null;
    }
}
function jobUrlKey(url) {
    if (!url) return '';
    try {
        const u = new URL(url);
        return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}`.toLowerCase();
    } catch {
        return String(url).split('?')[0].toLowerCase();
    }
}

function newSessionId() {
    return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Persist the job-page ↔ generate-page pair so fill cannot use another job's CV.
 */
async function saveActiveJobSession(patch) {
    const settings = await getSettings();
    const prev = settings.activeJobSession || {};
    const next = {
        ...prev,
        ...patch,
        updatedAt: new Date().toISOString()
    };
    await saveSettings({ activeJobSession: next });
    return next;
}

async function clearActiveJobSession() {
    await saveSettings({ activeJobSession: null });
}

/** Avoid overlapping regen workers. */
let _cvRegenWorkerRunning = false;

/**
 * Park application for CV regenerate (max 5 pending). Drop oldest when over cap.
 * Kicks background regen → quality re-check → auto rebid when pass.
 */
async function parkApplicationForCvRegen({
    item,
    app,
    qa,
    reason = 'cv_quality'
} = {}) {
    const applicationId = item?.id || app?.id;
    if (!applicationId) return { ok: false };

    const { entry, dropped } = await enqueuePendingCvRegen({
        applicationId,
        profileId: app?.profile_id || item?.profile_id,
        jobLinkId: app?.job_link_id || item?.job_link_id,
        company_name: app?.company_name || item?.company_name || '',
        job_role: app?.job_role || item?.job_role || '',
        job_url: app?.job_url || item?.open_url || item?.job_url || '',
        job_description: app?.job_description || '',
        reasons: qa?.hard_reasons || qa?.reasons || [reason]
    });

    for (const d of dropped) {
        await logCourseEvent(d.applicationId, 'cv_regenerate_dropped', {
            reason: 'pending_cap_5',
            cap: PENDING_CV_REGEN_CAP,
            company_name: d.company_name || null
        }).catch(() => {});
    }

    await logCourseEvent(applicationId, 'cv_regenerate_pending', {
        reason,
        hard_reasons: qa?.hard_reasons || [],
        quality: qa?.quality || null,
        pending_count: (await listPendingCvRegen()).length,
        cap: PENDING_CV_REGEN_CAP
    }).catch(() => {});

    // Fire-and-forget worker
    processPendingCvRegenQueue().catch((err) => {
        console.warn('[bidder] cv regen worker', err?.message || err);
    });

    return { ok: true, entry, dropped };
}

/**
 * Drain pending CV regen jobs: regenerate → check quality → auto rebid if pass.
 */
async function processPendingCvRegenQueue() {
    if (_cvRegenWorkerRunning) return;
    _cvRegenWorkerRunning = true;
    try {
        // Loop while there is work (new parks may arrive while regenerating).
        for (let guard = 0; guard < 12; guard++) {
            const list = await listPendingCvRegen();
            const next = list.find((e) => e.status === 'pending')
                || list.find((e) => e.status === 'regenerating' && (Date.now() - Number(e.enqueuedAt || 0)) > 180000);
            if (!next) break;

            const appId = next.applicationId;
            await updatePendingCvRegen(appId, { status: 'regenerating', startedAt: Date.now() });
            await logCourseEvent(appId, 'cv_regenerate_needed', {
                via: 'pending_queue',
                reasons: next.reasons || []
            }).catch(() => {});

            let gen = null;
            try {
                const app = await getBidderApplication(appId).catch(() => null);
                const jobDescription = next.job_description
                    || app?.job_description
                    || '';
                if (!jobDescription) {
                    throw new Error('missing_job_description');
                }
                gen = await Promise.race([
                    regenerateResume({
                        applicationId: appId,
                        jobDescription,
                        companyName: next.company_name || app?.company_name || '',
                        jobRole: next.job_role || app?.job_role || '',
                        jobUrl: next.job_url || app?.job_url || '',
                        coreSkills: ''
                    }),
                    new Promise((_, reject) => {
                        setTimeout(() => reject(new Error('CV regenerate timed out after 90s')), 90000);
                    })
                ]);
            } catch (err) {
                await updatePendingCvRegen(appId, {
                    status: 'failed',
                    error: err?.message || String(err)
                });
                await logCourseEvent(appId, 'cv_regenerate_failed', {
                    via: 'pending_queue',
                    error: err?.message || String(err)
                }).catch(() => {});
                await removePendingCvRegen(appId);
                continue;
            }

            const draftHtml = gen?.draft_html || gen?.resume_html || '';
            const resumeFilename = gen?.resume_filename || null;
            const uploadFilename = gen?.upload_filename || gen?.resume_upload_filename || null;

            await logCourseEvent(appId, 'cv_regenerated', {
                via: 'pending_queue',
                filename: resumeFilename,
                upload_filename: uploadFilename,
                quality_grade: gen?.quality_report?.grade || null
            }).catch(() => {});

            let qa = null;
            try {
                qa = await checkBidderCv({
                    application_id: appId,
                    draft_html: draftHtml,
                    job_description: next.job_description || '',
                    resume_filename: resumeFilename,
                    upload_filename: uploadFilename
                });
            } catch (err) {
                qa = { ok: false, blockSubmit: true, reasons: ['cv_check_failed'], hard_reasons: ['cv_check_failed'] };
            }

            if (qa?.blockSubmit || qa?.ok === false) {
                const hardFail = Array.isArray(qa?.hard_reasons) ? qa.hard_reasons : [];
                const noFile = hardFail.includes('missing_resume_file')
                    && !(resumeFilename || uploadFilename);
                await updatePendingCvRegen(appId, {
                    status: noFile ? 'failed' : 'ready',
                    error: (qa?.hard_reasons || qa?.reasons || ['quality_failed']).join(',')
                });
                await logCourseEvent(appId, 'cv_presubmit_blocked', {
                    via: 'pending_queue_after_regen',
                    reasons: qa?.reasons || [],
                    hard_reasons: qa?.hard_reasons || [],
                    quality: qa?.quality || null,
                    soft_continue: !noFile
                }).catch(() => {});
                if (noFile) {
                    await removePendingCvRegen(appId);
                    await notify(
                        'Bidder',
                        `CV still missing after regen (#${appId}) — skipped rebid`
                    ).catch(() => {});
                    continue;
                }
                // Soft QA fail: still rebid so the form gets filled / CV uploaded.
                await removePendingCvRegen(appId);
                await notify(
                    'Bidder',
                    `CV QA soft-fail (#${appId}) — rebid to upload / finish form`
                ).catch(() => {});
            } else {
                await updatePendingCvRegen(appId, { status: 'ready' });
                await removePendingCvRegen(appId);
                await logCourseEvent(appId, 'cv_check_ok', {
                    via: 'pending_queue_after_regen',
                    quality: qa?.quality || null
                }).catch(() => {});
                await notify(
                    'Bidder',
                    `CV passed (#${appId}) — auto rebid`
                ).catch(() => {});
            }

            // Auto rebid this application when queue is idle.
            try {
                const st = await getQueueState();
                if (st?.running) {
                    // Append for drain after current Process finishes.
                    const pendingRebids = Array.isArray(st.pendingRebidIds)
                        ? st.pendingRebidIds
                        : [];
                    if (!pendingRebids.includes(appId)) {
                        await setQueueState({
                            pendingRebidIds: [...pendingRebids, appId]
                        });
                    }
                } else {
                    // Start a focused Process for this application only.
                    processReadyQueue({
                        applicationIds: [appId],
                        jobLinkIds: next.jobLinkId ? [next.jobLinkId] : []
                    }).catch((err) => {
                        console.warn('[bidder] auto rebid failed', err?.message || err);
                    });
                }
            } catch (err) {
                console.warn('[bidder] auto rebid schedule failed', err?.message || err);
            }
        }
    } finally {
        _cvRegenWorkerRunning = false;
    }
}

/**
 * Fill is only allowed when this tab/window is bound to the CV session
 * (or a remembered cvLink for this exact apply URL). Never use another job's CV.
 */
function assertJobSessionMatch({ pageUrl, tabId, windowId, session, linked, lastResult }) {
    if (linked?.applicationId || linked?.resumeFilename) {
        if (!linked.jobUrl || urlsLooselyMatch(pageUrl, linked.jobUrl) || jobUrlKey(pageUrl) === jobUrlKey(linked.jobUrl)) {
            return { ok: true, via: 'cvLink' };
        }
    }

    if (lastResult?.applicationId && lastResult?.jobUrl) {
        if (urlsLooselyMatch(pageUrl, lastResult.jobUrl) || jobUrlKey(pageUrl) === jobUrlKey(lastResult.jobUrl)) {
            return { ok: true, via: 'lastResult' };
        }
    }

    if (!session?.sessionId) {
        return {
            ok: false,
            error:
                'No job↔CV session. On the JD page: select the JD text → Alt+Shift+G, wait for CV, then Alt+Shift+F on that job’s apply form (same browser window).'
        };
    }

    // Same window as the JD that launched generate (survives JD→apply navigation).
    if (windowId != null && session.jobWindowId != null && Number(windowId) === Number(session.jobWindowId)) {
        return { ok: true, via: 'window' };
    }
    if (tabId != null && (
        Number(tabId) === Number(session.jobTabId)
        || Number(tabId) === Number(session.applyTabId)
    )) {
        return { ok: true, via: 'tab' };
    }

    const pageKey = jobUrlKey(pageUrl);
    const sessionKey = session.jobUrlKey || jobUrlKey(session.jobUrl);
    if (pageKey && sessionKey && (pageKey === sessionKey || urlsLooselyMatch(pageUrl, session.jobUrl))) {
        return { ok: true, via: 'url' };
    }

    const label = [session.company, session.jobTitle].filter(Boolean).join(' — ') || session.jobUrl || 'another job';
    return {
        ok: false,
        error:
            `Wrong job window. Bound CV is for: ${label}. `
            + 'Use the same browser window where you generated, or run Alt+Shift+G on this job’s JD first.'
    };
}

/** Persist application_id + resume for this job URL so fill after refresh reconnects. */
async function rememberCvForJob({
    jobUrl,
    applicationId,
    resumeFilename,
    profileId,
    company,
    jobTitle
} = {}) {
    if (!applicationId && !resumeFilename) return;
    const settings = await getSettings();
    const url = jobUrl || settings.lastResult?.jobUrl || '';
    const key = jobUrlKey(url);
    if (!key) return;

    const links = { ...(settings.cvLinks || {}) };
    links[key] = {
        applicationId: applicationId || null,
        resumeFilename: resumeFilename || null,
        profileId: profileId || settings.selectedProfileId || null,
        jobUrl: url,
        company: company || null,
        jobTitle: jobTitle || null,
        at: new Date().toISOString()
    };

    const keys = Object.keys(links);
    if (keys.length > 50) {
        const sorted = keys.sort((a, b) => String(links[a].at || '').localeCompare(String(links[b].at || '')));
        for (const k of sorted.slice(0, keys.length - 50)) delete links[k];
    }
    await saveSettings({ cvLinks: links });
}

async function findCvLinkForUrl(pageUrl, profileId) {
    const settings = await getSettings();
    const links = settings.cvLinks || {};
    const key = jobUrlKey(pageUrl);
    const candidates = [];
    if (key && links[key]) candidates.push(links[key]);
    for (const v of Object.values(links)) {
        if (!v) continue;
        if (candidates.includes(v)) continue;
        if (urlsLooselyMatch(pageUrl, v.jobUrl) || urlsLooselyMatch(pageUrl, jobUrlKey(v.jobUrl))) {
            candidates.push(v);
        }
    }
    for (const v of candidates) {
        if (profileId && v.profileId && Number(v.profileId) !== Number(profileId)) continue;
        return v;
    }
    return null;
}

async function notify(title, message) {
    const text = String(message || '').slice(0, 250);
    let short = text;
    try {
        const entry = await appendUiMessage(title, text);
        short = entry?.short || text;
    } catch (_) {
        try {
            await chrome.storage.local.set({
                lastUiMessage: {
                    at: new Date().toISOString(),
                    title: String(title || 'Lumi'),
                    message: text,
                    short: text,
                    kind: /fail|error|nothing|no cv/i.test(`${title} ${text}`) ? 'error' : 'ok'
                }
            });
        } catch (__) { /* ignore */ }
    }

    try {
        await chrome.action.setBadgeBackgroundColor({ color: '#1d4ed8' });
        await chrome.action.setBadgeText({ text: '…' });
        setTimeout(() => {
            chrome.action.setBadgeText({ text: '' }).catch(() => {});
        }, 8000);
    } catch (_) { /* ignore */ }

    try {
        await chrome.notifications.create(`bidder-${Date.now()}`, {
            type: 'basic',
            iconUrl: chrome.runtime.getURL('icons/icon128.png'),
            title: String(title || 'Lumi'),
            message: short.slice(0, 120),
            priority: 2
        });
    } catch (err) {
        console.warn('[bidder] notify failed', err);
    }
}

async function toastActiveTab(text, kind = 'info') {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) return;
        await ensureScripts(tab.id);
        await chrome.tabs.sendMessage(tab.id, { type: 'SHOW_TOAST', text, kind });
    } catch (err) {
        console.warn('[bidder] toast failed', err);
    }
}

async function clearFillLock() {
    await chrome.storage.local.set({ [FILLING_KEY]: false, [FILLING_AT_KEY]: 0 });
}

async function acquireFillLock({ waitMs = 8000 } = {}) {
    const deadline = Date.now() + Math.max(0, Number(waitMs) || 0);
    for (;;) {
        const locks = await chrome.storage.local.get([FILLING_KEY, FILLING_AT_KEY]);
        const started = Number(locks[FILLING_AT_KEY] || 0);
        const stale = started > 0 && (Date.now() - started) > 3 * 60 * 1000;
        if (!locks[FILLING_KEY] || stale) {
            await chrome.storage.local.set({ [FILLING_KEY]: true, [FILLING_AT_KEY]: Date.now() });
            return;
        }
        if (Date.now() >= deadline) {
            throw new Error('Fill already in progress — wait a few seconds or reload the extension');
        }
        await new Promise((r) => setTimeout(r, 400));
    }
}

function isNoReceiverError(err) {
    return /Receiving end does not exist|Could not establish connection|message port closed/i.test(
        String(err?.message || err || '')
    );
}

async function waitTabDocumentReady(tabId, timeoutMs = 20000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        const tab = await chrome.tabs.get(tabId).catch(() => null);
        // Tab gone is normal during queue (user close / unattended skip) — never throw.
        if (!tab) return null;
        if (tabShowsBrowserErrorPage(tab)) throw new Error(tabErrorPageMessage(tab));
        const url = String(tab.url || tab.pendingUrl || '');
        if (
            tab.status === 'complete'
            && url
            && !/^(chrome|chrome-extension|edge|about|devtools):/i.test(url)
        ) {
            return tab;
        }
        await new Promise((r) => setTimeout(r, 250));
    }
    return await chrome.tabs.get(tabId).catch(() => null);
}

async function ensureScripts(tabId) {
    try {
        const tab = await waitTabDocumentReady(tabId);
        if (!tab) return false;
        try {
            await chrome.scripting.executeScript({
                target: { tabId, allFrames: true },
                files: [
                    'content/controlMatch.js',
                    'content/scrape.js',
                    'content/fillShared.js',
                    'content/atsPacks.js',
                    'content/fill.js',
                    'content/bidderFill.js'
                ]
            });
        } catch (injErr) {
            const inj = String(injErr?.message || injErr || '');
            // Tab really gone
            if (/No tab with id|Invalid tab/i.test(inj)) return false;
            // Already injected / CSP race — tab is still usable
        }
        // Install MAIN-world page filler (React-safe writes).
        try {
            await chrome.scripting.executeScript({
                target: { tabId, allFrames: true },
                files: ['content/pageWorldFill.js'],
                world: 'MAIN'
            });
        } catch (_) { /* ignore MAIN inject failures */ }
        return true;
    } catch (err) {
        const msg = String(err?.message || err || '');
        if (/No tab with id|Invalid tab|tab.*closed|Tab closed/i.test(msg)) {
            return false;
        }
        if (/showing error page|chrome-error|cannot be reached|err_/i.test(msg)) {
            throw new Error(
                /showing error page|chrome-error/i.test(msg)
                    ? 'This tab is a Chrome error page (site failed to load). Open the job URL again, then retry.'
                    : msg
            );
        }
        // Transient — tab may still accept messages
        const still = await chrome.tabs.get(tabId).catch(() => null);
        return !!still;
    }
}

/** Inject content scripts and sendMessage with reconnect retries (nav races). */
async function sendTabMessage(tabId, message, { retries = 6, baseDelayMs = 350 } = {}) {
    let lastErr = null;
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const injected = await ensureScripts(tabId);
            if (!injected) {
                const still = await chrome.tabs.get(tabId).catch(() => null);
                if (!still) {
                    const err = new Error('Tab closed');
                    err.tabClosed = true;
                    throw err;
                }
            }
            // Lightweight ping so we know a listener exists before heavy FILL_FORM payloads.
            if (attempt > 0 || message?.type === 'FILL_FORM' || message?.type === 'BIDDER_ENGINE_COLLECT') {
                await chrome.tabs.sendMessage(tabId, { type: 'DETECT_APPLY_FORM' });
            }
            return await chrome.tabs.sendMessage(tabId, message);
        } catch (err) {
            lastErr = err;
            if (err?.tabClosed || /Tab closed/i.test(String(err?.message || ''))) throw err;
            if (!isNoReceiverError(err)) throw err;
            await new Promise((r) => setTimeout(r, baseDelayMs * (attempt + 1)));
        }
    }
    throw lastErr || new Error('Could not establish connection. Receiving end does not exist.');
}

/** Chrome interstitial when navigation failed (DNS, connection, crash, etc.). */
function tabShowsBrowserErrorPage(tab) {
    if (!tab) return true;
    const url = String(tab.pendingUrl || tab.url || '');
    if (!url) return false;
    if (/^chrome-error:/i.test(url)) return true;
    if (/chromewebdata/i.test(url)) return true;
    if (/^chrome:\/\/error/i.test(url)) return true;
    if (/^about:neterror|^about:certerror/i.test(url)) return true;
    return false;
}

function tabErrorPageMessage(tab) {
    const url = String(tab?.pendingUrl || tab?.url || '');
    return `Tab is showing a Chrome error page${url ? ` (${url.slice(0, 80)})` : ''} — reload the job posting, then try again`;
}

/** Greenhouse / ATS URL helpers for finding an open apply tab after a stale tabId. */
function ghTokenFromUrl(url) {
    try {
        const u = new URL(String(url || ''));
        if (!/greenhouse\.io/i.test(u.hostname)) return '';
        return u.searchParams.get('token') || '';
    } catch {
        return '';
    }
}

function urlsLooselyMatchApply(a, b) {
    const left = String(a || '');
    const right = String(b || '');
    if (!left || !right) return false;
    if (left === right) return true;
    const t1 = ghTokenFromUrl(left);
    const t2 = ghTokenFromUrl(right);
    if (t1 && t2 && t1 === t2) return true;
    try {
        const u1 = new URL(left);
        const u2 = new URL(right);
        const h1 = u1.hostname.replace(/^www\./, '').replace(/^job-boards\./, 'boards.');
        const h2 = u2.hostname.replace(/^www\./, '').replace(/^job-boards\./, 'boards.');
        if (h1 === h2 && u1.pathname.replace(/\/$/, '') === u2.pathname.replace(/\/$/, '')) return true;
        if (h1 === h2 && /greenhouse\.io/i.test(h1)) return true;
    } catch {
        /* ignore */
    }
    return false;
}

/**
 * Resolve an open apply tab. Prefer stored tabId; if closed, search by job URL
 * (fixes Control "Tab closed" while the Greenhouse form tab is still open / Ready).
 */
async function resolveOpenApplyTabId({ tabId = null, applicationId = null, url = '' } = {}) {
    const clean = (raw) => {
        const s = String(raw || '').trim();
        if (!s) return '';
        if (/[?&]error=true\b/i.test(s) || /\/embed\/job_board/i.test(s)) return '';
        if (isAshbyJobDescriptionUrl(s)) return ashbyApplicationUrl(s);
        return s;
    };
    const wantedUrl = clean(url);
    const preferred = Number(tabId) || 0;
    if (preferred) {
        try {
            await chrome.tabs.get(preferred);
            return preferred;
        } catch {
            /* search below */
        }
    }
    try {
        const st = await getQueueState();
        const mapped = applicationId
            ? Number(st?.tabsByAppId?.[String(applicationId)] || 0) || 0
            : 0;
        const candidates = [
            mapped,
            Number(st?.currentTabId || 0) || 0,
            Number(st?.captchaTabId || 0) || 0
        ].filter((id, i, arr) => id && arr.indexOf(id) === i);
        for (const id of candidates) {
            try {
                const t = await chrome.tabs.get(id);
                const u = t?.pendingUrl || t?.url || '';
                if (wantedUrl && !urlsLooselyMatchApply(u, wantedUrl)) continue;
                return id;
            } catch {
                /* gone */
            }
        }
        if (wantedUrl) {
            const all = await chrome.tabs.query({});
            const tok = ghTokenFromUrl(wantedUrl);
            for (const t of all || []) {
                if (!t?.id || !t.url || /^(chrome|edge|about|devtools):/i.test(t.url)) continue;
                if (tok && ghTokenFromUrl(t.url) === tok) return t.id;
                if (urlsLooselyMatchApply(t.url, wantedUrl)) return t.id;
            }
        }
    } catch {
        /* ignore */
    }
    return null;
}

async function scrapeActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab');
    if (tabShowsBrowserErrorPage(tab)) {
        throw new Error(tabErrorPageMessage(tab));
    }
    if (!tab.url || /^(chrome|chrome-extension|edge|about|devtools):/i.test(tab.url)) {
        throw new Error('Open a job posting page first (not a Chrome internal page)');
    }
    await ensureScripts(tab.id);
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_JOB' });
    if (!response?.ok) throw new Error(response?.error || 'Failed to scrape page');
    return { tab, job: response.data };
}

async function collectForm(tabId) {
    const richest = await collectRichestApplySnap(tabId);
    if (richest?.form) return richest.form;
    const response = await sendTabMessage(tabId, { type: 'COLLECT_FORM' });
    if (!response?.ok) throw new Error(response?.error || 'Failed to collect form');
    return response.data;
}

async function listApplyFrameIds(tabId) {
    try {
        const rows = await chrome.scripting.executeScript({
            target: { tabId, allFrames: true },
            func: () => {
                const n = document.querySelectorAll(
                    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select, [role="combobox"], [role="radio"]'
                ).length;
                return { n, href: String(location.href || '') };
            }
        });
        return (rows || [])
            .map((r) => ({
                frameId: r.frameId,
                n: Number(r.result?.n) || 0,
                href: r.result?.href || ''
            }))
            .filter((r) => r.frameId != null);
    } catch {
        return [{ frameId: 0, n: 1, href: '' }];
    }
}

async function sendTabMessageFrame(tabId, message, frameId) {
    if (frameId == null) return sendTabMessage(tabId, message);
    return chrome.tabs.sendMessage(tabId, message, { frameId });
}

/** Prefer the iframe that actually hosts the apply form (parent often has 0 fields). */
async function collectRichestApplySnap(tabId) {
    const frames = await listApplyFrameIds(tabId);
    const ranked = [...frames].sort((a, b) => b.n - a.n);
    let bestForm = null;
    let bestEngine = null;
    let bestScore = -1;
    let bestFrameId = 0;
    for (const fr of ranked.slice(0, 8)) {
        try {
            const res = await sendTabMessageFrame(tabId, { type: 'COLLECT_FORM' }, fr.frameId);
            const form = res?.data || (res?.ok === false ? null : res);
            const score = (form?.fields?.length || 0) + (form?.questions?.length || 0);
            if (form && score > bestScore) {
                bestForm = form;
                bestScore = score;
                bestFrameId = fr.frameId;
            }
        } catch (_) { /* frame has no listener */ }
        try {
            const eng = await sendTabMessageFrame(tabId, { type: 'BIDDER_ENGINE_COLLECT' }, fr.frameId);
            if (eng?.ok && Array.isArray(eng.fields) && eng.fields.length) {
                if (!bestEngine || (eng.fields.length > (bestEngine.fields?.length || 0))) {
                    bestEngine = eng;
                }
            }
        } catch (_) { /* ignore */ }
    }
    return { form: bestForm, engine: bestEngine, frameId: bestFrameId, score: bestScore };
}

function panelQuestionFromField(f) {
    const label = String(f?.label || f?.id || '').replace(/\s+/g, ' ').trim();
    if (!label) return null;
    const kind = String(f?.kind || 'question');
    if (['first_name', 'last_name', 'full_name', 'email', 'phone', 'linkedin', 'github'].includes(kind)) {
        return null;
    }
    if (['resume', 'cover_letter'].includes(kind)) return null;
    const value = String(f?.value ?? f?.answer ?? '').trim();
    const options = Array.isArray(f?.options)
        ? f.options.map((o) => (typeof o === 'string' ? o : (o?.label || o?.value || ''))).filter(Boolean)
        : undefined;
    return {
        id: String(f.id || label),
        label,
        type: f.type || 'text',
        kind,
        required: !!f.required,
        value,
        answer: value,
        answer_type: f.answer_type
            || (kind === 'salary' ? 'salary' : (options?.length ? 'choice' : 'written')),
        options
    };
}

/**
 * Poll until the apply form has real mounted fields (not a React skeleton).
 * Prefer identity fields when requireIdentity — avoids filling decoy inputs.
 * Exits as soon as consecutive stable reads agree (no fixed long sleeps).
 */
async function waitForFormReady(tabId, {
    minFields = 2,
    requireIdentity = true,
    /** Profile fills: wait for fuller form (not just name+email). */
    profileFill = false,
    stableReads = 2,
    pollMs = 400,
    maxMs = 12000
} = {}) {
    const deadline = Date.now() + Math.max(1500, Number(maxMs) || 7000);
    const gap = Math.max(80, Number(pollMs) || 150);
    let lastFp = '';
    let streak = 0;
    let lastForm = null;
    const t0 = Date.now();
    const minCount = profileFill
        ? Math.max(6, Number(minFields) || 6)
        : Math.max(2, Number(minFields) || 2);
    while (Date.now() < deadline) {
        let form = null;
        try {
            await ensureScripts(tabId);
            form = await collectForm(tabId);
        } catch (_) {
            form = null;
        }
        lastForm = form;
        if (form?.blocked) {
            return { ok: false, form, reason: form.reason || 'blocked', waitedMs: Date.now() - t0 };
        }
        const count = formFieldCount(form);
        let readyOk = false;
        if (profileFill) {
            readyOk = formReadyForProfileFill(form, { minFields: minCount });
        } else {
            const usable = formHasUsableFields(form, minCount);
            const identityOk = !requireIdentity
                || formHasCoreIdentity(form)
                || (formHasIdentityFields(form) && count >= 5)
                || count >= Math.max(minCount, 6);
            readyOk = usable && identityOk;
        }
        if (readyOk) {
            const fp = formFingerprint(form);
            if (fp && fp === lastFp) streak += 1;
            else {
                lastFp = fp;
                streak = 1;
            }
            if (streak >= Math.max(1, Number(stableReads) || 2)) {
                return { ok: true, form, fieldCount: count, waitedMs: Date.now() - t0 };
            }
        } else {
            streak = 0;
            lastFp = '';
        }
        await new Promise((r) => setTimeout(r, gap));
    }
    const count = formFieldCount(lastForm);
    const ok = profileFill
        ? formReadyForProfileFill(lastForm, { minFields: Math.min(4, minCount) })
        : formHasUsableFields(lastForm, Math.min(2, minCount));
    return {
        ok,
        form: lastForm,
        fieldCount: count,
        reason: count > 0 ? 'timeout_partial' : 'timeout_empty',
        waitedMs: Date.now() - t0
    };
}

async function fillAndUpload(tabId, payload) {
    await ensureScripts(tabId);
    // Do NOT run dial-country CDP before fill — it delays first keystrokes and
    // jumps to the phone widget (Swooped fills identity first; dial runs with phone).
    const response = await sendTabMessage(tabId, { type: 'FILL_FORM', payload });
    if (!response?.ok) throw new Error(response?.error || 'Failed to fill form');
    const resumeFile = payload?.resume
        || (payload?.base64 && payload?.filename
            ? { filename: payload.filename, base64: payload.base64, mimeType: payload.mimeType }
            : null);
    const uploadedResume = Number(response?.uploadStats?.uploadedResume || response?.fillStats?.uploadedResume || 0);
    // Greenhouse often ignores isolated-world file change events. CDP is optional on
    // the store build — skip quietly when debugger is not granted.
    if (resumeFile?.base64 && uploadedResume < 1 && !payload?.skipFiles) {
        const trusted = await setFileInputViaDebugger(tabId, resumeFile).catch(() => null);
        if (trusted?.ok) {
            response.uploadStats = {
                ...(response.uploadStats || {}),
                uploaded: Math.max(Number(response.uploadStats?.uploaded || 0), 1),
                uploadedResume: Math.max(uploadedResume, 1)
            };
            if (response.fillStats) {
                response.fillStats.uploadedResume = Math.max(
                    Number(response.fillStats.uploadedResume || 0),
                    1
                );
                response.fillStats.resumeOk = true;
            }
        }
    }
    return response;
}

function urlsLooselyMatch(a, b) {
    if (!a || !b) return false;
    try {
        const ua = new URL(a);
        const ub = new URL(b);
        if (ua.hostname.replace(/^www\./, '') !== ub.hostname.replace(/^www\./, '')) return false;
        const pa = ua.pathname.replace(/\/+$/, '');
        const pb = ub.pathname.replace(/\/+$/, '');
        return pa === pb || pa.includes(pb) || pb.includes(pa);
    } catch {
        return String(a).split('?')[0] === String(b).split('?')[0];
    }
}

async function maybeMarkApplied(applicationId) {
    if (!applicationId) return null;
    try {
        return await markApplicationApplied(applicationId);
    } catch (err) {
        console.warn('[bidder] mark applied failed', err);
        return null;
    }
}

async function waitForAnswersReady(requestId, timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            chrome.runtime.onMessage.removeListener(listener);
            reject(new Error('Timed out after 60s — Answer questions on Generate, then Fill on apply form'));
        }, timeoutMs);

        function listener(msg) {
            if (msg?.type !== 'ANSWERS_READY') return;
            if (requestId && msg.requestId && msg.requestId !== requestId) return;
            clearTimeout(timer);
            chrome.runtime.onMessage.removeListener(listener);
            if (msg.error) {
                reject(new Error(msg.error));
                return;
            }
            resolve(msg.payload || {});
        }
        chrome.runtime.onMessage.addListener(listener);
    });
}

/**
 * Send selected questions to the Generate page AI Assistant, show answers there,
 * then return structured answers for autofill.
 */
async function answerQuestionsViaGenerateAssistant({
    settings,
    profile,
    job,
    result,
    questions,
    mode = 'interactive'
}) {
    const session = settings.activeJobSession || {};
    let generateTabId = session.generateTabId || settings.lastResult?.generateTabId || null;

    if (generateTabId) {
        try {
            await chrome.tabs.get(generateTabId);
        } catch (_) {
            generateTabId = null;
        }
    }

    if (!generateTabId) {
        // Fall back: open generate page for this profile (no auto_generate).
        const generateUrl =
            `${settings.frontendBaseUrl}/user/generate/${profile.id}?from_bidder=1`;
        const tab = await chrome.tabs.create({ url: generateUrl, active: true });
        await waitTabComplete(tab.id);
        await new Promise((r) => setTimeout(r, 800));
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content/app-bridge.js']
            });
        } catch (_) { /* ignore */ }
        generateTabId = tab.id;
        await saveActiveJobSession({ generateTabId });
    } else {
        try {
            await chrome.tabs.update(generateTabId, { active: true });
        } catch (_) { /* ignore */ }
        try {
            await chrome.scripting.executeScript({
                target: { tabId: generateTabId },
                files: ['content/app-bridge.js']
            });
        } catch (_) { /* ignore */ }
    }

    const requestId = `ans_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const waitPromise = waitForAnswersReady(requestId, 45000);

    await chrome.tabs.sendMessage(generateTabId, {
        type: 'BIDDER_ANSWER_QUESTIONS',
        payload: {
            requestId,
            mode,
            profile_id: profile.id,
            questions,
            job_description: job.description || job.job_description || '',
            resume_html: result.resume_html || result.resume_content || result.draft_html || '',
            company_name: job.company || result.company_name || '',
            job_role: job.title || result.job_role || '',
            application_id: result.application_id || result.applicationId || null
        }
    });

    await notify(
        mode === 'auto' ? 'Auto-answering questions…' : 'Answer questions on Generate',
        mode === 'auto'
            ? 'CV ready — drafting AI answers and filling the form'
            : 'Profile is filled. Click Answer on each question, then Fill on apply form'
    );

    return waitPromise;
}

function aiAnswersCacheKey({ applicationId, url, profileId }) {
    if (applicationId) return `app:${applicationId}`;
    return `url:${String(url || '').split('?')[0]}:${profileId || ''}`;
}

async function getCachedAiAnswers(key) {
    if (!key) return null;
    try {
        const { lumiAiAnswersCache } = await chrome.storage.session.get('lumiAiAnswersCache');
        const row = lumiAiAnswersCache?.[key];
        if (!row?.answers?.length) return null;
        if (Date.now() - Number(row.at || 0) > 6 * 60 * 60 * 1000) return null;
        return row;
    } catch {
        return null;
    }
}

async function setCachedAiAnswers(key, payload) {
    if (!key || !payload?.answers?.length) return;
    try {
        const { lumiAiAnswersCache } = await chrome.storage.session.get('lumiAiAnswersCache');
        const cache = lumiAiAnswersCache && typeof lumiAiAnswersCache === 'object' ? lumiAiAnswersCache : {};
        cache[key] = {
            answers: payload.answers,
            skipped: payload.skipped || [],
            profile: payload.profile || {},
            at: Date.now()
        };
        await chrome.storage.session.set({ lumiAiAnswersCache: cache });
    } catch (_) { /* ignore */ }
}

async function autofillAfterGenerate({
    tabId,
    settings,
    profile,
    job,
    result,
    phase = 'full',
    answerMode = 'interactive',
    softAnswers = false,
    fromPanel = false,
    reuseAnswers = true,
    gapFillOnly = false
}) {
    const t0 = Date.now();
    await setWorkProgress({
        phase: 'profile',
        label: 'Waiting for form fields…',
        tabId
    }).catch(() => {});
    const ready = await waitForFormReady(tabId, {
        minFields: 6,
        requireIdentity: true,
        profileFill: true,
        stableReads: 2,
        pollMs: 150,
        maxMs: 9000
    });
    let form = ready.form;
    if (!form || form.blocked) {
        form = await collectForm(tabId);
    }
    if (form.blocked) {
        throw new Error(form.reason || 'This site is blocked for autofill');
    }
    if (!formHasUsableFields(form, 2)) {
        throw new Error('Apply form fields not ready yet — wait a second and click Autofill again');
    }
    await setWorkProgress({
        phase: 'profile',
        label: `Filling profile (${formFieldCount(form)} fields)…`,
        tabId,
        fieldCount: formFieldCount(form),
        waitedMs: ready.waitedMs
    }).catch(() => {});

        const profileFields = {
        id: profile.id,
        first_name: profile.first_name,
        last_name: profile.last_name,
        email: profile.email,
        phone: profile.phone,
        linkedin_url: profile.linkedin_url,
        github_url: profile.github_url,
        city: profile.city,
        state: profile.state,
        country: profile.country,
        address: profile.address,
        postal_code: profile.postal_code,
        birthdate: profile.birthdate || '',
        salary_range: profile.salary_range || '',
        gender: profile.gender || '',
        work_authorization: profile.work_authorization || '',
        requires_sponsorship: profile.requires_sponsorship || '',
        disability_status: 'No, I do not have a disability',
        veteran_status: profile.veteran_status || '',
        race_ethnicity: 'Black or African American',
        website_url: profile.website_url || '',
        portfolio_url: profile.portfolio_url || '',
        pronouns: profile.pronouns || '',
        preferred_name: profile.preferred_name || '',
        over_18: profile.over_18 || '',
        hispanic_latino: profile.hispanic_latino || '',
        willing_to_relocate: profile.willing_to_relocate || '',
        willing_to_travel: profile.willing_to_travel || '',
        earliest_start_date: profile.earliest_start_date || '',
        notice_period: profile.notice_period || '',
        how_heard: profile.how_heard || 'LinkedIn',
        years_of_experience: profile.years_of_experience || '',
        education_level: profile.education_level || '',
        education: profile.education || '',
        school: profile.school || '',
        degree: profile.degree || '',
        discipline: profile.discipline || '',
        security_clearance: profile.security_clearance || ''
    };

    const questionsRaw = form.questions || [];
    let questions = questionsRaw;
    if (form.hasQuestionSelection) {
        questions = form.selectedQuestions || [];
    }

    // Always include salary fields for answer fill (even if not checked in picker).
    const salaryFromFields = (form.fields || []).filter((f) => f.kind === 'salary');
    for (const sf of salaryFromFields) {
        if (!questions.some((q) => String(q.id) === String(sf.id))) {
            questions = [...questions, {
                id: sf.id,
                label: sf.label,
                kind: 'salary',
                type: sf.type || 'text',
                answer_type: 'salary'
            }];
        }
    }

    const essayQuestions = questions.filter(
        (q) => q.kind === 'question' || (q.answer_type === 'written' && q.kind !== 'salary')
    );
    const salaryQuestions = questions.filter(
        (q) => q.kind === 'salary' || q.answer_type === 'salary'
    );
    // Also send choice / skill / custom selects the profile pass may leave empty → answers API.
    const extraApiQuestions = questions.filter((q) => {
        const k = String(q.kind || '');
        if (k === 'question' || k === 'salary') return false;
        return /^(skill_experience|skill_project_brief|how_heard|data_protection|math_captcha|background_check_yes)$/i.test(k)
            || q.answer_type === 'choice'
            || (Array.isArray(q.options) && q.options.length > 0);
    });
    // Essays need AI; salary is resolved server-side from JD/profile (no LLM).
    const writtenQuestions = (() => {
        const seen = new Set();
        const out = [];
        for (const q of [...essayQuestions, ...salaryQuestions, ...extraApiQuestions]) {
            const key = String(q.id || q.label || '').toLowerCase();
            if (!key || seen.has(key)) continue;
            seen.add(key);
            out.push(q);
        }
        return out;
    })();

    let fillResult = {
        fillStats: { filled: 0 },
        uploadStats: { uploaded: 0 },
        submitStats: { clicked: false },
        ats: form.ats
    };

    // Phase 1 — Simplify-style: saved profile only (no AI). Start typing once form is ready.
    // Long essays ("why this role", etc.) stay empty → Answer questions after Generate CV.
    let resumeFile = null;
    let coverLetterFile = null;
    if (phase === 'full' || phase === 'profile') {
        notify('Lumi', gapFillOnly
            ? 'Continue — empty fields + CV only (no extra AI)…'
            : 'Autofill — saved profile (no AI)…').catch(() => {});
        fillResult = await fillAndUpload(tabId, {
            fields: form.fields || [],
            answers: [],
            profile: profileFields,
            jobDescription: job.description || job.job_description || '',
            fileInputs: form.fileInputs || [],
            autoSubmit: false,
            skipFiles: true,
            skipQuestions: true,
            profileOnly: true,
            profileGapFill: !!gapFillOnly
        });

        // Always gap-fill: first pass often hits a partial SPA mount (name+email only).
        if (!gapFillOnly) {
            const filled1 = Number(fillResult?.fillStats?.filled || 0);
            await setWorkProgress({
                phase: 'profile',
                label: 'Gap-filling remaining profile fields…',
                tabId
            }).catch(() => {});
            const gapReady = await waitForFormReady(tabId, {
                minFields: 6,
                profileFill: true,
                requireIdentity: true,
                stableReads: 2,
                pollMs: 150,
                maxMs: 5000
            });
            if (gapReady.form && formHasUsableFields(gapReady.form, 2)) {
                form = gapReady.form;
            } else {
                try { form = await collectForm(tabId); } catch (_) { /* keep */ }
            }
            const gapFill = await fillAndUpload(tabId, {
                fields: form.fields || [],
                answers: [],
                profile: profileFields,
                jobDescription: job.description || job.job_description || '',
                fileInputs: form.fileInputs || [],
                autoSubmit: false,
                skipFiles: true,
                skipQuestions: true,
                profileOnly: true,
                profileGapFill: true
            });
            const filled2 = Number(gapFill?.fillStats?.filled || 0);
            if (filled2 > 0) {
                fillResult = {
                    ...fillResult,
                    ...gapFill,
                    fillStats: {
                        ...(fillResult.fillStats || {}),
                        ...(gapFill.fillStats || {}),
                        filled: filled1 + filled2
                    }
                };
            }
        }

        const uploadResumeAfter = async () => {
            const filename = result.resume_filename || result.resumeFilename;
            if (filename) {
                try {
                    resumeFile = await fetchResumeBase64(settings.apiBaseUrl, filename, settings.token, {
                        profile,
                        uploadFilename: result.resume_upload_filename || result.upload_filename || null
                    });
                } catch (err) {
                    console.warn('[bidder] resume download for upload failed', err);
                }
            }
            if (!resumeFile?.base64 && profile) {
                try {
                    const readyName = buildUploadResumeFilename(profile) || '';
                    if (readyName && readyName !== filename) {
                        resumeFile = await fetchResumeBase64(settings.apiBaseUrl, readyName, settings.token, {
                            profile,
                            uploadFilename: readyName
                        });
                    }
                } catch (err) {
                    console.warn('[bidder] ready-name resume download failed', err);
                }
            }
            if (resumeFile?.base64) {
                resumeFile.profile = profile;
                resumeFile.applicationId = result.application_id || result.applicationId || null;
                const saved = await downloadResumeToCvLibrary(
                    resumeFile,
                    profile,
                    resumeFile.applicationId
                ).catch((err) => {
                    console.warn('[bidder] local CV library download', err);
                    return null;
                });
                if (saved?.path) {
                    resumeFile.localPath = saved.path;
                    resumeFile.localRelPath = saved.relPath;
                }
            } else {
                await toastActiveTab(
                    'CV download failed — Generate CV first, then Continue fill',
                    'error'
                ).catch(() => {});
            }
            try {
                coverLetterFile = await maybePrepareCoverLetterFile({
                    form,
                    profileId: settings.selectedProfileId || result.profile_id,
                    jobDescription: job.description || job.job_description || '',
                    resumeHtml: result.resume_html || result.draft_html || '',
                    companyName: job.company || result.company_name || '',
                    jobRole: job.title || result.job_role || '',
                    settings,
                    uploadCoverLetter: false
                });
            } catch (_) { /* ignore */ }
            if (!(resumeFile?.base64 || coverLetterFile?.base64)) return null;
            try {
                const isolated = await fillAndUpload(tabId, {
                    uploadOnly: true,
                    filename: resumeFile?.filename,
                    base64: resumeFile?.base64,
                    mimeType: resumeFile?.mimeType,
                    resume: resumeFile,
                    coverLetter: coverLetterFile
                });
                let uploaded = Number(isolated?.uploadStats?.uploadedResume || isolated?.uploadStats?.uploaded || 0);
                if (resumeFile?.base64) {
                    const trusted = await setFileInputViaDebugger(tabId, resumeFile).catch(() => null);
                    if (trusted?.ok) uploaded = Math.max(uploaded, 1);
                    if (trusted?.ok || isolated) {
                        isolated.uploadStats = {
                            ...(isolated.uploadStats || {}),
                            uploaded,
                            uploadedResume: Math.max(Number(isolated.uploadStats?.uploadedResume || 0), uploaded)
                        };
                    }
                    if (!uploaded) {
                        await toastActiveTab(
                            resumeFile.localRelPath
                                ? `CV saved to ${resumeFile.localRelPath} — click Attach if the form is still empty`
                                : 'CV fetched but not attached — click Attach on Resume/CV',
                            'error'
                        ).catch(() => {});
                    } else {
                        await toastActiveTab(`CV attached (${resumeFile.filename})`, 'ok').catch(() => {});
                    }
                }
                return isolated;
            } catch (err) {
                console.warn('[bidder] post-profile resume upload', err);
                if (resumeFile?.base64) {
                    const trusted = await setFileInputViaDebugger(tabId, resumeFile).catch(() => null);
                    if (trusted?.ok) {
                        return { uploadStats: { uploaded: 1, uploadedResume: 1 } };
                    }
                }
                return null;
            }
        };

        // Profile-only: fill fields, then upload CV (await so Autofill actually attaches it).
        if (phase === 'profile') {
            const up = await uploadResumeAfter().catch(() => null);
            if (up?.uploadStats) fillResult.uploadStats = up.uploadStats;
            const uploaded = Number(up?.uploadStats?.uploaded || 0);
            if (!uploaded && !(result.resume_filename || result.resumeFilename)) {
                await toastActiveTab(
                    'No CV on file — Generate CV first, then Autofill to attach resume',
                    'error'
                ).catch(() => {});
            } else if (uploaded) {
                await toastActiveTab(`Uploaded ${uploaded} file(s)`, 'ok').catch(() => {});
            }
            await toastActiveTab(
                `Autofilled ${fillResult?.fillStats?.filled ?? 0} profile field(s)`
                    + (essayQuestions.length
                        ? ` · ${essayQuestions.length} essay(s) → Answer questions after Generate CV`
                        : ''),
                'success'
            );
            return {
                ats: fillResult.ats || form.ats,
                questions: essayQuestions.length,
                answers: 0,
                skippedSalary: fillResult.fillStats?.skippedSalary || 0,
                filled: fillResult.fillStats?.filled || 0,
                uploaded: fillResult.uploadStats?.uploaded || 0,
                submitted: false,
                markedApplied: false,
                applicationId: result.application_id || result.applicationId || null,
                phase: 'profile'
            };
        }

        // Full phase: upload before AI answers so CV is on the form.
        const up = await uploadResumeAfter();
        if (up?.uploadStats) fillResult.uploadStats = up.uploadStats;

        await toastActiveTab(
            `Autofilled ${fillResult?.fillStats?.filled ?? 0} profile field(s)`
                + (essayQuestions.length
                    ? ` · ${essayQuestions.length} essay(s) need Answer questions (Generate CV)`
                    : ''),
            'success'
        );
    }

    let answersPayload = {
        answers: [],
        skipped: [],
        profile: { ...profileFields }
    };

    // Phase 2 — AI written answers (needs CV)
    if ((phase === 'full' || phase === 'answers') && writtenQuestions.length > 0) {
        const hasCv = !!(
            result.resume_html
            || result.resume_content
            || result.draft_html
            || result.resume_filename
            || result.application_id
        );
        const cacheKey = aiAnswersCacheKey({
            applicationId: result.application_id || result.applicationId,
            url: job.url,
            profileId: profile.id
        });
        const cached = reuseAnswers ? await getCachedAiAnswers(cacheKey) : null;

        const applyAiAnswers = async (payload) => {
            answersPayload = {
                answers: payload.answers || [],
                skipped: payload.skipped || [],
                profile: {
                    ...profileFields,
                    ...(payload.profile || {})
                },
                provider: payload.provider || null,
                model: payload.model || null,
                written_filled: payload.written_filled,
                written_count: payload.written_count
            };

            try {
                await chrome.tabs.update(tabId, { active: true });
            } catch (_) { /* ignore */ }

            if (!(answersPayload.answers || []).length) return;

            await setWorkProgress({
                phase: 'fill_answers',
                label: `Filling ${answersPayload.answers.length} AI answer(s)…`,
                provider: answersPayload.provider || 'groq',
                elapsedMs: Date.now() - t0
            }).catch(() => {});
            await notify(
                'Filling AI answers',
                `${answersPayload.answers.length} answer(s) → apply form`
            );
            const aiFill = await fillAndUpload(tabId, {
                fields: form.fields || [],
                answers: answersPayload.answers || [],
                profile: answersPayload.profile,
                jobDescription: job.description || job.job_description || '',
                fileInputs: form.fileInputs || [],
                filename: resumeFile?.filename || null,
                base64: resumeFile?.base64 || null,
                mimeType: resumeFile?.mimeType || null,
                resume: resumeFile,
                coverLetter: coverLetterFile,
                answersOnly: true,
                autoSubmit: !!(settings.bidderAutoSubmit ?? settings.autoSubmit)
            });
            fillResult = {
                ...fillResult,
                fillStats: {
                    ...(fillResult.fillStats || {}),
                    filled: (fillResult.fillStats?.filled || 0) + (aiFill.fillStats?.filled || 0),
                    filledWritten: aiFill.fillStats?.filledWritten,
                    skippedWritten: aiFill.fillStats?.skippedWritten
                },
                submitStats: aiFill.submitStats || fillResult.submitStats
            };
        };

        try {
            if (gapFillOnly) {
                // Continue fill: attach CV + empty profile only. Never spend another API key.
                await notify('Lumi', 'Continue — empty fields + CV only (no extra AI)');
                let pageQa = [];
                try {
                    const live = await sendTabMessage(tabId, { type: 'COLLECT_FILLED_QA' });
                    pageQa = Array.isArray(live?.items) ? live.items : [];
                } catch (_) { /* ignore */ }
                const pack = await saveCapturedQuestionsPack({
                    applicationId: result.application_id || result.applicationId || null,
                    company: job.company || result.company_name || '',
                    jobRole: job.title || result.job_role || '',
                    url: job.url || '',
                    questions: writtenQuestions,
                    answers: [...(cached?.answers || []), ...pageQa]
                });
                if (pack?.items?.length) {
                    await sendTabMessage(tabId, {
                        type: 'UPDATE_AUTOFILL_PANEL',
                        qa: pack.items,
                        status: `${pack.items.length} question(s) saved in panel`
                    }).catch(() => {});
                }
            } else if (cached?.answers?.length) {
                await applyAiAnswers(cached);
                await toastActiveTab(
                    `Reused ${cached.answers.length} saved answer(s) — no extra API call`,
                    'ok'
                ).catch(() => {});
            } else if (!hasCv) {
                if (softAnswers || phase === 'full') {
                    await toastActiveTab(
                        `Profile filled — ${writtenQuestions.length} question(s) need a CV. Generate CV, then Autofill again for AI answers.`,
                        'info'
                    ).catch(() => {});
                    await notify(
                        'Lumi',
                        `${writtenQuestions.length} question(s) left — Generate CV so Autofill can call the answers API`
                    );
                } else {
                    throw new Error('Generate a CV first (Alt+Shift+G), then use Answer questions');
                }
            } else if (answerMode === 'auto') {
                await notify('Lumi', `Drafting ${writtenQuestions.length} answer(s) with Groq…`);
                await setWorkProgress({
                    phase: 'groq',
                    label: `Groq drafting ${writtenQuestions.length} answer(s)…`,
                    questionCount: writtenQuestions.length,
                    elapsedMs: Date.now() - t0
                }).catch(() => {});
                const apiPayload = await generateAnswers({
                    profile_id: profile.id,
                    job_description: job.description || job.job_description || '',
                    resume_html: result.resume_html || result.resume_content || result.draft_html || '',
                    questions: writtenQuestions,
                    company_name: job.company || result.company_name || '',
                    job_role: job.title || result.job_role || '',
                    application_id: result.application_id || result.applicationId || null,
                    answers_provider: 'groq'
                });
                await setCachedAiAnswers(cacheKey, apiPayload);
                await applyAiAnswers(apiPayload);
            } else {
                await notify('Lumi', `${writtenQuestions.length} question(s) → Answer on Generate`);
                const viaAssistant = await answerQuestionsViaGenerateAssistant({
                    settings: await getSettings(),
                    profile,
                    job,
                    result,
                    questions: writtenQuestions,
                    mode: answerMode || 'interactive'
                });
                await applyAiAnswers(viaAssistant);
            }
            try {
                const latestAnswers = answersPayload?.answers || [];
                const pack = await saveCapturedQuestionsPack({
                    applicationId: result.application_id || result.applicationId || null,
                    company: job.company || result.company_name || '',
                    jobRole: job.title || result.job_role || '',
                    url: job.url || '',
                    questions: writtenQuestions,
                    answers: latestAnswers
                });
                if (pack?.items?.length) {
                    await sendTabMessage(tabId, {
                        type: 'UPDATE_AUTOFILL_PANEL',
                        qa: pack.items,
                        status: `${pack.items.length} question(s) saved in panel`
                    }).catch(() => {});
                }
            } catch (_) { /* ignore */ }
        } catch (err) {
            if (gapFillOnly) {
                console.warn('[bidder] continue fill answers skipped', err);
            } else {
            console.warn('[bidder] answer draft failed — trying API batch', err);
            try {
                const apiPayload = await generateAnswers({
                    profile_id: profile.id,
                    job_description: job.description || job.job_description || '',
                    resume_html: result.resume_html || result.resume_content || result.draft_html || '',
                    questions: writtenQuestions,
                    company_name: job.company || result.company_name || '',
                    job_role: job.title || result.job_role || '',
                    application_id: result.application_id || result.applicationId || null,
                    answers_provider: 'groq'
                });
                await applyAiAnswers(apiPayload);
                if ((answersPayload.answers || []).length) {
                    await notify('Answers via API', err?.message || 'Filled using direct answers API');
                }
            } catch (err2) {
                console.warn('[bidder] generateAnswers failed', err2);
                await notify(
                    'Written answers skipped',
                    err2?.message || 'Generate a CV first (Alt+Shift+G), then Answer questions'
                );
                answersPayload.answers = [];
                answersPayload.skipped = writtenQuestions.map((q) => ({
                    id: q.id,
                    label: q.label,
                    reason: 'answers_api_failed'
                }));
            }
            }
        }
    } else if (phase === 'answers' && writtenQuestions.length === 0) {
        await notify('Lumi', 'No written questions found on this form');
    }

    const applicationId = result.application_id || result.applicationId || null;
    // Only auto-mark applied when optional auto-Submit actually clicked.
    // Otherwise the user marks applied (popup button) after they Submit.
    let marked = null;
    if (
        applicationId
        && settings.autoSubmit
        && fillResult.submitStats?.clicked
        && !opts.skipAutoMarkApplied
    ) {
        marked = await maybeMarkApplied(applicationId);
    }

    if (applicationId) {
        try {
            const salaryAns = (answersPayload.answers || []).find((a) => a?.salary_meta);
            await logBidCourseFill({
                application_id: applicationId,
                job_url: job.url || null,
                company_name: job.company || result.company_name || null,
                job_role: job.title || result.job_role || null,
                answers: answersPayload.answers || [],
                answers_provider: answersPayload.provider || null,
                answers_model: answersPayload.model || null,
                salary_value: salaryAns?.salary_meta?.value ?? null,
                salary_formatted: salaryAns?.answer || null,
                fill_stats: {
                    filled: fillResult.fillStats?.filled || 0,
                    uploaded: fillResult.uploadStats?.uploaded || 0,
                    filledSalary: fillResult.fillStats?.filledSalary || 0,
                    skippedSalary: fillResult.fillStats?.skippedSalary || 0,
                    ats: fillResult.ats || form.ats,
                    questions: writtenQuestions.length
                }
            });
        } catch (err) {
            console.warn('[bidder] bid course fill log failed', err);
        }
    }

    return {
        ats: fillResult.ats || form.ats,
        questions: essayQuestions.length,
        answers: (answersPayload.answers || []).length,
        skippedSalary: (answersPayload.skipped || []).length + (fillResult.fillStats?.skippedSalary || 0),
        filled: fillResult.fillStats?.filled || 0,
        uploaded: fillResult.uploadStats?.uploaded || 0,
        submitted: !!fillResult.submitStats?.clicked,
        markedApplied: !!marked,
        applicationId
    };
}

async function copyJobToClipboard(tabId, job) {
    const text = [
        job.title ? `Title: ${job.title}` : '',
        job.company ? `Company: ${job.company}` : '',
        job.url ? `URL: ${job.url}` : '',
        '',
        job.description || ''
    ].filter((line, i, arr) => line || arr[i - 1] !== '').join('\n').trim();

    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            func: async (payload) => {
                try {
                    await navigator.clipboard.writeText(payload);
                    return true;
                } catch (_) {
                    const ta = document.createElement('textarea');
                    ta.value = payload;
                    ta.style.position = 'fixed';
                    ta.style.left = '-9999px';
                    document.body.appendChild(ta);
                    ta.select();
                    const ok = document.execCommand('copy');
                    ta.remove();
                    return ok;
                }
            },
            args: [text]
        });
        return true;
    } catch (err) {
        console.warn('[bidder] clipboard copy failed', err);
        return false;
    }
}

async function waitTabComplete(tabId, timeoutMs = 30000) {
    const existing = await chrome.tabs.get(tabId);
    if (existing.status === 'complete') return;
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            reject(new Error('Timed out loading Generate page'));
        }, timeoutMs);
        function listener(id, info) {
            if (id === tabId && info.status === 'complete') {
                clearTimeout(timer);
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
            }
        }
        chrome.tabs.onUpdated.addListener(listener);
    });
}

/**
 * Ashby JD pages have no form — application is at .../{uuid}/application.
 * After JD scrape, open that page in the same tab (click Apply, else navigate).
 */
async function ensureAshbyApplicationPage(tabId, currentUrl) {
    if (!isAshbyJobDescriptionUrl(currentUrl)) {
        return { navigated: false, url: currentUrl };
    }
    const targetUrl = ashbyApplicationUrl(currentUrl);

    let clickedHref = null;
    try {
        const [{ result }] = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
                const anchors = [...document.querySelectorAll('a[href*="/application"]')];
                const prefer = anchors.find((a) => /apply for this job/i.test((a.innerText || '').trim()))
                    || anchors.find((a) => /apply/i.test((a.innerText || '').trim()))
                    || anchors[0];
                if (prefer) {
                    const href = prefer.href || prefer.getAttribute('href') || '';
                    prefer.click();
                    return href || true;
                }
                const btn = [...document.querySelectorAll('button, [role="button"]')]
                    .find((el) => /apply for this job/i.test((el.innerText || el.textContent || '').trim()));
                if (btn) {
                    btn.click();
                    return true;
                }
                return false;
            }
        });
        clickedHref = result || null;
    } catch (_) {
        clickedHref = null;
    }

    if (!clickedHref) {
        await chrome.tabs.update(tabId, { url: targetUrl });
    }

    try {
        await waitTabComplete(tabId, 45000);
    } catch (_) { /* SPA may already be complete */ }

    // Ashby SPA: wait until path includes /application or form appears.
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
        let tab;
        try { tab = await chrome.tabs.get(tabId); } catch (_) { break; }
        const url = tab?.url || '';
        if (/\/application\/?($|\?|#)/i.test(url)) break;
        try {
            await ensureScripts(tabId);
            const detect = await chrome.tabs.sendMessage(tabId, { type: 'DETECT_APPLY_FORM' }).catch(() => null);
            if (detect?.ok && detect.data?.ok) break;
        } catch (_) { /* loading */ }
        await new Promise((r) => setTimeout(r, 500));
    }

    // If click stayed on JD, force navigate.
    try {
        const tab = await chrome.tabs.get(tabId);
        if (isAshbyJobDescriptionUrl(tab?.url || '')) {
            await chrome.tabs.update(tabId, { url: targetUrl });
            await waitTabComplete(tabId, 45000).catch(() => {});
            await new Promise((r) => setTimeout(r, 1200));
        }
    } catch (_) { /* ignore */ }

    await ensureScripts(tabId).catch(() => false);
    await new Promise((r) => setTimeout(r, 800));
    let finalUrl = targetUrl;
    try {
        finalUrl = (await chrome.tabs.get(tabId))?.url || targetUrl;
    } catch (_) { /* ignore */ }
    return { navigated: true, url: finalUrl };
}

async function seedGenerateTabStorage(tabId, token, user, pending, clipText) {
    const seedFn = (token, user, pending, clipText) => {
        try {
            if (token) localStorage.setItem('token', token);
            if (user) localStorage.setItem('user', JSON.stringify(user));
            sessionStorage.setItem('job_apply_bidder_pending', JSON.stringify(pending));
            sessionStorage.setItem('job_apply_bidder_show_preview', '1');
        } catch (_) { /* ignore */ }
        try {
            navigator.clipboard.writeText(clipText);
        } catch (_) { /* ignore */ }
    };

    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            injectImmediately: true,
            func: seedFn,
            args: [token, user, pending, clipText]
        });
    } catch (_) {
        await chrome.scripting.executeScript({
            target: { tabId },
            func: seedFn,
            args: [token, user, pending, clipText]
        });
    }
}

async function openGeneratePageAndInject({ settings, profile, job, coreSkills, samePageFill = false, jobTab = null }) {
    const payload = {
        company_name: job.company || '',
        job_role: job.title || '',
        job_url: job.url || '',
        job_description: job.description || '',
        core_skills: coreSkills.join(', '),
        font_family: '__random__',
        auto_generate: true,
        same_page_fill: !!samePageFill,
        session_id: settings.activeJobSession?.sessionId || null
    };

    const magicClipboard = JSON.stringify({
        magic: '__JOB_DETAILS_PAYLOAD__',
        version: 1,
        company_name: payload.company_name,
        job_role: payload.job_role,
        core_skills: payload.core_skills,
        job_url: payload.job_url,
        job_description: payload.job_description
    });

    const generateUrl =
        `${settings.frontendBaseUrl}/user/generate/${profile.id}?from_bidder=1`;

    const tab = await chrome.tabs.create({ url: generateUrl, active: true });

    // Seed auth + JD as early as possible (before React mount when we can).
    const onLoading = (tabId, info) => {
        if (tabId !== tab.id || info.status !== 'loading') return;
        seedGenerateTabStorage(tab.id, settings.token, settings.user, payload, magicClipboard).catch(() => {});
    };
    chrome.tabs.onUpdated.addListener(onLoading);

    await waitTabComplete(tab.id);
    chrome.tabs.onUpdated.removeListener(onLoading);

    // Idempotent fallback after load — no full tab reload.
    await seedGenerateTabStorage(tab.id, settings.token, settings.user, payload, magicClipboard);

    try {
        await chrome.tabs.sendMessage(tab.id, {
            type: 'BIDDER_INJECT_JOB',
            payload,
            token: settings.token,
            user: settings.user
        });
    } catch (_) {
        await new Promise((r) => setTimeout(r, 250));
        try {
            await chrome.tabs.sendMessage(tab.id, {
                type: 'BIDDER_INJECT_JOB',
                payload,
                token: settings.token,
                user: settings.user
            });
        } catch (_) {
            // sessionStorage + poll bridge in ResumeGenerator is enough.
        }
    }

    await saveActiveJobSession({
        generateTabId: tab.id,
        generateWindowId: tab.windowId,
        generateUrl,
        jobTabId: jobTab?.id ?? null,
        jobWindowId: jobTab?.windowId ?? null
    });

    return { tabId: tab.id, generateUrl, payload };
}

/**
 * Profile-only autofill on a known tab (works while CV is still generating).
 * No AI, no resume required.
 */
async function fillProfileOnTab(tabId, { profile, job }) {
    await ensureScripts(tabId);
    const ready = await waitForFormReady(tabId, {
        minFields: 6,
        profileFill: true,
        requireIdentity: true,
        stableReads: 2,
        pollMs: 150,
        maxMs: 8000
    }).catch(() => null);
    let form = ready?.form || null;
    if (!form) form = await collectForm(tabId);
    if (form.blocked) {
        throw new Error(form.reason || 'This site is blocked for autofill');
    }
    const fieldCount = (form.fields || []).length + (form.fileInputs || []).length;
    if (fieldCount < 1) {
        return { filled: 0, questions: 0, uploaded: 0 };
    }

    const profileFields = {
        id: profile.id,
        first_name: profile.first_name,
        last_name: profile.last_name,
        email: profile.email,
        phone: profile.phone,
        linkedin_url: profile.linkedin_url,
        github_url: profile.github_url,
        city: profile.city,
        state: profile.state,
        country: profile.country,
        address: profile.address,
        postal_code: profile.postal_code,
        birthdate: profile.birthdate || '',
        salary_range: profile.salary_range || '',
        gender: profile.gender || '',
        work_authorization: profile.work_authorization || '',
        requires_sponsorship: profile.requires_sponsorship || '',
        disability_status: 'No, I do not have a disability',
        veteran_status: profile.veteran_status || '',
        race_ethnicity: 'Black or African American',
        website_url: profile.website_url || '',
        portfolio_url: profile.portfolio_url || '',
        pronouns: profile.pronouns || '',
        preferred_name: profile.preferred_name || '',
        over_18: profile.over_18 || '',
        hispanic_latino: profile.hispanic_latino || '',
        willing_to_relocate: profile.willing_to_relocate || '',
        willing_to_travel: profile.willing_to_travel || '',
        earliest_start_date: profile.earliest_start_date || '',
        notice_period: profile.notice_period || '',
        how_heard: profile.how_heard || 'LinkedIn',
        years_of_experience: profile.years_of_experience || '',
        education_level: profile.education_level || '',
        education: profile.education || '',
        school: profile.school || '',
        degree: profile.degree || '',
        discipline: profile.discipline || '',
        security_clearance: profile.security_clearance || ''
    };

    const writtenQuestions = (form.questions || []).filter(
        (q) => q.kind === 'question' || (q.answer_type === 'written' && q.kind !== 'salary')
    );

    const fillResult = await fillAndUpload(tabId, {
        fields: form.fields || [],
        answers: [],
        profile: profileFields,
        jobDescription: job.description || job.job_description || '',
        fileInputs: [],
        filename: null,
        base64: null,
        mimeType: null,
        autoSubmit: false,
        skipQuestions: true,
        profileOnly: true
    });

    const filled = fillResult.fillStats?.filled || 0;
    await chrome.tabs.sendMessage(tabId, {
        type: 'SHOW_TOAST',
        text: filled
            ? `Autofilled ${filled} profile field(s) while CV generates`
            : 'No profile fields matched yet',
        kind: filled ? 'ok' : 'info'
    }).catch(() => {});

    return {
        filled,
        uploaded: 0,
        questions: writtenQuestions.length,
        ats: fillResult.ats || form.ats
    };
}

async function runBidGenerate({ alsoFill = false } = {}) {
    const settings = await getSettings();
    if (!settings.token) {
        await notify('Lumi', 'Log in via the extension popup first');
        throw new Error('Not logged in');
    }
    if (!settings.selectedProfileId) {
        await notify('Lumi', 'Choose a bid profile in the extension popup');
        throw new Error('No profile selected');
    }

    const locks = await chrome.storage.local.get([GENERATING_KEY, 'generatingAt']);
    const genStarted = Number(locks.generatingAt || 0);
    const genStale = genStarted > 0 && (Date.now() - genStarted) > 10 * 60 * 1000;
    if (locks[GENERATING_KEY] && !genStale) {
        await notify('Lumi', 'A generate is already running');
        return;
    }

    await chrome.storage.local.set({ [GENERATING_KEY]: true, generatingAt: Date.now() });
    await notify('Lumi', 'Capturing job description…');

    try {
        const { tab, job } = await scrapeActiveTab();

        // Require a real JD: selection / picked block / known selector — not full-page junk.
        if (job.needsSelection || !job.description || job.description.length < 80) {
            await ensureScripts(tab.id);
            await chrome.tabs.sendMessage(tab.id, { type: 'START_JD_PICK' }).catch(() => {});
            await notify(
                'Select the JD first',
                'Highlight the job description (or click the JD block), then press Alt+Shift+G again'
            );
            await toastActiveTab(
                'Select JD text (or click JD block), then Alt+Shift+G',
                'error'
            );
            // Soft stop — already notified; do not throw (avoids red [bidder] Error in SW console).
            return {
                needsSelection: true,
                jobUrl: tab.url || job.url || ''
            };
        }

        if (job.source === 'none') {
            await chrome.tabs.sendMessage(tab.id, { type: 'START_JD_PICK' }).catch(() => {});
            await notify('Select the JD first', 'Could not find JD — click the description block, then Alt+Shift+G');
            return { needsSelection: true, jobUrl: tab.url || job.url || '' };
        }

        const copied = await copyJobToClipboard(tab.id, job);

        // Ashby: JD page has no form — open .../application in this tab after scrape.
        const jdUrl = job.url || tab.url || '';
        if (isAshbyJobDescriptionUrl(tab.url || jdUrl)) {
            try {
                await notify('Ashby', 'Opening application form…');
                const nav = await ensureAshbyApplicationPage(tab.id, tab.url || jdUrl);
                if (nav.navigated) {
                    job.url = jdUrl; // keep posting URL for CV / session
                    try {
                        const refreshed = await chrome.tabs.get(tab.id);
                        if (refreshed) Object.assign(tab, refreshed);
                    } catch (_) { /* ignore */ }
                }
            } catch (err) {
                console.warn('[bidder] ashby open application', err);
                await notify('Ashby', `Could not open application page: ${err?.message || err}`);
            }
        }

        const profiles = await listProfiles();
        const profile = (Array.isArray(profiles) ? profiles : [])
            .find((p) => Number(p.id) === Number(settings.selectedProfileId));
        if (!profile) throw new Error('Selected profile is no longer assigned to your account');

        let coreSkills = inferCoreSkillsFromJd(job.description, profile.techstacks);
        if (coreSkills.length === 0) {
            coreSkills = techstacksToCoreSkills(profile.techstacks).slice(0, 2);
        }
        if (coreSkills.length === 0) coreSkills = ['Python'];

        const sessionId = newSessionId();
        await saveActiveJobSession({
            sessionId,
            jobTabId: tab.id,
            jobWindowId: tab.windowId,
            jobUrl: jdUrl || job.url || tab.url || '',
            jobUrlKey: jobUrlKey(jdUrl || job.url || tab.url),
            jobDescription: job.description,
            jobSource: job.source || 'unknown',
            company: job.company || '',
            jobTitle: job.title || '',
            profileId: profile.id,
            generateTabId: null,
            applyTabId: /\/application\/?($|\?|#)/i.test(tab.url || '') ? tab.id : null,
            applicationId: null,
            resumeFilename: null,
            createdAt: new Date().toISOString()
        });

        // Greenhouse-style: JD + questions on one page → after CV, answer + fill this tab.
        // Ashby: after auto-nav to /application, form is on this tab too.
        let samePageFill = false;
        let formSnapshot = null;
        try {
            formSnapshot = await collectForm(tab.id);
            samePageFill = !formSnapshot?.blocked
                && Array.isArray(formSnapshot.questions)
                && formSnapshot.questions.length > 0;
            // Ashby application often has profile fields before AI questions.
            if (!samePageFill && detectAtsFromUrl(tab.url).id === 'ashby') {
                const fieldN = (formSnapshot?.fields || []).length;
                if (fieldN >= 2) samePageFill = true;
            }
        } catch (err) {
            console.warn('[bidder] form collect on generate', err);
        }

        if (samePageFill) {
            await saveSettings({
                pendingSamePageApply: {
                    applyTabId: tab.id,
                    applyUrl: tab.url || job.url || '',
                    sessionId,
                    autoAnswerWhenCvReady: true,
                    job: {
                        title: job.title,
                        company: job.company,
                        url: job.url,
                        description: job.description
                    },
                    form: {
                        ats: formSnapshot.ats,
                        fields: formSnapshot.fields || [],
                        questions: formSnapshot.questions || [],
                        fileInputs: formSnapshot.fileInputs || []
                    },
                    profileId: profile.id,
                    at: new Date().toISOString()
                }
            });
            await saveActiveJobSession({ applyTabId: tab.id });

            // Profile autofill NOW (no AI) while CV generates in parallel.
            try {
                await notify(
                    'Autofill while CV generates',
                    `Filling name/phone/… now · ${formSnapshot.questions.length} AI question(s) after CV`
                );
                await fillProfileOnTab(tab.id, { profile, job });
            } catch (err) {
                console.warn('[bidder] profile fill during generate', err);
                await notify('Profile autofill skipped', err?.message || String(err));
            }
        } else {
            await saveSettings({ pendingSamePageApply: null });
            // Still try profile fill if the page has personal fields (JD+apply hybrid).
            try {
                const fieldN = (formSnapshot?.fields || []).length;
                if (fieldN >= 2) {
                    await fillProfileOnTab(tab.id, { profile, job });
                    await saveActiveJobSession({ applyTabId: tab.id });
                    await saveSettings({
                        pendingSamePageApply: {
                            applyTabId: tab.id,
                            applyUrl: tab.url || job.url || '',
                            sessionId,
                            autoAnswerWhenCvReady: true,
                            job: {
                                title: job.title,
                                company: job.company,
                                url: job.url,
                                description: job.description
                            },
                            form: formSnapshot,
                            profileId: profile.id,
                            at: new Date().toISOString()
                        }
                    });
                }
            } catch (err) {
                console.warn('[bidder] optional profile fill', err);
            }
            await notify(
                'Lumi',
                copied
                    ? `JD captured (${job.source}) — opening Generate…`
                    : 'Opening Generate page with JD…'
            );
        }

        const opened = await openGeneratePageAndInject({
            settings: await getSettings(),
            profile,
            job,
            coreSkills,
            samePageFill,
            jobTab: tab
        });

        if (samePageFill) {
            await notify(
                'CV generating…',
                'Profile already autofilled. AI questions will fill when CV is ready.'
            );
        } else if (alsoFill && !samePageFill) {
            await notify('Generate started in app', 'When CV is ready: Answer questions on the apply form');
        } else if (!samePageFill) {
            await notify(
                'Watch Generate page',
                'CV generating — Autofill anytime; Answer questions after CV'
            );
        }

        const lastResult = {
            at: new Date().toISOString(),
            sessionId,
            jobTitle: job.title,
            company: job.company || '',
            jobUrl: job.url,
            jobDescription: job.description,
            jdSource: job.source,
            jdCopied: copied,
            openedGenerateUi: true,
            generateUrl: opened.generateUrl,
            generateTabId: opened.tabId,
            jobTabId: tab.id,
            jobWindowId: tab.windowId,
            profileId: profile.id,
            profileName: `${profile.first_name} ${profile.last_name}`,
            applicationId: null,
            resumeFilename: null,
            downloadUrl: null,
            validationPass: null,
            autoPassed: null,
            samePageFill,
            questionCount: samePageFill ? formSnapshot.questions.length : 0,
            fillStats: null
        };
        await saveSettings({ lastResult });
        return lastResult;
    } catch (err) {
        const message = err?.message || String(err);
        const soft = /Select the job description|Could not find JD|error page|Chrome error page|Open a job posting/i.test(message);
        await saveSettings({
            lastResult: { at: new Date().toISOString(), error: message },
            pendingSamePageApply: null
        });
        if (!soft) {
            await notify('Lumi failed', message);
        } else if (/error page|Chrome error page/i.test(message)) {
            await notify('Page failed to load', message);
        }
        if (soft) return { error: message, soft: true };
        throw err;
    } finally {
        await chrome.storage.local.set({ [GENERATING_KEY]: false });
    }
}

/**
 * Called when the Generate page finishes a CV (via app-bridge).
 * If this was a Greenhouse same-page run, draft answers and fill the apply tab.
 */
async function handleGenerateDone(result = {}) {
    const settings = await getSettings();
    const applicationId = result.application_id || null;
    const resumeFilename = result.resume_filename || null;
    const jobUrl = result.job_url || settings.lastResult?.jobUrl || null;

    await saveSettings({
        lastResult: {
            ...(settings.lastResult || {}),
            at: new Date().toISOString(),
            applicationId,
            resumeFilename,
            downloadUrl: resumeFilename
                ? resumeDownloadUrl(settings.apiBaseUrl, resumeFilename)
                : (settings.lastResult?.downloadUrl || null),
            validationPass: result.validation_pass,
            company: result.company_name || settings.lastResult?.company,
            jobTitle: result.job_role || settings.lastResult?.jobTitle,
            jobUrl,
            profileId: result.profile_id || settings.lastResult?.profileId
        }
    });

    // Remember this CV by job URL so Alt+Shift+F after refresh reconnects
    // to the same application_id (no regenerate).
    await rememberCvForJob({
        jobUrl,
        applicationId,
        resumeFilename,
        profileId: result.profile_id || settings.selectedProfileId,
        company: result.company_name,
        jobTitle: result.job_role
    });

    await saveActiveJobSession({
        applicationId,
        resumeFilename,
        company: result.company_name || settings.activeJobSession?.company,
        jobTitle: result.job_role || settings.activeJobSession?.jobTitle,
        jobUrl: jobUrl || settings.activeJobSession?.jobUrl,
        jobUrlKey: jobUrlKey(jobUrl || settings.activeJobSession?.jobUrl),
        profileId: result.profile_id || settings.selectedProfileId
    });

    const pending = settings.pendingSamePageApply;
    if (pending?.applyTabId) {
        await saveSettings({
            pendingSamePageApply: {
                ...pending,
                waitForManualFill: !pending.autoAnswerWhenCvReady,
                applicationId,
                resumeFilename
            }
        });
    }

    // After CV: auto-run AI answers on the apply tab (profile was filled during generate).
    if (pending?.autoAnswerWhenCvReady && pending.applyTabId && applicationId) {
        await notify(
            'CV ready — answering questions',
            'Profile already filled. Drafting AI answers from JD + CV…'
        );
        try {
            await chrome.tabs.get(pending.applyTabId);
            // Prefer staying on generate briefly then answers UI opens — run answers phase
            // with explicit tab so we don't scrape the Generate page.
            await runFillOnly({
                phase: 'answers',
                answerMode: 'auto',
                tabId: pending.applyTabId,
                jobOverride: pending.job || null,
                resultOverride: {
                    application_id: applicationId,
                    resume_filename: resumeFilename,
                    resume_html: result.resume_html || result.resume_content || result.draft_html || '',
                    company_name: result.company_name || pending.job?.company || '',
                    job_role: result.job_role || pending.job?.title || ''
                }
            });
            await saveSettings({ pendingSamePageApply: null });
            return { ok: true, filled: true, applicationId, autoAnswered: true };
        } catch (err) {
            console.warn('[bidder] auto answer after CV failed', err);
            await notify(
                'CV ready — answer manually',
                err?.message || 'Click Answer questions on the apply page'
            );
        }
    }

    await notify(
        'CV ready — preview on Generate',
        applicationId
            ? `App #${applicationId}. Profile may already be filled — use Answer questions for “why…”`
            : 'Review the CV, then Answer questions on the apply form.'
    );
    return { ok: true, filled: false, applicationId, deferredFill: true };
}

async function runFillOnly(opts = {}) {
    const phase = opts.phase || 'profile'; // Simplify default: profile autofill only
    const settings = await getSettings();
    if (!settings.token || !settings.selectedProfileId) {
        await notify('Lumi', 'Log in and choose a profile in the extension popup first');
        throw new Error('Log in and choose a profile first');
    }

    await acquireFillLock();
    const phaseLabel = phase === 'answers'
        ? 'Answer questions…'
        : phase === 'full'
            ? 'Autofill + answer questions…'
            : 'Autofill (profile)…';
    await setWorkProgress({
        kind: 'autofill',
        phase: phase === 'answers' ? 'answers' : 'collect',
        label: phaseLabel,
        startedAt: Date.now(),
        phaseStartedAt: Date.now()
    }).catch(() => {});
    await notify('Lumi', phaseLabel);
    await toastActiveTab(phaseLabel, 'info');

    try {
        let tab;
        let job;
        if (opts.tabId) {
            tab = await chrome.tabs.get(opts.tabId);
            await ensureScripts(tab.id);
            job = opts.jobOverride
                ? {
                    title: opts.jobOverride.title || '',
                    company: opts.jobOverride.company || '',
                    url: opts.jobOverride.url || tab.url || '',
                    description: opts.jobOverride.description || ''
                }
                : {
                    title: '',
                    company: '',
                    url: tab.url || '',
                    description: ''
                };
            // Prefer session JD text when answering
            const session0 = settings.activeJobSession;
            if ((!job.description || job.description.length < 80) && session0?.jobDescription) {
                job.description = session0.jobDescription;
                job.title = job.title || session0.jobTitle || '';
                job.company = job.company || session0.company || '';
            }
        } else {
            const scraped = await scrapeActiveTab();
            tab = scraped.tab;
            job = scraped.job;
        }

        const session = settings.activeJobSession;
        const pageUrl = tab.url || job.url || '';

        const fe = settings.frontendBaseUrl || '';
        if (
            (fe && pageUrl.startsWith(fe))
            || /\/user\/generate\//i.test(pageUrl)
            || isAppUrl(pageUrl, fe)
        ) {
            throw new Error('Switch to the job apply form tab (not the Generate page)');
        }

        const linked = await findCvLinkForUrl(pageUrl, settings.selectedProfileId);
        const gate = assertJobSessionMatch({
            pageUrl,
            tabId: tab.id,
            windowId: tab.windowId,
            session,
            linked,
            lastResult: settings.lastResult
        });
        // Manual Autofill (profile / full from popup/hotkey): soft session —
        // token+profile is enough; warn but continue. Bidder queue keeps strict session.
        const softSession = opts.softSession !== false && (
            phase === 'profile'
            || opts.manualAutofill === true
            || opts.fromPanel === true
        );
        if (!gate.ok) {
            if (softSession && settings.token && settings.selectedProfileId) {
                await chrome.tabs.sendMessage(tab.id, {
                    type: 'SHOW_TOAST',
                    text: 'No job↔CV session — filling from profile anyway',
                    kind: 'info'
                }).catch(() => {});
            } else {
                throw new Error(gate.error);
            }
        }

        await saveActiveJobSession({
            applyTabId: tab.id,
            applyUrl: pageUrl
        });

        await chrome.tabs.sendMessage(tab.id, {
            type: 'SHOW_TOAST',
            text: 'Lumi: working on this page…',
            kind: 'info'
        }).catch(() => {});

        if (phase === 'answers' || phase === 'full') {
            let formPreview = null;
            try {
                formPreview = await collectForm(tab.id);
            } catch (_) { /* ignore */ }
            const writtenQs = (formPreview?.questions || []).filter(
                (q) => q.kind === 'question' || q.kind === 'salary'
            );
            if (writtenQs.length > 0 && !formPreview?.hasQuestionSelection) {
                await chrome.tabs.sendMessage(tab.id, { type: 'SELECT_ALL_QUESTIONS' }).catch(() => {});
            }
        }

        let profile = null;
        let result = {
            application_id: null,
            resume_filename: null,
            resume_html: '',
            company_name: job.company || session?.company || settings.lastResult?.company || '',
            job_role: job.title || session?.jobTitle || settings.lastResult?.jobTitle || '',
            ...(opts.resultOverride || {})
        };
        if (opts.resultOverride?.application_id) {
            result.application_id = opts.resultOverride.application_id;
        }
        if (opts.resultOverride?.resume_filename) {
            result.resume_filename = opts.resultOverride.resume_filename;
        }
        if (opts.resultOverride?.resume_html) {
            result.resume_html = opts.resultOverride.resume_html;
        }

        // Prefer session CV (bound to this job window), then cvLink for this URL.
        if (session?.applicationId || session?.resumeFilename) {
            result.application_id = session.applicationId || null;
            result.resume_filename = session.resumeFilename || null;
            result.company_name = session.company || result.company_name;
            result.job_role = session.jobTitle || result.job_role;
            if (session.jobDescription) {
                job.description = session.jobDescription;
            }
        } else if (linked?.applicationId || linked?.resumeFilename) {
            result.application_id = linked.applicationId || null;
            result.resume_filename = linked.resumeFilename || null;
            result.company_name = linked.company || result.company_name;
            result.job_role = linked.jobTitle || result.job_role;
        }

        if (settings.lastResult?.applicationId && !result.application_id) {
            result.application_id = settings.lastResult.applicationId;
            result.resume_filename = settings.lastResult.resumeFilename || result.resume_filename;
        }

        try {
            const profiles = await listProfiles();
            profile = (profiles || []).find((p) => String(p.id) === String(settings.selectedProfileId))
                || (profiles || [])[0];
        } catch (_) { /* ignore */ }

        if (result.application_id) {
            try {
                const packed = await getBidderApplication(result.application_id);
                if (packed?.application) {
                    result.resume_filename = packed.application.resume_filename || result.resume_filename;
                    result.resume_html = packed.application.draft_html || result.resume_html || '';
                    result.company_name = packed.application.company_name || result.company_name;
                    result.job_role = packed.application.job_role || result.job_role;
                    job.description = packed.application.job_description || job.description || session?.jobDescription || '';
                    if (packed.profile) profile = packed.profile;
                }
            } catch (err) {
                console.warn('[bidder] application fetch failed', err);
            }
        }

        if (!result.application_id && !result.resume_filename) {
            try {
                const byUrl = await getBidderApplicationByJobUrl(pageUrl, settings.selectedProfileId);
                if (byUrl?.application) {
                    result.application_id = byUrl.application.id;
                    result.resume_filename = byUrl.application.resume_filename;
                    result.resume_html = byUrl.application.draft_html || '';
                    result.company_name = byUrl.application.company_name || result.company_name;
                    result.job_role = byUrl.application.job_role || result.job_role;
                    job.description = byUrl.application.job_description || job.description;
                    if (byUrl.profile) profile = byUrl.profile;
                }
            } catch (_) { /* ignore */ }
        }

        // Last resort: newest CV for this profile (so Autofill can still attach a resume).
        if (!result.resume_filename && settings.selectedProfileId) {
            try {
                const latest = await getLatestBidderApplication(settings.selectedProfileId);
                if (latest?.application?.resume_filename) {
                    result.resume_filename = latest.application.resume_filename;
                    result.resume_html = latest.application.draft_html || result.resume_html || '';
                    if (!result.application_id) result.application_id = latest.application.id;
                }
            } catch (_) { /* ignore */ }
        }

        if (!profile) {
            throw new Error('No profile selected — save a bid profile in the popup');
        }

        if (phase === 'answers' && !result.resume_filename && !result.application_id && !result.resume_html) {
            throw new Error('Generate a CV first (Alt+Shift+G), then Answer questions');
        }

        if (session?.jobDescription && session.jobDescription.length > 80) {
            job.description = session.jobDescription;
        }

        const fillStats = await autofillAfterGenerate({
            tabId: tab.id,
            settings,
            profile,
            job,
            result,
            phase,
            answerMode: opts.answerMode || 'interactive',
            softAnswers: !!opts.softAnswers,
            fromPanel: !!opts.fromPanel,
            reuseAnswers: opts.reuseAnswers !== false,
            gapFillOnly: !!opts.gapFillOnly
        });

        await rememberCvForJob({
            jobUrl: pageUrl,
            applicationId: fillStats.applicationId || result.application_id,
            resumeFilename: result.resume_filename,
            profileId: settings.selectedProfileId,
            company: result.company_name,
            jobTitle: result.job_role
        });

        await saveActiveJobSession({
            applicationId: fillStats.applicationId || result.application_id,
            resumeFilename: result.resume_filename,
            applyTabId: tab.id,
            applyUrl: pageUrl
        });

        await saveSettings({
            pendingFill: null,
            lastResult: {
                ...(settings.lastResult || {}),
                at: new Date().toISOString(),
                applicationId: fillStats.applicationId || result.application_id,
                filled: fillStats.filled,
                uploaded: fillStats.uploaded,
                resumeFilename: result.resume_filename || settings.lastResult?.resumeFilename,
                jobUrl: pageUrl || settings.lastResult?.jobUrl,
                sessionId: session?.sessionId || settings.lastResult?.sessionId,
                phase
            }
        });

        const msg = phase === 'profile'
            ? `Autofilled ${fillStats.filled || 0} field(s)`
                + (fillStats.uploaded ? `, uploaded resume` : '')
                + (fillStats.questions ? ` · ${fillStats.questions} need Answer questions` : '')
            : `Filled ${fillStats.filled || 0}`
                + (fillStats.answers ? `, answers ${fillStats.answers}` : '');
        await notify('Lumi', msg);
        await toastActiveTab(msg, (fillStats.filled || 0) > 0 ? 'ok' : 'error');
        await setWorkProgress({
            phase: 'done',
            label: msg,
            filled: fillStats.filled || 0,
            answers: fillStats.answers || 0
        }).catch(() => {});
        return fillStats;
    } catch (err) {
        const message = err?.message || String(err);
        await setWorkProgress({
            phase: 'error',
            label: message,
            error: message
        }).catch(() => {});
        await notify('Fill failed', message);
        await toastActiveTab('Fill failed: ' + message, 'error');
        throw err;
    } finally {
        await clearFillLock();
        // Keep final status ~8s so popup can show elapsed, then clear.
        setTimeout(() => { clearWorkProgress().catch(() => {}); }, 8000);
    }
}

/**
 * Stay-in-Lumi focus helper.
 * Only reclaim focus from OUR apply/background window — never yank the user
 * out of Gmail, another Chrome window, or any unrelated tab.
 * Pass { force: true } right after we open an apply tab.
 */
async function refocusStayInAppHome(opts = {}) {
    const force = !!opts.force;
    try {
        const { captchaUserFocusHoldUntil } = await chrome.storage.session.get('captchaUserFocusHoldUntil');
        if (Date.now() < Number(captchaUserFocusHoldUntil || 0)) return false;
    } catch (_) { /* ignore */ }

    const isApp = (u) => isAppUrl(u);
    try {
        const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (!force && isApp(active?.url) && !/job-links/i.test(active.url || '')) return false;
    } catch (_) { /* ignore */ }
    const pickHome = async () => {
        const tabs = await chrome.tabs.query({});
        return (
            tabs.find((t) => isApp(t.url) && /job-links/i.test(t.url || ''))
            || tabs.find((t) => isApp(t.url))
            || null
        );
    };

    try {
        const home = await pickHome();
        if (!home?.id) return false;

        if (!force) {
            let bgId = null;
            try {
                bgId = (await chrome.storage.session.get(['bidderBgWindowId']))?.bidderBgWindowId || null;
            } catch (_) { /* ignore */ }
            let focused = null;
            try {
                focused = await chrome.windows.getLastFocused();
            } catch (_) { /* ignore */ }
            const focusedId = focused?.id;
            // Already on Job Links window — nothing to reclaim.
            if (focusedId != null && focusedId === home.windowId) return true;
            // User is in some other window (not our apply bg) — leave them alone.
            if (focusedId != null && bgId != null && focusedId !== bgId) return false;
            if (focusedId != null && bgId == null && focusedId !== home.windowId) return false;
        }

        await chrome.tabs.update(home.id, { active: true });
        if (home.windowId != null) {
            await chrome.windows.update(home.windowId, { focused: true });
        }
        // One short re-assert only when we just opened an apply tab (debugger can steal once).
        if (force) {
            setTimeout(() => {
                chrome.storage.session.get('captchaUserFocusHoldUntil').then((data) => {
                    if (Date.now() < Number(data?.captchaUserFocusHoldUntil || 0)) return;
                    pickHome().then((h) => {
                        if (!h?.id) return;
                        chrome.tabs.update(h.id, { active: true }).catch(() => {});
                        if (h.windowId != null) {
                            chrome.windows.update(h.windowId, { focused: true }).catch(() => {});
                        }
                    }).catch(() => {});
                }).catch(() => {});
            }, 200);
        }
        return true;
    } catch (_) {
        return false;
    }
}

/** Dedicated unfocused window for apply tabs — Job Links window never switches. */
async function getOrCreateBidderBgWindow() {
    try {
        const stored = await chrome.storage.session.get(['bidderBgWindowId']);
        const id = stored?.bidderBgWindowId;
        if (id) {
            try {
                const win = await chrome.windows.get(id);
                if (win?.id) return win;
            } catch (_) { /* gone */ }
        }
    } catch (_) { /* session storage may be unavailable */ }
    return null;
}

function greenhouseJobKey(url) {
    try {
        const u = new URL(String(url || ''));
        if (!/greenhouse\.io/i.test(u.hostname)) return '';
        const forParam = (u.searchParams.get('for') || '').toLowerCase();
        const token = u.searchParams.get('token') || '';
        const jobId = token || (u.pathname.match(/\/jobs\/(\d+)/i)?.[1] || '');
        if (!jobId) return '';
        return `${forParam || u.hostname}|${jobId}`;
    } catch {
        return '';
    }
}

function urlsSameApplyJob(a, b) {
    const left = String(a || '');
    const right = String(b || '');
    if (!left || !right) return false;
    if (left === right) return true;
    try {
        if (urlsLooselyMatch(left, right)) return true;
    } catch (_) { /* ignore */ }
    const gk1 = greenhouseJobKey(left);
    const gk2 = greenhouseJobKey(right);
    if (gk1 && gk2 && gk1 === gk2) return true;
    try {
        const u1 = new URL(left);
        const u2 = new URL(right);
        if (u1.hostname.replace(/^www\./i, '') !== u2.hostname.replace(/^www\./i, '')) return false;
        const p1 = u1.pathname.replace(/\/+$/, '').toLowerCase();
        const p2 = u2.pathname.replace(/\/+$/, '').toLowerCase();
        return p1 === p2 || p1.includes(p2) || p2.includes(p1);
    } catch {
        return false;
    }
}

/** Find an open Chrome tab for this job URL (any window) — recovers after false Tab closed. */
async function findLiveApplyTabForUrl(wantedUrl) {
    const wanted = String(wantedUrl || '').trim();
    if (!wanted) return null;
    try {
        const tabs = await chrome.tabs.query({});
        let best = null;
        for (const t of tabs || []) {
            if (!t?.id) continue;
            const u = t.pendingUrl || t.url || '';
            if (!u || /^chrome:|^about:/i.test(u)) continue;
            if (!urlsSameApplyJob(u, wanted)) continue;
            if (!best || t.active) best = t;
            if (t.active) break;
        }
        return best;
    } catch (_) {
        return null;
    }
}

async function closeBidderTab(tabId) {
    if (!tabId) return;
    await releasePageDebugger(tabId);
    try { await chrome.tabs.remove(tabId); } catch (_) { /* ignore */ }
}

/** Drop dead tab ids from queue maps so Control never shows a fake Focus chip. */
async function clearTabMapping({ applicationId = null, tabId = null } = {}) {
    const st = await getQueueState().catch(() => null);
    if (!st) return;
    const tabsByAppId = { ...(st.tabsByAppId || {}) };
    if (applicationId != null) delete tabsByAppId[String(applicationId)];
    if (tabId != null) {
        for (const [k, v] of Object.entries(tabsByAppId)) {
            if (Number(v) === Number(tabId)) delete tabsByAppId[k];
        }
    }
    const patch = {
        tabsByAppId,
        ownedTabAlive: false,
        captchaTabMissing: true
    };
    if (tabId != null && Number(st.currentTabId) === Number(tabId)) patch.currentTabId = null;
    if (tabId != null && Number(st.captchaTabId) === Number(tabId)) patch.captchaTabId = null;
    await setQueueState(patch).catch(() => {});
}

/**
 * Best-effort evidence before close/park — screenshot + form collect + tab_closed event.
 * Keeps missing fields so the operator can check out after the page is gone or parked.
 */
async function captureFailEvidence(applicationId, tabId, reason, extra = {}) {
    if (!applicationId || !tabId) return null;
    let formSnap = null;
    try {
        const res = await sendTabMessage(tabId, { type: 'COLLECT_FORM' }, { retries: 1, baseDelayMs: 80 });
        const form = res?.form || res?.data || res || null;
        const fields = Array.isArray(form?.fields) ? form.fields : [];
        const missing = Array.isArray(form?.missingRequired)
            ? form.missingRequired
            : (Array.isArray(form?.missing) ? form.missing : []);
        formSnap = {
            fieldCount: fields.length || Number(form?.fieldCount) || 0,
            requiredOk: form?.requiredOk,
            requiredTotal: form?.requiredTotal,
            missing: missing.filter(Boolean).slice(0, 12).map((m) => (
                typeof m === 'string' ? m : String(m?.label || m?.name || m || '')
            )).filter(Boolean),
            url: form?.url || extra.url || null,
            fingerprint: form?.formFingerprint || form?.fingerprint || null
        };
    } catch (_) { /* tab may already be dying */ }
    try {
        await uploadScreenshot(applicationId, 'pre_close', tabId, { settleMs: 0, stayInApp: true });
    } catch (_) { /* ignore */ }
    const evidenceType = /cv_regen|fill_failed|form_too_thin|bid_time_budget/i.test(String(reason || ''))
        ? 'fill_evidence'
        : 'tab_closed';
    await logCourseEvent(applicationId, evidenceType, {
        reason: String(reason || 'unknown'),
        phase: extra.phase || reason,
        tabId,
        error: extra.error ? String(extra.error).slice(0, 200) : undefined,
        ...(formSnap || {})
    }).catch(() => {});
    if (formSnap?.missing?.length || formSnap?.requiredTotal) {
        await setAppRunState(applicationId, 'incomplete', {
            tabId,
            missingRequired: formSnap.missing || [],
            requiredOk: formSnap.requiredOk,
            requiredTotal: formSnap.requiredTotal,
            url: formSnap.url || extra.url || null,
            eventType: evidenceType
        }).catch(() => {});
    }
    try {
        await notify(
            'Lumi',
            reason === 'leftover_sweep'
                ? 'Apply tab closed — evidence saved'
                : 'Fill issue — tab kept for review · check Control'
        );
    } catch (_) { /* ignore */ }
    return formSnap;
}

/** Enrich queue payload with live tab liveness for Control / popup. */
async function enrichQueueSnapshot(st) {
    const data = st && typeof st === 'object' ? { ...st } : {};
    const appId = data.currentId || data.captchaApplicationId || data.lastApplicationId;
    const runRow = appId && data.runByAppId ? data.runByAppId[String(appId)] : null;
    let ownedTabId = Number(
        (appId && data.tabsByAppId?.[String(appId)])
        || data.currentTabId
        || data.captchaTabId
        || runRow?.tabId
        || 0
    ) || null;
    let ownedTabAlive = false;
    let ownedTabUrl = data.currentJobUrl || data.ownedTabUrl || runRow?.url || null;
    if (ownedTabId) {
        try {
            const tab = await chrome.tabs.get(ownedTabId);
            ownedTabAlive = true;
            ownedTabUrl = tab?.pendingUrl || tab?.url || ownedTabUrl;
        } catch (_) {
            ownedTabAlive = false;
        }
    }
    // Heal: mapped id dead but an apply tab for this job is still open (common after Open / bg-window churn).
    if (!ownedTabAlive && ownedTabUrl) {
        const live = await findLiveApplyTabForUrl(ownedTabUrl);
        if (live?.id) {
            ownedTabId = live.id;
            ownedTabAlive = true;
            ownedTabUrl = live.pendingUrl || live.url || ownedTabUrl;
            const tabsByAppId = { ...(data.tabsByAppId || {}) };
            if (appId) tabsByAppId[String(appId)] = ownedTabId;
            await setQueueState({
                tabsByAppId,
                currentTabId: ownedTabId,
                captchaTabId: data.captchaTabId ? ownedTabId : data.captchaTabId,
                captchaTabMissing: false,
                ownedTabAlive: true,
                currentJobUrl: ownedTabUrl || data.currentJobUrl || null
            }).catch(() => {});
            data.tabsByAppId = tabsByAppId;
            data.currentTabId = ownedTabId;
            data.captchaTabMissing = false;
        }
    } else if (!ownedTabAlive && ownedTabId && appId) {
        await clearTabMapping({ applicationId: appId, tabId: ownedTabId }).catch(() => {});
    }
    return {
        ...data,
        runState: data.runState || runRow?.status || null,
        ownedTabId: ownedTabAlive ? ownedTabId : (ownedTabId || null),
        ownedTabAlive,
        captchaTabMissing: !ownedTabAlive,
        ownedTabUrl: ownedTabUrl || null,
        missingRequired: runRow?.missingRequired
            || data.lastStatusMeta?.missing
            || data.lastStatusMeta?.missingRequired
            || [],
        lastDomSummary: data.lastDomSummary || runRow?.lastDomSummary || null,
        captcha: /awaiting_captcha/i.test(String(data.status || '')) || !!runRow?.captcha
    };
}

/** Bring the apply tab forward so the user can check answers / submit manually. */
async function focusBidderTabForReview(tabId) {
    if (!tabId) return false;
    try {
        const tab = await chrome.tabs.get(tabId);
        if (!tab?.id) return false;
        if (tab.windowId != null) {
            try {
                await chrome.windows.update(tab.windowId, { focused: true, state: 'normal' });
            } catch (_) { /* ignore */ }
        }
        await chrome.tabs.update(tabId, { active: true });
        return true;
    } catch (_) {
        return false;
    }
}

async function openReadyApplication(item, { fromQueue = false } = {}) {
    if (!item?.open_url) throw new Error('No apply URL on this application');
    const settings = await getSettings();
    const prefs = await getBidderPrefs();

    // Wait for CV if somehow not ready
    if (!item.resume_filename) {
        throw new Error('CV not ready yet — wait for generation');
    }

    // Production has no local disk — pull the CV into Downloads as soon as
    // Start Bid fires: CVs/Vinh Ly/Vinh_Ly_CV_<time>/Vinh_Ly.docx
    try {
        const profileHint = {
            first_name: item.first_name,
            last_name: item.last_name
        };
        const resumeFile = await fetchResumeBase64(
            settings.apiBaseUrl,
            item.resume_filename,
            settings.token,
            {
                profile: profileHint,
                uploadFilename: item.resume_upload_filename || null
            }
        );
        if (resumeFile) {
            resumeFile.profile = profileHint;
            resumeFile.applicationId = item.id;
            const saved = await downloadResumeToCvLibrary(resumeFile, profileHint, item.id);
            if (saved?.relPath) {
                await logCourseEvent(item.id, 'cv_downloaded', { path: saved.relPath }).catch(() => {});
            }
        }
    } catch (err) {
        console.warn('[bidder] start-bid CV download', err);
    }

    // Ashby Overview JD has no form — open .../application directly.
    const applyUrl = isAshbyJobDescriptionUrl(item.open_url)
        ? ashbyApplicationUrl(item.open_url)
        : item.open_url;

    await rememberCvForJob({
        jobUrl: applyUrl,
        applicationId: item.id,
        resumeFilename: item.resume_filename,
        profileId: item.profile_id,
        company: item.company_name,
        jobTitle: item.job_role
    });

    await saveSettings({
        pendingFill: {
            applicationId: item.id,
            profileId: item.profile_id,
            resumeFilename: item.resume_filename,
            company: item.company_name,
            jobRole: item.job_role,
            jobUrl: applyUrl,
            // Queue Process drives fill itself — never auto-start a second fill on tab load
            // (that raced acquireFillLock → "Fill already in progress" every Process).
            autoFillWhenReady: !fromQueue,
            fromBidder: true,
            autoSubmit: prefs.autoSubmit
        },
        lastResult: {
            at: new Date().toISOString(),
            applicationId: item.id,
            profileId: item.profile_id,
            resumeFilename: item.resume_filename,
            company: item.company_name,
            jobTitle: item.job_role,
            jobUrl: applyUrl,
            downloadUrl: item.resume_filename
                ? resumeDownloadUrl(settings.apiBaseUrl, item.resume_filename)
                : null,
            fromMode2: true,
            fromBidder: true
        },
        selectedProfileId: item.profile_id || settings.selectedProfileId
    });

    await logCourseEvent(item.id, 'opened', {
        url: applyUrl,
        fromQueue,
        stayInApp: true,
        ashbyApplication: applyUrl !== item.open_url,
        bgWindow: true
    });

    // Always open apply pages in a separate unfocused window so the Job Links
    // tab never redirects. Live monitor stays visible in the app window.
    let bgWin = await getOrCreateBidderBgWindow();
    let tab;
    if (bgWin?.id) {
        tab = await chrome.tabs.create({
            windowId: bgWin.id,
            url: applyUrl,
            active: false
        });
        try { await chrome.windows.update(bgWin.id, { focused: false }); } catch (_) { /* ignore */ }
    } else {
        bgWin = await chrome.windows.create({
            url: applyUrl,
            focused: false,
            type: 'normal',
            width: 1100,
            height: 800,
            left: 80,
            top: 80
        });
        tab = bgWin.tabs?.[0];
        try {
            await chrome.storage.session.set({ bidderBgWindowId: bgWin.id });
        } catch (_) { /* ignore */ }
    }
    // Do not yank Job Links (or any other window) to the front — user may be in Gmail/etc.
    try { await chrome.windows.update(bgWin.id, { focused: false }); } catch (_) { /* ignore */ }

    await notify(
        'Apply page opened',
        'Bidder — background window. You can keep using other tabs; watch Live monitor.'
    );
    return { ok: true, tabId: tab.id, url: applyUrl, windowId: bgWin.id };
}

/**
 * Process ready queue until daily cap / empty / stop.
 * Max 3 tabs, 15s between opens. CAPTCHA/login: focus tab, pause queue
 * (default) until you solve it, then resume fill — no auto-bypass.
 */
async function processReadyQueue(opts = {}) {
    const jobLinkIds = Array.isArray(opts.jobLinkIds)
        ? opts.jobLinkIds.map((id) => parseInt(id, 10)).filter((n) => Number.isInteger(n) && n > 0)
        : [];
    const applicationIds = Array.isArray(opts.applicationIds)
        ? opts.applicationIds.map((id) => parseInt(id, 10)).filter((n) => Number.isInteger(n) && n > 0)
        : [];

    const gotLock = await acquireQueueLock();
    if (!gotLock) {
        throw new Error(
            'Queue already in progress — use Live monitor (Resume / Next / Stop). Do not click Process again.'
        );
    }

    // Always start Process clean — a stuck Autofill lock or prior Stop must not block bidding.
    await clearFillLock();
    // Cancel any leftover Mode-2 pendingFill so tab-complete cannot race Process fill.
    try {
        await saveSettings({ pendingFill: null });
    } catch (_) { /* ignore */ }

    // Resume any parked CV regenerations (cap 5) while Process runs.
    processPendingCvRegenQueue().catch(() => {});

    // MV3: early sendResponse (queued≥1) can let Chrome sleep the SW mid-queue.
    // Ping storage periodically so Process keeps running through Greenhouse fill.
    const keepAlive = setInterval(() => {
        try {
            chrome.storage.local.get(['bidderQueueState']).catch(() => {});
        } catch (_) { /* ignore */ }
    }, 4000);

    let lockReleasedEarly = false;

    let prefs = await getBidderPrefs();
    if (
        opts.uploadCoverLetter != null
        || opts.stayInApp != null
        || opts.unattended != null
        || opts.captchaGraceSec != null
        || opts.humanAssistWaitSec != null
        || opts.autoSubmit != null
        || opts.autoNext != null
        || opts.captchaHelper != null
        || opts.capsolverApiKey != null
        || opts.twocaptchaApiKey != null
        || opts.disabledFillLessons != null
        || opts.formWaitMs != null
        || opts.openGapMs != null
        || opts.screenshotSettleSec != null
        || opts.maxTabs != null
    ) {
        const patch = {};
        if (opts.uploadCoverLetter != null) patch.bidderUploadCoverLetter = !!opts.uploadCoverLetter;
        if (opts.stayInApp != null) patch.bidderStayInApp = !!opts.stayInApp;
        if (opts.unattended != null) patch.bidderUnattended = !!opts.unattended;
        if (opts.autoSubmit != null) patch.bidderAutoSubmit = !!opts.autoSubmit;
        if (opts.autoNext != null) patch.bidderAutoNext = !!opts.autoNext;
        if (opts.captchaHelper != null) patch.bidderCaptchaHelper = !!opts.captchaHelper;
        if (opts.humanAssistWaitSec != null && Number(opts.humanAssistWaitSec) >= 0) {
            const sec = Math.min(600, Math.round(Number(opts.humanAssistWaitSec)));
            patch.bidderHumanAssistWaitSec = sec;
            patch.bidderCaptchaHelperWaitSec = sec;
            patch.bidderCaptchaGraceSec = sec;
        }
        if (opts.captchaHelperWaitSec != null && Number(opts.captchaHelperWaitSec) >= 0) {
            patch.bidderCaptchaHelperWaitSec = Number(opts.captchaHelperWaitSec);
        }
        if (opts.captchaGraceSec != null && Number(opts.captchaGraceSec) >= 0) {
            patch.bidderCaptchaGraceSec = Number(opts.captchaGraceSec);
        }
        if (opts.formWaitMs != null && Number(opts.formWaitMs) >= 3000) {
            patch.bidderFormWaitMs = Math.min(45000, Math.round(Number(opts.formWaitMs)));
        }
        if (opts.openGapMs != null && Number(opts.openGapMs) >= 0) {
            patch.bidderOpenGapMs = Math.min(10000, Math.round(Number(opts.openGapMs)));
        }
        if (opts.screenshotSettleSec != null && Number(opts.screenshotSettleSec) >= 0) {
            patch.bidderScreenshotSettleSec = Math.min(8, Math.round(Number(opts.screenshotSettleSec)));
        }
        if (opts.maxTabs != null && Number(opts.maxTabs) >= 1) {
            patch.bidderMaxTabs = Math.min(5, Math.round(Number(opts.maxTabs)));
        }
        if (opts.capsolverApiKey != null) {
            patch.bidderCapsolverApiKey = String(opts.capsolverApiKey || '').trim();
        }
        if (opts.twocaptchaApiKey != null) {
            patch.bidderTwocaptchaApiKey = String(opts.twocaptchaApiKey || '').trim();
        }
        if (opts.disabledFillLessons != null && typeof opts.disabledFillLessons === 'object') {
            patch.bidderDisabledFillLessons = opts.disabledFillLessons;
        }
        await saveBidderPrefs(patch);
        Object.assign(prefs, {
            uploadCoverLetter: patch.bidderUploadCoverLetter ?? prefs.uploadCoverLetter,
            stayInApp: true,
            unattended: patch.bidderUnattended ?? prefs.unattended,
            // Explicit boolean — never leave stale true when Process says false.
            autoSubmit: patch.bidderAutoSubmit !== undefined
                ? !!patch.bidderAutoSubmit
                : prefs.autoSubmit,
            autoNext: patch.bidderAutoNext ?? prefs.autoNext,
            captchaHelper: patch.bidderCaptchaHelper ?? prefs.captchaHelper,
            humanAssistWaitMs: patch.bidderHumanAssistWaitSec != null
                ? Math.round(Number(patch.bidderHumanAssistWaitSec) * 1000)
                : (patch.bidderCaptchaHelperWaitSec != null
                    ? Math.round(Number(patch.bidderCaptchaHelperWaitSec) * 1000)
                    : prefs.humanAssistWaitMs),
            captchaGraceMs: patch.bidderCaptchaGraceSec != null
                ? Math.round(Number(patch.bidderCaptchaGraceSec) * 1000)
                : prefs.captchaGraceMs,
            captchaHelperWaitMs: patch.bidderCaptchaHelperWaitSec != null
                ? Math.round(Number(patch.bidderCaptchaHelperWaitSec) * 1000)
                : prefs.captchaHelperWaitMs,
            capsolverApiKey: patch.bidderCapsolverApiKey != null
                ? patch.bidderCapsolverApiKey
                : prefs.capsolverApiKey,
            twocaptchaApiKey: patch.bidderTwocaptchaApiKey != null
                ? patch.bidderTwocaptchaApiKey
                : prefs.twocaptchaApiKey,
            disabledFillLessons: patch.bidderDisabledFillLessons != null
                ? patch.bidderDisabledFillLessons
                : prefs.disabledFillLessons
        });
        if (prefs.humanAssistWaitMs != null) {
            prefs.captchaGraceMs = prefs.humanAssistWaitMs;
            prefs.captchaHelperWaitMs = prefs.humanAssistWaitMs;
        }
    }
    // Stay on Job Links for Live monitor. Hands-free (unattended) must NOT force captchaFocus —
    // that path waits for helpers / CapSolver and continues the queue without you.
    prefs.stayInApp = true;
    if (prefs.unattended) {
        prefs.captchaFocus = false;
    } else {
        prefs.captchaFocus = prefs.captchaFocus !== false;
    }
    const settings = await getSettings();
    if (!settings.token) {
        clearInterval(keepAlive);
        await releaseQueueLock();
        throw new Error('Log in first (Job Links page session will sync into Lumi on Process)');
    }
    if (!settings.selectedProfileId && !jobLinkIds.length && !applicationIds.length) {
        clearInterval(keepAlive);
        await releaseQueueLock();
        throw new Error('Choose a bid profile in the popup');
    }

    try {
        await setQueueState({
            running: true,
            status: 'loading',
            error: null,
            jobLinkIds,
            applicationIds,
            stopRequested: false,
            pauseRequested: false,
            nextClicked: false,
            queueStartedAt: Date.now()
        });
        let items = [];
        try {
            const data = await listBidderReady(
                200,
                // When the user picks Job Links in the UI, bid those ready CVs
                // even if Lumi's popup profile differs (fill uses each app's profile).
                jobLinkIds.length || applicationIds.length ? null : settings.selectedProfileId,
                jobLinkIds.length ? jobLinkIds : null,
                Array.isArray(opts.remembered) ? opts.remembered : null
            );
            items = data?.items || [];
            if (applicationIds.length) {
                const allow = new Set(applicationIds);
                const scoped = items.filter((it) => allow.has(Number(it.id)));
                if (scoped.length) items = scoped;
                else if (!jobLinkIds.length) {
                    items = [];
                }
            }
            if (jobLinkIds.length && settings.selectedProfileId && items.length > 1) {
                const preferred = items.filter(
                    (it) => Number(it.profile_id) === Number(settings.selectedProfileId)
                );
                if (preferred.length) items = preferred;
            }
        } catch (err) {
            if (err.status === 401 || err.authExpired) {
                await notify('Lumi', 'Session expired — log in again');
                await setQueueState({ running: false, status: 'auth', error: 'login_required' });
                throw new Error('Session expired — pause and log in on Job Links, then Process again');
            }
            throw err;
        }

        if (!items.length) {
            const msg = jobLinkIds.length || applicationIds.length
                ? `No ready CVs for the selected Job Link(s) under this login. Use the same account in Lumi as Job Links (or click Process again so the page session syncs).`
                : `No ready applications for Lumi profile #${settings.selectedProfileId}`;
            await notify('Bidder', msg);
            await setQueueState({ running: false, status: 'empty' });
            return { ok: false, processed: 0, queued: 0, error: msg, filtered: jobLinkIds.length > 0 };
        }

        // Signal caller that the queue is real (not empty) before long work.
        if (typeof opts.onReady === 'function') {
            try {
                opts.onReady({ ok: true, started: true, queued: items.length, jobLinkIds });
            } catch (_) { /* ignore */ }
        }

        const names = items
            .slice(0, 3)
            .map((it) => it.company_name || it.job_role || `#${it.id}`)
            .join(', ');
        await notify(
            'Bidder',
            `Starting ${items.length} job(s)${names ? `: ${names}` : ''}${items.length > 3 ? '…' : ''}`
        );

        await setQueueState({
            running: true,
            status: 'running',
            total: items.length,
            index: 0,
            openTabIds: [],
            queueStartedAt: Date.now()
        });

        let processed = 0;
        let skippedAts = 0; // legacy counter (LinkedIn-only skips logged as blocked_ats during fill)
        let lastOpenAt = 0;
        const expiredJobLinkIds = new Set();
        const openTabs = new Map(); // tabId -> item
        // Greenhouse email OTP: keep these tabs open after queue (never leftover-close).
        const holdEmailOtpTabs = new Map(); // tabId -> { id, company_name, ... }
        // Manual review (auto-submit off): keep apply tab open so user can check / submit.
        const manualReviewTabs = new Map(); // tabId -> item

        for (let i = 0; i < items.length; i++) {
            const pauseGate = await waitWhileBidderPaused();
            if (pauseGate.stopped) break;
            const state = await getQueueState();
            if (state?.stopRequested) break;

            // Soft wait until under max tabs
            const maxTabs = Math.max(1, Math.min(5, Number(prefs.maxTabs) || BIDDER_DEFAULTS.maxTabs));
            while (openTabs.size >= maxTabs) {
                await new Promise((r) => setTimeout(r, 1000));
                // Drop closed tabs
                for (const tid of [...openTabs.keys()]) {
                    try {
                        await chrome.tabs.get(tid);
                    } catch {
                        openTabs.delete(tid);
                    }
                }
                const st2 = await getQueueState();
                if (st2?.stopRequested) break;
                if (st2?.pauseRequested) {
                    const pg = await waitWhileBidderPaused();
                    if (pg.stopped) break;
                }
            }

            const openGap = Number(prefs.openGapMs);
            const gapMs = Number.isFinite(openGap) && openGap >= 0
                ? openGap
                : BIDDER_DEFAULTS.openGapMs;
            const gap = gapMs - (Date.now() - lastOpenAt);
            if (lastOpenAt && gap > 0) {
                await new Promise((r) => setTimeout(r, gap));
            }

            const item = items[i];
            if (item.job_link_id && expiredJobLinkIds.has(Number(item.job_link_id))) {
                await logCourseEvent(item.id, 'job_expired', {
                    job_link_id: item.job_link_id,
                    reason: 'same_job_link'
                }).catch(() => {});
                continue;
            }
            const applyUrl = item.open_url || item.job_url || '';
            const itemAts = resolveBidderAts({
                applyUrl,
                tabUrl: applyUrl,
                formAts: item.ats || item.ats_name || 'generic'
            });
            await setQueueState({
                index: i + 1,
                currentId: item.id,
                currentJobUrl: applyUrl || null,
                currentTabId: null,
                jobStartedAt: Date.now()
            });
            await setAppRunState(item.id, 'opening', {
                url: applyUrl || null,
                eventType: 'run_opening'
            }).catch(() => {});

            // Always create/update a bid course so failures are visible in the UI.
            await logCourseEvent(item.id, 'queue_started', {
                job_link_id: item.job_link_id || null,
                company: item.company_name || null,
                url: applyUrl || null,
                ats: itemAts
            });

            let opened = null;
            try {
                opened = await openReadyApplication(item, { fromQueue: true });
            } catch (err) {
                await logCourseEvent(item.id, 'open_failed', { error: err?.message });
                await notify('Bidder', `Skip open: ${err?.message || err}`);
                continue;
            }
            lastOpenAt = Date.now();
            openTabs.set(opened.tabId, item);
            await setQueueState({
                currentTabId: opened.tabId,
                currentJobUrl: applyUrl || opened.url || null,
                captchaTabMissing: false,
                ownedTabAlive: true,
                tabsByAppId: {
                    ...((await getQueueState().catch(() => null))?.tabsByAppId || {}),
                    [String(item.id)]: opened.tabId
                }
            });
            await setAppRunState(item.id, 'gating', {
                tabId: opened.tabId,
                url: applyUrl || opened.url || null,
                eventType: 'run_gating'
            }).catch(() => {});
            // First live frame ASAP so Control is not stuck on "Waiting for live frames…"
            void uploadScreenshot(item.id, 'opened', opened.tabId, { settleMs: 0, stayInApp: true })
                .catch(() => {});

            try {
            let siteSuccess = false;
            const closedAtOpen = await probeJobClosed(opened.tabId);
            if (closedAtOpen?.closed) {
                if (item.job_link_id) expiredJobLinkIds.add(Number(item.job_link_id));
                await finishExpiredJob({
                    item,
                    tabId: opened.tabId,
                    openTabs,
                    probe: closedAtOpen,
                    url: applyUrl || opened.url || null
                });
                continue;
            }

            // Wait for form. Prefer clicking Apply — never CAPTCHA-pause while Apply is still on the page.
            let formOk = false;
            let captchaHandoff = false;
            let applyClickedOnce = false;
            let lastApplyMeta = null;
            let profileEmail = String(
                item.email || item.profile_email || item.candidate_email || ''
            ).trim();
            if (!profileEmail) {
                try {
                    const packed = await getBidderApplication(item.id);
                    profileEmail = String(
                        packed?.profile?.email
                        || packed?.email
                        || packed?.application?.email
                        || ''
                    ).trim();
                } catch (_) { /* ignore */ }
            }
            // Apply-gate wait — start fill as soon as the form paints (do not sit 20–45s).
            const formWaitMs = Math.min(
                Math.max(
                    formWaitMsForAts(itemAts, Number(prefs.formWaitMs) || 8000),
                    4000
                ),
                10000
            );
            const formDeadline = Date.now() + formWaitMs;
            const bidLimitMs = bidLimitMsForAts(itemAts, { pageCount: 0 });
            const bidDeadline = Date.now() + bidLimitMs;
            await setWorkProgress({
                kind: 'queue',
                phase: 'form_wait',
                label: `Waiting for form (${Math.round(formWaitMs / 1000)}s max)…`,
                company: item.company_name || '',
                applicationId: item.id,
                startedAt: Date.now()
            }).catch(() => {});
            let lastGateShotAt = 0;
            while (Date.now() < formDeadline) {
                try {
                    await ensureScripts(opened.tabId);
                    // Keep Live monitor updating during the gate wait (was stuck on “Waiting…”).
                    if (Date.now() - lastGateShotAt > 1200) {
                        lastGateShotAt = Date.now();
                        void uploadScreenshot(item.id, 'live', opened.tabId, {
                            settleMs: 0,
                            stayInApp: true
                        }).catch(() => {});
                    }
                    const revealedEarly = await ensureApplyFormVisible(opened.tabId, {
                        profileEmail,
                        applicationId: item.id
                    });
                    if (revealedEarly?.tabId && revealedEarly.tabId !== opened.tabId) {
                        openTabs.delete(opened.tabId);
                        opened.tabId = revealedEarly.tabId;
                        openTabs.set(opened.tabId, item);
                        await setQueueState({
                            currentTabId: opened.tabId,
                            currentJobUrl: revealedEarly.href || opened.url || null
                        }).catch(() => {});
                    }
                    if (revealedEarly?.clicked || revealedEarly?.applyFound) {
                        applyClickedOnce = applyClickedOnce || !!revealedEarly.clicked;
                        lastApplyMeta = revealedEarly;
                    }
                    const closedMidWait = await probeJobClosed(opened.tabId);
                    if (closedMidWait?.closed) {
                        if (item.job_link_id) expiredJobLinkIds.add(Number(item.job_link_id));
                        await finishExpiredJob({
                            item,
                            tabId: opened.tabId,
                            openTabs,
                            probe: closedMidWait,
                            url: applyUrl || opened.url || null
                        });
                        formOk = false;
                        opened.expired = true;
                        break;
                    }
                    const detect = await chrome.tabs.sendMessage(opened.tabId, { type: 'DETECT_APPLY_FORM' });
                    if (detect?.ok && detect.data?.ok) {
                        formOk = true;
                        // Learn: this Apply label/selector got us a form on this host.
                        if (lastApplyMeta?.applyLabel || lastApplyMeta?.applySelector) {
                            try {
                                const tab = await chrome.tabs.get(opened.tabId);
                                const h = new URL(tab.url || '').hostname;
                                await saveApplyLesson({
                                    host: h,
                                    label: lastApplyMeta.applyLabel,
                                    selector: lastApplyMeta.applySelector,
                                    href: tab.url,
                                    outcome: 'form_ok'
                                });
                                await logCourseEvent(item.id, 'apply_lesson_saved', {
                                    label: lastApplyMeta.applyLabel,
                                    selector: lastApplyMeta.applySelector
                                }).catch(() => {});
                            } catch (_) { /* ignore */ }
                        }
                        break;
                    }
                    // JD / careers pages: Apply is the only action. Do not treat as CAPTCHA/login.
                    if (revealedEarly?.applyFound || revealedEarly?.clicked) {
                        await new Promise((r) => setTimeout(r, 1000));
                        continue;
                    }
                    const wall = await detectCaptchaOrLogin(opened.tabId);
                    let formReadyNow = false;
                    try {
                        const dForm = await chrome.tabs.sendMessage(opened.tabId, { type: 'DETECT_APPLY_FORM' });
                        formReadyNow = !!(dForm?.ok && dForm?.data?.ok);
                    } catch (_) { /* loading */ }
                    if (formReadyNow && !wall?.login
                        && !isBlockingCaptchaWall(wall, { formReady: true })) {
                        formOk = true;
                        break;
                    }
                    if ((wall.captcha || wall.login) && isBlockingCaptchaWall(wall, { formReady: formReadyNow })) {
                        captchaHandoff = true;
                        const wait = await runCaptchaPassEngine({
                            tabId: opened.tabId,
                            applicationId: item.id,
                            prefs,
                            wall,
                            phase: 'open',
                            companyLabel: item.company_name || 'Job'
                        });
                        if (wait.stopped) break;
                        if (wait.tabClosed || wait.timeout || wait.skippedWait || wait.abandoned || !wait.cleared) {
                            if ((wait.tabClosed || wait.timeout) && !wait.abandoned) {
                                await logCourseEvent(item.id, 'captcha_abandoned', wait);
                            }
                            if (!wait.abandoned && prefs.unattended) {
                                try { await chrome.tabs.remove(opened.tabId); } catch (_) { /* ignore */ }
                            }
                            openTabs.delete(opened.tabId);
                            formOk = false;
                            break;
                        }
                        formOk = await recheckFormAfterCaptcha(opened.tabId);
                        captchaHandoff = false;
                        break;
                    }
                } catch (_) { /* loading */ }
                await new Promise((r) => setTimeout(r, 400));
            }

            if (opened.expired) continue;

            // Unattended / user may have closed the apply tab — try URL rebind before skip.
            {
                let alive = await chrome.tabs.get(opened.tabId).catch(() => null);
                if (!alive) {
                    const rebound = await findLiveApplyTabForUrl(applyUrl || opened.url || '');
                    if (rebound?.id) {
                        openTabs.delete(opened.tabId);
                        opened.tabId = rebound.id;
                        openTabs.set(opened.tabId, item);
                        alive = rebound;
                        await setQueueState({
                            currentTabId: opened.tabId,
                            captchaTabMissing: false,
                            ownedTabAlive: true,
                            tabsByAppId: {
                                ...((await getQueueState().catch(() => null))?.tabsByAppId || {}),
                                [String(item.id)]: opened.tabId
                            }
                        }).catch(() => {});
                        await logCourseEvent(item.id, 'tab_rebound', {
                            phase: 'form_wait',
                            tabId: opened.tabId,
                            url: rebound.url || applyUrl || null
                        }).catch(() => {});
                        void uploadScreenshot(item.id, 'live', opened.tabId, {
                            settleMs: 0,
                            stayInApp: true
                        }).catch(() => {});
                    }
                }
                if (!alive) {
                    openTabs.delete(opened.tabId);
                    await logCourseEvent(item.id, 'tab_closed', {
                        phase: 'form_wait',
                        reason: 'tab_missing_during_gating'
                    }).catch(() => {});
                    await setAppRunState(item.id, 'incomplete', {
                        eventType: 'tab_closed',
                        url: applyUrl || null
                    }).catch(() => {});
                    await notify('Bidder', 'Apply tab closed during gating — Open tab, then Re-fill');
                    continue;
                }
            }

            if (!formOk) {
                // Last try: click Apply once more before deciding CAPTCHA / no-form
                const lastReveal = await ensureApplyFormVisible(opened.tabId, {
                    profileEmail,
                    applicationId: item.id
                }).catch(() => null);
                if (lastReveal?.tabId && lastReveal.tabId !== opened.tabId) {
                    openTabs.delete(opened.tabId);
                    opened.tabId = lastReveal.tabId;
                    openTabs.set(opened.tabId, item);
                }
                if (lastReveal?.clicked || lastReveal?.applyFound) {
                    formOk = await recheckFormAfterCaptcha(opened.tabId, Math.min(18000, formWaitMs));
                    if (formOk && (lastReveal.applyLabel || lastReveal.applySelector)) {
                        try {
                            const tab = await chrome.tabs.get(opened.tabId);
                            await saveApplyLesson({
                                host: new URL(tab.url || '').hostname,
                                label: lastReveal.applyLabel,
                                selector: lastReveal.applySelector,
                                href: tab.url,
                                outcome: 'form_ok'
                            });
                        } catch (_) { /* ignore */ }
                    }
                }
            }

            if (!formOk) {
                const late = await chrome.tabs.sendMessage(opened.tabId, { type: 'DETECT_APPLY_FORM' }).catch(() => null);
                let href = '';
                try { href = (await chrome.tabs.get(opened.tabId))?.url || ''; } catch (_) { /* ignore */ }
                const onAts = /greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs\.com|smartrecruiters\.com/i.test(href);
                if (late?.data?.ok || Number(late?.data?.count || 0) >= 1 || onAts) {
                    formOk = true;
                    await logCourseEvent(item.id, 'form_detected', {
                        late: true,
                        count: late?.data?.count || 0,
                        atsUrl: onAts
                    }).catch(() => {});
                }
            }

            if (!formOk) {
                const wall = await detectCaptchaOrLogin(opened.tabId).catch(() => ({}));
                // Still on a JD with Apply — keep tab open for Open/Resume; do not hard-fail as "can't do that".
                const stillApply = await ensureApplyFormVisible(opened.tabId, {
                    profileEmail,
                    applicationId: item.id
                }).catch(() => null);
                if (stillApply?.applyFound || applyClickedOnce) {
                    const waitMs = Math.max(
                        0,
                        Number(prefs.humanAssistWaitMs ?? prefs.captchaGraceMs ?? BIDDER_DEFAULTS.humanAssistWaitMs) || 0
                    );
                    const waitSec = Math.round(waitMs / 1000);
                    await logCourseEvent(item.id, 'needs_manual', {
                        reason: 'apply_gate',
                        applyClickedOnce,
                        applyLabel: stillApply?.applyLabel || lastApplyMeta?.applyLabel || null,
                        humanAssistWaitMs: waitMs,
                        detail: 'Apply visible or clicked but form not ready — Open tab and click Apply / create account, then Resume'
                    });
                    await uploadScreenshot(item.id, 'live', opened.tabId, {
                        settleMs: 200,
                        stayInApp: true
                    }).catch(() => {});
                    await setQueueState({
                        status: 'awaiting_captcha',
                        captchaTabId: opened.tabId,
                        captchaApplicationId: item.id,
                        captchaJobUrl: stillApply?.href || null,
                        captchaSince: Date.now(),
                        captchaAbandonRequested: false,
                        captchaResolved: false,
                        lastStatusEvent: 'needs_manual',
                        lastStatusAt: Date.now(),
                        lastStatusMeta: { reason: 'apply_gate' }
                    }).catch(() => {});
                    await notify(
                        'Bidder — needs help',
                        waitSec > 0
                            ? `Apply gate — finish Apply / account, then Resume (~${waitSec}s or skip) (${item.company_name || item.id})`
                            : `Apply gate — skipping (${item.company_name || item.id})`
                    );
                    await playBidderSound(prefs.soundEnabled);
                    if (waitMs <= 0) {
                        await logCourseEvent(item.id, 'captcha_abandoned', {
                            reason: 'apply_gate',
                            skippedWait: true
                        }).catch(() => {});
                        try { await chrome.tabs.remove(opened.tabId); } catch (_) { /* ignore */ }
                        openTabs.delete(opened.tabId);
                        await setQueueState({
                            status: 'running',
                            captchaTabId: null,
                            captchaApplicationId: null,
                            captchaKind: null
                        }).catch(() => {});
                        continue;
                    }
                    const wait = await waitForCaptchaOrLoginCleared(opened.tabId, {
                        applicationId: item.id,
                        timeoutMs: waitMs
                    }).catch(() => ({ cleared: false, timeout: true }));
                    if (wait?.cleared) {
                        await setQueueState({
                            status: 'running',
                            captchaTabId: null,
                            captchaApplicationId: null,
                            captchaKind: null
                        }).catch(() => {});
                        // Fall through — form may now be ready; re-detect on next loop iteration is hard.
                        // Re-check form once; if still missing, skip.
                        const formAfter = await ensureApplyFormVisible(opened.tabId, {
                            profileEmail,
                            applicationId: item.id
                        }).catch(() => null);
                        if (formAfter?.formReady || formAfter?.ok) {
                            // continue fill path by not continuing — need formOk true.
                            // Simplest: mark and re-process via continue with retry is complex.
                            // Leave tab and skip to next if still no form fields.
                        }
                        const wallClear = await detectCaptchaOrLogin(opened.tabId).catch(() => ({}));
                        if (!wallClear?.login && formAfter) {
                            // Try one more form detect
                            const detect = await sendTabMessage(opened.tabId, { type: 'DETECT_APPLY_FORM' }).catch(() => null);
                            if (detect?.ok && detect?.data?.ok) {
                                formOk = true;
                            }
                        }
                        if (!formOk) {
                            await logCourseEvent(item.id, 'captcha_abandoned', {
                                reason: 'apply_gate_resume_no_form',
                                via: wait?.via || 'manual_resume'
                            }).catch(() => {});
                            await notify('Bidder — skipped', `Apply gate still incomplete — skip ${item.company_name || item.id}`);
                            try { await chrome.tabs.remove(opened.tabId); } catch (_) { /* ignore */ }
                            openTabs.delete(opened.tabId);
                            continue;
                        }
                    } else {
                        await logCourseEvent(item.id, 'captcha_abandoned', {
                            reason: 'apply_gate',
                            timeout: !!wait?.timeout,
                            abandoned: !!wait?.abandoned,
                            via: wait?.via || 'timeout'
                        }).catch(() => {});
                        await notify(
                            'Bidder — skipped',
                            `No response on Apply gate — skip ${item.company_name || item.id}`
                        );
                        try { await chrome.tabs.remove(opened.tabId); } catch (_) { /* ignore */ }
                        openTabs.delete(opened.tabId);
                        await setQueueState({
                            status: 'running',
                            captchaTabId: null,
                            captchaApplicationId: null,
                            captchaKind: null
                        }).catch(() => {});
                        continue;
                    }
                }
                if (!formOk && (isBlockingCaptchaWall(wall, { formReady: false }) || captchaHandoff)) {
                    // Attended: leave tab open for human. Unattended: tab already closed.
                    if (!prefs.unattended) {
                        // Tab left open for human; do not close
                    } else {
                        try { await chrome.tabs.remove(opened.tabId); } catch (_) { /* ignore */ }
                        openTabs.delete(opened.tabId);
                    }
                    continue;
                }
                if (!formOk) {
                    // Last chance: scripts may have been late — collect once more before giving up.
                    await ensureScripts(opened.tabId).catch(() => {});
                    const lateReady = await waitForFormReady(opened.tabId, {
                        minFields: 2,
                        requireIdentity: false,
                        profileFill: false,
                        stableReads: 1,
                        pollMs: 200,
                        maxMs: 4000
                    }).catch(() => null);
                    if (lateReady?.ok && Number(lateReady.fieldCount || 0) >= 2) {
                        formOk = true;
                        await logCourseEvent(item.id, 'form_detected_late', {
                            fieldCount: lateReady.fieldCount || 0,
                            waitedMs: lateReady.waitedMs || 0
                        }).catch(() => {});
                    }
                }
                if (!formOk) {
                    await logCourseEvent(item.id, 'no_form', {
                        waitMs: formWaitMs,
                        tabId: opened.tabId
                    });
                    await notify(
                        'Bidder',
                        `No form in ${Math.round(formWaitMs / 1000)}s — tab kept · Open + Re-fill`
                    );
                    await uploadScreenshot(item.id, 'no_form', opened.tabId, {
                        settleMs: 0,
                        stayInApp: true
                    }).catch(() => {});
                    // Never leftover-close here — that left users with an empty reopened tab + 0 processed.
                    if (prefs.unattended) {
                        try { await chrome.tabs.remove(opened.tabId); } catch (_) { /* ignore */ }
                        openTabs.delete(opened.tabId);
                    } else if (opened?.tabId) {
                        manualReviewTabs.set(opened.tabId, item);
                        openTabs.delete(opened.tabId);
                        await focusBidderTabForReview(opened.tabId).catch(() => {});
                        await setAppRunState(item.id, 'incomplete', {
                            tabId: opened.tabId,
                            eventType: 'no_form',
                            url: applyUrl || opened.url || null
                        }).catch(() => {});
                        await setQueueState({
                            status: 'awaiting_manual_submit',
                            captchaTabId: opened.tabId,
                            captchaApplicationId: item.id,
                            captchaKind: 'manual_review',
                            ownedTabAlive: true,
                            coachStatus: 'Form not detected — Open tab, wait for fields, then Re-fill',
                            coachAt: Date.now()
                        }).catch(() => {});
                    }
                    continue;
                }
            }

            // Greenhouse JD sits above the form — click Apply + scroll before capture/fill.
            const revealed = await ensureApplyFormVisible(opened.tabId);
            await logCourseEvent(item.id, 'form_revealed', revealed);
            await refocusStayInAppHome();

            // Form already passed DETECT in the gate loop — only a short stability check
            // before fill (was a second full 8s wait that delayed typing).
            await ensureApplyFormVisible(opened.tabId);
            const ready = await waitForFormReady(opened.tabId, {
                minFields: 2,
                requireIdentity: false,
                profileFill: false,
                stableReads: 1,
                pollMs: 80,
                maxMs: 1500
            });
            void uploadScreenshot(item.id, 'opened', opened.tabId, { settleMs: 0, stayInApp: true })
                .catch(() => {});
            await logCourseEvent(item.id, 'form_detected', {
                revealed,
                fieldCount: ready.fieldCount || 0,
                ready: !!ready.ok,
                reason: ready.reason || null,
                waitedMs: ready.waitedMs || 0
            });

            await setAppRunState(item.id, 'filling', {
                tabId: opened.tabId,
                url: applyUrl || opened.url || null,
                eventType: 'run_filling'
            }).catch(() => {});
            await setWorkProgress({
                kind: 'queue',
                phase: 'filling',
                label: `Filling ${item.company_name || 'application'}…`,
                applicationId: item.id,
                company: item.company_name || ''
            }).catch(() => {});

            // Clear per-job lesson stash from prior item.
            if (prefs.earlyFillLessons || prefs.earlyFillLessonMeta) {
                prefs = { ...prefs, earlyFillLessons: undefined, earlyFillLessonMeta: undefined };
            }

            // Early lesson replay for this host (before first fill attempt).
            try {
                let host = '';
                try {
                    const tab = await chrome.tabs.get(opened.tabId);
                    host = new URL(tab.url || applyUrl || '').hostname.replace(/^www\./i, '');
                } catch (_) {
                    try { host = new URL(applyUrl || '').hostname.replace(/^www\./i, ''); } catch (_) { /* ignore */ }
                }
                if (host) {
                    let disabledMap = {};
                    try {
                        const prefs = await getBidderPrefs();
                        disabledMap = prefs?.disabledFillLessons && typeof prefs.disabledFillLessons === 'object'
                            ? prefs.disabledFillLessons
                            : {};
                    } catch (_) {
                        disabledMap = {};
                    }
                    const local = await fillLessonsForHost(host);
                    let remote = [];
                    try {
                        const pack = await listBidderFillLessons({ host });
                        remote = Array.isArray(pack?.lessons) ? pack.lessons : [];
                    } catch (_) { /* ignore */ }
                    const merged = [...local, ...remote].filter((les) => {
                        const key = `${host}|${les.fieldKey || les.field_key || 'form'}|${les.issueKey || les.issue_key || ''}`;
                        return !disabledMap[key];
                    });
                    if (merged.length) {
                        const lesson = matchFillLesson(merged, {}) || merged[0];
                        const fills = Array.isArray(lesson?.actions?.fills) ? lesson.actions.fills : [];
                        if (fills.length) {
                            await setQueueState({
                                coachStatus: `Lesson ready — ${lesson.fieldKey || lesson.field_key || 'form'} @ ${host}`,
                                coachAt: Date.now()
                            }).catch(() => {});
                            await logCourseEvent(item.id, 'fill_lesson_queued', {
                                host,
                                fieldKey: lesson.fieldKey || lesson.field_key,
                                fill_count: fills.length,
                                phase: 'before_fill'
                            }).catch(() => {});
                            prefs = {
                                ...prefs,
                                earlyFillLessons: fills,
                                earlyFillLessonMeta: {
                                    host,
                                    fieldKey: lesson.fieldKey || lesson.field_key,
                                    issueKey: lesson.issueKey || lesson.issue_key
                                }
                            };
                        }
                    }
                }
            } catch (lessonEarlyErr) {
                console.warn('[bidder] early lesson load failed', lessonEarlyErr?.message || lessonEarlyErr);
            }

            // Full fill — at most 2 attempts, and only retry tab/script disconnects.
            // Re-running the whole fill 4× was why one bid could exceed 10 minutes.
            let fillStats = null;
            let fillErr = null;
            let submitted = false;
            for (let attempt = 0; attempt < 2; attempt++) {
                if (Date.now() > bidDeadline) {
                    fillErr = new Error('bid_time_budget_exceeded');
                    await logCourseEvent(item.id, 'bid_budget_exceeded', {
                        attempt,
                        limitMs: bidLimitMs
                    });
                    break;
                }
                const midWall = await detectCaptchaOrLogin(opened.tabId);
                // Form already detected — ignore passive reCAPTCHA widgets; only block real walls.
                if (isBlockingCaptchaWall(midWall, { formReady: true })) {
                    await setAppRunState(item.id, 'paused_captcha', {
                        tabId: opened.tabId,
                        captcha: true,
                        eventType: 'run_paused_captcha'
                    }).catch(() => {});
                    const wait = await runCaptchaPassEngine({
                        tabId: opened.tabId,
                        applicationId: item.id,
                        prefs,
                        wall: midWall,
                        phase: 'before_fill',
                        companyLabel: item.company_name || 'Job'
                    });
                    if (!wait.cleared) {
                        fillErr = new Error(
                            wait.stopped
                                ? 'stopped'
                                : wait.timeout
                                    ? 'captcha_not_cleared'
                                    : 'captcha_needs_manual'
                        );
                        break;
                    }
                    await setAppRunState(item.id, 'filling', {
                        tabId: opened.tabId,
                        captcha: false,
                        eventType: 'run_filling'
                    }).catch(() => {});
                }
                try {
                    await ensureApplyFormVisible(opened.tabId);
                    await ensureScripts(opened.tabId);
                    fillStats = await runBidderFillOnTab(opened.tabId, item, {
                        ...prefs,
                        bidDeadline,
                        bidLimitMs
                    });
                    fillErr = null;
                    break;
                } catch (err) {
                    fillErr = err;
                    if (err.status === 401 || err.authExpired) {
                        await notify('Lumi', 'Session expired — pause and log in');
                        await setQueueState({ running: false, status: 'auth', error: 'login_required' });
                        throw err;
                    }
                    const connRace = isNoReceiverError(err);
                    await logCourseEvent(item.id, 'fill_retry', {
                        attempt,
                        error: err?.message,
                        willRetry: connRace && attempt === 0
                    });
                    // Only retry ephemeral extension disconnects — not AI/CV/logic failures.
                    if (!connRace || attempt >= 1) break;
                    await new Promise((r) => setTimeout(r, 1500));
                }
            }

            if (fillErr) {
                const errMsg = String(fillErr?.message || '');
                const parkedRegen = /cv_regen_pending/i.test(errMsg)
                    || fillErr?.code === 'cv_regen_pending';
                const isBudget = /bid_time_budget|bid_budget/i.test(errMsg)
                    || fillErr?.code === 'answers_budget_short';
                const isThin = /form_too_thin/i.test(errMsg) || fillErr?.code === 'form_too_thin';
                const isCaptcha = /captcha/i.test(errMsg);
                // bid_budget_exceeded already logged — avoid a second FAILED event.
                if (!parkedRegen && !isBudget && !isThin) {
                    await logCourseEvent(item.id, 'fill_failed', {
                        error: errMsg,
                        tabId: opened.tabId
                    });
                }
                // Capture form + screenshot BEFORE any close/park so Control keeps evidence.
                const snap = await captureFailEvidence(
                    item.id,
                    opened.tabId,
                    isThin
                        ? 'form_too_thin'
                        : (isBudget ? 'bid_time_budget' : (parkedRegen ? 'cv_regen_pending' : 'fill_failed')),
                    { phase: 'fill', error: errMsg, url: applyUrl || item.open_url || null }
                ).catch(() => null);
                await setAppRunState(item.id, parkedRegen || isBudget || isThin ? 'incomplete' : 'failed', {
                    tabId: opened.tabId,
                    missingRequired: snap?.missing || [],
                    requiredOk: snap?.requiredOk,
                    requiredTotal: snap?.requiredTotal,
                    url: snap?.url || applyUrl || item.open_url || null,
                    eventType: parkedRegen || isBudget || isThin ? 'run_incomplete' : 'run_failed'
                }).catch(() => {});
                await notify(
                    'Bidder',
                    parkedRegen
                        ? 'CV regenerating (pending) — will auto-rebid when it passes'
                        : (isThin
                            ? 'Form still mounting — tab kept for review'
                            : (isBudget
                                ? `Time limit (~${Math.round(bidLimitMs / 1000)}s) — tab kept for review`
                                : `Fill failed — tab kept for review: ${errMsg.slice(0, 80)}`))
                );
                await playBidderSound(prefs.soundEnabled);
                // Keep apply tab for CV regen / fill review — never close on regen alone.
                if (prefs.unattended && isCaptcha && !parkedRegen) {
                    await clearTabMapping({ applicationId: item.id, tabId: opened.tabId }).catch(() => {});
                    try { await chrome.tabs.remove(opened.tabId); } catch (_) { /* ignore */ }
                    openTabs.delete(opened.tabId);
                } else if (opened?.tabId) {
                    manualReviewTabs.set(opened.tabId, item);
                    openTabs.delete(opened.tabId);
                    await focusBidderTabForReview(opened.tabId).catch(() => {});
                    await setQueueState({
                        status: 'awaiting_manual_submit',
                        captchaTabId: opened.tabId,
                        captchaApplicationId: item.id,
                        captchaKind: 'manual_review',
                        ownedTabAlive: true,
                        coachStatus: isThin
                            ? 'Form still mounting — wait, then Re-fill'
                            : (isBudget
                                ? 'Time limit — review filled answers, then submit or Reject'
                                : 'Fill issue — review answers on the apply tab, then submit or Reject'),
                        coachAt: Date.now()
                    }).catch(() => {});
                }
                continue;
            }

            // Brief settle for React paint, then capture — do not force a 2s+ delay.
            const settleSec = Math.max(0, Math.min(4, Number(prefs.screenshotSettleSec) || 0));
            if (settleSec > 0) {
                await new Promise((r) => setTimeout(r, settleSec * 1000));
            }
            await ensureApplyFormVisible(opened.tabId);
            await uploadScreenshot(item.id, 'after_fill', opened.tabId, { settleMs: 0, stayInApp: true });
            fillStats = normalizeFillStats(fillStats || {});
            await setAppRunState(item.id, 'verifying', {
                tabId: opened.tabId,
                requiredOk: fillStats.requiredOk,
                requiredTotal: fillStats.requiredTotal,
                missingRequired: fillStats.missingRequired,
                eventType: 'run_verifying'
            }).catch(() => {});
            const fillIncompleteEarly = isFillIncomplete(fillStats);
            await savePackage(item.id, fillStats?.answersList || [], {
                filled: fillStats?.filled,
                company: item.company_name,
                role: item.job_role,
                incomplete: !!fillIncompleteEarly,
                requiredOk: fillStats?.requiredOk,
                requiredTotal: fillStats?.requiredTotal
            });
            await saveCapturedQuestionsPack({
                applicationId: item.id,
                company: item.company_name || '',
                jobRole: item.job_role || '',
                url: applyUrl || item.open_url || '',
                questions: fillStats?.questionsList || [],
                answers: fillStats?.answersList || []
            }).catch(() => {});

            // Submit success path — proof screenshot defaults to site thank-you / success message.
            // Never treat engine submitClicked as intentional when Auto-submit is OFF.
            submitted = !!fillStats?.submitClicked && !!prefs.autoSubmit;
            if (fillStats?.submitClicked && !prefs.autoSubmit) {
                await logCourseEvent(item.id, 'submit_suppressed', {
                    reason: 'auto_submit_off',
                    filled: fillStats?.filled || 0
                }).catch(() => {});
                fillStats = { ...(fillStats || {}), submitClicked: false };
            }
            const fillIncomplete = fillIncompleteEarly;
            if (!submitted && prefs.autoSubmit) {
                await setAppRunState(item.id, 'submitting', {
                    tabId: opened.tabId,
                    eventType: 'run_submitting'
                }).catch(() => {});
                const resumeBlocksSubmit = !!(
                    fillStats?.resumeRequired
                    && (
                        Number(fillStats?.uploadedResume || fillStats?.uploaded || 0) < 1
                        || fillStats?.resumeNameOk === false
                        || fillStats?.resumeCheck?.ok === false
                    )
                );
                // Always try Submit when auto-submit is on. Greenhouse's enabled
                // "Submit application" button is the source of truth — our collector
                // often false-flags React EE selects as empty and used to skip the click.
                // Never force-click when a required résumé is still empty or named badly.
                if (resumeBlocksSubmit) {
                    const badName = fillStats?.resumeNameOk === false
                        || /resume_name/i.test(String(fillStats?.reason || ''));
                    await logCourseEvent(item.id, 'submit_blocked_incomplete', {
                        filled: fillStats?.filled || 0,
                        requiredOk: fillStats?.requiredOk,
                        requiredTotal: fillStats?.requiredTotal,
                        missing: fillStats?.missingRequired
                            || (badName ? ['CV name'] : ['Résumé']),
                        reason: badName ? 'resume_name_invalid' : 'resume_required',
                        resumeFilename: fillStats?.resumeFilename || '',
                        incomplete: true
                    });
                    await setAppRunState(item.id, 'incomplete', {
                        tabId: opened.tabId,
                        missingRequired: fillStats.missingRequired
                            || (badName ? ['CV name'] : ['Résumé']),
                        requiredOk: fillStats.requiredOk,
                        requiredTotal: fillStats.requiredTotal,
                        eventType: 'run_incomplete'
                    }).catch(() => {});
                    await notify(
                        'Bidder',
                        badName
                            ? `CV name invalid (${fillStats?.resumeFilename || 'messy'}) — Submit blocked`
                            : 'Résumé not uploaded — Submit blocked; tab left open'
                    );
                    await playBidderSound(prefs.soundEnabled);
                } else {
                try {
                    const sub = await sendTabMessage(opened.tabId, {
                        type: 'BIDDER_ENGINE_SUBMIT',
                        force: !!fillIncomplete && !resumeBlocksSubmit
                    });
                    if (sub?.clicked) {
                        submitted = true;
                        fillStats = {
                            ...(fillStats || {}),
                            submitClicked: true,
                            requiredComplete: true
                        };
                        await logCourseEvent(item.id, 'submit_clicked', {
                            ...(sub || {}),
                            via: fillIncomplete ? 'queue_force_site_ready' : 'queue_retry'
                        });
                    } else if (fillIncomplete) {
                        await logCourseEvent(item.id, 'fill_incomplete', {
                            filled: fillStats?.filled || 0,
                            requiredOk: fillStats?.requiredOk,
                            requiredTotal: fillStats?.requiredTotal,
                            missing: fillStats?.missingRequired || sub?.missing || [],
                            reason: sub?.reason || 'required_fields_incomplete',
                            siteReady: sub?.siteReady
                        });
                        await setAppRunState(item.id, 'incomplete', {
                            tabId: opened.tabId,
                            missingRequired: fillStats.missingRequired,
                            requiredOk: fillStats.requiredOk,
                            requiredTotal: fillStats.requiredTotal,
                            eventType: 'run_incomplete'
                        }).catch(() => {});
                        const waitMs = Math.max(
                            0,
                            Number(prefs.humanAssistWaitMs ?? prefs.captchaGraceMs ?? BIDDER_DEFAULTS.humanAssistWaitMs) || 0
                        );
                        const waitSec = Math.round(waitMs / 1000);
                        await notify(
                            'Bidder — needs help',
                            waitSec > 0
                                ? `Incomplete fill (${fillStats?.requiredOk ?? '?'}/${fillStats?.requiredTotal ?? '?'}) — Resume within ~${waitSec}s or skip`
                                : `Incomplete fill — skipping`
                        );
                        await playBidderSound(prefs.soundEnabled);
                        if (prefs.autoNext || prefs.unattended) {
                            await setQueueState({
                                status: 'awaiting_captcha',
                                captchaTabId: opened.tabId,
                                captchaApplicationId: item.id,
                                captchaKind: 'manual',
                                captchaSince: Date.now(),
                                captchaResolved: false,
                                captchaAbandonRequested: false
                            }).catch(() => {});
                            const wait = waitMs > 0
                                ? await waitForCaptchaOrLoginCleared(opened.tabId, {
                                    applicationId: item.id,
                                    timeoutMs: waitMs
                                }).catch(() => ({ cleared: false, timeout: true }))
                                : { cleared: false, skippedWait: true };
                            if (wait?.cleared) {
                                await setQueueState({
                                    status: 'running',
                                    captchaTabId: null,
                                    captchaApplicationId: null,
                                    captchaKind: null
                                }).catch(() => {});
                                // User finished manually — try detect success; otherwise leave tab and continue queue.
                                const okNow = await detectSubmitSuccess(opened.tabId).catch(() => false);
                                if (okNow) {
                                    try { await markApplicationApplied(item.id); } catch (_) { /* ignore */ }
                                    await logCourseEvent(item.id, 'marked_applied', { via: 'manual_after_incomplete' }).catch(() => {});
                                    try { await chrome.tabs.remove(opened.tabId); } catch (_) { /* ignore */ }
                                    openTabs.delete(opened.tabId);
                                } else {
                                    openTabs.delete(opened.tabId);
                                }
                                continue;
                            }
                            await logCourseEvent(item.id, 'captcha_abandoned', {
                                reason: 'fill_incomplete',
                                timeout: !!wait?.timeout,
                                via: wait?.via || 'timeout'
                            }).catch(() => {});
                            await notify('Bidder — skipped', `No response on incomplete form — skip ${item.company_name || item.id}`);
                            try { await chrome.tabs.remove(opened.tabId); } catch (_) { /* ignore */ }
                            openTabs.delete(opened.tabId);
                            await setQueueState({
                                status: 'running',
                                captchaTabId: null,
                                captchaApplicationId: null,
                                captchaKind: null
                            }).catch(() => {});
                            continue;
                        }
                    } else {
                        // Fallback: Mode-1 CLICK_SUBMIT (fill.js) if bidder engine missed the button.
                        const sub2 = await sendTabMessage(opened.tabId, { type: 'CLICK_SUBMIT' }).catch(() => null);
                        if (sub2?.clicked) {
                            submitted = true;
                            fillStats = { ...(fillStats || {}), submitClicked: true };
                            await logCourseEvent(item.id, 'submit_clicked', {
                                ...(sub2 || {}),
                                via: 'queue_click_submit'
                            });
                        } else {
                            await logCourseEvent(item.id, 'submit_no_click', {
                                filled: fillStats?.filled || 0,
                                reason: sub?.reason || sub2?.reason || 'no_submit_control'
                            });
                        }
                    }
                } catch (err) {
                    await logCourseEvent(item.id, 'submit_no_click', {
                        filled: fillStats?.filled || 0,
                        error: err?.message || String(err)
                    });
                }
                }
            }
            if (submitted) {
                await setAppRunState(item.id, 'submitting', {
                    tabId: opened.tabId,
                    eventType: 'run_submitting'
                }).catch(() => {});
                let poll = await pollDetectSubmitSuccess(opened.tabId, {
                    totalMs: SUBMIT_SUCCESS_POLL_MS,
                    gapMs: 800
                });
                // Validation errors → one re-fill of missing labels + one resubmit.
                if (!poll.ok && poll.reason === 'validation_errors') {
                    await logCourseEvent(item.id, 'submit_validation', {
                        reason: poll.reason,
                        sample: String(poll.sample || '').slice(0, 160)
                    }).catch(() => {});
                    try {
                        await ensureScripts(opened.tabId);
                        const refills = await runBidderFillOnTab(opened.tabId, item, {
                            ...prefs,
                            bidDeadline: Date.now() + 45000,
                            autoSubmit: false,
                            answersOnly: false
                        }).catch(() => null);
                        const reStats = normalizeFillStats(refills || {});
                        if (canAutoSubmit(reStats, { autoSubmit: !!prefs.autoSubmit })) {
                            const sub2 = await sendTabMessage(opened.tabId, { type: 'BIDDER_ENGINE_SUBMIT' }).catch(() => null);
                            if (sub2?.clicked) {
                                await logCourseEvent(item.id, 'submit_clicked', { via: 'validation_refill' });
                                poll = await pollDetectSubmitSuccess(opened.tabId, {
                                    totalMs: SUBMIT_SUCCESS_POLL_MS,
                                    gapMs: 800
                                });
                            }
                        }
                    } catch (reErr) {
                        console.warn('[bidder] validation refill failed', reErr?.message || reErr);
                    }
                }
                // Greenhouse: Submit #1 → email security code → fill → Submit #2 → thank-you.
                // Never treat OTP miss as "done" and never leftover-close this tab.
                if (!poll.ok) {
                    await new Promise((r) => setTimeout(r, 1200));
                    let otpUi = await detectEmailSecurityCodePage(opened.tabId).catch(() => null);
                    const wall = await detectCaptchaOrLogin(opened.tabId).catch(() => null);
                    const isEmailOtp = !!(
                        otpUi?.emailOtp
                        || wall?.emailOtp
                        || /email_otp/i.test(String(wall?.vendor || ''))
                    );
                    if (isEmailOtp) {
                        await logCourseEvent(item.id, 'email_otp_wait', {
                            phase: 'post_submit',
                            engine: 'greenhouse-double-submit',
                            shortBoxes: otpUi?.shortBoxes || 0
                        }).catch(() => {});
                        await setQueueState({
                            status: 'awaiting_email_otp',
                            captchaTabId: opened.tabId,
                            captchaApplicationId: item.id,
                            captchaKind: 'email_otp',
                            captchaSince: Date.now(),
                            coachStatus: 'Waiting for email security code…',
                            coachAt: Date.now()
                        }).catch(() => {});
                        try { await chrome.tabs.update(opened.tabId, { active: true }); } catch (_) { /* ignore */ }

                        // Greenhouse security codes expire in ~10m — do not use short CAPTCHA grace.
                        const otpTimeout = Math.min(
                            Math.max(Number(prefs.emailOtpWaitMs) || 9 * 60 * 1000, 3 * 60 * 1000),
                            10 * 60 * 1000
                        );
                        await setQueueState({
                            coachStatus: `Watching mailbox for security code (~${Math.round(otpTimeout / 60000)}m)…`,
                            coachAt: Date.now()
                        }).catch(() => {});
                        let otp = await tryFillOutlookEmailOtp(opened.tabId, {
                            timeoutMs: otpTimeout,
                            applicationId: item.id
                        }).catch((err) => ({ ok: false, error: err?.message || String(err) }));

                        // Keep polling the mailbox + allow Instruct paste until the code window ends.
                        if (!otp?.ok) {
                            await notify(
                                'Lumi — Security code',
                                'Still waiting for the email code. Mailbox keeps syncing; you can also paste it in Instruct Lumi.'
                            );
                            await playBidderSound(prefs.soundEnabled);
                            const instructHoldMs = Math.min(
                                Math.max(otpTimeout, 3 * 60 * 1000),
                                10 * 60 * 1000
                            );
                            const holdStart = Date.now();
                            let secondSubmitTried = false;
                            let lastMailboxRetryAt = 0;
                            while (Date.now() - holdStart < instructHoldMs) {
                                const stHold = await getQueueState();
                                if (stHold?.stopRequested) break;
                                try { await chrome.tabs.get(opened.tabId); } catch {
                                    otp = { ok: false, error: 'tab_closed' };
                                    break;
                                }
                                const successEarly = await detectSubmitSuccess(opened.tabId).catch(() => false);
                                if (successEarly) {
                                    poll = { ok: true, reason: 'success_during_otp_hold', attempts: 0, elapsedMs: Date.now() - holdStart };
                                    otp = { ok: true, via: 'already_success' };
                                    break;
                                }
                                const filled = await emailOtpInputsFilled(opened.tabId).catch(() => null);
                                if (filled?.filled && !secondSubmitTried) {
                                    secondSubmitTried = true;
                                    otp = { ok: true, via: 'manual_or_instruct' };
                                    break;
                                }
                                // Retry mailbox every ~12s so a late Graph/IMAP deliver can still AFK-pass.
                                if (Date.now() - lastMailboxRetryAt > 12000) {
                                    lastMailboxRetryAt = Date.now();
                                    const retry = await tryFillOutlookEmailOtp(opened.tabId, {
                                        timeoutMs: 20000,
                                        applicationId: item.id
                                    }).catch(() => null);
                                    if (retry?.ok) {
                                        otp = retry;
                                        break;
                                    }
                                }
                                const leftSec = Math.max(0, Math.round((instructHoldMs - (Date.now() - holdStart)) / 1000));
                                await setQueueState({
                                    coachStatus: `Awaiting email security code (${leftSec}s left) — auto mailbox + Instruct`,
                                    coachAt: Date.now()
                                }).catch(() => {});
                                await new Promise((r) => setTimeout(r, 2000));
                            }
                        }

                        await logCourseEvent(item.id, otp?.ok ? 'email_otp_filled' : 'email_otp_miss', {
                            phase: 'post_submit',
                            ok: !!otp?.ok,
                            via: otp?.via || null,
                            subject: otp?.subject || null,
                            error: otp?.error || null
                        }).catch(() => {});

                        if (otp?.ok && otp?.via !== 'already_success') {
                            await new Promise((r) => setTimeout(r, 700));
                            let otpSubmit = await sendTabMessage(opened.tabId, {
                                type: 'BIDDER_ENGINE_SUBMIT',
                                force: true
                            }).catch(() => null);
                            if (!otpSubmit?.clicked) {
                                otpSubmit = await sendTabMessage(opened.tabId, { type: 'CLICK_SUBMIT' }).catch(() => null);
                            }
                            if (!otpSubmit?.clicked) {
                                otpSubmit = await clickPostOtpSubmit(opened.tabId).catch(() => null);
                            }
                            await logCourseEvent(item.id, 'submit_clicked', {
                                via: 'post_submit_email_otp',
                                clicked: !!otpSubmit?.clicked,
                                label: otpSubmit?.label || null
                            }).catch(() => {});
                            poll = await pollDetectSubmitSuccess(opened.tabId, {
                                totalMs: Math.max(SUBMIT_SUCCESS_POLL_MS, 25000),
                                gapMs: 800
                            });
                        }

                        // Still on OTP page → park tab; do not leftover-close.
                        if (!poll.ok) {
                            holdEmailOtpTabs.set(opened.tabId, item);
                            openTabs.delete(opened.tabId);
                            await setQueueState({
                                status: 'awaiting_email_otp',
                                captchaTabId: opened.tabId,
                                captchaApplicationId: item.id,
                                captchaKind: 'email_otp',
                                coachStatus: 'Security code tab kept open — Instruct then second Submit',
                                coachAt: Date.now()
                            }).catch(() => {});
                            await logCourseEvent(item.id, 'needs_manual', {
                                reason: 'awaiting_email_otp',
                                tabKept: true
                            }).catch(() => {});
                            await setAppRunState(item.id, 'incomplete', {
                                tabId: opened.tabId,
                                eventType: 'run_awaiting_email_otp'
                            }).catch(() => {});
                            await uploadSuccessProofScreenshot(item.id, opened.tabId, {
                                stayInApp: true,
                                waitMs: 800
                            }).catch(() =>
                                uploadScreenshot(item.id, 'live', opened.tabId, { stayInApp: true })
                            );
                            await refocusStayInAppHome();
                            // Skip the generic needs_manual close path below.
                            if (!prefs.autoNext) {
                                await setQueueState({
                                    running: true,
                                    status: 'awaiting_email_otp',
                                    lastTabId: opened.tabId,
                                    lastApplicationId: item.id,
                                    captchaTabId: opened.tabId,
                                    captchaApplicationId: item.id,
                                    captchaKind: 'email_otp'
                                });
                                await notify('Lumi', 'Enter security code via Instruct, then Next when ready');
                                await waitForBidderNext();
                            }
                            continue;
                        }

                        await setQueueState({
                            status: 'running',
                            captchaKind: null,
                            captchaTabId: null,
                            captchaApplicationId: null,
                            coachStatus: null
                        }).catch(() => {});
                    }
                }
                const ok = !!poll.ok;
                if (ok || prefs.autoSubmit) {
                    if (ok) {
                        siteSuccess = true;
                        try {
                            await markApplicationApplied(item.id);
                        } catch (markErr) {
                            console.warn(
                                '[bidder] mark applied failed after site thank-you',
                                markErr?.message || markErr
                            );
                        }
                        await logCourseEvent(item.id, 'marked_applied', {
                            via: 'success_text',
                            pollAttempts: poll.attempts,
                            pollMs: poll.elapsedMs
                        });
                        await setAppRunState(item.id, 'success', {
                            tabId: opened.tabId,
                            eventType: 'run_success'
                        }).catch(() => {});
                        await watchLearnAfterSuccess(opened.tabId, item.id, {
                            source: 'auto_watch'
                        }).catch(() => {});
                        await uploadSuccessProofScreenshot(item.id, opened.tabId, {
                            stayInApp: true,
                            waitMs: 1600
                        });
                        await closeBidderTab(opened.tabId);
                        openTabs.delete(opened.tabId);
                        holdEmailOtpTabs.delete(opened.tabId);
                        processed += 1;
                        submitted = true;
                        await refocusStayInAppHome();
                    } else {
                        await logCourseEvent(item.id, 'needs_manual', {
                            reason: poll.reason || 'submit_no_thanks',
                            pollAttempts: poll.attempts
                        });
                        await setAppRunState(item.id, 'incomplete', {
                            tabId: opened.tabId,
                            eventType: 'run_needs_manual'
                        }).catch(() => {});
                        // If OTP UI appeared late, still hold the tab.
                        const lateOtp = await detectEmailSecurityCodePage(opened.tabId).catch(() => null);
                        if (lateOtp?.emailOtp) {
                            holdEmailOtpTabs.set(opened.tabId, item);
                            openTabs.delete(opened.tabId);
                            await setQueueState({
                                status: 'awaiting_email_otp',
                                captchaTabId: opened.tabId,
                                captchaApplicationId: item.id,
                                captchaKind: 'email_otp'
                            }).catch(() => {});
                            await notify('Lumi — Security code', 'Tab kept open for email code + second Submit');
                        } else {
                            await notify('Bidder', 'Submit clicked — confirm success (Submitted OK) if needed');
                        }
                        await playBidderSound(prefs.soundEnabled);
                        await uploadSuccessProofScreenshot(item.id, opened.tabId, {
                            stayInApp: true,
                            waitMs: 1000
                        }).catch(() =>
                            uploadScreenshot(item.id, 'live', opened.tabId, { stayInApp: true })
                        );
                        await refocusStayInAppHome();
                    }
                }
            } else if ((await finalizeSubmitSuccessIfDetected(opened.tabId, item.id, 'after_fill_late').catch(() => null))?.ok) {
                processed += 1;
            } else if (fillIncomplete) {
                await ensureApplyFormVisible(opened.tabId);
                await uploadScreenshot(item.id, 'after_fill_done', opened.tabId, { stayInApp: true });
                await setQueueState({
                    coachStatus: 'Watching… stuck after fill — use Instruct Lumi',
                    coachAt: Date.now()
                }).catch(() => {});
                await setAppRunState(item.id, 'incomplete', {
                    tabId: opened.tabId,
                    missingRequired: fillStats.missingRequired,
                    eventType: 'run_incomplete'
                }).catch(() => {});
                // Keep apply tab open for manual finish — do not leftover-close.
                manualReviewTabs.set(opened.tabId, item);
                openTabs.delete(opened.tabId);
                await focusBidderTabForReview(opened.tabId);
            } else if (!prefs.autoSubmit) {
                await logCourseEvent(item.id, 'awaiting_manual_submit', {
                    filled: fillStats?.filled || 0
                });
                // Keep apply tab open — user reviews answers / submits manually.
                // Captured Q&A also live in the extension popup for editing.
                await ensureApplyFormVisible(opened.tabId);
                await uploadScreenshot(item.id, 'after_fill_done', opened.tabId, { stayInApp: true });
                manualReviewTabs.set(opened.tabId, item);
                openTabs.delete(opened.tabId);
                await focusBidderTabForReview(opened.tabId);
                await notify(
                    'Bidder',
                    `Fill done (${fillStats?.filled || 0} fields) — tab kept open. Fix answers in the popup or submit on the form.`
                );
            } else {
                // autoSubmit on but could not click Submit — keep tab for manual finish.
                await ensureApplyFormVisible(opened.tabId);
                await uploadScreenshot(item.id, 'after_fill_done', opened.tabId, { stayInApp: true });
                manualReviewTabs.set(opened.tabId, item);
                openTabs.delete(opened.tabId);
                await focusBidderTabForReview(opened.tabId);
                await notify(
                    'Bidder',
                    'Could not click Submit — tab kept open for you to finish.'
                );
            }

            // Pause for Next unless autoNext
            if (!prefs.autoNext) {
                await setQueueState({
                    running: true,
                    status: 'awaiting_next',
                    lastTabId: null,
                    lastApplicationId: item.id
                });
                await notify('Bidder', 'Click Next in Auto Bidder / Live monitor to continue');
                await waitForBidderNext();
            }

            // Count fill-only jobs once (submit success already counted above)
            if (!fillStats?.submitClicked) processed += 1;
            } catch (itemErr) {
                if (itemErr?.status === 401 || itemErr?.authExpired) throw itemErr;
                if (itemErr?.jobExpired || /job_expired/i.test(String(itemErr?.message || ''))) {
                    if (item.job_link_id) expiredJobLinkIds.add(Number(item.job_link_id));
                    await finishExpiredJob({
                        item,
                        tabId: opened?.tabId || itemErr?.tabId || null,
                        openTabs,
                        probe: itemErr?.probe || null,
                        url: applyUrl || opened?.url || null
                    });
                    continue;
                }
                const msg = String(itemErr?.message || itemErr || '');
                const accessDenied = /application not found or access denied/i.test(msg);
                if (siteSuccess || accessDenied) {
                    let thankYou = siteSuccess;
                    if (!thankYou && opened?.tabId) {
                        const late = await detectSubmitSuccess(opened.tabId).catch(() => null);
                        thankYou = !!late?.ok;
                    }
                    if (thankYou) {
                        await logCourseEvent(item.id, 'marked_applied', {
                            via: 'success_after_api_error',
                            error: msg
                        }).catch(() => {});
                        if (opened?.tabId) openTabs.delete(opened.tabId);
                        continue;
                    }
                }
                if (opened?.tabId) openTabs.delete(opened.tabId);
                await logCourseEvent(item.id, 'item_aborted', { error: msg }).catch(() => {});
                if (/Tab closed|bid_time_budget/i.test(msg)) {
                    console.warn('[bidder] item skipped (tab/budget)', msg);
                } else {
                    console.warn('[bidder] item failed', itemErr);
                    await notify('Bidder', `Skip: ${msg}`).catch(() => {});
                }
            }
        }

        // Close leftover apply tabs — but NEVER close Greenhouse email-OTP tabs
        // (Submit #1 done; waiting for code + Submit #2), or manual-review tabs.
        // Always capture evidence + clear tab mapping before close so Control stays honest.
        for (const tid of [...openTabs.keys()]) {
            if (holdEmailOtpTabs.has(tid) || manualReviewTabs.has(tid)) {
                openTabs.delete(tid);
                continue;
            }
            const lateOtp = await detectEmailSecurityCodePage(tid).catch(() => null);
            if (lateOtp?.emailOtp) {
                const meta = openTabs.get(tid);
                if (meta) holdEmailOtpTabs.set(tid, meta);
                openTabs.delete(tid);
                continue;
            }
            const leftoverItem = openTabs.get(tid);
            const leftoverAppId = leftoverItem?.id || null;
            if (leftoverAppId) {
                await captureFailEvidence(leftoverAppId, tid, 'leftover_sweep', {
                    phase: 'leftover_sweep',
                    url: leftoverItem?.open_url || null
                }).catch(() => {});
                await clearTabMapping({ applicationId: leftoverAppId, tabId: tid }).catch(() => {});
            } else {
                await clearTabMapping({ tabId: tid }).catch(() => {});
            }
            await closeBidderTab(tid);
            openTabs.delete(tid);
        }
        const reviewHoldCount = manualReviewTabs.size;
        if (!reviewHoldCount) {
            await refocusStayInAppHome();
        }

        const otpHoldCount = holdEmailOtpTabs.size;
        const firstOtpTab = otpHoldCount ? [...holdEmailOtpTabs.keys()][0] : null;
        const firstOtpItem = firstOtpTab ? holdEmailOtpTabs.get(firstOtpTab) : null;
        const firstReviewTab = reviewHoldCount ? [...manualReviewTabs.keys()][0] : null;
        const firstReviewItem = firstReviewTab ? manualReviewTabs.get(firstReviewTab) : null;
        let pendingCvCount = 0;
        try {
            pendingCvCount = (await listPendingCvRegen()).length;
        } catch (_) { /* ignore */ }
        const stillWorking = otpHoldCount > 0 || reviewHoldCount > 0 || pendingCvCount > 0;

        await setQueueState({
            running: stillWorking,
            status: otpHoldCount > 0
                ? 'awaiting_email_otp'
                : (reviewHoldCount > 0
                    ? 'awaiting_manual_submit'
                    : (pendingCvCount > 0 ? 'awaiting_cv_regen' : 'done')),
            processed,
            skippedAts,
            queueEndedAt: Date.now(),
            captchaTabId: firstOtpTab || firstReviewTab || null,
            captchaApplicationId: firstOtpItem?.id || firstReviewItem?.id || null,
            captchaKind: otpHoldCount > 0 ? 'email_otp' : (reviewHoldCount > 0 ? 'manual_review' : null),
            coachStatus: otpHoldCount > 0
                ? 'Security code tab(s) kept open — Instruct Lumi with the code, then Submit'
                : (reviewHoldCount > 0
                    ? 'Apply tab kept open — review answers in popup or submit on the form'
                    : (pendingCvCount > 0
                        ? `CV regenerating (${pendingCvCount}) — form kept; auto-rebid when ready`
                        : null)),
            coachAt: Date.now()
        });
        if (otpHoldCount > 0) {
            await notify(
                'Lumi — Security code',
                `${otpHoldCount} Greenhouse tab(s) waiting for email code. Instruct Lumi with the code (second Submit).`
            );
        } else if (reviewHoldCount > 0) {
            await notify(
                'Lumi — Review answers',
                `${reviewHoldCount} apply tab(s) kept open. Edit answers in the extension popup, then submit on the form.`
            );
        }
        const doneMsg = otpHoldCount > 0
            ? `Queue paused — ${otpHoldCount} tab(s) need email security code (Instruct Lumi)`
            : (reviewHoldCount > 0
                ? `Queue paused — ${reviewHoldCount} tab(s) open for review / manual submit`
                : (pendingCvCount > 0
                    ? `Queue paused — ${pendingCvCount} CV(s) regenerating (will auto-rebid)`
                    : (skippedAts
                        ? `Queue finished — processed ${processed}, skipped ${skippedAts} unsupported`
                        : `Queue finished — processed ${processed}`)));
        await notify('Bidder', doneMsg);

        // Drain any CVs that finished regenerating while this Process was running.
        try {
            const stEnd = await getQueueState();
            const rebidIds = Array.isArray(stEnd?.pendingRebidIds)
                ? stEnd.pendingRebidIds.map((id) => parseInt(id, 10)).filter((n) => Number.isInteger(n) && n > 0)
                : [];
            if (rebidIds.length && otpHoldCount === 0 && reviewHoldCount === 0 && pendingCvCount === 0) {
                await setQueueState({ pendingRebidIds: [] });
                // Release lock first so nested Process can acquire it.
                clearInterval(keepAlive);
                await releaseAllPageDebuggers().catch(() => {});
                await releaseQueueLock();
                lockReleasedEarly = true;
                processReadyQueue({ applicationIds: rebidIds }).catch((err) => {
                    console.warn('[bidder] drain rebid failed', err?.message || err);
                });
                return {
                    ok: true,
                    processed,
                    queued: items.length,
                    skippedAts,
                    awaitingEmailOtp: otpHoldCount,
                    rebidQueued: rebidIds.length
                };
            }
        } catch (err) {
            console.warn('[bidder] rebid drain skipped', err?.message || err);
        }

        // Keep regenerating any parked CVs after Process ends.
        processPendingCvRegenQueue().catch(() => {});

        return { ok: true, processed, queued: items.length, skippedAts, awaitingEmailOtp: otpHoldCount };
    } catch (err) {
        console.warn('[bidder] processReadyQueue failed', err);
        await setQueueState({
            running: false,
            status: 'error',
            error: err?.message || String(err)
        }).catch(() => {});
        throw err;
    } finally {
        clearInterval(keepAlive);
        await releaseAllPageDebuggers().catch(() => {});
        if (!lockReleasedEarly) {
            await releaseQueueLock();
        }
    }
}

async function waitWhileBidderPaused() {
    while (true) {
        const st = await getQueueState();
        if (st?.stopRequested) return { stopped: true };
        if (!st?.pauseRequested) {
            if (String(st?.status || '') === 'paused' && st?.running) {
                await setQueueState({ status: 'running' }).catch(() => {});
            }
            return { stopped: false };
        }
        if (String(st?.status || '') !== 'paused') {
            await setQueueState({ status: 'paused' }).catch(() => {});
        }
        await new Promise((r) => setTimeout(r, 400));
    }
}

async function waitForBidderNext(timeoutMs = 60 * 60 * 1000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const st = await getQueueState();
        if (st?.nextClicked) {
            await setQueueState({ nextClicked: false, status: 'running', pauseRequested: false });
            return;
        }
        if (st?.stopRequested) return;
        if (st?.pauseRequested) {
            const pg = await waitWhileBidderPaused();
            if (pg.stopped) return;
            continue;
        }
        await new Promise((r) => setTimeout(r, 400));
    }
}

async function playBidderSound(enabled) {
    if (!enabled) return;
    try {
        await chrome.notifications.create(`bidder-sound-${Date.now()}`, {
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'Lumi Bidder',
            message: 'Needs your attention',
            priority: 2,
            silent: false
        });
    } catch (_) { /* ignore */ }
}

/**
 * CAPTCHA / login pass engineer.
 * - Built-in CapSolver / 2Captcha API (when key set): extract sitekey → buy token → inject
 * - Else: wait for Chrome helper extensions (NopeCHA/Buster) or human Resume
 * - Attended / unattended wait windows as before
 */
async function runCaptchaPassEngine({
    tabId,
    applicationId,
    prefs,
    wall,
    phase = 'open',
    companyLabel = 'Job'
} = {}) {
    const kind = wall?.captcha ? 'needs_captcha' : 'login_wall';
    const stayInApp = prefs?.stayInApp !== false;
    const unattended = prefs?.unattended === true;
    const solverProvider = resolveSolverProvider(prefs || {});
    // Free path: NopeCHA/Buster — always wait for helpers when no paid API key
    const captchaHelper = prefs?.captchaHelper === true || !solverProvider;
    const vendor = wall?.vendor || (wall?.login ? 'login' : 'generic');

    try {
        const helpers = await probeCaptchaHelpers();
        if (applicationId && helpers.probed) {
            await logCourseEvent(applicationId, helpers.helper_missing
                ? 'captcha_helper_missing'
                : 'captcha_helper_present', {
                phase,
                vendor,
                nopecha: !!helpers.nopecha,
                buster: !!helpers.buster
            }).catch(() => {});
        }
    } catch (_) { /* ignore */ }

    const strategy = captchaStrategyForVendor(vendor, {
        login: !!wall?.login,
        captchaHelper: captchaHelper || !!solverProvider
    });
    const baseGrace = Math.max(
        0,
        Number(prefs?.humanAssistWaitMs ?? prefs?.captchaGraceMs ?? BIDDER_DEFAULTS.humanAssistWaitMs) || 0
    );
    const helperWait = Math.max(
        0,
        Number(prefs?.humanAssistWaitMs ?? prefs?.captchaHelperWaitMs ?? BIDDER_DEFAULTS.captchaHelperWaitMs) || 0
    );
    // Settings "Human help wait": notify → wait → skip if no Resume / solve.
    const graceMs = Math.max(baseGrace, helperWait);
    const helperUseful = (!!captchaHelper || !!solverProvider) && !!wall?.captcha;
    // AFK CAPTCHA pass: keep apply tab focused the entire wait (helpers / inject need it).
    const holdApplyForHelpers = helperUseful;
    const shouldWait = graceMs > 0;
    // Re-nudge NopeCHA/Buster more often on free path (no paid solver)
    const HELPER_REASSIST_MS = solverProvider ? 15000 : 8000;

    const alreadyThankYou = await detectSubmitSuccess(tabId).catch(() => false);
    if (alreadyThankYou || wall?.thankYou) {
        if (applicationId) {
            await logCourseEvent(applicationId, 'submit_success_detected', {
                via: 'thank_you_before_captcha',
                phase,
                engine: 'captcha-pass-v9'
            }).catch(() => {});
            try { await markApplicationApplied(applicationId); } catch (_) { /* ignore */ }
            await logCourseEvent(applicationId, 'marked_applied', {
                via: 'thank_you_before_captcha',
                phase
            }).catch(() => {});
        }
        await setQueueState({
            status: 'running',
            lastStatusEvent: 'marked_applied',
            lastStatusAt: Date.now(),
            captchaKind: null,
            captchaTabId: null,
            captchaApplicationId: null,
            captchaUnattended: null
        }).catch(() => {});
        return { cleared: true, via: 'submit_success', thankYou: true, kind };
    }

    await logCourseEvent(applicationId, kind, {
        ...wall,
        phase,
        stayInApp,
        unattended,
        captchaHelper,
        freeHelpersOnly: !solverProvider,
        solverProvider: solverProvider || null,
        vendor,
        strategy: strategy.id,
        strategyLabel: strategy.label,
        helperUseful,
        holdApplyForHelpers,
        graceMs: unattended || captchaHelper || solverProvider ? graceMs : undefined,
        engine: 'captcha-pass-v9'
    });

    await uploadScreenshot(applicationId, wall?.captcha ? 'captcha' : 'login_wall', tabId, {
        settleMs: 400,
        stayInApp
    }).catch(() => {});

    // Built-in API solver first (CapSolver / 2Captcha) — multi-strategy, up to 2 rounds.
    if (wall?.captcha && solverProvider && !wall?.login) {
        try { await chrome.tabs.update(tabId, { active: true }); } catch (_) { /* ignore */ }
        await logCourseEvent(applicationId, 'captcha_solver_start', {
            phase,
            provider: solverProvider,
            vendor,
            engine: 'captcha-pass-v9'
        }).catch(() => {});

        let solved = null;
        for (let round = 0; round < 2; round += 1) {
            if (round > 0) {
                await new Promise((r) => setTimeout(r, 3000));
                await logCourseEvent(applicationId, 'captcha_solver_retry', {
                    phase,
                    round,
                    engine: 'captcha-pass-v9'
                }).catch(() => {});
            }
            solved = await solveCaptchaOnTab(tabId, {
                ...prefs,
                captchaSolverTimeoutMs: Math.max(
                    Number(prefs?.captchaSolverTimeoutMs) || 0,
                    240000
                )
            }, wall).catch((err) => ({
                ok: false,
                error: err?.message || String(err)
            }));
            if (solved?.ok) break;
            // Only retry when sitekey missing / soft miss — hard vendor skip
            if (solved?.skipped || /vendor_not_solvable|no_solver/i.test(String(solved?.error || ''))) {
                break;
            }
        }

        await logCourseEvent(applicationId, solved?.ok ? 'captcha_solver_ok' : 'captcha_solver_miss', {
            phase,
            provider: solved?.provider || solverProvider,
            vendor: solved?.vendor || vendor,
            error: solved?.error || null,
            sitekey: solved?.sitekey || null,
            taskType: solved?.taskType || null,
            attemptCount: Array.isArray(solved?.attempts) ? solved.attempts.length : null,
            engine: 'captcha-pass-v9'
        }).catch(() => {});
        if (solved?.ok) {
            await new Promise((r) => setTimeout(r, 2000));
            const after = await detectCaptchaOrLogin(tabId).catch(() => null);
            if (after && (!after.captcha || after.widgetSolved) && !after.login) {
                await logCourseEvent(applicationId, 'captcha_cleared', {
                    via: `api_${solved.provider}`,
                    phase,
                    engine: 'captcha-pass-v9'
                });
                await setQueueState({
                    status: 'running',
                    captchaKind: null,
                    captchaTabId: null,
                    captchaApplicationId: null,
                    captchaUnattended: null
                });
                return { cleared: true, via: `api_${solved.provider}`, kind };
            }
            // Token injected but detector still sees wall — treat as cleared for solvable widgets
            if (solved.injected) {
                await logCourseEvent(applicationId, 'captcha_cleared', {
                    via: `api_${solved.provider}_injected`,
                    phase,
                    engine: 'captcha-pass-v9'
                });
                await setQueueState({
                    status: 'running',
                    captchaKind: null,
                    captchaTabId: null,
                    captchaApplicationId: null,
                    captchaUnattended: null
                });
                return { cleared: true, via: `api_${solved.provider}_injected`, kind };
            }
        }
    }

    // Free helpers: focus pulse + re-assist so NopeCHA / Buster can engage.
    let assist = null;
    if (wall?.captcha && helperUseful && !wall?.login) {
        assist = await assistCaptchaHelpersWithRetry(tabId, vendor, {
            attempts: 3,
            gapMs: 1100,
            focusPulse: true
        }).catch(() => null);
        if (assist?.solved || assist?.clicked) {
            await logCourseEvent(applicationId, 'captcha_assist_helpers', {
                phase,
                tried: assist.tried || [],
                vendor,
                solved: !!assist.solved,
                signals: assist.signals || [],
                attempts: assist.attempts,
                freeHelpersOnly: !solverProvider,
                engine: 'captcha-pass-v10'
            });
            await new Promise((r) => setTimeout(r, 1200));
            const tokenHit = assist.solved
                ? { solved: true }
                : await detectCaptchaSolved(tabId).catch(() => ({ solved: false }));
            const early = await detectCaptchaOrLogin(tabId).catch(() => null);
            if (
                tokenHit?.solved
                || (early && (!early.captcha || early.widgetSolved) && !early.login)
            ) {
                await logCourseEvent(applicationId, 'captcha_cleared', {
                    via: tokenHit?.solved ? 'helper_token' : 'helper_assist',
                    phase,
                    engine: 'captcha-pass-v10'
                });
                await setQueueState({
                    status: 'running',
                    captchaKind: null,
                    captchaTabId: null,
                    captchaApplicationId: null,
                    captchaUnattended: null
                });
                return { cleared: true, via: tokenHit?.solved ? 'helper_token' : 'helper_assist', kind };
            }
        }
    }

    // Email security code / Outlook OTP — existing path kept; further work deferred.
    if (wall?.emailOtp || /email_otp/i.test(String(vendor))) {
        try { await chrome.tabs.update(tabId, { active: true }); } catch (_) { /* ignore */ }
        await logCourseEvent(applicationId, 'email_otp_wait', {
            phase,
            engine: 'captcha-pass-v9'
        }).catch(() => {});
        // Email OTP is not a CAPTCHA widget — wait almost the full Greenhouse 10m window.
        const otpWait = Math.min(
            Math.max(Number(prefs?.emailOtpWaitMs) || graceMs || helperWait || 9 * 60 * 1000, 3 * 60 * 1000),
            10 * 60 * 1000
        );
        const otp = await tryFillOutlookEmailOtp(tabId, {
            timeoutMs: otpWait,
            applicationId
        }).catch((err) => ({ ok: false, error: err?.message || String(err) }));
        await logCourseEvent(applicationId, otp?.ok ? 'email_otp_filled' : 'email_otp_miss', {
            phase,
            ok: !!otp?.ok,
            subject: otp?.subject || null,
            error: otp?.error || null,
            engine: 'captcha-pass-v9'
        }).catch(() => {});
        if (otp?.ok) {
            await new Promise((r) => setTimeout(r, 1500));
            let otpSubmit = await sendTabMessage(tabId, {
                type: 'BIDDER_ENGINE_SUBMIT',
                force: true
            }).catch(() => null);
            if (!otpSubmit?.clicked) {
                otpSubmit = await clickPostOtpSubmit(tabId).catch(() => null);
            }
            await logCourseEvent(applicationId, 'submit_clicked', {
                via: 'captcha_pass_email_otp',
                clicked: !!otpSubmit?.clicked
            }).catch(() => {});
            await new Promise((r) => setTimeout(r, 1500));
            const afterOtp = await detectCaptchaOrLogin(tabId).catch(() => null);
            const success = await detectSubmitSuccess(tabId).catch(() => false);
            if (
                success
                || (afterOtp && !afterOtp.captcha && !afterOtp.login && !afterOtp.emailOtp)
            ) {
                await setQueueState({
                    status: 'running',
                    captchaKind: null,
                    captchaTabId: null,
                    captchaApplicationId: null,
                    captchaUnattended: null
                });
                return { cleared: true, via: 'outlook_email_otp', kind };
            }
        }
    }

    if (holdApplyForHelpers) {
        // AFK/attended helper pass: pin apply tab — do NOT soft-refocus Job Links (starves solvers).
        try { await chrome.tabs.update(tabId, { active: true }); } catch (_) { /* ignore */ }
        try {
            await chrome.storage.session.set({
                captchaUserFocusHoldUntil: Date.now() + Math.max(graceMs, 60_000) + 30_000
            });
        } catch (_) { /* ignore */ }
        await logCourseEvent(applicationId, 'captcha_helper_focus_pulse', {
            phase,
            focus: 'apply_hold',
            afk: unattended,
            engine: 'captcha-pass-v9'
        }).catch(() => {});
    } else if (!stayInApp && !unattended) {
        try { await chrome.tabs.update(tabId, { active: true }); } catch (_) { /* ignore */ }
    } else if (!unattended) {
        await refocusStayInAppHome();
    }

    const graceSec = Math.round(graceMs / 1000);
    const vendorName = vendorLabel(vendor);
    await notify(
        wall?.captcha ? `Bidder — ${vendorName}` : 'Bidder — Login required',
        graceSec > 0
            ? `${companyLabel}: needs help — waiting ~${graceSec}s for Resume / CAPTCHA; then skip.`
            : `${companyLabel}: needs help — skipping now (wait = 0).`
    );
    await playBidderSound(prefs?.soundEnabled);

    let captchaJobUrl = null;
    try {
        const st0 = await getQueueState();
        captchaJobUrl = st0?.currentJobUrl || st0?.captchaJobUrl || null;
        if (!captchaJobUrl || /[?&]error=true\b/i.test(captchaJobUrl) || /\/embed\/job_board/i.test(captchaJobUrl)) {
            const t = await chrome.tabs.get(tabId);
            const tabUrl = t?.pendingUrl || t?.url || null;
            if (tabUrl && !/[?&]error=true\b/i.test(tabUrl) && !/\/embed\/job_board/i.test(tabUrl)) {
                captchaJobUrl = tabUrl;
            }
        }
    } catch (_) { /* ignore */ }

    await setQueueState({
        status: 'awaiting_captcha',
        captchaTabId: tabId,
        captchaApplicationId: applicationId,
        captchaKind: wall?.captcha ? 'captcha' : 'login',
        captchaSince: Date.now(),
        captchaStayInApp: stayInApp,
        captchaUnattended: unattended,
        captchaHelper,
        captchaHoldApply: holdApplyForHelpers,
        captchaJobUrl,
        captchaTabMissing: false,
        captchaAbandonRequested: false
    });

    const abandonUnattended = async (extra = {}) => {
        await logCourseEvent(applicationId, 'captcha_abandoned', {
            ...extra,
            phase,
            unattended,
            captchaHelper,
            graceMs,
            assist,
            engine: 'captcha-pass-v9'
        });
        // Keep browser tab open when helper was on so CapSolver/NopeCHA / Open tab can still finish.
        if (!captchaHelper) {
            try { await chrome.tabs.remove(tabId); } catch (_) { /* ignore */ }
        }
        try { await chrome.storage.session.remove('captchaUserFocusHoldUntil'); } catch (_) { /* ignore */ }
        await setQueueState({
            status: 'running',
            captchaKind: null,
            captchaTabId: null,
            captchaApplicationId: null,
            captchaUnattended: null,
            captchaHelper: null,
            captchaHoldApply: null,
            captchaTabMissing: false,
            captchaAbandonRequested: false,
            captchaResolved: false,
            lastStatusEvent: 'captcha_abandoned',
            lastStatusAt: Date.now()
        }).catch(() => {});
        await notify(
            'Bidder — skipped',
            captchaHelper
                ? `${companyLabel}: no response in time — apply tab left open; queue continues.`
                : `${companyLabel}: no response in time — skipped; queue continues.`
        );
        return {
            cleared: false,
            abandoned: true,
            unattended,
            captchaHelper,
            tabKept: !!captchaHelper,
            skippedWait: !!extra.skippedWait,
            timeout: !!extra.timeout,
            via: extra.via || null,
            kind
        };
    };

    if (!shouldWait) {
        return abandonUnattended({ skippedWait: true });
    }

    // Live frames on status change only (≤0.5s) — no CAPTCHA interval spam.

    let lastAssist = Date.now();
    const pollMs = unattended ? 1000 : BIDDER_DEFAULTS.captchaPollMs;
    const start = Date.now();
    while (Date.now() - start < graceMs) {
            const stFocus = await getQueueState();
            const tid = stFocus?.captchaTabId || tabId;

            if (holdApplyForHelpers && tid) {
                // Pin apply tab every cycle — NopeCHA/Buster need focus for AFK pass.
                try { await chrome.tabs.update(tid, { active: true }); } catch (_) { /* ignore */ }
                if (Date.now() - lastAssist > HELPER_REASSIST_MS) {
                    const again = await assistCaptchaHelpers(tid, vendor).catch(() => null);
                    if (again?.clicked) {
                        await logCourseEvent(applicationId, 'captcha_assist_helpers', {
                            phase,
                            tried: again.tried || [],
                            vendor,
                            engine: 'captcha-pass-v9'
                        }).catch(() => {});
                    }
                    lastAssist = Date.now();
                }
            } else if (captchaHelper && Date.now() - lastAssist > HELPER_REASSIST_MS) {
                if (tid) await assistCaptchaHelpers(tid, vendor).catch(() => null);
                lastAssist = Date.now();
            }

            const slice = Math.min(pollMs * 8, Math.max(0, graceMs - (Date.now() - start)));
            const wait = await waitForCaptchaOrLoginCleared(tabId, {
                applicationId,
                timeoutMs: Math.max(pollMs, slice),
                pollMs
            });
            if (wait.cleared) {
                const thankYou = wait.via === 'submit_success' || wait.thankYou;
                if (thankYou && applicationId) {
                    await logCourseEvent(applicationId, 'submit_success_detected', {
                        via: 'thank_you_during_captcha',
                        phase,
                        engine: 'captcha-pass-v9'
                    }).catch(() => {});
                    try { await markApplicationApplied(applicationId); } catch (_) { /* ignore */ }
                    await logCourseEvent(applicationId, 'marked_applied', {
                        via: 'thank_you_during_captcha',
                        phase
                    }).catch(() => {});
                } else {
                    await logCourseEvent(applicationId, 'captcha_cleared', {
                        ...wait,
                        phase,
                        unattended,
                        captchaHelper,
                        engine: 'captcha-pass-v9'
                    });
                }
                const st = await getQueueState();
                const clearedTid = st?.captchaTabId || tabId;
                await uploadScreenshot(
                    applicationId,
                    thankYou ? 'after_submit' : 'captcha_cleared',
                    clearedTid,
                    { settleMs: 600, stayInApp }
                ).catch(() => {});
                await notify(
                    thankYou ? 'Lumi' : 'Bidder',
                    thankYou
                        ? 'SUCCESS — thank-you'
                        : (captchaHelper
                            ? 'Challenge cleared (NopeCHA/Buster) — continuing AFK fill'
                            : 'Challenge cleared — continuing fill')
                );
                try { await chrome.storage.session.remove('captchaUserFocusHoldUntil'); } catch (_) { /* ignore */ }
                await setQueueState({
                    status: 'running',
                    lastStatusEvent: thankYou ? 'marked_applied' : (st?.lastStatusEvent || 'captcha_cleared'),
                    lastStatusAt: Date.now(),
                    captchaKind: null,
                    captchaTabId: null,
                    captchaApplicationId: null,
                    captchaUnattended: null,
                    captchaHelper: null,
                    captchaHoldApply: null,
                    captchaJobUrl: null,
                    captchaTabMissing: false
                });
                if (stayInApp) await refocusStayInAppHome().catch(() => {});
                return { ...wait, kind };
            }
            if (wait.abandoned || wait.via === 'user_skip') {
                return abandonUnattended({ ...wait, via: wait.via || 'user_skip' });
            }
            if (wait.stopped) {
                return { ...wait, kind };
            }
            if (wait.tabClosed) {
                return abandonUnattended(wait);
            }
        }
        return abandonUnattended({ timeout: true });
}

const APPLY_LESSONS_KEY = 'bidderApplyLessons';
const ATS_CREDS_KEY = 'bidderAtsCredentials';

async function loadApplyLessons() {
    try {
        return (await chrome.storage.local.get([APPLY_LESSONS_KEY]))[APPLY_LESSONS_KEY] || [];
    } catch {
        return [];
    }
}

async function saveApplyLesson(lesson) {
    try {
        const cur = await loadApplyLessons();
        const next = upsertApplyLesson(cur, lesson);
        await chrome.storage.local.set({ [APPLY_LESSONS_KEY]: next });
        return next;
    } catch {
        return [];
    }
}

/** After SUCCESS, remember location free-text / instruct patterns for this host. */
async function watchLearnAfterSuccess(tabId, applicationId, meta = {}) {
    try {
        let host = '';
        try {
            const tab = await chrome.tabs.get(tabId);
            host = new URL(tab.url || '').hostname.replace(/^www\./i, '');
        } catch (_) { /* ignore */ }
        if (!host) return;
        let city = meta.city || meta.location || '';
        if (!city && applicationId) {
            try {
                const packed = await getBidderApplication(applicationId);
                const p = packed?.profile || {};
                city = [p.city, p.state, p.postal_code].filter(Boolean).join(', ');
            } catch (_) { /* ignore */ }
        }
        const lesson = {
            host,
            fieldKey: meta.fieldKey || 'location',
            issueKey: meta.issueKey || 'location|no_dropdown_match',
            instruction: meta.instruction || 'Type city, state and zip into Location',
            actions: meta.actions || {
                fills: city
                    ? [{ label: 'Location (city)', answer: city }]
                    : [],
                clickSubmit: true
            },
            ats: meta.ats || '',
            source: meta.source || 'auto_watch'
        };
        const existing = await fillLessonsForHost(host);
        if (!lesson.actions.fills?.length && existing[0]?.actions) {
            lesson.actions = existing[0].actions;
            lesson.fieldKey = existing[0].fieldKey || lesson.fieldKey;
            lesson.issueKey = existing[0].issueKey || lesson.issueKey;
        }
        if (!lesson.actions.fills?.length && !existing.length) return;
        await saveFillLesson(lesson);
        await saveBidderFillLesson({
            host: lesson.host,
            field_key: lesson.fieldKey,
            issue_key: lesson.issueKey,
            instruction: lesson.instruction,
            actions: lesson.actions,
            ats: lesson.ats,
            source: lesson.source
        }).catch(() => {});
        // Studying Engine: learn Policy answers from successful fill lessons
        try {
            const fills = Array.isArray(lesson.actions?.fills) ? lesson.actions.fills : [];
            for (const fill of fills) {
                const label = String(fill.label || fill.fieldLabel || '').trim();
                const answer = String(fill.answer || fill.value || '').trim();
                if (!label || !answer || answer.length > 160) continue;
                const kindGuess = (() => {
                    const h = label.toLowerCase();
                    if (/disabilit|ada\b/.test(h) && !/insurance/.test(h)) return 'disability_status';
                    if (/sponsor|visa/.test(h)) return 'requires_sponsorship';
                    if (/previous|former|worked for|employed/.test(h)) return 'previous_employer_no';
                    if (/background\s*check/.test(h)) return 'background_check_yes';
                    if (/non[\s-]*compete/.test(h)) return 'non_compete_no';
                    if (/salary|compensation/.test(h) && /comfortable|outlined|accept/.test(h)) {
                        return 'salary_comfort_yes';
                    }
                    return '';
                })();
                if (!kindGuess) continue;
                await upsertQuestionMemory({
                    kind: kindGuess,
                    question: label,
                    answer,
                    source: 'success',
                    knockout: ['disability_status', 'requires_sponsorship', 'previous_employer_no',
                        'background_check_yes', 'non_compete_no'].includes(kindGuess)
                }).catch(() => {});
            }
        } catch (_) { /* ignore */ }
        await setQueueState({
            coachStatus: `Learned — ${lesson.fieldKey} @ ${host}`,
            coachAt: Date.now()
        }).catch(() => {});
        await notify('Lumi', `Learned — ${lesson.fieldKey} @ ${host}`);
        if (applicationId) {
            await logCourseEvent(applicationId, 'fill_lesson_applied', {
                via: 'auto_watch',
                host,
                fieldKey: lesson.fieldKey
            }).catch(() => {});
        }
    } catch (err) {
        console.warn('[bidder] watch learn failed', err?.message || err);
    }
}

async function getOrCreateAtsPassword(host) {
    const h = String(host || '').replace(/^www\./i, '').toLowerCase();
    if (!h) return generateAtsPassword('lumi');
    try {
        const data = (await chrome.storage.local.get([ATS_CREDS_KEY]))[ATS_CREDS_KEY] || {};
        if (data[h]?.password) return data[h].password;
        const password = generateAtsPassword(h);
        data[h] = {
            password,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        await chrome.storage.local.set({ [ATS_CREDS_KEY]: data });
        return password;
    } catch {
        return generateAtsPassword(h);
    }
}

async function followApplyOpenedTab(openerTabId, beforeTabIds, waitMs = 5000) {
    const deadline = Date.now() + waitMs;
    while (Date.now() < deadline) {
        try {
            const tabs = await chrome.tabs.query({});
            const child = (tabs || []).find((t) => t?.openerTabId === openerTabId && t.id);
            if (child?.id) return child.id;
            const fresh = (tabs || []).find((t) => {
                if (!t?.id || beforeTabIds.has(t.id)) return false;
                const u = String(t.pendingUrl || t.url || '');
                return /\/apply|application|greenhouse|lever|ashby|workday|smartrecruiters|icims/i.test(u);
            });
            if (fresh?.id) return fresh.id;
        } catch (_) { /* ignore */ }
        await new Promise((r) => setTimeout(r, 400));
    }
    return null;
}

/**
 * Sign in to an existing ATS account. Never click Create / Sign up —
 * that opened a second Greenhouse login on top of the real apply form.
 */
async function tryCreateAtsAccount(tabId, profileEmail) {
    const email = String(profileEmail || '').trim();
    if (!email || !tabId) return { ok: false, reason: 'no_email' };
    try {
        let host = '';
        try {
            const tab = await chrome.tabs.get(tabId);
            host = new URL(tab.url || '').hostname.replace(/^www\./i, '');
        } catch (_) { /* ignore */ }
        const password = await getOrCreateAtsPassword(host);
        const [{ result }] = await chrome.scripting.executeScript({
            target: { tabId },
            func: (emailAddr, pass) => {
                const text = (document.body?.innerText || '').slice(0, 8000).toLowerCase();
                const formReady = !!(
                    document.querySelector('#first_name, [name="first_name"], input[autocomplete="given-name"]')
                    || document.querySelector('input#resume, input[name="resume"]')
                );
                if (formReady) {
                    return { ok: true, skipped: 'form_already_open', created: false };
                }
                const looksLogin = /\balready\s+have\s+an?\s+account\b|\bsign\s*in\b|\blog\s*in\b|\breturning\s+applicant\b/.test(text);
                const looksCreate = /\b(create\s+(an?\s+)?account|sign\s*up|register|set\s+a\s+password|confirm\s+password)\b/.test(text);
                const isVisible = (el) => {
                    if (!el) return false;
                    const r = el.getBoundingClientRect();
                    if (r.width < 2 || r.height < 2) return false;
                    const st = window.getComputedStyle(el);
                    return st.display !== 'none' && st.visibility !== 'hidden';
                };
                const passInputs = [...document.querySelectorAll('input[type="password"]')].filter(isVisible);
                if (!looksLogin && !looksCreate && passInputs.length < 1) {
                    return { ok: false, reason: 'not_auth_page', created: false };
                }
                const clickIf = (re) => {
                    const btn = [...document.querySelectorAll('button, input[type="submit"], a[role="button"], a')]
                        .find((el) => {
                            if (!isVisible(el)) return false;
                            const t = `${el.innerText || ''} ${el.value || ''}`.replace(/\s+/g, ' ').trim();
                            return re.test(t);
                        });
                    if (!btn) return false;
                    try { btn.click(); return true; } catch (_) { return false; }
                };
                if (looksLogin || looksCreate) {
                    clickIf(/\balready\s+have\s+an?\s+account\b|\bsign\s*in\b|\blog\s*in\b/i);
                }
                const fill = (el, val) => {
                    if (!el || !isVisible(el)) return false;
                    try {
                        el.focus();
                        el.value = val;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        return true;
                    } catch (_) {
                        return false;
                    }
                };
                const emailEl = [...document.querySelectorAll(
                    'input[type="email"], input[name*="email" i], input[autocomplete="email"], input[id*="email" i]'
                )].find(isVisible);
                const filledEmail = fill(emailEl, emailAddr);
                let filledPass = 0;
                for (const p of passInputs.slice(0, 1)) {
                    if (fill(p, pass)) filledPass += 1;
                }
                const signedIn = clickIf(/^(sign\s*in|log\s*in|continue|next)$/i);
                return {
                    ok: !!(filledEmail || filledPass || signedIn),
                    filledEmail,
                    filledPass,
                    clicked: signedIn,
                    created: false,
                    passFields: passInputs.length
                };
            },
            args: [email, password]
        });
        if (result?.ok) {
            await new Promise((r) => setTimeout(r, 1800));
            try { await waitTabComplete(tabId, 8000); } catch (_) { /* ignore */ }
        }
        return { ...(result || { ok: false }), host, passwordSaved: true, created: false };
    } catch (err) {
        return { ok: false, reason: err?.message || String(err), created: false };
    }
}

/**
 * Greenhouse (and similar) show JD + Apply above a long form.
 * Click Apply if present and scroll the real application fields into view
 * so fill + Live monitor screenshots show the form, not the job poster.
 * Also follows new tabs and can start ATS account creation.
 */
async function ensureApplyFormVisible(tabId, opts = {}) {
    try {
        await ensureScripts(tabId);
        let host = '';
        let beforeIds = new Set();
        try {
            const tab = await chrome.tabs.get(tabId);
            host = new URL(tab.url || '').hostname.replace(/^www\./i, '');
            beforeIds = new Set((await chrome.tabs.query({})).map((t) => t.id).filter(Boolean));
        } catch (_) { /* ignore */ }
        const lessons = lessonsForHost(await loadApplyLessons(), host)
            .map((l) => ({ selector: l.selector, label: l.label }))
            .slice(0, 8);

        const [{ result }] = await chrome.scripting.executeScript({
            target: { tabId },
            func: (learned) => {
                const normalize = (t) => (t || '').replace(/\s+/g, ' ').trim();
                const visible = (el) => {
                    if (!el) return false;
                    const r = el.getBoundingClientRect();
                    if (r.width < 2 || r.height < 2) return false;
                    const st = window.getComputedStyle(el);
                    return st.visibility !== 'hidden' && st.display !== 'none' && st.opacity !== '0';
                };
                const isApplyLabel = (raw) => {
                    const t = normalize(raw);
                    if (!t || t.length > 72) return false;
                    if (/withdraw|cancel|delete|unsubscribe|share|save\s*job|sign\s*in|log\s*in|decline|accept\s*cookie|already\s*applied/i.test(t)) {
                        return false;
                    }
                    if (/^(apply|apply\s*now|apply\s*online|apply\s*for\s*this\s*job(?:\s*online)?|apply\s*for\s*this\s*position|apply\s*for\s*this\s*role|start\s*application|begin\s*application|continue\s*application)$/i.test(t)) {
                        return true;
                    }
                    if (/^apply\b/i.test(t) && t.length <= 48) return true;
                    if (/\bapply\s+for\s+this\s+job\b/i.test(t) && t.length <= 56) return true;
                    if (/\bapply\s+online\b/i.test(t) && t.length <= 40) return true;
                    return false;
                };
                const scoreLabel = (raw) => {
                    const t = normalize(raw).toLowerCase();
                    if (!isApplyLabel(t)) return 0;
                    let score = 10;
                    if (/apply for this job online/.test(t)) score += 20;
                    else if (/apply for this job/.test(t)) score += 16;
                    else if (/apply now|apply online/.test(t)) score += 12;
                    else if (/^apply$/.test(t)) score += 8;
                    if (/start application|begin application/.test(t)) score += 10;
                    return score;
                };

                // Cookie / consent banners often sit over Apply
                const consent = [...document.querySelectorAll(
                    'button, a, [role="button"], input[type="button"]'
                )].find((el) => {
                    if (!visible(el)) return false;
                    const t = normalize(el.innerText || el.textContent || el.value || '');
                    return /^(accept( all)?( cookies)?|allow( all)?( cookies)?|agree|i agree|got it|ok)$/i.test(t);
                });
                if (consent) {
                    try { consent.click(); } catch (_) { /* ignore */ }
                }

                // Prefer learned selectors for this ATS host first.
                let apply = null;
                let applyLabel = '';
                let applySelector = '';
                for (const lesson of (learned || [])) {
                    if (!lesson?.selector) continue;
                    try {
                        const el = document.querySelector(lesson.selector);
                        if (el && visible(el)) {
                            apply = el;
                            applyLabel = lesson.label || normalize(el.innerText || el.value || '');
                            applySelector = lesson.selector;
                            break;
                        }
                    } catch (_) { /* ignore */ }
                }

                if (!apply) {
                    const applyCandidates = [...document.querySelectorAll(
                        'button, a, [role="button"], input[type="button"], input[type="submit"], '
                        + '[data-automation-id*="apply" i], [class*="apply" i]'
                    )];
                    let bestScore = 0;
                    for (const el of applyCandidates) {
                        if (!visible(el)) continue;
                        const t = normalize(
                            el.innerText || el.textContent || el.value
                            || el.getAttribute('aria-label') || el.getAttribute('title') || ''
                        );
                        const sc = scoreLabel(t);
                        if (sc > bestScore) {
                            bestScore = sc;
                            apply = el;
                            applyLabel = t;
                            applySelector = el.id
                                ? `#${el.id}`
                                : (el.getAttribute('data-qa')
                                    ? `[data-qa="${el.getAttribute('data-qa')}"]`
                                    : '');
                        }
                    }
                    if (!apply) {
                        apply = document.querySelector(
                            '#apply_button, .application--button, [data-qa="btn-apply"], '
                            + '[data-automation-id="adventureButton"], [data-automation-id="applyButton"], '
                            + 'a[href*="#app"], a[href*="application"], a[href*="/apply"], button[aria-label*="Apply" i]'
                        );
                        if (apply && visible(apply)) {
                            applyLabel = normalize(
                                apply.innerText || apply.value || apply.getAttribute('aria-label') || 'Apply'
                            );
                        } else {
                            apply = null;
                        }
                    }
                }

                const formAlreadyOpen = !!(
                    document.querySelector('#first_name, [name="first_name"], input[autocomplete="given-name"]')
                    || document.querySelector('input#resume, input[name="resume"]')
                    || document.querySelector('#application-form, form#application-form, #greenhouse-job-application')
                );
                const applyFound = !!(apply && visible(apply));
                let clicked = false;
                // Form is already on this page — do not click Apply (opens login/create walls).
                if (applyFound && !formAlreadyOpen) {
                    try {
                        apply.scrollIntoView({ block: 'center', behavior: 'instant' });
                    } catch (_) { /* ignore */ }
                    try {
                        apply.focus?.();
                        apply.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
                        apply.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
                        apply.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                        apply.click();
                        clicked = true;
                    } catch (_) {
                        try { apply.click(); clicked = true; } catch (__) { /* ignore */ }
                    }
                }
                const form =
                    document.querySelector(
                        '#application-form, form#application-form, #greenhouse-job-application, '
                        + '#application, form[action*="application"], #apply_app, '
                        + '[data-provides="application-form"], .application--form, form#apply_form, '
                        + '[data-automation-id="applyFlowPage"], [data-automation-id="createAccountPage"]'
                    )
                    || document.querySelector(
                        '#first_name, [name="first_name"], input[autocomplete="given-name"], '
                        + 'input[type="email"], input[name="email"], input[autocomplete="email"]'
                    );
                if (form) {
                    try {
                        form.scrollIntoView({ block: 'start', behavior: 'instant' });
                    } catch (_) {
                        try { form.scrollIntoView(true); } catch (__) { /* ignore */ }
                    }
                }
                const first = document.querySelector(
                    '#first_name, [name="first_name"], input[autocomplete="given-name"], '
                    + 'input[type="email"][name="email"], input[name="job_application[first_name]"]'
                );
                const r = first?.getBoundingClientRect();
                const fieldCount = document.querySelectorAll(
                    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea'
                ).length;
                const pageText = (document.body?.innerText || '').slice(0, 4000).toLowerCase();
                const createAccountLikely = /\b(create\s+(an?\s+)?account|sign\s*up|register|confirm\s+password)\b/.test(pageText);
                return {
                    clicked,
                    applyFound,
                    applyLabel,
                    applySelector,
                    formAlreadyOpen,
                    consentClicked: !!consent,
                    scrolled: !!form,
                    firstInView: !!(r && r.top >= -40 && r.top < (window.innerHeight || 800) * 0.9),
                    hasFirstName: !!document.querySelector('#first_name, [name="first_name"], input[autocomplete="given-name"]'),
                    fieldCount,
                    createAccountLikely,
                    scrollY: window.scrollY || 0,
                    href: String(location.href || '')
                };
            },
            args: [lessons]
        });

        await new Promise((r) => setTimeout(r, clickedDelay(result)));
        let activeTabId = tabId;
        if (result?.clicked) {
            const childId = await followApplyOpenedTab(tabId, beforeIds, 4500);
            if (childId && childId !== tabId) {
                activeTabId = childId;
                try {
                    await chrome.tabs.update(activeTabId, { active: true });
                } catch (_) { /* ignore */ }
                await setQueueState({ currentTabId: activeTabId }).catch(() => {});
            }
            try {
                await waitTabComplete(activeTabId, 10000);
            } catch (_) { /* ignore */ }
            await new Promise((r) => setTimeout(r, 900));
            try { await ensureScripts(activeTabId); } catch (_) { /* ignore */ }

            // Account wall after Apply — create with saved/generated password.
            if (opts.profileEmail) {
                try {
                    const [{ result: probe }] = await chrome.scripting.executeScript({
                        target: { tabId: activeTabId },
                        func: () => (document.body?.innerText || '').slice(0, 6000)
                    });
                    if (
                        looksLikeLoginPage(probe)
                        || looksLikeCreateAccountPage(probe)
                        || result?.createAccountLikely
                    ) {
                        const signed = await tryCreateAtsAccount(activeTabId, opts.profileEmail);
                        result.accountCreate = signed;
                        if (signed?.ok) {
                            await logCourseEvent(opts.applicationId, 'ats_account_signin', {
                                host,
                                clicked: !!signed.clicked,
                                filledEmail: !!signed.filledEmail,
                                created: false
                            }).catch(() => {});
                        }
                    }
                } catch (_) { /* ignore */ }
            }
        }

        // Second pass after Apply click / SPA paint — re-scroll form into view.
        if (result?.clicked || !result?.firstInView) {
            try {
                const [{ result: again }] = await chrome.scripting.executeScript({
                    target: { tabId: activeTabId },
                    func: () => {
                        const form = document.querySelector(
                            '#application-form, form#application-form, #greenhouse-job-application, '
                            + '#application, #first_name, [name="first_name"], input[type="email"], '
                            + '[data-automation-id="applyFlowPage"], [data-automation-id="createAccountPage"]'
                        );
                        if (form) {
                            try { form.scrollIntoView({ block: 'start', behavior: 'instant' }); }
                            catch (_) { try { form.scrollIntoView(true); } catch (__) { /* ignore */ } }
                        }
                        const first = document.querySelector('#first_name, [name="first_name"], input[type="email"]');
                        const r = first?.getBoundingClientRect();
                        return {
                            scrolled: !!form,
                            firstInView: !!(r && r.top >= -40 && r.top < (window.innerHeight || 800) * 0.9),
                            hasFirstName: !!document.querySelector('#first_name, [name="first_name"]'),
                            scrollY: window.scrollY || 0,
                            href: String(location.href || '')
                        };
                    }
                });
                return {
                    ...(result || {}),
                    ...(again || {}),
                    clicked: !!result?.clicked,
                    tabId: activeTabId,
                    followedNewTab: activeTabId !== tabId
                };
            } catch (_) { /* ignore */ }
        }
        return {
            ...(result || { clicked: false, scrolled: false }),
            tabId: activeTabId,
            followedNewTab: activeTabId !== tabId
        };
    } catch (err) {
        console.warn('[bidder] ensureApplyFormVisible', err);
        return { clicked: false, scrolled: false, error: err?.message };
    }
}

function clickedDelay(result) {
    return result?.clicked ? 2200 : 400;
}

async function recheckFormAfterCaptcha(tabId, formWaitMs = BIDDER_DEFAULTS.formWaitMs) {
    try {
        await ensureScripts(tabId);
        const detect2 = await chrome.tabs.sendMessage(tabId, { type: 'DETECT_APPLY_FORM' });
        if (detect2?.ok && detect2.data?.ok) return true;
    } catch (_) { /* loading */ }

    const extraDeadline = Date.now() + formWaitMs;
    while (Date.now() < extraDeadline) {
        await new Promise((r) => setTimeout(r, 800));
        try {
            const d3 = await chrome.tabs.sendMessage(tabId, { type: 'DETECT_APPLY_FORM' });
            if (d3?.ok && d3.data?.ok) return true;
        } catch (_) { /* loading */ }
    }
    return false;
}

async function runBidderFillOnTab(tabId, item, prefs) {
    await acquireFillLock();
    try {
        return await runBidderFillOnTabInner(tabId, item, prefs);
    } finally {
        await clearFillLock();
    }
}

async function prepareBidderApplicationFiles(tabId, item, app, prefs, profile = {}) {
    await ensureScripts(tabId);
    let resumeFile = null;
    const resumeName = app.resume_filename || item.resume_filename;
    const settings = await getSettings();
    if (resumeName) {
        const profileHint = {
            first_name: profile.first_name || profile.firstName || app.first_name || item.first_name || prefs?.first_name,
            last_name: profile.last_name || profile.lastName || app.last_name || item.last_name || prefs?.last_name,
            preferred_name: profile.preferred_name || app.preferred_name || item.preferred_name
        };
        // Prefer names from cached profiles list when application payload lacks them.
        if (!profileHint.first_name || !profileHint.last_name) {
            try {
                const profiles = await listProfiles(settings.apiBaseUrl, settings.token);
                const pid = app.profile_id || item.profile_id || settings.selectedProfileId;
                const p = (profiles || []).find((x) => String(x.id) === String(pid));
                if (p) {
                    profileHint.first_name = profileHint.first_name || p.first_name;
                    profileHint.last_name = profileHint.last_name || p.last_name;
                }
            } catch (_) { /* ignore */ }
        }
        resumeFile = await fetchResumeBase64(settings.apiBaseUrl, resumeName, settings.token, {
            profile: profileHint,
            uploadFilename: app.resume_upload_filename || item.resume_upload_filename || null
        }).catch(() => null);
        if (resumeFile) {
            resumeFile.profile = profileHint;
            resumeFile.applicationId = item.id || app.id || null;
            const saved = await downloadResumeToCvLibrary(
                resumeFile,
                profileHint,
                resumeFile.applicationId
            ).catch((err) => {
                console.warn('[bidder] local CV library download', err);
                return null;
            });
            if (saved?.path) {
                resumeFile.localPath = saved.path;
                resumeFile.localRelPath = saved.relPath;
            }
        }
    }
    const detect = await chrome.tabs.sendMessage(tabId, { type: 'DETECT_APPLY_FORM' }).catch(() => null);
    const formSnap = detect?.data?.form || { fileInputs: [] };
    const coverLetterFile = await maybePrepareCoverLetterFile({
        form: formSnap,
        profileId: app.profile_id || item.profile_id,
        jobDescription: app.job_description || '',
        resumeHtml: app.draft_html || '',
        companyName: app.company_name || item.company_name || '',
        jobRole: app.job_role || item.job_role || '',
        settings,
        uploadCoverLetter: !!prefs.uploadCoverLetter
    });
    return { resumeFile, coverLetterFile, formSnap, settings };
}

function mapBidderQuestions(rawQuestions) {
    return (rawQuestions || []).map((q) => ({
        id: q.id,
        label: q.label,
        kind: q.kind,
        type: q.type,
        required: !!q.required,
        value: q.value ?? q.answer ?? '',
        answer: q.answer ?? q.value ?? '',
        answer_type: q.kind === 'salary' || q.answer_type === 'salary'
            ? 'salary'
            : (Array.isArray(q.options) && q.options.length ? 'choice' : (q.answer_type || 'written')),
        options: Array.isArray(q.options)
            ? q.options.map((o) => (typeof o === 'string' ? o : (o?.label || o?.value || ''))).filter(Boolean)
            : undefined
    })).filter((q) => q.label || q.id);
}

function mergeBidderQuestions(...lists) {
    const out = [];
    const seen = new Set();
    for (const list of lists) {
        for (const q of list || []) {
            const lab = String(q.label || '').replace(/\s+/g, ' ').trim().toLowerCase();
            const key = `${String(q.id || '')}::${lab}`;
            if (!lab && !q.id) continue;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(q);
        }
    }
    return out;
}

async function loadBidderQuestions(tabId, { ats, applyUrl, tabUrl, formSnap } = {}) {
    let collected = null;
    let snap = formSnap || null;
    try {
        const richest = await collectRichestApplySnap(tabId);
        collected = richest?.engine || collected;
        if (!snap || !Array.isArray(snap.questions) || !snap.questions.length) {
            snap = richest?.form || snap;
        }
    } catch (_) { /* ignore */ }
    if (!collected) {
        try {
            collected = await sendTabMessage(tabId, { type: 'BIDDER_ENGINE_COLLECT' });
        } catch (_) {
            collected = null;
        }
    }
    const needFormSnap = !snap || !Array.isArray(snap.questions) || !snap.questions.length;
    if (needFormSnap) {
        snap = await collectForm(tabId).catch(() => snap);
    }
    const fieldQs = mapBidderQuestions(
        (collected?.fields || snap?.fields || []).map(panelQuestionFromField).filter(Boolean)
    );
    const engineQs = mapBidderQuestions(collected?.questions || []);
    const formQs = mapBidderQuestions(snap?.questions || []);
    const questions = mergeBidderQuestions(engineQs, formQs, fieldQs);
    const ghUrl = /greenhouse\.io/i.test(String(applyUrl || tabUrl || ''));
    const softHandoff = !!(
        collected
        && !collected.ok
        && (collected.useAutofill || /greenhouse[_-]?only|use_autofill/i.test(String(collected.reason || '')))
        && !ghUrl
    );
    return { collected, questions, formSnap: snap, softHandoff };
}

async function setAutofillPanelStatus(tabId, status, progress = null) {
    try {
        await sendTabMessage(tabId, {
            type: 'UPDATE_AUTOFILL_PANEL',
            status: String(status || '').slice(0, 120),
            progress: progress == null ? undefined : progress
        });
    } catch (_) { /* panel may not exist yet */ }
}

async function generateBidderAnswersForItem(item, app, questions, engineLabel, budgetMs = 50000) {
    if (!questions.length) return [];
    const cacheKey = aiAnswersCacheKey({
        applicationId: item.id || app.id,
        url: item.open_url || item.job_url || app.job_url,
        profileId: app.profile_id || item.profile_id
    });
    const cached = await getCachedAiAnswers(cacheKey);
    if (cached?.answers?.length) {
        await logCourseEvent(item.id, 'bidder_answers_reused', {
            engine: engineLabel,
            count: cached.answers.length,
            questions: questions.length,
            cached: true
        }).catch(() => {});
        return cached.answers;
    }
    const answersStartedAt = Date.now();
    const requested = Number(budgetMs);
    // Always give Groq enough time — empty essays are worse than a few extra seconds.
    const ANSWERS_BUDGET_MS = Math.min(
        40000,
        Math.max(25000, Number.isFinite(requested) ? requested : 30000)
    );
    const profileId = app.profile_id || item.profile_id;
    if (!profileId) {
        await logCourseEvent(item.id, 'ai_failed', {
            error: 'missing_profile_id',
            engine: engineLabel,
            questions: questions.length,
            duration_ms: 0
        }).catch(() => {});
        return [];
    }
    const payload = {
        profile_id: profileId,
        job_description: app.job_description || '',
        resume_html: app.draft_html || '',
        questions,
        company_name: app.company_name || item.company_name || '',
        job_role: app.job_role || item.job_role || '',
        application_id: item.id
    };
    try {
        let brain = null;
        try {
            brain = await Promise.race([
                generateBidderAnswers(payload),
                new Promise((_, reject) => {
                    setTimeout(
                        () => reject(new Error(`AI answers timed out after ${Math.round(ANSWERS_BUDGET_MS / 1000)}s — continuing with profile fill`)),
                        ANSWERS_BUDGET_MS
                    );
                })
            ]);
        } catch (brainErr) {
            console.warn('[bidder] brain answers failed; trying generate-answers', brainErr);
            brain = await Promise.race([
                generateAnswers({ ...payload, answers_provider: 'groq' }),
                new Promise((_, reject) => {
                    setTimeout(
                        () => reject(brainErr),
                        Math.max(12000, ANSWERS_BUDGET_MS - (Date.now() - answersStartedAt))
                    );
                })
            ]);
        }
        const answers = brain.answers || [];
        await setCachedAiAnswers(cacheKey, { answers, skipped: brain.skipped || [], profile: brain.profile || {} });
        await logCourseEvent(item.id, brain.reused && !brain.generated_count
            ? 'bidder_answers_reused'
            : 'bidder_answers_ready', {
            engine: brain.engine_version || engineLabel,
            count: answers.length,
            questions: questions.length,
            duration_ms: Date.now() - answersStartedAt,
            memory_hits: brain.memory_hits || answers.filter((a) => a?.match_source === 'question_memory').length,
            studying: !!brain.studying,
            reused: !!brain.reused,
            reused_count: brain.reused_count || 0,
            generated_count: brain.generated_count != null
                ? brain.generated_count
                : (brain.reused && brain.provider === 'cache' ? 0 : answers.length),
            provider: brain.provider || null,
            meta: brain.bidder_meta || null
        });
        // Persist immediately so skip / rebid can reuse without another LLM call.
        if (answers.length) {
            await savePackage(item.id, answers, {
                reason: 'bidder_answers_ready',
                count: answers.length,
                reused: !!brain.reused,
                provider: brain.provider || null
            }).catch(() => {});
        }
        // Simplify-style: capture questions + answers for popup review / edit.
        await saveCapturedQuestionsPack({
            applicationId: item.id,
            company: app.company_name || item.company_name || '',
            jobRole: app.job_role || item.job_role || '',
            url: item.open_url || '',
            questions,
            answers
        }).catch(() => {});
        // Persist Policy labels into question memory so the next bid studies them.
        try {
            for (const a of answers) {
                const lane = String(a?.lane || '');
                const src = String(a?.match_source || a?.source || '');
                if (lane !== 'policy' && !/hard_lock|question_memory|regex|fixed/.test(src)) continue;
                const label = String(a.label || '').trim();
                const answer = String(a.answer || '').trim();
                if (!label || !answer || answer.length > 160) continue;
                await upsertQuestionMemory({
                    kind: a.kind || undefined,
                    question: label,
                    answer,
                    source: 'success',
                    knockout: !!a.knockout
                }).catch(() => {});
            }
        } catch (_) { /* ignore */ }
        return answers;
    } catch (err) {
        await logCourseEvent(item.id, 'ai_failed', {
            error: err?.message,
            engine: engineLabel,
            questions: questions.length,
            duration_ms: Date.now() - answersStartedAt
        });
        await notify('Bidder', `AI answers failed — continuing profile fill: ${err?.message || err}`);
        return [];
    }
}

async function runAutofillEngineOnTab(tabId, item, prefs, ctx) {
    const {
        profile,
        payload,
        app,
        answers: seedAnswers,
        ats,
        engineLabel,
        filePayload
    } = ctx;

    const stayInApp = prefs.stayInApp !== false;
    const shotOpts = (extra = {}) => ({ stayInApp, ...extra });
    const pageLimit = maxPagesForAts(ats);
    const pageSettleMs = settleMsForAts(ats);
    const bidLimitMs = Number(prefs?.bidLimitMs) || bidLimitMsForAts(ats, { pageCount: pageLimit });
    const bidDeadline = Number(prefs?.bidDeadline) || (Date.now() + bidLimitMs);
    let answers = Array.isArray(seedAnswers) ? [...seedAnswers] : [];
    // Prefer early lessons queued before fill (wins over AI via merge priority).
    if (Array.isArray(prefs?.earlyFillLessons) && prefs.earlyFillLessons.length) {
        answers = mergeAnswers(answers, lessonFillsToAnswers(prefs.earlyFillLessons, 'fill_lesson_early'));
        if (prefs.earlyFillLessonMeta) {
            await logCourseEvent(item.id, 'fill_lesson_applied', {
                ...prefs.earlyFillLessonMeta,
                fill_count: prefs.earlyFillLessons.length,
                phase: 'early_merge'
            }).catch(() => {});
        }
    }
    let totalFilled = 0;
    let totalUploaded = 0;
    let pages = 0;
    let lastFp = '';
    let submitClicked = false;
    let lastFillResp = null;
    let lastRequiredComplete = null;
    let lastRequiredOk = null;
    let lastRequiredTotal = null;
    let lastMissingRequired = [];
    let budgetExceeded = false;

    await logCourseEvent(item.id, 'autofill_engine', {
        ats,
        engine: engineLabel || engineLabelForAts(ats),
        version: AUTOFILL_ENGINE,
        maxPages: pageLimit,
        settleMs: pageSettleMs,
        bidLimitMs
    });

    // Keep Live monitor + Open-tab wired to THIS apply tab for the whole autofill run.
    try {
        const tab = await chrome.tabs.get(tabId);
        const tabUrl = tab?.pendingUrl || tab?.url || '';
        await setQueueState({
            currentTabId: tabId,
            currentId: item.id,
            currentJobUrl: tabUrl || undefined
        });
    } catch (_) {
        await setQueueState({ currentTabId: tabId, currentId: item.id });
    }

    while (pages < pageLimit) {
        if (Date.now() > bidDeadline) {
            budgetExceeded = true;
            await logCourseEvent(item.id, 'bid_budget_exceeded', {
                phase: 'autofill_page_loop',
                page: pages,
                limitMs: bidLimitMs
            });
            break;
        }
        pages += 1;

        // CAPTCHA / login gate before each page fill (blocking walls only — not sitekey widgets)
        const wall = await detectCaptchaOrLogin(tabId);
        if (isBlockingCaptchaWall(wall, { formReady: true })) {
            const wait = await runCaptchaPassEngine({
                tabId,
                applicationId: item.id,
                prefs,
                wall,
                phase: `autofill_page_${pages}`,
                companyLabel: item.company_name || app.company_name || 'Job'
            });
            if (!wait.cleared) {
                throw new Error(
                    wait.stopped
                        ? 'stopped'
                        : wait.timeout
                            ? 'captcha_not_cleared'
                            : 'captcha_needs_manual'
                );
            }
        }

        // Wait for SPA fields to mount. Pre-NEXT used 6×500ms until ANY fields —
        // the 150ms identity gate filled Greenhouse before react-select/#resume existed.
        let formSnap = null;
        const formReadyTries = ats === 'greenhouse' ? 12 : 8;
        const formReadyGap = ats === 'greenhouse' ? 500 : 350;
        for (let readyTry = 0; readyTry < formReadyTries; readyTry++) {
            formSnap = await collectForm(tabId).catch(() => null);
            if (formSnap?.blocked) {
                throw new Error(formSnap.reason || 'Site blocked');
            }
            const n = formFieldCount(formSnap);
            if (n > 0 && (formHasUsableFields(formSnap, 2) || formFingerprint(formSnap))) {
                if (ats === 'greenhouse' && n < 6 && readyTry < 4) {
                    await new Promise((r) => setTimeout(r, formReadyGap));
                    continue;
                }
                break;
            }
            await new Promise((r) => setTimeout(r, formReadyGap));
        }
        const fp = formFingerprint(formSnap);
        // lastFp = page we already filled. Do NOT set lastFp to the destination
        // after Next — that skips fill+AI on page 2 (fp === lastFp && pages > 1).
        if (fp && fp === lastFp && pages > 1) {
            // Same fingerprint as the page we just filled — Next did not advance.
            break;
        }

        // Fresh questions on later pages → AI only when budget remains (≥12s).
        const pageQuestions = mapBidderQuestions(formSnap?.questions || []);
        const freshQs = pickNewQuestions(pageQuestions, answers);
        const remainingMs = bidDeadline - Date.now();
        if (freshQs.length && remainingMs >= 12000) {
            const more = await generateBidderAnswersForItem(
                item,
                app,
                freshQs,
                engineLabel || engineLabelForAts(ats),
                Math.min(30000, remainingMs - 5000)
            );
            answers = mergeAnswers(answers, more);
        } else if (freshQs.length) {
            await logCourseEvent(item.id, 'ai_skipped_budget', {
                page: pages,
                fresh: freshQs.length,
                remainingMs
            });
        }

        void uploadScreenshot(item.id, `autofill_page_${pages}_before`, tabId, shotOpts({ settleMs: 0 }))
            .catch(() => {});

        let fillResp = null;
        let fillErr = null;
        for (let attempt = 1; attempt <= AUTOFILL_RETRY_PER_PAGE; attempt++) {
            try {
                fillResp = await fillAndUpload(tabId, {
                    ...filePayload,
                    profile: { ...profile, ...payload.profile },
                    answers,
                    jobDescription: app.job_description || '',
                    // v3: always fill profile + answers on every page.
                    // answersOnly only on final submit polish.
                    autoSubmit: false,
                    answersOnly: useAnswersOnlyOnPage(pages),
                    engine: AUTOFILL_ENGINE
                });
                fillErr = null;
                // Post-fill re-collect: catch conditional fields that mounted mid-fill.
                await new Promise((r) => setTimeout(r, 200));
                const postForm = await collectForm(tabId).catch(() => null);
                const postQs = mapBidderQuestions(postForm?.questions || []);
                const postFresh = pickNewQuestions(postQs, answers);
                if (postFresh.length && (bidDeadline - Date.now()) >= 8000) {
                    const morePost = await generateBidderAnswersForItem(
                        item,
                        app,
                        postFresh,
                        engineLabel || engineLabelForAts(ats),
                        Math.min(25000, bidDeadline - Date.now() - 4000)
                    );
                    answers = mergeAnswers(answers, morePost);
                    fillResp = await fillAndUpload(tabId, {
                        ...filePayload,
                        profile: { ...profile, ...payload.profile },
                        answers,
                        jobDescription: app.job_description || '',
                        autoSubmit: false,
                        answersOnly: false,
                        skipFiles: true,
                        engine: AUTOFILL_ENGINE
                    }).catch(() => fillResp);
                }
                const refillForm = postForm || formSnap;
                if (
                    shouldRefillPage({
                        form: refillForm,
                        fillStats: {
                            filled: fillResp.fillStats?.filled || 0,
                            uploaded: fillResp.uploadStats?.uploaded || 0
                        },
                        attempt,
                        maxAttempts: AUTOFILL_RETRY_PER_PAGE
                    })
                    || (postFresh.length > 0 && attempt < AUTOFILL_RETRY_PER_PAGE)
                ) {
                    await logCourseEvent(item.id, 'fill_retry', {
                        engine: AUTOFILL_ENGINE,
                        page: pages,
                        attempt,
                        reason: postFresh.length ? 'new_questions' : 'low_coverage',
                        filled: fillResp.fillStats?.filled || 0,
                        fields: formFieldCount(refillForm),
                        fresh: postFresh.length
                    });
                    await new Promise((r) => setTimeout(r, 700));
                    continue;
                }
                break;
            } catch (err) {
                fillErr = err;
                await logCourseEvent(item.id, 'fill_retry', {
                    engine: AUTOFILL_ENGINE,
                    page: pages,
                    attempt,
                    error: err?.message
                });
                await new Promise((r) => setTimeout(r, 900));
            }
        }
        if (fillErr) throw fillErr;
        lastFillResp = fillResp;
        // Record fingerprint of the page we just filled (not the Next destination).
        lastFp = fp || lastFp;

        totalFilled += fillResp.fillStats?.filled || 0;
        totalUploaded += fillResp.uploadStats?.uploaded || 0;
        if (fillResp.fillStats && typeof fillResp.fillStats.requiredComplete === 'boolean') {
            const merged = normalizeFillStats({
                ...fillResp.fillStats,
                uploaded: fillResp.uploadStats?.uploaded,
                uploadedResume: fillResp.uploadStats?.uploadedResume
                    ?? fillResp.fillStats.uploadedResume
            });
            lastRequiredComplete = merged.requiredComplete;
            lastRequiredOk = merged.requiredOk;
            lastRequiredTotal = merged.requiredTotal;
            lastMissingRequired = merged.missingRequired;
        }

        await uploadScreenshot(item.id, `autofill_page_${pages}_after`, tabId, shotOpts({ settleMs: 600 }))
            .catch(() => {});

        await logCourseEvent(item.id, 'autofill_page', {
            engine: AUTOFILL_ENGINE,
            ats,
            page: pages,
            filled: fillResp.fillStats?.filled || 0,
            uploaded: fillResp.uploadStats?.uploaded || 0,
            requiredComplete: fillResp.fillStats?.requiredComplete,
            requiredOk: fillResp.fillStats?.requiredOk,
            requiredTotal: fillResp.fillStats?.requiredTotal,
            missing: fillResp.fillStats?.missingRequired || [],
            fingerprint: fp ? fp.slice(0, 120) : null
        });

        // Try Next / Continue for multi-step ATS (Workday, Oracle, etc.)
        const beforeNextFp = fp;
        const clickedNext = await clickFormNextIfAny(tabId);
        if (!clickedNext) {
            break;
        }

        await new Promise((r) => setTimeout(r, pageSettleMs));
        let afterForm = await collectForm(tabId).catch(() => null);
        let afterFp = formFingerprint(afterForm);
        if (!shouldAdvancePage({
            clickedNext: true,
            fingerprintBefore: beforeNextFp,
            fingerprintAfter: afterFp,
            pages,
            maxPages: pageLimit
        })) {
            // SPA still painting — retry settle once before giving up.
            await new Promise((r) => setTimeout(r, pageSettleMs));
            afterForm = await collectForm(tabId).catch(() => null);
            afterFp = formFingerprint(afterForm);
            if (!shouldAdvancePage({
                clickedNext: true,
                fingerprintBefore: beforeNextFp,
                fingerprintAfter: afterFp,
                pages,
                maxPages: pageLimit
            })) {
                break;
            }
        }
        // Do NOT set lastFp = afterFp here — next loop must fill the new page.
        // Continue loop for next page fill
    }

    // Do not treat a wall-clock stop as a normal FILLED / submit path.
    if (budgetExceeded) {
        throw new Error('bid_time_budget_exceeded');
    }

    // Final submit pass if enabled
    if (prefs.autoSubmit) {
        // Auto-apply matching fill lessons for this host before submit / when incomplete.
        try {
            let host = '';
            try {
                const tab = await chrome.tabs.get(tabId);
                host = new URL(tab.url || '').hostname.replace(/^www\./i, '');
            } catch (_) { /* ignore */ }
            if (host) {
                let disabledMap = {};
                try {
                    const p = await getBidderPrefs();
                    disabledMap = p?.disabledFillLessons && typeof p.disabledFillLessons === 'object'
                        ? p.disabledFillLessons
                        : {};
                } catch (_) {
                    disabledMap = {};
                }
                const local = await fillLessonsForHost(host);
                let remote = [];
                try {
                    const pack = await listBidderFillLessons({ host });
                    remote = Array.isArray(pack?.lessons) ? pack.lessons : [];
                } catch (_) { /* ignore */ }
                const merged = [...local, ...remote].filter((les) => {
                    const key = `${host}|${les.fieldKey || les.field_key || 'form'}|${les.issueKey || les.issue_key || ''}`;
                    return !disabledMap[key];
                });
                const missBlob = (lastMissingRequired || []).join(' ').toLowerCase();
                const wantLoc = /location|city/.test(missBlob) || lastRequiredComplete === false;
                let lesson = matchFillLesson(merged, {
                    fieldKey: wantLoc ? 'location' : undefined,
                    issueKey: wantLoc ? 'location|no_dropdown_match' : undefined
                });
                if (!lesson) {
                    lesson = merged.find((l) => Array.isArray(l?.actions?.fills) && l.actions.fills.length)
                        || (merged.length === 1 ? merged[0] : null);
                }
                const fills = Array.isArray(lesson?.actions?.fills) ? lesson.actions.fills : [];
                if (fills.length) {
                    const lessonAnswers = lessonFillsToAnswers(fills, 'fill_lesson');
                    answers = mergeAnswers(answers, lessonAnswers);
                    await fillAndUpload(tabId, {
                        ...filePayload,
                        profile: { ...profile, ...payload.profile },
                        answers: lessonAnswers,
                        jobDescription: app.job_description || '',
                        autoSubmit: false,
                        answersOnly: true,
                        engine: AUTOFILL_ENGINE
                    }).catch(() => null);
                    await logCourseEvent(item.id, 'fill_lesson_applied', {
                        host,
                        fieldKey: lesson.fieldKey || lesson.field_key,
                        issueKey: lesson.issueKey || lesson.issue_key,
                        source: lesson.source || 'local',
                        fill_count: fills.length,
                        phase: 'pre_submit'
                    }).catch(() => {});
                    await notify('Lumi', `Lesson applied — ${lesson.fieldKey || 'form'} @ ${host}`);
                    await setQueueState({
                        coachStatus: `Using lesson — ${lesson.fieldKey || 'form'} @ ${host}`,
                        coachAt: Date.now()
                    }).catch(() => {});
                    // Refresh required completeness after lesson
                    try {
                        const re = await sendTabMessage(tabId, { type: 'BIDDER_ENGINE_COLLECT' });
                        if (re && re.requiredComplete != null) {
                            lastRequiredComplete = !!re.requiredComplete;
                            lastRequiredOk = re.requiredOk;
                            lastRequiredTotal = re.requiredTotal;
                            lastMissingRequired = re.missingRequired || lastMissingRequired;
                        }
                    } catch (_) { /* ignore */ }
                }
            }
        } catch (lessonErr) {
            console.warn('[bidder] fill lesson apply failed', lessonErr?.message || lessonErr);
        }

        const requiredBlocked = isFillIncomplete({
            requiredComplete: lastRequiredComplete,
            requiredOk: lastRequiredOk,
            requiredTotal: lastRequiredTotal,
            missingRequired: lastMissingRequired,
            resumeRequired: lastFillResp?.fillStats?.resumeRequired,
            uploadedResume: lastFillResp?.uploadStats?.uploadedResume
                ?? lastFillResp?.fillStats?.uploadedResume,
            uploaded: lastFillResp?.uploadStats?.uploaded,
            resumeFilename: lastFillResp?.fillStats?.resumeFilename
                || lastFillResp?.uploadStats?.resumeFilename
                || lastFillResp?.resumeCheck?.filename,
            resumeNameOk: lastFillResp?.fillStats?.resumeNameOk
                ?? lastFillResp?.resumeCheck?.nameOk
                ?? lastFillResp?.uploadStats?.resumeNameOk,
            resumeOk: lastFillResp?.fillStats?.resumeOk ?? lastFillResp?.resumeCheck?.ok,
            visibleRequiredErrors: lastFillResp?.fillStats?.visibleRequiredErrors
        });
        if (requiredBlocked) {
            await logCourseEvent(item.id, 'submit_blocked_incomplete', {
                ats,
                reason: 'required_fields_incomplete',
                engine: AUTOFILL_ENGINE,
                requiredOk: lastRequiredOk,
                requiredTotal: lastRequiredTotal,
                missing: lastMissingRequired,
                incomplete: true
            });
        } else {
        // Final CV gate before submit: file + clean name + content quality.
        let cvPreSubmit = null;
        try {
            await setAutofillPanelStatus(tabId, 'Final CV quality check…', 88);
            cvPreSubmit = await checkBidderCv({
                application_id: item.id,
                profile_id: app.profile_id || item.profile_id,
                draft_html: app.draft_html || '',
                job_description: app.job_description || '',
                resume_filename: app.resume_filename || item.resume_filename,
                upload_filename: lastFillResp?.uploadStats?.resumeFilename
                    || lastFillResp?.fillStats?.resumeFilename
                    || app.resume_upload_filename
                    || item.resume_upload_filename
                    || null
            });
            await logCourseEvent(item.id, cvPreSubmit?.ok ? 'cv_presubmit_ok' : 'cv_presubmit_blocked', {
                reasons: cvPreSubmit?.reasons || [],
                hard_reasons: cvPreSubmit?.hard_reasons || [],
                quality: cvPreSubmit?.quality || null,
                resumeFilename: lastFillResp?.fillStats?.resumeFilename
                    || lastFillResp?.uploadStats?.resumeFilename
                    || null
            }).catch(() => {});
        } catch (cvErr) {
            console.warn('[bidder] pre-submit cv-check failed', cvErr?.message || cvErr);
        }
        if (cvPreSubmit && cvPreSubmit.blockSubmit) {
            await parkApplicationForCvRegen({
                item,
                app,
                qa: cvPreSubmit,
                reason: 'cv_presubmit_quality'
            });
            await logCourseEvent(item.id, 'submit_blocked_incomplete', {
                ats,
                reason: 'cv_quality_blocked',
                hard_reasons: cvPreSubmit.hard_reasons || [],
                quality: cvPreSubmit.quality || null,
                engine: AUTOFILL_ENGINE,
                incomplete: true,
                pending_regen: true
            });
            await notify(
                'Bidder',
                cvPreSubmit.quality?.summary
                    ? `Submit blocked — ${cvPreSubmit.quality.summary}. Parked for regen + auto-rebid.`
                    : `Submit blocked — CV issues. Parked for regen + auto-rebid.`
            );
            const err = new Error('cv_regen_pending');
            err.code = 'cv_regen_pending';
            throw err;
        } else {
        // Groq application checkout — block auto-submit when critical issues remain.
        let checkout = null;
        try {
            const snap = await collectForm(tabId).catch(() => null);
            const bidderSnap = await sendTabMessage(tabId, { type: 'BIDDER_ENGINE_COLLECT' }).catch(() => null);
            const fieldRows = Array.isArray(bidderSnap?.fields) && bidderSnap.fields.length
                ? bidderSnap.fields
                : (Array.isArray(snap?.fields) ? snap.fields : []);
            checkout = await checkoutApplicationCheck({
                application_id: item.id,
                ats,
                company_name: item.company_name || app.company_name || '',
                job_role: item.job_role || app.job_role || '',
                missing_required: lastMissingRequired || [],
                fields: fieldRows.map((f) => ({
                    id: f.id,
                    label: f.label,
                    value: f.value ?? '',
                    required: !!f.required
                })),
                answers: Array.isArray(answers)
                    ? answers.map((a) => ({
                        id: a.id,
                        label: a.label,
                        answer: a.answer || a.value || ''
                    }))
                    : []
            });
            await logCourseEvent(item.id, checkout?.ok ? 'checkout_ok' : 'checkout_blocked', {
                ats,
                summary: checkout?.summary || null,
                issues: (checkout?.issues || []).slice(0, 8),
                fix_count: Array.isArray(checkout?.fix_answers) ? checkout.fix_answers.length : 0,
                provider: checkout?.provider || null,
                skipped: !!checkout?.skipped
            }).catch(() => {});
        } catch (chkErr) {
            console.warn('[bidder] checkout check failed', chkErr?.message || chkErr);
        }

        if (checkout && checkout.ok === false && !checkout.skipped) {
            // Apply Groq fix answers once, then re-evaluate required completeness.
            const fixes = Array.isArray(checkout.fix_answers) ? checkout.fix_answers : [];
            if (fixes.length) {
                try {
                    await fillAndUpload(tabId, {
                        ...filePayload,
                        profile: { ...profile, ...payload.profile },
                        answers: [
                            ...(Array.isArray(answers) ? answers : []),
                            ...fixes.map((f) => ({
                                id: f.id || f.label,
                                label: f.label,
                                answer: f.answer,
                                answer_type: 'written',
                                source: 'groq_checkout'
                            }))
                        ],
                        jobDescription: app.job_description || '',
                        autoSubmit: false,
                        answersOnly: true,
                        engine: AUTOFILL_ENGINE
                    }).catch(() => null);
                } catch (_) { /* ignore */ }
            }
            await logCourseEvent(item.id, 'submit_blocked_incomplete', {
                ats,
                reason: 'groq_checkout_blocked',
                summary: checkout.summary || null,
                issues: (checkout.issues || []).slice(0, 8),
                engine: AUTOFILL_ENGINE,
                missing: lastMissingRequired
            });
        } else {
        const wall = await detectCaptchaOrLogin(tabId);
        if (isBlockingCaptchaWall(wall, {
            formReady: true,
            forSubmit: true,
            captchaHelper: !!prefs.captchaHelper
        })) {
            const wait = await runCaptchaPassEngine({
                tabId,
                applicationId: item.id,
                prefs,
                wall,
                phase: 'autofill_pre_submit',
                companyLabel: item.company_name || app.company_name || 'Job'
            });
            if (!wait.cleared) {
                await logCourseEvent(item.id, 'submit_blocked_incomplete', {
                    ats,
                    reason: 'captcha before submit',
                    engine: AUTOFILL_ENGINE
                });
            } else {
                const sub = await fillAndUpload(tabId, {
                    ...filePayload,
                    profile: { ...profile, ...payload.profile },
                    answers,
                    jobDescription: app.job_description || '',
                    autoSubmit: true,
                    answersOnly: useAnswersOnlyOnPage(pages, { finalSubmitPass: true }),
                    engine: AUTOFILL_ENGINE
                }).catch(() => null);
                submitClicked = !!sub?.submitStats?.clicked;
                if (submitClicked) {
                    await logCourseEvent(item.id, 'submit_clicked', sub.submitStats || {});
                }
            }
        } else {
            const sub = await sendTabMessage(tabId, { type: 'CLICK_SUBMIT' }).catch(() => null);
            submitClicked = !!sub?.clicked;
            if (submitClicked) {
                await logCourseEvent(item.id, 'submit_clicked', sub || {});
            } else if (lastFillResp) {
                // One more full fill+submit
                const finalFill = await fillAndUpload(tabId, {
                    ...filePayload,
                    profile: { ...profile, ...payload.profile },
                    answers,
                    jobDescription: app.job_description || '',
                    autoSubmit: true,
                    answersOnly: useAnswersOnlyOnPage(pages, { finalSubmitPass: true }),
                    engine: AUTOFILL_ENGINE
                });
                submitClicked = !!finalFill.submitStats?.clicked;
                totalFilled += finalFill.fillStats?.filled || 0;
                totalUploaded += finalFill.uploadStats?.uploaded || 0;
                if (finalFill.fillStats && typeof finalFill.fillStats.requiredComplete === 'boolean') {
                    const merged = normalizeFillStats({
                        ...finalFill.fillStats,
                        uploaded: finalFill.uploadStats?.uploaded,
                        uploadedResume: finalFill.uploadStats?.uploadedResume
                            ?? finalFill.fillStats.uploadedResume
                    });
                    lastRequiredComplete = merged.requiredComplete;
                    lastRequiredOk = merged.requiredOk;
                    lastRequiredTotal = merged.requiredTotal;
                    lastMissingRequired = merged.missingRequired.length
                        ? merged.missingRequired
                        : lastMissingRequired;
                }
                if (submitClicked) {
                    await logCourseEvent(item.id, 'submit_clicked', finalFill.submitStats || {});
                } else {
                    await logCourseEvent(item.id, 'submit_blocked_incomplete', {
                        ats,
                        reason: 'autofill did not click submit — review form manually',
                        engine: AUTOFILL_ENGINE,
                        requiredOk: lastRequiredOk,
                        requiredTotal: lastRequiredTotal,
                        missing: lastMissingRequired
                    });
                }
            }
        }
        } // end checkout ok → submit
        } // end cv pre-submit ok
        } // end !requiredBlocked
    }

    await uploadScreenshot(item.id, 'pre_submit', tabId, shotOpts({ settleMs: 1000 })).catch(() => {});
    // Never promote to FILLED from raw fill-count alone when required fields are incomplete/unknown-with-missing.
    const minFillForReady = 5;
    const hasMissing = Array.isArray(lastMissingRequired) && lastMissingRequired.length > 0;
    const fillLooksComplete = lastRequiredComplete === true
        || (
            lastRequiredComplete !== false
            && !hasMissing
            && (
                submitClicked
                || (
                    // Only use the 5-field heuristic when required tracking never ran.
                    lastRequiredComplete == null
                    && !(Number(lastRequiredTotal) > 0)
                    && (
                        totalFilled >= minFillForReady
                        || (totalFilled + totalUploaded) >= minFillForReady
                    )
                )
            )
        );
    const incomplete = lastRequiredComplete === false || hasMissing || !fillLooksComplete;
    if (incomplete) {
        await logCourseEvent(item.id, 'fill_incomplete', {
            ats,
            filled: totalFilled,
            uploaded: totalUploaded,
            pages,
            minFillForReady,
            engine: engineLabel || engineLabelForAts(ats),
            version: AUTOFILL_ENGINE,
            requiredOk: lastRequiredOk,
            requiredTotal: lastRequiredTotal,
            missing: lastMissingRequired,
            reason: lastRequiredComplete === false
                ? 'required_fields_incomplete'
                : 'too few fields filled — not marking FILLED'
        });
    } else {
        await logCourseEvent(item.id, 'ready_to_submit', {
            ats,
            filled: totalFilled,
            uploaded: totalUploaded,
            pages,
            engine: engineLabel || engineLabelForAts(ats),
            version: AUTOFILL_ENGINE,
            submitClicked,
            forceFilled: !!submitClicked,
            requiredComplete: lastRequiredComplete
        });
    }

    await savePackage(item.id, answers, {
        engine: engineLabel || engineLabelForAts(ats),
        ats,
        filled: totalFilled + totalUploaded,
        pages,
        version: AUTOFILL_ENGINE,
        incomplete,
        requiredOk: lastRequiredOk,
        requiredTotal: lastRequiredTotal
    });

    const normalized = normalizeFillStats({
        filled: totalFilled,
        submitClicked,
        incomplete,
        requiredComplete: lastRequiredComplete !== false && fillLooksComplete,
        requiredOk: lastRequiredOk,
        requiredTotal: lastRequiredTotal,
        missingRequired: lastMissingRequired
    });

    return {
        filled: totalFilled,
        submitClicked,
        answersList: answers,
        submitStats: { clicked: submitClicked },
        engine: engineLabel || engineLabelForAts(ats),
        ats,
        pages,
        incomplete: normalized.incomplete,
        requiredComplete: normalized.requiredComplete,
        requiredOk: normalized.requiredOk,
        requiredTotal: normalized.requiredTotal,
        missingRequired: normalized.missingRequired
    };
}

async function probeJobClosed(tabId) {
    try {
        const form = await chrome.tabs.sendMessage(tabId, { type: 'DETECT_APPLY_FORM' });
        if (form?.ok && form.data?.ok) {
            return { closed: false, reason: 'form_present', count: form.data.count || 0 };
        }
    } catch (_) { /* scripts may not be ready */ }
    try {
        const res = await chrome.tabs.sendMessage(tabId, { type: 'DETECT_JOB_CLOSED' });
        if (res?.ok && res.data) return res.data;
    } catch (_) { /* content script may not be ready */ }
    try {
        const tab = await chrome.tabs.get(tabId).catch(() => null);
        const [inj] = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
                const formish = document.querySelectorAll(
                    'input:not([type="hidden"]):not([type="submit"]), select, textarea'
                ).length;
                let httpStatus = 0;
                try {
                    const nav = performance.getEntriesByType('navigation')[0];
                    if (nav && Number(nav.responseStatus) > 0) httpStatus = Number(nav.responseStatus);
                } catch (_) { /* ignore */ }
                return {
                    text: (document.body?.innerText || '').slice(0, 1200),
                    fieldCount: formish,
                    headingText: Array.from(document.querySelectorAll('h1, h2'))
                        .slice(0, 4)
                        .map((el) => (el.innerText || '').trim())
                        .filter(Boolean)
                        .join('\n'),
                    alertText: Array.from(document.querySelectorAll(
                        '[role="alert"], .flash, .flash--error'
                    )).map((el) => (el.innerText || '').trim()).filter(Boolean).join(' '),
                    title: document.title || '',
                    url: location.href || '',
                    httpStatus
                };
            }
        });
        return analyzeJobClosedPage({
            ...(inj?.result || {}),
            url: inj?.result?.url || tab?.url || ''
        }) || { closed: false };
    } catch (_) {
        return { closed: false };
    }
}

async function finishExpiredJob({ item, tabId, openTabs, probe = null, url = null }) {
    const info = probe || {};
    await logCourseEvent(item.id, 'job_expired', {
        job_link_id: item.job_link_id || null,
        match: info.match || null,
        snippet: info.snippet || null,
        url: url || null
    }).catch(() => {});
    if (item.job_link_id) {
        await markJobLinkExpired(item.job_link_id, {
            snippet: info.snippet || null,
            url: url || null
        }).catch(() => {});
    }
    if (tabId) {
        await setAutofillPanelStatus(tabId, 'Job expired — bid stopped', 100).catch(() => {});
        await uploadScreenshot(item.id, 'live', tabId, {
            settleMs: 200,
            stayInApp: true
        }).catch(() => {});
        try { await chrome.tabs.remove(tabId); } catch (_) { /* ignore */ }
    }
    if (openTabs && tabId) openTabs.delete(tabId);
    await notify('Bidder', `Job expired — stopped bid (${item.company_name || item.id})`).catch(() => {});
    return true;
}

async function runBidderFillOnTabInner(tabId, item, prefs) {
    const closedBeforeFill = await probeJobClosed(tabId);
    if (closedBeforeFill?.closed) {
        const err = new Error('job_expired');
        err.jobExpired = true;
        err.probe = closedBeforeFill;
        err.tabId = tabId;
        throw err;
    }
    await ensureScripts(tabId);
    const payload = await getBidderApplication(item.id);
    const app = payload.application || {};
    const profile = payload.profile || {};
    const applyUrl = app.job_url || item.open_url || item.job_url || '';
    let tabUrl = applyUrl;
    try {
        const tab = await chrome.tabs.get(tabId);
        tabUrl = tab?.url || applyUrl;
    } catch (_) { /* ignore */ }
    const atsHint = resolveBidderAts({
        applyUrl,
        tabUrl,
        formAts: app.ats || item.ats || 'generic'
    });
    const bidLimitMs = Number(prefs?.bidLimitMs) || bidLimitMsForAts(atsHint);
    const bidDeadline = Number(prefs?.bidDeadline) || (Date.now() + bidLimitMs);

    let formSnap = await collectForm(tabId).catch(() => null);
    let ats = resolveBidderAts({
        applyUrl,
        tabUrl,
        formAts: formSnap?.ats
    });

    if (formSnap?.blocked || ats === 'linkedin') {
        const reason = formSnap?.reason || 'LinkedIn Easy Apply is not supported';
        // Legacy content scripts used to return blocked+greenhouse_only for Oracle etc.
        // Never treat that as a hard fail — multi-ATS autofill handles those sites.
        if (/greenhouse[_-]?only|use_autofill/i.test(String(reason)) && ats !== 'linkedin') {
            await logCourseEvent(item.id, 'autofill_engine', {
                ats,
                engine: engineLabelForAts(ats),
                fallback: 'cleared_stale_greenhouse_only_block',
                url: formSnap?.url || tabUrl || applyUrl || null
            });
        } else {
            await logCourseEvent(item.id, 'blocked_ats', {
                ats: ats === 'linkedin' ? 'linkedin' : (formSnap?.ats || ats),
                reason,
                url: formSnap?.url || tabUrl || applyUrl || null
            });
            throw new Error(reason);
        }
    }

    let engineLabel = ats === 'greenhouse'
        ? 'bidder-engine-v1'
        : engineLabelForAts(ats);

    await saveSettings({
        selectedProfileId: app.profile_id || item.profile_id,
        lastResult: {
            ...(await getSettings()).lastResult,
            applicationId: item.id,
            resumeFilename: app.resume_filename || item.resume_filename,
            jobUrl: app.job_url || item.open_url,
            fromBidder: true,
            bidderEngine: engineLabel
        }
    });

    await rememberCvForJob({
        jobUrl: app.job_url || item.open_url,
        applicationId: item.id,
        resumeFilename: app.resume_filename || item.resume_filename,
        profileId: app.profile_id || item.profile_id,
        company: app.company_name || item.company_name,
        jobTitle: app.job_role || item.job_role
    });

    // Fill name/email/phone ASAP — gate already found a form; only a short re-check.
    await setAutofillPanelStatus(tabId, 'Filling profile (name, email, phone)…', 12);
    await ensureApplyFormVisible(tabId).catch(() => {});
    const earlyReady = await waitForFormReady(tabId, {
        minFields: 2,
        requireIdentity: false,
        profileFill: false,
        stableReads: 1,
        pollMs: 120,
        maxMs: 2500
    }).catch(() => ({ ok: false, fieldCount: 0, reason: 'wait_failed' }));
    const earlyCount = Number(earlyReady?.fieldCount || 0);
    try {
        let early = await sendTabMessage(tabId, {
            type: 'FILL_FORM',
            payload: {
                profile: { ...profile, ...payload.profile },
                answers: [],
                autoSubmit: false,
                skipFiles: true,
                skipQuestions: true,
                profileOnly: true
            }
        });
        // Second pass for late-mounted required fields (phone, city, essays).
        await waitForFormReady(tabId, {
            minFields: 3,
            requireIdentity: false,
            profileFill: false,
            stableReads: 1,
            pollMs: 120,
            maxMs: 1500
        }).catch(() => {});
        const gap = await sendTabMessage(tabId, {
            type: 'FILL_FORM',
            payload: {
                profile: { ...profile, ...payload.profile },
                answers: [],
                autoSubmit: false,
                skipFiles: true,
                skipQuestions: true,
                profileOnly: true,
                profileGapFill: true
            }
        }).catch(() => null);
        const filledEarly = Number(early?.fillStats?.filled || 0)
            + Number(gap?.fillStats?.filled || 0);
        await logCourseEvent(item.id, 'profile_fill_started', {
            ats,
            engine: engineLabel,
            early: true,
            filled: filledEarly
        });
        await setAppRunState(item.id, 'filling', {
            tabId,
            eventType: 'profile_fill_started',
            requiredOk: Number(gap?.fillStats?.requiredOk || early?.fillStats?.requiredOk || 0),
            requiredTotal: Number(gap?.fillStats?.requiredTotal || early?.fillStats?.requiredTotal || 0),
            missingRequired: gap?.fillStats?.missingRequired || early?.fillStats?.missingRequired || []
        }).catch(() => {});
        await setQueueState({
            lastStatusEvent: 'profile_fill_started',
            lastStatusAt: Date.now(),
            lastStatusMeta: { filled: filledEarly, phase: 'early_profile' }
        }).catch(() => {});
    } catch (err) {
        console.warn('[bidder] early profile fill', err);
    }

    const prepPromise = prepareBidderApplicationFiles(tabId, item, app, prefs, profile);

    // CV quality gate — file, clean name, content quality.
    // Missing file / critical content → regenerate and wait (60s).
    // Soft keyword overlap alone still deferred to background.
    try {
        await setAutofillPanelStatus(tabId, 'Checking CV quality…', 18);
        const qa = await checkBidderCv({
            application_id: item.id,
            profile_id: app.profile_id || item.profile_id,
            draft_html: app.draft_html || '',
            job_description: app.job_description || '',
            resume_filename: app.resume_filename || item.resume_filename,
            upload_filename: app.resume_upload_filename || item.resume_upload_filename || null
        });
        await logCourseEvent(item.id, qa?.ok ? 'cv_check_ok' : 'cv_check_issues', {
            reasons: qa?.reasons || [],
            hard_reasons: qa?.hard_reasons || [],
            quality: qa?.quality || null,
            blockSubmit: !!qa?.blockSubmit
        }).catch(() => {});

        const hard = Array.isArray(qa?.hard_reasons) ? qa.hard_reasons : [];
        const mustRegenNow = !!qa?.shouldRegenerate && (
            hard.includes('missing_resume_file')
            || hard.includes('draft_too_short')
            || hard.includes('quality_critical')
            || hard.includes('quality_score_low')
        );

        if (mustRegenNow) {
            // Park for regen, but CONTINUE fill so essays / profile / file upload still run.
            // Throwing here left Greenhouse empty and falsely ended the queue at 100%.
            await parkApplicationForCvRegen({
                item,
                app,
                qa,
                reason: 'cv_quality_hard'
            });
            await setAutofillPanelStatus(tabId, 'CV regenerating — filling form anyway…', 20);
            await notify(
                'Bidder',
                qa?.quality?.summary
                    ? `CV regenerating (${qa.quality.grade || 'fail'}) — filling form now, will rebid when pass`
                    : 'CV regenerating — filling form now, will rebid when pass'
            );
            await logCourseEvent(item.id, 'cv_regen_pending', {
                continue_fill: true,
                reasons: qa?.reasons || [],
                hard_reasons: hard
            }).catch(() => {});
        } else if (qa?.shouldRegenerate) {
            await logCourseEvent(item.id, 'cv_regenerate_deferred', {
                ...qa,
                note: 'soft_quality_issue_fill_continues'
            });
            generateResume({
                profileId: app.profile_id || item.profile_id,
                jobDescription: app.job_description || '',
                companyName: app.company_name || item.company_name || '',
                jobRole: app.job_role || item.job_role || '',
                jobUrl: app.job_url || item.open_url || '',
                coreSkills: ''
            }).then((gen) => {
                if (gen?.resume_filename) {
                    logCourseEvent(item.id, 'cv_regenerated_bg', { filename: gen.resume_filename }).catch(() => {});
                }
            }).catch((err) => {
                logCourseEvent(item.id, 'cv_regenerate_failed', { error: err?.message, bg: true }).catch(() => {});
            });
        }
    } catch (err) {
        if (err?.code === 'cv_regen_pending' || /cv_regen_pending/i.test(String(err?.message || ''))) {
            throw err;
        }
        console.warn('[bidder] cv-check', err);
    }

    let questions = [];
    let useGreenhouseEngine = ats === 'greenhouse';
    const loadQs = async () => loadBidderQuestions(tabId, {
        ats,
        applyUrl,
        tabUrl,
        formSnap
    });
    let collectedPack = await loadQs().catch(() => ({
        collected: null,
        questions: [],
        formSnap,
        softHandoff: false
    }));
    if (collectedPack.formSnap) formSnap = collectedPack.formSnap;
    questions = collectedPack.questions || [];
    if (useGreenhouseEngine && collectedPack.softHandoff) {
        useGreenhouseEngine = false;
        ats = resolveBidderAts({
            applyUrl,
            tabUrl,
            formAts: collectedPack.collected?.ats || formSnap?.ats || 'generic'
        });
        engineLabel = engineLabelForAts(ats);
        await logCourseEvent(item.id, 'autofill_engine', {
            ats,
            engine: engineLabel,
            fallback: 'greenhouse_collect_handoff'
        });
    } else if (
        useGreenhouseEngine
        && collectedPack.collected
        && !collectedPack.collected.ok
        && !collectedPack.softHandoff
        && !questions.length
    ) {
        throw new Error(
            collectedPack.collected?.reason
            || collectedPack.collected?.error
            || 'Bidder collect failed'
        );
    }
    if (!useGreenhouseEngine && !questions.length) {
        if (!formSnap) formSnap = await collectForm(tabId).catch(() => null);
        questions = mergeBidderQuestions(questions, mapBidderQuestions(formSnap?.questions || []));
        await logCourseEvent(item.id, 'autofill_engine', { ats, engine: engineLabel });
    }
    if (!questions.length) {
        await new Promise((r) => setTimeout(r, 200));
        await ensureApplyFormVisible(tabId).catch(() => {});
        collectedPack = await loadQs().catch(() => collectedPack);
        if (collectedPack.formSnap) formSnap = collectedPack.formSnap;
        questions = collectedPack.questions || [];
    }

    await ensureApplyFormVisible(tabId);
    if (questions.length) {
        await logCourseEvent(item.id, 'answers_generating', {
            ats,
            engine: engineLabel,
            questions: questions.length
        });
        await setAppRunState(item.id, 'filling', {
            tabId,
            eventType: 'answers_generating',
            requiredTotal: questions.length
        }).catch(() => {});
        await setQueueState({
            lastStatusEvent: 'answers_generating',
            lastStatusAt: Date.now(),
            lastStatusMeta: { questions: questions.length, phase: 'answers' }
        }).catch(() => {});
    }
    await setAutofillPanelStatus(
        tabId,
        questions.length
            ? `Drafting ${questions.length} AI answer(s)… (profile filling — questions wait)`
            : 'Preparing resume upload…',
        35
    );

    const remainingTotal = Math.max(0, bidDeadline - Date.now());
    let answersPromise;
    if (!questions.length) {
        answersPromise = Promise.resolve([]);
        await logCourseEvent(item.id, 'ai_skipped_budget', {
            fresh: 0,
            questions: 0,
            duration_ms: 0,
            remainingMs: remainingTotal,
            reason: 'no_questions_collected'
        }).catch(() => {});
    } else {
        const answersBudgetMs = Math.max(25000, Math.min(40000, remainingTotal || 30000));
        answersPromise = generateBidderAnswersForItem(
            item,
            app,
            questions,
            engineLabel,
            answersBudgetMs
        )
            .catch((err) => {
                console.warn('[bidder] answers failed; continue profile-only', err);
                return [];
            });
    }
    let resumeFile = null;
    let coverLetterFile = null;
    try {
        await setAutofillPanelStatus(tabId, 'Preparing resume / cover letter files…', 40);
        const prep = await prepPromise;
        resumeFile = prep?.resumeFile || null;
        coverLetterFile = prep?.coverLetterFile || null;
        if (resumeFile?.base64) {
            const clean = buildUploadResumeFilename({ ...profile, ...payload.profile });
            if (clean && !/^resume_/i.test(clean)) {
                resumeFile = { ...resumeFile, filename: clean };
            }
        }
    } catch (err) {
        throw err;
    }

    const shotOpts = (extra = {}) => ({ stayInApp: true, ...extra });
    const filePayload = {
        resume: resumeFile,
        coverLetter: coverLetterFile,
        skipCoverLetter: !coverLetterFile,
        filename: resumeFile?.filename,
        base64: resumeFile?.base64,
        mimeType: resumeFile?.mimeType
    };

    try {
        await ensureApplyFormVisible(tabId);
        await setAutofillPanelStatus(tabId, 'Uploading files + refreshing profile…', 55);
        await logCourseEvent(item.id, 'profile_fill_files', {
            ats,
            engine: engineLabel,
            questions: questions.length,
            parallel_answers: true
        });
        // Profile + files while AI still runs (questions wait for answers).
        await sendTabMessage(tabId, {
            type: 'FILL_FORM',
            payload: {
                ...filePayload,
                profile: { ...profile, ...payload.profile },
                answers: [],
                autoSubmit: false,
                skipQuestions: true,
                profileOnly: true,
                skipFiles: false
            }
        }).catch(() => null);
        if (resumeFile?.base64) {
            await setAutofillPanelStatus(tabId, 'Uploading resume…', 48);
            let trusted = await setFileInputViaDebugger(tabId, resumeFile).catch((err) => ({
                ok: false,
                reason: err?.message || String(err)
            }));
            if (!trusted?.ok) {
                await new Promise((r) => setTimeout(r, 500));
                trusted = await setFileInputViaDebugger(tabId, resumeFile).catch((err) => ({
                    ok: false,
                    reason: err?.message || String(err)
                }));
            }
            await logCourseEvent(item.id, trusted?.ok ? 'cv_upload_ok' : 'cv_upload_retry', {
                debugger: !!trusted?.ok,
                reason: trusted?.reason || null,
                filename: resumeFile.filename || trusted?.filename || null,
                phase: 'early'
            }).catch(() => {});
            await setAppRunState(item.id, 'filling', {
                tabId,
                eventType: trusted?.ok ? 'cv_upload_ok' : 'cv_upload_retry'
            }).catch(() => {});
        }
        uploadScreenshot(item.id, 'mid_fill', tabId, shotOpts({ settleMs: 200 })).catch(() => {});
    } catch (err) {
        console.warn('[bidder] file/profile fill', err);
    }

    let answers = [];
    try {
        await setAutofillPanelStatus(tabId, 'Waiting for AI answers…', 65);
        const ans = await answersPromise;
        answers = Array.isArray(ans) ? ans : [];
    } catch (err) {
        console.warn('[bidder] answers failed; fill with profile defaults', err);
        answers = [];
    }

    // Studying / fill lessons — merge AFTER AI so lesson priority wins (mergeAnswers).
    if (Array.isArray(prefs?.earlyFillLessons) && prefs.earlyFillLessons.length) {
        answers = mergeAnswers(answers, lessonFillsToAnswers(prefs.earlyFillLessons, 'fill_lesson_early'));
        await logCourseEvent(item.id, 'fill_lesson_applied', {
            ...(prefs.earlyFillLessonMeta || {}),
            fill_count: prefs.earlyFillLessons.length,
            phase: 'greenhouse_merge',
            answer_count: answers.length
        }).catch(() => {});
    }

    const memoryHits = answers.filter((a) => a?.match_source === 'question_memory' || a?.source === 'question_memory').length;
    const policyLocks = answers.filter((a) => a?.match_source === 'hard_lock' || a?.lane === 'policy').length;
    await logCourseEvent(item.id, 'studying_answer_mix', {
        total: answers.length,
        memory_hits: memoryHits,
        policy_or_lock: policyLocks,
        unique: answers.filter((a) => a?.lane === 'unique').length,
        lessons: answers.filter((a) => /fill_lesson/.test(String(a?.source || a?.match_source || ''))).length
    }).catch(() => {});

    await setAutofillPanelStatus(
        tabId,
        answers.length ? `Filling ${answers.length} answer(s)…` : 'Finishing form fill…',
        75
    );
    await ensureApplyFormVisible(tabId);

        if (!useGreenhouseEngine) {
            return await runAutofillEngineOnTab(tabId, item, prefs, {
                profile,
                payload,
                app,
                answers,
                ats,
                engineLabel,
                filePayload
            });
        }

        // Dial Country* (+1) before engine — must be trusted CDP click/type/Enter.
        try {
            const dialOk = await ensureUsDialCodeTrusted(tabId);
            await logCourseEvent(item.id, 'dial_country', { ok: !!dialOk, via: 'trusted_cdp' });
        } catch (err) {
            console.warn('[bidder] dial country', err);
        }

        let run = await sendTabMessage(tabId, {
            type: 'BIDDER_ENGINE_RUN',
            payload: {
                profile: { ...profile, ...payload.profile },
                answers,
                autoSubmit: !!prefs.autoSubmit,
                applicationId: item.id,
                jobDescription: app.job_description || '',
                bidDeadline,
                resume: resumeFile,
                coverLetter: coverLetterFile,
                skipCoverLetter: !coverLetterFile,
                filename: resumeFile?.filename,
                base64: resumeFile?.base64,
                mimeType: resumeFile?.mimeType
            }
        });

        // Explicit CV upload pass — Greenhouse engine does not attach files itself.
        if (resumeFile?.base64) {
            try {
                await setAutofillPanelStatus(tabId, 'Uploading resume…', 78);
                await sendTabMessage(tabId, {
                    type: 'FILL_FORM',
                    payload: {
                        ...filePayload,
                        profile: { ...profile, ...payload.profile },
                        answers: [],
                        autoSubmit: false,
                        skipQuestions: true,
                        profileOnly: true,
                        skipFiles: false
                    }
                }).catch(() => null);
            } catch (err) {
                console.warn('[bidder] greenhouse resume upload', err);
            }
        }

        if (!run?.ok) throw new Error(run?.error || 'Bidder engine run failed');
        let result = run.result || {};

        // Fill leftover empty fields (optional EEO, city, country, essays) after engine.
        await setAutofillPanelStatus(tabId, 'Filling remaining gaps…', 79);
        const gap = await fillAndUpload(tabId, {
            ...filePayload,
            profile: { ...profile, ...payload.profile },
            answers,
            jobDescription: app.job_description || '',
            autoSubmit: false,
            skipQuestions: true,
            skipFiles: !resumeFile?.base64,
            engine: AUTOFILL_ENGINE
        }).catch(() => null);
        if (gap?.fillStats) {
            result = {
                ...result,
                filled: Number(result.filled || 0) + Number(gap.fillStats.filled || 0),
                requiredComplete: gap.fillStats.requiredComplete ?? result.requiredComplete,
                requiredOk: gap.fillStats.requiredOk ?? result.requiredOk,
                requiredTotal: gap.fillStats.requiredTotal ?? result.requiredTotal,
                missingRequired: gap.fillStats.missingRequired || result.missingRequired
            };
        }
        await logCourseEvent(item.id, 'profile_gaps_filled', {
            ats,
            engine: engineLabel,
            filled: result.filled,
            requiredOk: result.requiredOk,
            requiredTotal: result.requiredTotal,
            missing: result.missingRequired || []
        }).catch(() => {});
        await setAppRunState(item.id, 'filling', {
            tabId,
            eventType: 'profile_gaps_filled',
            requiredOk: result.requiredOk,
            requiredTotal: result.requiredTotal,
            missingRequired: result.missingRequired || []
        }).catch(() => {});
        await setQueueState({
            lastStatusEvent: 'profile_gaps_filled',
            lastStatusAt: Date.now(),
            lastStatusMeta: {
                filled: result.filled,
                requiredOk: result.requiredOk,
                requiredTotal: result.requiredTotal,
                missing: result.missingRequired || []
            }
        }).catch(() => {});

        // Required fields still empty — keep the engine running (do not stop at 100%).
        for (let pass = 0; pass < 1; pass++) {
            if (
                result.requiredComplete !== false
                || result.blocked
                || result.timeout
                || /bid_time_budget|budget_exceeded/i.test(String(result.reason || ''))
            ) {
                break;
            }
            const missingN = Array.isArray(result.missingRequired) ? result.missingRequired.length : 0;
            await setAutofillPanelStatus(
                tabId,
                missingN ? `Filling ${missingN} required gap(s)…` : 'Filling required fields…',
                80
            );
            await setQueueState({
                lastStatusEvent: 'required_gaps_retry',
                lastStatusAt: Date.now(),
                lastStatusMeta: { missing: result.missingRequired || [], pass: pass + 1 }
            }).catch(() => {});
            const again = await sendTabMessage(tabId, {
                type: 'BIDDER_ENGINE_RUN',
                payload: {
                    profile: { ...profile, ...payload.profile },
                    answers,
                    autoSubmit: false,
                    applicationId: item.id,
                    jobDescription: app.job_description || '',
                    bidDeadline: Date.now() + 45000,
                    resume: resumeFile,
                    coverLetter: coverLetterFile,
                    skipCoverLetter: !coverLetterFile,
                    filename: resumeFile?.filename,
                    base64: resumeFile?.base64,
                    mimeType: resumeFile?.mimeType
                }
            }).catch(() => null);
            if (again?.ok && again.result) {
                run = again;
                result = again.result;
            }
            const extraGap = await fillAndUpload(tabId, {
                ...filePayload,
                profile: { ...profile, ...payload.profile },
                answers,
                jobDescription: app.job_description || '',
                autoSubmit: false,
                skipQuestions: true,
                skipFiles: !resumeFile?.base64,
                engine: AUTOFILL_ENGINE
            }).catch(() => null);
            if (extraGap?.fillStats) {
                result = {
                    ...result,
                    filled: Number(result.filled || 0) + Number(extraGap.fillStats.filled || 0),
                    requiredComplete: extraGap.fillStats.requiredComplete ?? result.requiredComplete,
                    requiredOk: extraGap.fillStats.requiredOk ?? result.requiredOk,
                    requiredTotal: extraGap.fillStats.requiredTotal ?? result.requiredTotal,
                    missingRequired: extraGap.fillStats.missingRequired || result.missingRequired
                };
            }
        }

        // Explicit CV upload — content-script change events are untrusted, so
        // Greenhouse ignores them. CDP setFileInputFiles is the attach that sticks.
        if (resumeFile?.base64) {
            try {
                await setAutofillPanelStatus(tabId, 'Uploading resume…', 84);
                const up = await sendTabMessage(tabId, {
                    type: 'FILL_FORM',
                    payload: {
                        ...filePayload,
                        profile: { ...profile, ...payload.profile },
                        answers: [],
                        autoSubmit: false,
                        skipQuestions: true,
                        uploadOnly: true,
                        skipFiles: false
                    }
                }).catch(() => null);
                const trusted = await setFileInputViaDebugger(tabId, resumeFile).catch((err) => ({
                    ok: false,
                    reason: err?.message || String(err)
                }));
                await logCourseEvent(item.id, trusted?.ok ? 'cv_upload_ok' : 'cv_upload_retry', {
                    contentUploaded: Number(up?.uploadStats?.uploadedResume || 0),
                    debugger: !!trusted?.ok,
                    reason: trusted?.reason || null,
                    filename: resumeFile.filename || trusted?.filename || null
                }).catch(() => {});
                await setAppRunState(item.id, 'filling', {
                    tabId,
                    eventType: trusted?.ok ? 'cv_upload_ok' : 'cv_upload_retry'
                }).catch(() => {});
                await setQueueState({
                    lastStatusEvent: trusted?.ok ? 'cv_upload_ok' : 'cv_upload_retry',
                    lastStatusAt: Date.now(),
                    lastStatusMeta: {
                        filename: resumeFile.filename || null,
                        debugger: !!trusted?.ok
                    }
                }).catch(() => {});
            } catch (err) {
                console.warn('[bidder] greenhouse resume upload', err);
            }
        }

        if (result.timeout || /bid_time_budget|budget_exceeded/i.test(String(result.reason || ''))) {
            await logCourseEvent(item.id, 'bid_budget_exceeded', {
                via: 'greenhouse_engine',
                limitMs: BID_HARD_LIMIT_MS,
                pages: result.pages,
                filled: result.filled
            }).catch(() => {});
            throw new Error('bid_time_budget_exceeded');
        }
        const softHandoff = !!result.useAutofill
            || /greenhouse[_-]?only|use_autofill/i.test(String(result.reason || ''));
        if (softHandoff) {
            useGreenhouseEngine = false;
            ats = resolveBidderAts({
                applyUrl,
                tabUrl,
                formAts: result.ats || formSnap?.ats || ats
            });
            engineLabel = engineLabelForAts(ats);
            await logCourseEvent(item.id, 'autofill_engine', {
                ats,
                engine: engineLabel,
                fallback: 'greenhouse_run_handoff',
                priorReason: result.reason || null
            });
            return await runAutofillEngineOnTab(tabId, item, prefs, {
                profile,
                payload,
                app,
                answers,
                ats,
                engineLabel,
                filePayload
            });
        }

        if (Array.isArray(result.attempts) && result.attempts.length) {
            try {
                await logBidderFieldAttempts(item.id, result.attempts);
            } catch (err) {
                console.warn('[bidder] field attempts', err);
            }
        }

        if (result.blocked) {
            await logCourseEvent(item.id, 'blocked_ats', result);
            throw new Error(result.reason || 'ATS blocked');
        }

        if (result.preSubmit || result.readyToSubmit) {
            await uploadScreenshot(item.id, 'pre_submit', tabId, shotOpts({ settleMs: 1000 }));
            await logCourseEvent(item.id, 'ready_to_submit', {
                requiredComplete: result.requiredComplete,
                requiredOk: result.requiredOk,
                requiredTotal: result.requiredTotal
            });
            if (prefs.autoSubmit && result.requiredComplete) {
                const preWall = await detectCaptchaOrLogin(tabId).catch(() => null);
                if (isBlockingCaptchaWall(preWall, {
                    formReady: true,
                    forSubmit: true,
                    captchaHelper: !!prefs.captchaHelper
                })) {
                    const wait = await runCaptchaPassEngine({
                        tabId,
                        applicationId: item.id,
                        prefs,
                        wall: preWall,
                        phase: 'bidder_pre_submit',
                        companyLabel: item.company_name || app.company_name || 'Job'
                    });
                    if (!wait.cleared) {
                        await logCourseEvent(item.id, 'submit_blocked_incomplete', {
                            reason: 'captcha before submit',
                            incomplete: true
                        });
                        result.submitClicked = false;
                    } else if (!result.submitClicked) {
                        const sub = await sendTabMessage(tabId, { type: 'BIDDER_ENGINE_SUBMIT', force: false });
                        result.submitClicked = !!sub?.clicked;
                        await logCourseEvent(item.id, 'submit_clicked', sub || {});
                    }
                } else if (!result.submitClicked) {
                    const sub = await sendTabMessage(tabId, {
                        type: 'BIDDER_ENGINE_SUBMIT',
                        force: false
                    });
                    result.submitClicked = !!sub?.clicked;
                    await logCourseEvent(item.id, 'submit_clicked', sub || {});
                }
            } else if (prefs.autoSubmit && !result.requiredComplete) {
                // Never force-submit when required fields are empty (sponsorship, etc.).
                await logCourseEvent(item.id, 'submit_blocked_incomplete', {
                    missing: result.missingRequired || [],
                    requiredOk: result.requiredOk,
                    requiredTotal: result.requiredTotal,
                    incomplete: true,
                    reason: 'required_fields_incomplete'
                });
                await notify(
                    'Bidder',
                    `Submit blocked — ${(result.missingRequired || []).slice(0, 2).join(', ') || 'required fields'} still empty`
                );
            }
        }

        await logCourseEvent(item.id, 'mid_fill', {
            requiredOk: result.requiredOk,
            requiredTotal: result.requiredTotal,
            filled: result.filled,
            complete: !!result.requiredComplete,
            missing: result.missingRequired || []
        });

        // Top-up runs inside bidderFill runEngine via window.__lumiFillEngine.topUpMissingFields.
        if (result.topUpFilled > 0) {
            await logCourseEvent(item.id, 'mid_fill', {
                requiredOk: result.requiredOk,
                requiredTotal: result.requiredTotal,
                filled: result.filled,
                complete: !!result.requiredComplete,
                topUpFilled: result.topUpFilled,
                missing: result.missingRequired || []
            });
        }

        // In-engine top-up may have completed required fields after the first submit gate skipped.
        if (
            prefs.autoSubmit
            && result.requiredComplete
            && !result.submitClicked
        ) {
            try {
                const sub = await sendTabMessage(tabId, { type: 'BIDDER_ENGINE_SUBMIT', force: false });
                if (sub?.clicked) {
                    result.submitClicked = true;
                    await logCourseEvent(item.id, 'submit_clicked', { ...(sub || {}), afterTopUp: true });
                } else {
                    const sub2 = await sendTabMessage(tabId, { type: 'CLICK_SUBMIT' }).catch(() => null);
                    result.submitClicked = !!sub2?.clicked;
                    if (result.submitClicked) {
                        await logCourseEvent(item.id, 'submit_clicked', {
                            ...(sub2 || {}),
                            afterTopUp: true,
                            via: 'CLICK_SUBMIT'
                        });
                    }
                }
            } catch (err) {
                console.warn('[bidder] post top-up submit', err);
            }
        }

        if (result.requiredComplete || result.filled > 0) {
            // Only use awaiting_manual_submit when Auto Bidder auto-submit is OFF.
            // Incomplete required fields with autoSubmit ON → submit_blocked_incomplete.
            let fillEvent = 'fill_done';
            if (!result.requiredComplete) {
                fillEvent = prefs.autoSubmit ? 'submit_blocked_incomplete' : 'awaiting_manual_submit';
            }
            await logCourseEvent(item.id, fillEvent, {
                filled: result.filled,
                requiredOk: result.requiredOk,
                requiredTotal: result.requiredTotal,
                incomplete: !result.requiredComplete,
                autoSubmit: !!prefs.autoSubmit,
                missing: result.missingRequired || []
            });
        }

        await savePackage(item.id, answers, {
            engine: engineLabel,
            filled: result.filled,
            requiredComplete: result.requiredComplete,
            incomplete: !result.requiredComplete,
            missing: result.missingRequired || []
        });
        await saveCapturedQuestionsPack({
            applicationId: item.id,
            company: app.company_name || item.company_name || '',
            jobRole: app.job_role || item.job_role || '',
            url: item.open_url || '',
            questions,
            answers
        }).catch(() => {});

        return {
            filled: result.filled || 0,
            submitClicked: !!result.submitClicked,
            answersList: answers,
            questionsList: questions,
            submitStats: { clicked: !!result.submitClicked },
            engine: engineLabel,
            requiredComplete: !!result.requiredComplete,
            requiredOk: result.requiredOk,
            requiredTotal: result.requiredTotal,
            missingRequired: result.missingRequired || [],
            incomplete: !result.requiredComplete,
            attempts: result.attempts
        };
}

// When the user (or Chrome) closes an owned apply tab — clear stale Focus chips + log once.
chrome.tabs.onRemoved.addListener((tabId) => {
    (async () => {
        const st = await getQueueState().catch(() => null);
        if (!st) return;
        const tid = Number(tabId);
        const tabsByAppId = st.tabsByAppId || {};
        let appId = null;
        for (const [k, v] of Object.entries(tabsByAppId)) {
            if (Number(v) === tid) {
                appId = k;
                break;
            }
        }
        if (!appId && Number(st.currentTabId) === tid) appId = st.currentId || null;
        if (!appId && Number(st.captchaTabId) === tid) appId = st.captchaApplicationId || null;
        const ours = !!appId
            || Number(st.currentTabId) === tid
            || Number(st.captchaTabId) === tid;
        if (!ours) return;
        // Avoid duplicate tab_closed if leftover_sweep / fill park already logged.
        const lastEv = String(st.lastStatusEvent || '');
        const lastTab = Number(st.lastStatusMeta?.tabId || 0);
        const alreadyLogged = /tab_closed/i.test(lastEv) && lastTab === tid
            && (Date.now() - Number(st.lastStatusAt || 0) < 15_000);
        if (appId && !alreadyLogged) {
            await logCourseEvent(appId, 'tab_closed', {
                reason: 'browser_closed',
                phase: 'tabs.onRemoved',
                tabId: tid,
                missing: st.lastStatusMeta?.missing || st.runByAppId?.[String(appId)]?.missingRequired || undefined
            }).catch(() => {});
            await notify(
                'Lumi',
                'Apply tab closed — evidence kept · Open tab to continue checkout'
            ).catch(() => {});
        }
        await clearTabMapping({ applicationId: appId, tabId: tid }).catch(() => {});
        await setQueueState({
            ownedTabAlive: false,
            captchaTabMissing: true,
            coachStatus: st.coachStatus || 'Apply tab closed — Open tab to continue checkout'
        }).catch(() => {});
    })().catch(() => {});
});

// Mode 2 / Bidder: when pendingFill tab finishes loading an apply-looking form, fill it.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'complete' || !tab?.url) return;
    try {
        if (tabShowsBrowserErrorPage(tab)) return;
        const settings = await getSettings();
        const pending = settings.pendingFill;
        if (!pending?.autoFillWhenReady || !pending.jobUrl) return;
        if (!urlsLooselyMatch(tab.url, pending.jobUrl) && !tab.url.includes(new URL(pending.jobUrl).hostname)) {
            return;
        }

        // Claim the tab, but keep autoFillWhenReady until a form is actually ready.
        // Clearing it on the first "complete" made Greenhouse wait for the popup Autofill click.
        if (inflightPendingFillTabs.has(tabId)) return;
        inflightPendingFillTabs.set(tabId, Date.now());

        try {
            await ensureScripts(tabId);
            const readyDeadline = Date.now() + 22000;
            let formReady = false;
            while (Date.now() < readyDeadline) {
                let liveUrl = tab.url;
                try {
                    liveUrl = (await chrome.tabs.get(tabId))?.url || tab.url;
                } catch (_) { /* ignore */ }
                if (isAshbyJobDescriptionUrl(liveUrl)) {
                    try {
                        if (pending.applicationId) {
                            await logCourseEvent(pending.applicationId, 'ashby_open_application', {
                                from: liveUrl
                            });
                        }
                        await ensureAshbyApplicationPage(tabId, liveUrl);
                    } catch (err) {
                        console.warn('[bidder] ashby pending → application', err);
                    }
                }
                const detect = await chrome.tabs.sendMessage(tabId, { type: 'DETECT_APPLY_FORM' }).catch(() => null);
                if (detect?.ok && detect.data?.ok) {
                    formReady = true;
                    break;
                }
                const wall = await detectCaptchaOrLogin(tabId).catch(() => ({}));
                if ((wall.captcha || wall.login) && isBlockingCaptchaWall(wall, { formReady: false })) {
                    const prefs = await getBidderPrefs();
                    const wait = await runCaptchaPassEngine({
                        tabId,
                        applicationId: pending.applicationId,
                        prefs,
                        wall,
                        phase: 'pending_fill',
                        companyLabel: pending.company || 'Job'
                    });
                    if (wait.cleared) {
                        formReady = true;
                        break;
                    }
                }
                await new Promise((r) => setTimeout(r, 700));
            }
            if (!formReady) {
                // Bidder Open/Process should still start fill; the engine waits for fields.
                formReady = !!(pending.fromBidder && pending.applicationId);
            }
            if (!formReady) return;

            await saveSettings({ pendingFill: { ...pending, autoFillWhenReady: false } });

            await notify('Lumi Bidder', 'Apply form detected — full fill…');

            if (pending.fromBidder && pending.applicationId) {
                const prefs = await getBidderPrefs();
                const item = {
                    id: pending.applicationId,
                    profile_id: pending.profileId,
                    resume_filename: pending.resumeFilename,
                    company_name: pending.company,
                    job_role: pending.jobRole,
                    open_url: pending.jobUrl
                };
                await new Promise((r) => setTimeout(r, 2000));
                await uploadScreenshot(pending.applicationId, 'opened', tabId, { settleMs: 1000 });
                const stats = await runBidderFillOnTab(tabId, item, {
                    ...prefs,
                    autoSubmit: pending.autoSubmit != null ? pending.autoSubmit : prefs.autoSubmit
                });
                const settleSec = Math.max(5, Number(prefs.screenshotSettleSec) || 6);
                await new Promise((r) => setTimeout(r, settleSec * 1000));
                await uploadScreenshot(pending.applicationId, 'after_fill', tabId, { settleMs: 1200 });
                await savePackage(pending.applicationId, [], { filled: stats?.filled });
                if (stats?.submitClicked) {
                    const poll = await pollDetectSubmitSuccess(tabId, {
                        totalMs: SUBMIT_SUCCESS_POLL_MS,
                        gapMs: 800
                    });
                    if (poll.ok) {
                        await markApplicationApplied(pending.applicationId);
                        await logCourseEvent(pending.applicationId, 'marked_applied', { via: 'success_text' });
                        await uploadSuccessProofScreenshot(pending.applicationId, tabId, {
                            waitMs: 1600,
                            settleMs: 900
                        });
                        try { await chrome.tabs.remove(tabId); } catch (_) {}
                    }
                }
            } else {
                await runFillOnly({ phase: 'profile', tabId });
            }
        } finally {
            inflightPendingFillTabs.delete(tabId);
        }
    } catch (err) {
        console.warn('[bidder] pendingFill watcher', err);
        inflightPendingFillTabs.delete(tabId);
    }
});

chrome.commands.onCommand.addListener((command) => {
    if (command === 'bid-generate') {
        runBidGenerate({ alsoFill: false }).catch((err) => {
            const m = String(err?.message || err || '');
            if (/Select the job description|Could not find JD|error page|Chrome error page|Open a job posting/i.test(m)) {
                console.warn('[bidder]', m);
                return;
            }
            console.error('[bidder]', err);
        });
    }
    if (command === 'bid-fill') {
        runFillOnly({ phase: 'profile' }).catch((err) => console.error('[bidder]', err));
    }
    if (command === 'bid-select-questions') {
        (async () => {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id) return;
            await ensureScripts(tab.id);
            await chrome.tabs.sendMessage(tab.id, { type: 'SHOW_QUESTION_PICKER' });
        })().catch((err) => console.error('[bidder]', err));
    }
    if (command === 'bid-select-jd') {
        (async () => {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id) return;
            await ensureScripts(tab.id);
            await chrome.tabs.sendMessage(tab.id, { type: 'START_JD_PICK' });
            await notify('Select JD', 'Click the job description block (or highlight text), then Alt+Shift+G');
        })().catch((err) => console.error('[bidder]', err));
    }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'GET_CAPTURED_QUESTIONS') {
        getLatestCapturedPack()
            .then((pack) => sendResponse({ ok: true, pack }))
            .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
        return true;
    }
    if (msg?.type === 'SAVE_CAPTURED_ANSWER') {
        (async () => {
            const pack = await updateCapturedItemAnswer(
                msg.applicationId || null,
                Number(msg.index),
                msg.answer
            );
            if (!pack) throw new Error('Captured question not found');
            const item = pack.items?.[Number(msg.index)];
            if (item?.label && String(msg.answer || '').trim()) {
                await upsertQuestionMemory({
                    kind: item.kind || undefined,
                    question: item.label,
                    answer: String(msg.answer).trim(),
                    source: 'manual_fix'
                }).catch(() => {});
            }
            // Also push correction into bid course when we have an application id.
            if (pack.applicationId != null && item?.label) {
                await savePackage(pack.applicationId, pack.items.map((row) => ({
                    id: row.id,
                    label: row.label,
                    kind: row.kind,
                    answer: row.answer,
                    value: row.answer
                })), {
                    reason: 'popup_answer_edit',
                    index: Number(msg.index)
                }).catch(() => {});
            }
            return pack;
        })()
            .then((pack) => sendResponse({ ok: true, pack }))
            .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
        return true;
    }
    if (msg?.type === 'ENSURE_US_DIAL_CODE') {
        const tabId = msg.tabId || _sender?.tab?.id;
        ensureUsDialCodeTrusted(tabId)
            .then((ok) => sendResponse({ ok: !!ok }))
            .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
        return true;
    }
    if (msg?.type === 'GENERATE_DONE') {
        handleGenerateDone(msg.result || {})
            .then((result) => sendResponse({ ok: true, result }))
            .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
        return true;
    }
    if (msg?.type === 'RUN_BID_GENERATE') {
        runBidGenerate({ alsoFill: !!msg.alsoFill })
            .then((result) => sendResponse({ ok: true, result }))
            .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
        return true;
    }
    if (msg?.type === 'RUN_FILL_ONLY') {
        runFillOnly({ phase: msg.phase || 'profile' })
            .then((result) => sendResponse({ ok: true, result }))
            .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
        return true;
    }
    if (msg?.type === 'RUN_PROFILE_AUTOFILL') {
        // Profile first, then answers API for remaining questions (essays / custom Qs).
        runFillOnly({
            phase: 'full',
            answerMode: 'auto',
            manualAutofill: true,
            softSession: true,
            softAnswers: true
        })
            .then((result) => sendResponse({ ok: true, result }))
            .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
        return true;
    }
    if (msg?.type === 'RUN_CONTINUE_FILL') {
        runFillOnly({
            phase: 'full',
            answerMode: 'auto',
            manualAutofill: true,
            softSession: true,
            fromPanel: true,
            reuseAnswers: true,
            gapFillOnly: true
        })
            .then((result) => sendResponse({ ok: true, result }))
            .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
        return true;
    }
    if (msg?.type === 'RUN_DOWNLOAD_CV_LIBRARY') {
        (async () => {
            const settings = await getSettings();
            const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
            let filename = settings.lastResult?.resumeFilename || '';
            let profile = null;
            try {
                const profiles = await listProfiles();
                profile = (profiles || []).find((p) => String(p.id) === String(settings.selectedProfileId))
                    || (profiles || [])[0];
            } catch (_) { /* ignore */ }
            if (!filename && settings.selectedProfileId) {
                const latest = await getLatestBidderApplication(settings.selectedProfileId).catch(() => null);
                filename = latest?.application?.resume_filename || '';
                if (!profile && latest?.profile) profile = latest.profile;
            }
            if (!filename) throw new Error('No CV on file — Generate CV first');
            const resumeFile = await fetchResumeBase64(settings.apiBaseUrl, filename, settings.token, {
                profile,
                uploadFilename: profile ? buildUploadResumeFilename(profile) : null
            });
            resumeFile.profile = profile;
            resumeFile.applicationId = settings.lastResult?.applicationId || null;
            const saved = await downloadResumeToCvLibrary(
                resumeFile,
                profile || {},
                resumeFile.applicationId
            );
            if (!saved?.ok && !saved?.path && !saved?.relPath) {
                throw new Error('Could not write CV — choose a folder in Lumi, or allow Downloads');
            }
            const folder = saved.folderName || (saved.via === 'chosen_folder' ? 'your folder' : 'Downloads/CVs');
            await toastActiveTab(
                saved.via === 'chosen_folder'
                    ? `CV saved to ${folder}/${saved.relPath || ''}`
                    : `CV saved to Downloads/${saved.relPath || 'CVs'}`,
                'ok'
            ).catch(() => {});
            sendResponse({
                ok: true,
                folder,
                path: saved.path || '',
                relPath: saved.relPath || '',
                via: saved.via
            });
        })()
            .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
        return true;
    }
    if (msg?.type === 'RUN_ANSWER_QUESTIONS') {
        // Auto-draft on Generate (JD + CV), then fill selected fields on the apply tab.
        runFillOnly({ phase: 'answers', answerMode: 'auto' })
            .then((result) => sendResponse({ ok: true, result }))
            .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
        return true;
    }
    if (msg?.type === 'START_JD_PICK_ACTIVE') {
        (async () => {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id) throw new Error('No active tab');
            await ensureScripts(tab.id);
            return chrome.tabs.sendMessage(tab.id, { type: 'START_JD_PICK' });
        })()
            .then((data) => sendResponse({ ok: true, data }))
            .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
        return true;
    }
    if (msg?.type === 'JD_PICKED') {
        notify('JD captured', `${(msg.job?.description || '').length} chars — press Alt+Shift+G`)
            .then(() => sendResponse({ ok: true }))
            .catch(() => sendResponse({ ok: true }));
        return true;
    }
    if (msg?.type === 'LIST_READY') {
        (async () => {
            const settings = await getSettings();
            return listBidderReady(msg.limit || 50, msg.profileId || settings.selectedProfileId);
        })()
            .then((data) => sendResponse({ ok: true, data }))
            .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
        return true;
    }
    if (msg?.type === 'BIDDER_PING') {
        const version = chrome.runtime.getManifest()?.version || '0';
        sendResponse({
            ok: true,
            version,
            extensionId: chrome.runtime.id,
            engine: 'bidder-engine-v1',
            autofillEngine: AUTOFILL_ENGINE
        });
        return false;
    }
    if (msg?.type === 'BIDDER_CHOOSE_CV_FOLDER') {
        openCvFolderPicker()
            .then((data) => sendResponse({ ok: true, ...data }))
            .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
        return true;
    }
    if (msg?.type === 'BIDDER_CLEAR_CV_FOLDER') {
        chrome.storage.local.remove(['cvRootFolderName', 'cvRootFolderSetAt'])
            .then(() => getCvFolderStatus())
            .then((data) => sendResponse({ ok: true, ...data }))
            .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
        return true;
    }
    if (msg?.type === 'BIDDER_CV_FOLDER_STATUS' || msg?.type === 'CV_FOLDER_PICKED' || msg?.type === 'CV_FOLDER_CLEARED') {
        if (msg?.type === 'BIDDER_CV_FOLDER_STATUS') {
            getCvFolderStatus()
                .then((data) => sendResponse({ ok: true, ...data }))
                .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
            return true;
        }
        sendResponse({ ok: true });
        return false;
    }
    if (msg?.type === 'BIDDER_PROBE_CAPTCHA_HELPERS') {
        probeCaptchaHelpers()
            .then((helpers) => sendResponse({ ok: true, ...helpers }))
            .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
        return true;
    }
    if (msg?.type === 'BIDDER_SAVE_PREFS') {
        (async () => {
            const prefs = msg.prefs && typeof msg.prefs === 'object' ? msg.prefs : {};
            const allowed = [
                'bidderStayInApp',
                'bidderUnattended',
                'bidderCaptchaHelper',
                'bidderCaptchaHelperWaitSec',
                'bidderCaptchaGraceSec',
                'bidderHumanAssistWaitSec',
                'bidderAutoSubmit',
                'bidderAutoNext',
                'bidderCaptchaFocus',
                'bidderUploadCoverLetter',
                'bidderSoundEnabled',
                'bidderCapsolverApiKey',
                'bidderTwocaptchaApiKey',
                'bidderDisabledFillLessons',
                'bidderScreenshotSettleSec',
                'bidderFormWaitMs',
                'bidderOpenGapMs',
                'bidderMaxTabs'
            ];
            const patch = {};
            for (const key of allowed) {
                if (prefs[key] !== undefined) patch[key] = prefs[key];
            }
            // Keep grace / helper in sync with unified human-assist wait.
            if (patch.bidderHumanAssistWaitSec != null && Number(patch.bidderHumanAssistWaitSec) >= 0) {
                const sec = Math.min(600, Math.round(Number(patch.bidderHumanAssistWaitSec)));
                patch.bidderHumanAssistWaitSec = sec;
                patch.bidderCaptchaHelperWaitSec = sec;
                patch.bidderCaptchaGraceSec = sec;
            }
            if (patch.bidderFormWaitMs != null) {
                const ms = Math.round(Number(patch.bidderFormWaitMs));
                if (Number.isFinite(ms)) patch.bidderFormWaitMs = Math.max(3000, Math.min(30000, ms));
            }
            if (patch.bidderOpenGapMs != null) {
                const ms = Math.round(Number(patch.bidderOpenGapMs));
                if (Number.isFinite(ms)) patch.bidderOpenGapMs = Math.max(0, Math.min(10000, ms));
            }
            if (patch.bidderScreenshotSettleSec != null) {
                const sec = Math.round(Number(patch.bidderScreenshotSettleSec));
                if (Number.isFinite(sec)) patch.bidderScreenshotSettleSec = Math.max(0, Math.min(8, sec));
            }
            if (patch.bidderMaxTabs != null) {
                const n = Math.round(Number(patch.bidderMaxTabs));
                if (Number.isFinite(n)) patch.bidderMaxTabs = Math.max(1, Math.min(5, n));
            }
            if (!Object.keys(patch).length) {
                return { ok: false, error: 'No prefs to save' };
            }
            await saveSettings(patch);
            return { ok: true, saved: Object.keys(patch) };
        })()
            .then((res) => sendResponse(res))
            .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
        return true;
    }
    if (msg?.type === 'REINJECT_APP_BRIDGE') {
        reinjectAppBridgeIntoAppTabs()
            .then((n) => sendResponse({
                ok: true,
                injected: n,
                version: chrome.runtime.getManifest()?.version || '0',
                extensionId: chrome.runtime.id
            }))
            .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
        return true;
    }
    if (msg?.type === 'BIDDER_STATUS') {
        getBidderStatus()
            .then((data) => sendResponse({ ok: true, data }))
            .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
        return true;
    }
    if (msg?.type === 'GET_MONITOR_SNAPSHOT') {
        (async () => {
            const settings = await getSettings();
            const profileId = msg.profileId || settings.selectedProfileId || null;
            const [statusSettled, queuePair, readySettled, work] = await Promise.all([
                getBidderStatus().then((data) => ({ ok: true, data })).catch((err) => ({
                    ok: false,
                    error: err?.message || String(err)
                })),
                Promise.all([getQueueState(), getUiMessageLog()]).then(async ([data, uiMessageLog]) => {
                    const enriched = await enrichQueueSnapshot(data || {});
                    return {
                        ok: true,
                        data: {
                            ...enriched,
                            uiMessageLog
                        }
                    };
                }).catch((err) => ({ ok: false, error: err?.message || String(err) })),
                listBidderReady(msg.limit || 50, profileId)
                    .then((data) => ({ ok: true, data }))
                    .catch((err) => ({ ok: false, error: err?.message || String(err) })),
                getWorkProgress()
            ]);
            return {
                ok: true,
                at: Date.now(),
                status: statusSettled,
                queue: queuePair,
                ready: readySettled,
                work,
                profileId
            };
        })()
            .then((data) => sendResponse(data))
            .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
        return true;
    }
    if (msg?.type === 'OPEN_READY') {
        openReadyApplication(msg.item)
            .then((result) => sendResponse({ ok: true, result }))
            .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
        return true;
    }
    if (msg?.type === 'PROCESS_READY_QUEUE') {
        const jobLinkIds = Array.isArray(msg.jobLinkIds) ? msg.jobLinkIds : [];
        const applicationIds = Array.isArray(msg.applicationIds) ? msg.applicationIds : [];
        (async () => {
            let acked = false;
            try {
                // Sync web-app session into the extension before listing ready apps.
                if (msg.token) {
                    const patch = { token: String(msg.token) };
                    if (msg.user && typeof msg.user === 'object') patch.user = msg.user;
                    if (msg.selectedProfileId != null && Number(msg.selectedProfileId) > 0) {
                        patch.selectedProfileId = Number(msg.selectedProfileId);
                    }
                    await saveSettings(patch);
                }

                const st = await getQueueState();
                const status = String(st?.status || '');
                const alreadyActive = !!(
                    st?.running
                    || /^(?:running|awaiting_captcha|awaiting_email_otp|awaiting_next)$/i.test(status)
                );
                if (alreadyActive) {
                    // Soft-ack — not a hard failure. User clicked Process again while
                    // the queue is paused on CAPTCHA / email OTP or still bidding.
                    if (/awaiting_captcha|awaiting_email_otp/i.test(status) && st?.captchaTabId) {
                        try {
                            await chrome.tabs.update(st.captchaTabId, { active: true });
                            const tab = await chrome.tabs.get(st.captchaTabId);
                            if (tab?.windowId != null) {
                                await chrome.windows.update(tab.windowId, { focused: true });
                            }
                        } catch (_) { /* tab may be gone */ }
                    }
                    const message = /awaiting_email_otp/i.test(status)
                        ? 'Queue paused on email security code — Instruct Lumi with the code (tab stays open for second Submit).'
                        : /awaiting_captcha/i.test(status)
                        ? 'Queue is paused on CAPTCHA / login — solve it in the apply tab, then Resume in Live monitor. Do not click Process again.'
                        : /awaiting_next/i.test(status)
                            ? 'Queue is waiting — click Next or Resume in Live monitor (Process already started).'
                            : 'Queue already in progress — use Live monitor (Resume / Next / Stop). Do not start Process again.';
                    sendResponse({
                        ok: true,
                        alreadyRunning: true,
                        started: true,
                        queued: Number(st?.total) || 0,
                        processed: Number(st?.processed) || 0,
                        status: status || 'running',
                        message
                    });
                    return;
                }
                const summary = await processReadyQueue({
                    jobLinkIds,
                    applicationIds,
                    remembered: Array.isArray(msg.remembered) ? msg.remembered : null,
                    uploadCoverLetter: msg.uploadCoverLetter,
                    stayInApp: msg.stayInApp,
                    unattended: msg.unattended,
                    captchaGraceSec: msg.captchaGraceSec,
                    captchaHelper: msg.captchaHelper,
                    captchaHelperWaitSec: msg.captchaHelperWaitSec,
                    disabledFillLessons: msg.disabledFillLessons,
                    onReady: (early) => {
                        if (acked) return;
                        acked = true;
                        try {
                            sendResponse(early);
                        } catch (_) { /* channel closed */ }
                    }
                });
                if (!acked) {
                    acked = true;
                    if (summary && summary.ok === false) {
                        sendResponse({
                            ok: false,
                            error: summary.error || 'No ready applications to bid',
                            processed: summary.processed || 0,
                            queued: summary.queued || 0
                        });
                    } else {
                        sendResponse({ ok: true, ...(summary || {}) });
                    }
                }
            } catch (err) {
                console.warn('[bidder] PROCESS_READY_QUEUE', err);
                if (!acked) {
                    try {
                        sendResponse({ ok: false, error: err?.message || String(err) });
                    } catch (_) { /* channel closed */ }
                }
            }
        })();
        return true;
    }
    if (msg?.type === 'BIDDER_NEXT') {
        setQueueState({ nextClicked: true, status: 'running' })
            .then(() => sendResponse({ ok: true }))
            .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
        return true;
    }
    if (msg?.type === 'BIDDER_CAPTCHA_RESUME') {
        // Human finished CAPTCHA (or wants to force continue). Does not bypass — just unblocks wait.
        (async () => {
            const prev = await getQueueState();
            const prefs = await getBidderPrefs();
            const stayInApp = prefs.stayInApp !== false && prev?.captchaStayInApp !== false;
            let tabId = prev?.captchaTabId || null;
            if (tabId) {
                try { await chrome.tabs.get(tabId); } catch { tabId = null; }
            }
            // Reopen apply URL if the background tab was closed before Resume.
            if (!tabId && (msg.url || prev?.captchaJobUrl)) {
                const url = msg.url || prev.captchaJobUrl;
                const created = await chrome.tabs.create({ url, active: true });
                tabId = created.id;
                try {
                    if (created.windowId != null) {
                        await chrome.windows.update(created.windowId, { focused: true });
                    }
                } catch (_) { /* ignore */ }
                await chrome.storage.session.set({
                    captchaUserFocusHoldUntil: Date.now() + 10 * 60 * 1000
                });
                await setQueueState({ captchaTabId: tabId, captchaTabMissing: false });
            }
            await setQueueState({
                captchaResolved: true,
                captchaForceResume: !!msg.force,
                status: 'running'
            });
            const st = await getQueueState();
            tabId = st?.captchaTabId || tabId;
            // Focus apply tab when user is finishing CAPTCHA (or caller asked).
            if (tabId && (!stayInApp || msg.focusTab || msg.force)) {
                try { await chrome.tabs.update(tabId, { active: true }); } catch (_) {}
                try {
                    const tab = await chrome.tabs.get(tabId);
                    if (tab.windowId != null) {
                        await chrome.windows.update(tab.windowId, { focused: true });
                    }
                } catch (_) { /* ignore */ }
                await chrome.storage.session.set({
                    captchaUserFocusHoldUntil: Date.now() + 10 * 60 * 1000
                });
            }
            // If the wait loop died with the MV3 service worker, Resume still kicks fill after a short delay.
            if ((msg.force || msg.kick) && tabId && st?.captchaApplicationId) {
                setTimeout(() => {
                    (async () => {
                        const now = await getQueueState();
                        if (now?.captchaApplicationId !== st.captchaApplicationId) return;
                        const wall = await detectCaptchaOrLogin(tabId);
                        if ((wall.captcha || wall.login) && !msg.force) return;
                        const p2 = await getBidderPrefs();
                        await ensureScripts(tabId);
                        await runBidderFillOnTab(tabId, {
                            id: st.captchaApplicationId,
                            company_name: 'Job',
                            job_role: ''
                        }, p2);
                        await logCourseEvent(st.captchaApplicationId, 'captcha_cleared', {
                            via: 'resume_kick',
                            engine: 'captcha-pass-v9'
                        });
                        try { await chrome.storage.session.remove('captchaUserFocusHoldUntil'); } catch (_) { /* ignore */ }
                        await setQueueState({
                            status: 'running',
                            captchaKind: null,
                            captchaTabId: null,
                            captchaApplicationId: null,
                            captchaJobUrl: null
                        });
                    })().catch((err) => console.warn('[bidder] captcha resume kick', err));
                }, 1800);
            }
            sendResponse({
                ok: true,
                wasRunning: !!prev?.running,
                stayInApp,
                captchaTabId: tabId || null,
                reopened: !prev?.captchaTabId && !!tabId
            });
        })().catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
        return true;
    }
    if (msg?.type === 'BIDDER_CAPTCHA_FOCUS_TAB') {
        (async () => {
            const st = await getQueueState();
            const cleanUrl = (raw) => {
                const s = String(raw || '').trim();
                if (!s) return '';
                if (/[?&]error=true\b/i.test(s) || /\/embed\/job_board/i.test(s)) return '';
                if (isAshbyJobDescriptionUrl(s)) return ashbyApplicationUrl(s);
                return s;
            };
            const brokenLanding = (raw) => {
                const s = String(raw || '');
                return !s
                    || /[?&]error=true\b/i.test(s)
                    || /\/embed\/job_board/i.test(s)
                    || /^chrome:\/\//i.test(s)
                    || /^about:/i.test(s);
            };
            const wantedUrl = cleanUrl(msg.url)
                || cleanUrl(st?.currentJobUrl)
                || cleanUrl(st?.captchaJobUrl);
            const wantedAppId = Number(msg.applicationId || 0) || 0;

            const ghFor = (url) => {
                try {
                    const u = new URL(url);
                    if (!/greenhouse\.io/i.test(u.hostname)) return '';
                    const forParam = (u.searchParams.get('for') || '').toLowerCase();
                    if (forParam) return forParam;
                    // job-boards.greenhouse.io/daymark/jobs/123 → daymark
                    const m = u.pathname.match(/^\/([^/]+)(?:\/|$)/);
                    if (m && !/^(embed|jobs|job_app|s)$/i.test(m[1])) return m[1].toLowerCase();
                    return '';
                } catch {
                    return '';
                }
            };
            const ghToken = (url) => {
                try {
                    const u = new URL(url);
                    if (!/greenhouse\.io/i.test(u.hostname)) return '';
                    return u.searchParams.get('token') || '';
                } catch {
                    return '';
                }
            };
            const ghJobId = (url) => {
                try {
                    const u = new URL(url);
                    if (!/greenhouse\.io/i.test(u.hostname)) return '';
                    const tok = u.searchParams.get('token') || '';
                    if (tok) return tok;
                    const m = u.pathname.match(/\/jobs\/(\d+)/i);
                    return m ? m[1] : '';
                } catch {
                    return '';
                }
            };

            const urlsLooselySameJob = (a, b) => {
                const left = String(a || '');
                const right = String(b || '');
                if (!left || !right) return false;
                if (left === right) return true;
                const t1 = ghToken(left);
                const t2 = ghToken(right);
                if (t1 && t2) return t1 === t2;
                const id1 = ghJobId(left);
                const id2 = ghJobId(right);
                const f1 = ghFor(left);
                const f2 = ghFor(right);
                // Same Greenhouse board + same job id/token (listing URL vs embed URL).
                if (f1 && f2 && f1 === f2 && id1 && id2 && id1 === id2) return true;
                // Lever: jobs.lever.co/{company}/{uuid}[/apply]
                try {
                    const u1 = new URL(left);
                    const u2 = new URL(right);
                    const h1 = u1.hostname.replace(/^www\./, '');
                    const h2 = u2.hostname.replace(/^www\./, '');
                    if (/lever\.co$/i.test(h1) && /lever\.co$/i.test(h2)) {
                        const p1 = u1.pathname.split('/').filter(Boolean);
                        const p2 = u2.pathname.split('/').filter(Boolean);
                        if (p1[0] && p2[0] && p1[0].toLowerCase() === p2[0].toLowerCase()
                            && p1[1] && p2[1] && p1[1].toLowerCase() === p2[1].toLowerCase()) {
                            return true;
                        }
                    }
                    // Ashby: *.ashbyhq.com/{org}/... job id in path
                    if (/ashbyhq\.com$/i.test(h1) && /ashbyhq\.com$/i.test(h2)) {
                        const strip = (p) => p.replace(/\/(application|apply)\/?$/i, '').replace(/\/$/, '');
                        if (strip(u1.pathname).toLowerCase() === strip(u2.pathname).toLowerCase()) return true;
                    }
                    // Workday: same host + job path segment
                    if (/myworkdayjobs\.com|workdayjobs\.com/i.test(h1) && h1 === h2) {
                        const strip = (p) => p.replace(/\/+/g, '/').replace(/\/$/, '').toLowerCase();
                        if (strip(u1.pathname) === strip(u2.pathname)) return true;
                        const jobSeg = (p) => {
                            const m = p.match(/\/job\/([^/]+)/i) || p.match(/\/(\d{4,})(?:\/|$)/);
                            return m ? m[1].toLowerCase() : '';
                        };
                        const j1 = jobSeg(u1.pathname);
                        const j2 = jobSeg(u2.pathname);
                        if (j1 && j2 && j1 === j2) return true;
                    }
                    const normH = (h) => h.replace(/^www\./, '').replace(/^job-boards\./, 'boards.');
                    if (normH(h1) === normH(h2)
                        && u1.pathname.replace(/\/$/, '') === u2.pathname.replace(/\/$/, '')) {
                        return true;
                    }
                    // Same company careers host + same path prefix (custom ATS like Evio)
                    if (normH(h1) === normH(h2)) {
                        const base = (p) => p.replace(/\/(apply|application|jobs?)\/?$/i, '').replace(/\/$/, '').toLowerCase();
                        if (base(u1.pathname) && base(u1.pathname) === base(u2.pathname)) return true;
                    }
                } catch {
                    /* ignore */
                }
                return false;
            };

            const looksLikeApplyTab = (url) => {
                const s = String(url || '');
                if (!s || brokenLanding(s)) return false;
                return /greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs\.com|workday\.|icims\.com|smartrecruiters\.com|bamboohr\.com|oraclecloud\.com|job-boards\.|\/apply|\/application|\/jobs\//i.test(s);
            };

            const tabMatchesWanted = (tabUrl) => {
                if (!wantedUrl) return true;
                return urlsLooselySameJob(tabUrl, wantedUrl);
            };

            async function tabAlive(id) {
                if (!id) return null;
                try {
                    return await chrome.tabs.get(id);
                } catch {
                    return null;
                }
            }

            async function focusTab(tab) {
                await chrome.tabs.update(tab.id, { active: true });
                if (tab.windowId != null) {
                    try { await chrome.windows.update(tab.windowId, { focused: true }); } catch (_) { /* ignore */ }
                }
            }

            let reopened = false;
            let navigated = false;
            let focusedExisting = false;
            let tabId = null;
            let tabUrl = '';

            // 0) Tab remembered for this applicationId — only if URL still matches THIS job.
            if (wantedAppId) {
                const mapped = Number(st?.tabsByAppId?.[String(wantedAppId)] || 0) || 0;
                if (mapped) {
                    const t = await tabAlive(mapped);
                    const u = t ? (t.pendingUrl || t.url || '') : '';
                    if (t && wantedUrl && tabMatchesWanted(u)) {
                        await focusTab(t);
                        tabId = t.id;
                        tabUrl = u;
                        focusedExisting = true;
                    } else if (t && wantedUrl && !tabMatchesWanted(u)) {
                        // Stale map pointed at another ATS/job (e.g. Lever while user wants Greenhouse).
                        // Navigate this owned tab to the correct URL instead of focusing the wrong form.
                        try {
                            await chrome.tabs.update(t.id, { url: wantedUrl, active: true });
                            if (t.windowId != null) {
                                try { await chrome.windows.update(t.windowId, { focused: true }); } catch (_) { /* ignore */ }
                            }
                            tabId = t.id;
                            tabUrl = wantedUrl;
                            focusedExisting = true;
                            navigated = true;
                        } catch (_) { /* create below */ }
                    } else if (t && !wantedUrl) {
                        // No URL from Control — refuse to trust a mapped tab alone (wrong-job risk).
                    }
                }
            }

            // 1) Prefer exact Live-monitor / queue tabs — only if they match THIS job URL.
            if (!focusedExisting) {
                const preferredIds = [
                    msg.tabId,
                    wantedAppId && String(st?.currentId) === String(wantedAppId) ? st?.captchaTabId : null,
                    wantedAppId && String(st?.currentId) === String(wantedAppId) ? st?.currentTabId : null
                    // Never fall back to captchaTabId/currentTabId without wantedAppId —
                    // that focused leftover Lever/Greenhouse tabs for the wrong job.
                ].map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);

                for (const id of preferredIds) {
                    const t = await tabAlive(id);
                    if (!t) continue;
                    const u = t.pendingUrl || t.url || '';
                    if (brokenLanding(u) && !looksLikeApplyTab(u)) continue;
                    if (!wantedUrl || !tabMatchesWanted(u)) continue;
                    await focusTab(t);
                    tabId = t.id;
                    tabUrl = u;
                    focusedExisting = true;
                    break;
                }
            }

            // 2) Search existing apply tabs — MUST match wanted URL (token/job id).
            if (!focusedExisting && wantedUrl) {
                try {
                    const bgId = (await chrome.storage.session.get(['bidderBgWindowId']))?.bidderBgWindowId;
                    const pools = [];
                    if (bgId) {
                        try { pools.push({ tabs: await chrome.tabs.query({ windowId: bgId }), bidderWin: true }); } catch (_) { /* ignore */ }
                    }
                    pools.push({ tabs: await chrome.tabs.query({}), bidderWin: false });
                    const seen = new Set();
                    const wantedTok = ghToken(wantedUrl);
                    const wantedJob = ghJobId(wantedUrl);
                    outer: for (const pool of pools) {
                        for (const t of pool.tabs || []) {
                            if (!t?.id || seen.has(t.id)) continue;
                            seen.add(t.id);
                            const u = t.pendingUrl || t.url || '';
                            if (!looksLikeApplyTab(u) && !tabMatchesWanted(u)) continue;
                            const match = urlsLooselySameJob(u, wantedUrl)
                                || (wantedTok && ghToken(u) === wantedTok)
                                || (wantedJob && ghJobId(u) === wantedJob && ghFor(u) === ghFor(wantedUrl));
                            if (!match) continue;
                            await focusTab(t);
                            tabId = t.id;
                            tabUrl = u;
                            focusedExisting = true;
                            break outer;
                        }
                    }
                } catch (_) { /* ignore */ }
            }

            // 3) REMOVED: never focus a random recent apply tab when URL is missing
            // (that opened leftover Lever while the user selected Greenhouse Figma).

            if (!focusedExisting) {
                if (!wantedUrl) {
                    throw new Error(
                        'No apply URL for this job. Select the Job Link / Bid course that has the Greenhouse/Lever apply link, then Open again.'
                    );
                }
                // Never open LinkedIn / non-apply source pages as the "apply tab".
                if (/linkedin\.com/i.test(wantedUrl)) {
                    throw new Error(
                        'Open tab would launch a LinkedIn/source URL, not the filled apply form. Process again so Lumi keeps the apply tab.'
                    );
                }
                let created = null;
                try {
                    const bgWin = await getOrCreateBidderBgWindow();
                    if (bgWin?.id) {
                        created = await chrome.tabs.create({
                            windowId: bgWin.id,
                            url: wantedUrl,
                            active: true
                        });
                        try { await chrome.windows.update(bgWin.id, { focused: true }); } catch (_) { /* ignore */ }
                    }
                } catch (_) { /* ignore */ }
                if (!created?.id) {
                    created = await chrome.tabs.create({ url: wantedUrl, active: true });
                }
                tabId = created.id;
                tabUrl = wantedUrl;
                reopened = true;
            } else if (wantedUrl && tabUrl && !tabMatchesWanted(tabUrl) && msg.forceNavigate !== false) {
                // Final safety: focused tab still wrong host/job → navigate.
                try {
                    await chrome.tabs.update(tabId, { url: wantedUrl });
                    tabUrl = wantedUrl;
                    navigated = true;
                } catch (_) { /* ignore */ }
            }

            const patch = {
                currentTabId: tabId,
                captchaTabMissing: false,
                ownedTabAlive: true
            };
            if (wantedAppId) patch.currentId = wantedAppId;
            if (wantedUrl && !/linkedin\.com/i.test(wantedUrl)) patch.currentJobUrl = wantedUrl;
            else if (tabUrl && looksLikeApplyTab(tabUrl)) patch.currentJobUrl = tabUrl;
            if (wantedAppId && tabId) {
                patch.tabsByAppId = {
                    ...(st?.tabsByAppId || {}),
                    [String(wantedAppId)]: tabId
                };
            }
            if (st?.status === 'awaiting_captcha' || st?.captchaTabId || focusedExisting || reopened) {
                patch.captchaTabId = tabId;
                if (patch.currentJobUrl) patch.captchaJobUrl = patch.currentJobUrl;
                if (wantedAppId) patch.captchaApplicationId = wantedAppId;
                if (st?.status === 'awaiting_captcha') patch.status = 'awaiting_captcha';
            }
            // Clear stale "Tab closed" coach so Control reflects the live tab.
            if (focusedExisting || reopened) {
                patch.coachStatus = reopened
                    ? 'Apply tab reopened — click Re-fill to start filling'
                    : 'Apply tab focused — click Re-fill if fields are empty';
                patch.coachAt = Date.now();
                if (/tab_closed/i.test(String(st?.lastStatusEvent || ''))) {
                    patch.lastStatusEvent = reopened ? 'tab_reopened' : 'tab_focused';
                    patch.lastStatusAt = Date.now();
                    patch.lastStatusMeta = {
                        ...(st?.lastStatusMeta || {}),
                        reason: reopened ? 'reopened' : 'focused_existing',
                        tabId
                    };
                }
            }
            await setQueueState(patch);

            if (wantedAppId && tabId) {
                void uploadScreenshot(wantedAppId, reopened ? 'reopened' : 'live', tabId, {
                    settleMs: 0,
                    stayInApp: true
                }).catch(() => {});
            }

            await chrome.storage.session.set({
                captchaUserFocusHoldUntil: Date.now() + 10 * 60 * 1000
            });
            sendResponse({
                ok: true,
                tabId,
                reopened,
                navigated,
                focusedExisting,
                applicationId: wantedAppId || null,
                url: patch.currentJobUrl || tabUrl || null,
                needsRefill: !!(reopened || focusedExisting)
            });
        })().catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
        return true;
    }
    if (msg?.type === 'BIDDER_CAPTCHA_SKIP') {
        (async () => {
            const st = await getQueueState();
            await setQueueState({
                captchaAbandonRequested: true,
                captchaResolved: false,
                status: st?.status === 'awaiting_captcha' ? 'awaiting_captcha' : 'running'
            });
            // If wait loop already dead, clear stuck banner + close leftover tab.
            if (st?.captchaTabId) {
                try { await chrome.tabs.remove(st.captchaTabId); } catch (_) { /* ignore */ }
            }
            try { await chrome.storage.session.remove('captchaUserFocusHoldUntil'); } catch (_) { /* ignore */ }
            if (st?.captchaApplicationId) {
                await logCourseEvent(st.captchaApplicationId, 'captcha_abandoned', {
                    via: 'user_skip',
                    engine: 'captcha-pass-v9'
                }).catch(() => {});
            }
            await setQueueState({
                status: 'running',
                captchaKind: null,
                captchaTabId: null,
                captchaApplicationId: null,
                captchaJobUrl: null,
                captchaTabMissing: false,
                captchaAbandonRequested: false,
                nextClicked: true
            });
            sendResponse({ ok: true, skipped: true });
        })().catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
        return true;
    }
    // Manual re-run of bidder fill on the current apply tab (FILLED / incomplete / post-CAPTCHA).
    if (msg?.type === 'BIDDER_LIST_QUESTIONS') {
        (async () => {
            try {
                const st = await getQueueState();
                const appId = Number(msg.applicationId || st?.currentId || st?.lastApplicationId || 0) || null;
                let tabId = await resolveOpenApplyTabId({
                    tabId: msg.tabId || st?.currentTabId || st?.captchaTabId,
                    applicationId: appId,
                    url: msg.url || st?.currentJobUrl || ''
                });
                if (!tabId) {
                    sendResponse({ ok: false, error: 'No apply tab open. Process or Open tab first.' });
                    return;
                }
                await ensureScripts(tabId);
                const packed = await loadBidderQuestions(tabId, {
                    applyUrl: msg.url || st?.currentJobUrl || '',
                    tabUrl: (await chrome.tabs.get(tabId).catch(() => null))?.url || ''
                });
                const filledQa = await sendTabMessage(tabId, { type: 'COLLECT_FILLED_QA' }).catch(() => null);
                const byId = new Map();
                for (const item of (filledQa?.items || [])) {
                    const k = String(item.id || item.label || '').toLowerCase();
                    if (k) byId.set(k, String(item.answer || '').trim());
                }
                const questions = mergeBidderQuestions(
                    packed.questions || [],
                    (packed.formSnap?.questions || []).map(panelQuestionFromField).filter(Boolean),
                    (packed.formSnap?.fields || []).map(panelQuestionFromField).filter(Boolean),
                    (packed.collected?.fields || []).map(panelQuestionFromField).filter(Boolean)
                ).map((q) => {
                    const key = String(q.id || q.label || '').toLowerCase();
                    const fromLive = byId.get(key) || q.answer || q.value || '';
                    return {
                        id: String(q.id || q.label || ''),
                        label: String(q.label || q.id || 'Question'),
                        type: q.type || 'text',
                        kind: q.kind || q.answer_type || 'written',
                        required: !!q.required,
                        value: fromLive,
                        answer: fromLive,
                        options: q.options
                    };
                });
                sendResponse({
                    ok: true,
                    tabId,
                    count: questions.length,
                    questions
                });
            } catch (err) {
                sendResponse({ ok: false, error: err?.message || String(err) });
            }
        })();
        return true;
    }

    if (msg?.type === 'BIDDER_APPLY_ANSWERS') {
        (async () => {
            try {
                const answersIn = Array.isArray(msg.answers) ? msg.answers : [];
                const answers = answersIn
                    .map((a) => ({
                        id: String(a?.id || a?.label || '').trim(),
                        label: String(a?.label || a?.id || '').trim(),
                        answer: String(a?.answer ?? a?.value ?? '').trim(),
                        type: a?.type || 'text',
                        kind: a?.kind || a?.answer_type || 'written'
                    }))
                    .filter((a) => a.label || a.id);
                if (!answers.length) {
                    sendResponse({ ok: false, error: 'No answers to apply' });
                    return;
                }
                const st = await getQueueState();
                const prefs = await getBidderPrefs();
                const appId = Number(
                    msg.applicationId
                    || st?.currentId
                    || st?.captchaApplicationId
                    || st?.lastApplicationId
                    || 0
                ) || null;
                let tabId = Number(msg.tabId || st?.currentTabId || st?.captchaTabId || 0) || null;
                if (tabId) {
                    try { await chrome.tabs.get(tabId); } catch { tabId = null; }
                }
                if (!tabId) {
                    sendResponse({ ok: false, error: 'No apply tab open. Process or Open tab first.' });
                    return;
                }
                await ensureScripts(tabId);
                await ensureApplyFormVisible(tabId);
                const fillResp = await fillAndUpload(tabId, {
                    answers,
                    autoSubmit: false,
                    answersOnly: true,
                    preferPanelAnswers: true,
                    engine: 'control-panel-answers'
                });
                if (appId) {
                    await savePackage(appId, answers, {
                        filled: fillResp?.fillStats?.filled,
                        source: 'control_panel',
                        ats: fillResp?.ats || null
                    }).catch(() => {});
                    await logCourseEvent(appId, 'answers_applied_from_panel', {
                        count: answers.length,
                        filled: fillResp?.fillStats?.filled || 0
                    }).catch(() => {});
                    await uploadScreenshot(appId, 'live', tabId, {
                        settleMs: 200,
                        stayInApp: true
                    }).catch(() => {});
                }
                sendResponse({
                    ok: true,
                    filled: fillResp?.fillStats?.filled || 0,
                    tabId,
                    applicationId: appId,
                    answersCount: answers.length
                });
            } catch (err) {
                sendResponse({ ok: false, error: err?.message || String(err) });
            }
        })();
        return true;
    }

    if (msg?.type === 'BIDDER_INSTRUCT') {
        (async () => {
            try {
                const instruction = String(msg.instruction || '').trim();
                if (!instruction) {
                    sendResponse({ ok: false, error: 'Instruction is empty' });
                    return;
                }
                const st = await getQueueState();
                const prefs = await getBidderPrefs();
                const appId = Number(
                    msg.applicationId
                    || st?.currentId
                    || st?.captchaApplicationId
                    || st?.lastApplicationId
                    || 0
                ) || null;
                let tabId = await resolveOpenApplyTabId({
                    tabId: msg.tabId || st?.currentTabId || st?.captchaTabId,
                    applicationId: appId,
                    url: msg.url || st?.currentJobUrl || ''
                });
                if (!tabId) {
                    sendResponse({ ok: false, error: 'No apply tab open. Process or Open tab first.' });
                    return;
                }
                await ensureScripts(tabId);
                await ensureApplyFormVisible(tabId);

                let host = '';
                try {
                    const tab = await chrome.tabs.get(tabId);
                    host = new URL(tab.url || '').hostname.replace(/^www\./i, '');
                } catch (_) { /* ignore */ }

                const richest = await collectRichestApplySnap(tabId).catch(() => null);
                const snap = richest?.form || await collectForm(tabId).catch(() => null);
                const bidderSnap = richest?.engine
                    || await sendTabMessage(tabId, { type: 'BIDDER_ENGINE_COLLECT' }).catch(() => null);
                const fieldRows = [
                    ...(Array.isArray(bidderSnap?.fields) ? bidderSnap.fields : []),
                    ...(Array.isArray(snap?.fields) ? snap.fields : []),
                    ...(Array.isArray(snap?.questions) ? snap.questions : []),
                    ...(Array.isArray(bidderSnap?.questions) ? bidderSnap.questions : [])
                ];

                await logCourseEvent(appId, 'user_instruction', {
                    instruction: instruction.slice(0, 400),
                    host,
                    field_count: fieldRows.length
                }).catch(() => {});
                await notify('Lumi', `Instruction: ${instruction.slice(0, 80)}`);

                const interpreted = await interpretBidderInstruction({
                    instruction,
                    application_id: appId,
                    host,
                    ats: snap?.ats || bidderSnap?.ats || '',
                    fields: fieldRows.map((f) => ({
                        id: f.id,
                        label: f.label,
                        value: f.value ?? f.answer ?? '',
                        required: !!f.required,
                        kind: f.kind || '',
                        type: f.type || '',
                        options: Array.isArray(f.options)
                            ? f.options.map((o) => (typeof o === 'string' ? o : (o?.label || o?.value || ''))).filter(Boolean)
                            : undefined
                    })),
                    missing_required: fieldRows
                        .filter((f) => f.required && !String(f.value || f.answer || '').trim())
                        .map((f) => f.label || f.id)
                        .filter(Boolean)
                        .slice(0, 16)
                });

                if (!interpreted?.ok
                    && !interpreted?.fills?.length
                    && !interpreted?.clickSubmit
                    && !interpreted?.queueControl
                    && !interpreted?.reAutofill) {
                    sendResponse({
                        ok: false,
                        error: interpreted?.summary || interpreted?.error || 'Could not apply instruction',
                        summary: interpreted?.summary || null
                    });
                    return;
                }

                // Queue / control actions (pause, resume, stop, next, skip CAPTCHA)
                const qc = String(interpreted.queueControl || '').toLowerCase();
                if (qc === 'pause') {
                    await setQueueState({ pauseRequested: true, status: 'paused' });
                    await notify('Lumi', 'Paused — fix the form, then say Resume');
                    await setQueueState({
                        coachStatus: 'Paused — waiting for you',
                        coachAt: Date.now()
                    }).catch(() => {});
                    sendResponse({
                        ok: true,
                        queueControl: 'pause',
                        summary: interpreted.summary || 'Paused',
                        tabId,
                        applicationId: appId
                    });
                    return;
                }
                if (qc === 'resume') {
                    await setQueueState({ pauseRequested: false, status: 'running' });
                    await notify('Lumi', 'Resumed');
                    await setQueueState({
                        coachStatus: 'Resumed — continuing',
                        coachAt: Date.now()
                    }).catch(() => {});
                    sendResponse({
                        ok: true,
                        queueControl: 'resume',
                        summary: interpreted.summary || 'Resumed',
                        tabId,
                        applicationId: appId
                    });
                    return;
                }
                if (qc === 'stop') {
                    await setQueueState({
                        stopRequested: true,
                        pauseRequested: false,
                        running: false,
                        status: 'stopped',
                        queueEndedAt: Date.now()
                    });
                    await releaseQueueLock().catch(() => {});
                    await notify('Lumi', 'Stopped');
                    sendResponse({
                        ok: true,
                        queueControl: 'stop',
                        summary: interpreted.summary || 'Stopped',
                        tabId,
                        applicationId: appId
                    });
                    return;
                }
                if (qc === 'next') {
                    await setQueueState({ nextClicked: true, pauseRequested: false, status: 'running' });
                    await notify('Lumi', 'Next job');
                    sendResponse({
                        ok: true,
                        queueControl: 'next',
                        summary: interpreted.summary || 'Next job',
                        tabId,
                        applicationId: appId
                    });
                    return;
                }
                if (qc === 'skip') {
                    await setQueueState({
                        captchaAbandonRequested: true,
                        captchaResolved: false
                    });
                    await notify('Lumi', 'Skip CAPTCHA / blocked job');
                    sendResponse({
                        ok: true,
                        queueControl: 'skip',
                        summary: interpreted.summary || 'Skip CAPTCHA',
                        tabId,
                        applicationId: appId
                    });
                    return;
                }

                // Re-autofill this apply tab — signal client / return so REAUTOFILL can run.
                if (interpreted.reAutofill) {
                    await setQueueState({
                        coachStatus: 'Re-autofill requested…',
                        coachAt: Date.now()
                    }).catch(() => {});
                    await notify('Lumi', 'Re-autofilling…');
                    await logCourseEvent(appId, 'instruction_reautofill', {
                        summary: interpreted.summary || null,
                        host
                    }).catch(() => {});
                    sendResponse({
                        ok: true,
                        reAutofill: true,
                        summary: interpreted.summary || 'Re-autofill',
                        tabId,
                        applicationId: appId
                    });
                    return;
                }

                const fills = Array.isArray(interpreted.fills) ? interpreted.fills : [];
                let filled = 0;
                // Keep alphanumeric Greenhouse codes (e.g. wFY53Ht3) — do NOT strip letters.
                let otpCode = String(
                    interpreted.emailOtp
                    || fills.find((f) => f.answer_type === 'email_otp' || /security|otp|verif|code/i.test(f.label || ''))?.answer
                    || ''
                ).replace(/[^A-Za-z0-9]/g, '').trim();
                if (!otpCode) {
                    const m = instruction.match(
                        /(?:(?:this\s+is\s+(?:the\s+)?)?code|security\s*code|otp)\s*(?:is|:|=)?\s*([A-Za-z0-9]{4,12})\b/i
                    ) || instruction.match(/^\s*([A-Za-z0-9]{4,12})\s*$/);
                    if (m?.[1]) otpCode = m[1];
                }

                // Prefer dedicated OTP injector (Greenhouse React) over generic written fill.
                if (otpCode && otpCode.length >= 4 && otpCode.length <= 12) {
                    let otpOk = false;
                    const r = await fillEmailSecurityCode(tabId, otpCode).catch(() => null);
                    otpOk = !!r?.filled;
                    if (otpOk) filled += 1;
                    if (!otpOk) {
                        const fillResp = await fillAndUpload(tabId, {
                            answers: [{
                                id: fills[0]?.id || 'email_otp',
                                label: fills[0]?.label || 'Security code',
                                answer: otpCode,
                                answer_type: 'written',
                                source: 'user_instruct'
                            }],
                            autoSubmit: false,
                            answersOnly: true,
                            engine: 'instruct-lumi-otp'
                        });
                        filled += fillResp?.fillStats?.filled || 0;
                    }
                    await new Promise((r) => setTimeout(r, 600));
                } else if (fills.length) {
                    const fillResp = await fillAndUpload(tabId, {
                        answers: fills.map((f) => ({
                            id: f.id || f.label,
                            label: f.label,
                            answer: f.answer,
                            answer_type: 'written',
                            source: 'user_instruct'
                        })),
                        autoSubmit: false,
                        answersOnly: true,
                        engine: 'instruct-lumi'
                    });
                    filled = fillResp?.fillStats?.filled || 0;
                }

                let submitClicked = false;
                if (interpreted.clickSubmit || otpCode || fills.length) {
                    // Always force after OTP — required-field scan often still sees empty React inputs.
                    const force = !!(interpreted.clickSubmit || otpCode);
                    const sub = await sendTabMessage(tabId, {
                        type: 'BIDDER_ENGINE_SUBMIT',
                        force
                    }).catch(() => null);
                    submitClicked = !!sub?.clicked;
                    if (!submitClicked) {
                        const sub2 = await sendTabMessage(tabId, { type: 'CLICK_SUBMIT' }).catch(() => null);
                        submitClicked = !!sub2?.clicked || !!sub2?.submitStats?.clicked;
                    }
                    // Greenhouse sometimes uses Confirm / Verify instead of Submit
                    if (!submitClicked && otpCode) {
                        const conf = await clickPostOtpSubmit(tabId).catch(() => null);
                        submitClicked = !!conf?.clicked;
                    }
                }

                await saveFillLesson({
                    host,
                    fieldKey: interpreted.fieldKey || 'form',
                    issueKey: interpreted.issueKey || 'user_instruct',
                    instruction,
                    actions: { fills, clickSubmit: !!interpreted.clickSubmit },
                    ats: snap?.ats || '',
                    source: 'user_instruct'
                }).catch(() => {});
                await saveBidderFillLesson({
                    host,
                    field_key: interpreted.fieldKey || 'form',
                    issue_key: interpreted.issueKey || 'user_instruct',
                    instruction,
                    actions: { fills, clickSubmit: !!interpreted.clickSubmit },
                    ats: snap?.ats || '',
                    source: 'user_instruct'
                }).catch(() => {});

                if (appId) {
                    await logCourseEvent(appId, 'instruction_applied', {
                        filled,
                        submitClicked,
                        summary: interpreted.summary || null,
                        fieldKey: interpreted.fieldKey || null,
                        issueKey: interpreted.issueKey || null
                    }).catch(() => {});
                    await uploadScreenshot(appId, 'live', tabId, {
                        settleMs: 200,
                        stayInApp: true
                    }).catch(() => {});
                }

                let success = false;
                if (submitClicked) {
                    await new Promise((r) => setTimeout(r, 2000));
                    success = await detectSubmitSuccess(tabId);
                    if (success && appId) {
                        await markApplicationApplied(appId);
                        await logCourseEvent(appId, 'marked_applied', { via: 'instruct' }).catch(() => {});
                        await setQueueState({
                            status: 'running',
                            captchaKind: null,
                            captchaTabId: null,
                            captchaApplicationId: null,
                            coachStatus: null
                        }).catch(() => {});
                        await notify('Lumi', 'SUCCESS — thank-you');
                    } else {
                        await notify('Lumi', submitClicked
                            ? (otpCode
                                ? 'Code filled + Submit clicked — check thank-you page'
                                : 'Instruction applied — submit clicked')
                            : 'Instruction applied');
                    }
                } else {
                    await notify('Lumi', `Instruction applied · ${filled} fields`);
                }

                await setQueueState({
                    coachStatus: success
                        ? 'Learned — instruction led to SUCCESS'
                        : `Learned — ${interpreted.fieldKey || 'fix'} · ${host || 'host'}`,
                    coachAt: Date.now(),
                    lastStatusEvent: success ? 'marked_applied' : 'instruction_applied',
                    lastStatusAt: Date.now()
                }).catch(() => {});

                sendResponse({
                    ok: true,
                    filled,
                    submitClicked,
                    success,
                    tabId,
                    applicationId: appId,
                    summary: interpreted.summary || 'Instruction applied',
                    coach: success ? 'Learned — SUCCESS' : `Learned — ${interpreted.fieldKey || 'fix'}`
                });
            } catch (err) {
                sendResponse({ ok: false, error: err?.message || String(err) });
            }
        })();
        return true;
    }

    if (msg?.type === 'BIDDER_REAUTOFILL') {
        (async () => {
            const st = await getQueueState();
            const prefs = await getBidderPrefs();
            const appId = Number(
                msg.applicationId
                || st?.currentId
                || st?.captchaApplicationId
                || st?.lastApplicationId
                || 0
            ) || null;
            const cleanUrl = (raw) => {
                const s = String(raw || '').trim();
                if (!s) return '';
                if (/[?&]error=true\b/i.test(s) || /\/embed\/job_board/i.test(s)) return '';
                if (isAshbyJobDescriptionUrl(s)) return ashbyApplicationUrl(s);
                return s;
            };
            const wantedUrl = cleanUrl(msg.url)
                || cleanUrl(st?.currentJobUrl)
                || cleanUrl(st?.captchaJobUrl);
            let tabId = await resolveOpenApplyTabId({
                tabId: Number(msg.tabId || st?.currentTabId || st?.captchaTabId || 0) || null,
                applicationId: appId,
                url: wantedUrl
            });
            let reopened = false;
            if (!tabId && wantedUrl) {
                const created = await chrome.tabs.create({ url: wantedUrl, active: true });
                tabId = created.id;
                reopened = true;
                try {
                    if (created.windowId != null) {
                        await chrome.windows.update(created.windowId, { focused: true });
                    }
                } catch (_) { /* ignore */ }
            }
            if (tabId) {
                await setQueueState({
                    currentTabId: tabId,
                    currentJobUrl: wantedUrl || undefined,
                    captchaTabMissing: false,
                    ...(appId
                        ? {
                            tabsByAppId: {
                                ...(st?.tabsByAppId || {}),
                                [String(appId)]: tabId
                            }
                        }
                        : {})
                });
            }
            if (!tabId || !appId) {
                sendResponse({
                    ok: false,
                    error: 'No active apply job to re-autofill. Process a job first (or Open tab), then try again.'
                });
                return;
            }
            try {
                await chrome.tabs.update(tabId, { active: true });
                const tab = await chrome.tabs.get(tabId);
                if (tab.windowId != null) {
                    await chrome.windows.update(tab.windowId, { focused: true });
                }
            } catch (_) { /* ignore */ }
            await setQueueState({
                status: 'running',
                reautofilling: true,
                currentTabId: tabId,
                currentId: appId
            });
            await logCourseEvent(appId, 'reautofill_started', {
                tabId,
                reopened,
                via: 'ui'
            }).catch(() => {});
            try {
                const injected = await ensureScripts(tabId);
                if (!injected) {
                    const still = await chrome.tabs.get(tabId).catch(() => null);
                    if (!still) throw Object.assign(new Error('Tab closed'), { tabClosed: true });
                }
                // Give a reopened / Ready panel tab a moment to paint the form.
                await new Promise((r) => setTimeout(r, reopened ? 1800 : 600));
                await ensureScripts(tabId);
                await ensureApplyFormVisible(tabId).catch(() => {});
                const result = await runBidderFillOnTab(tabId, {
                    id: appId,
                    company_name: 'Job',
                    job_role: ''
                }, {
                    ...prefs,
                    bidDeadline: Date.now() + BID_HARD_LIMIT_MS
                });
                await logCourseEvent(appId, 'reautofill_done', {
                    filled: result?.filled || 0,
                    submitClicked: !!result?.submitClicked,
                    incomplete: !!result?.incomplete,
                    requiredOk: result?.requiredOk,
                    requiredTotal: result?.requiredTotal,
                    reopened
                }).catch(() => {});
                await uploadScreenshot(appId, 'reautofill_after', tabId, { stayInApp: true }).catch(() => {});
                const confirmed = await finalizeSubmitSuccessIfDetected(tabId, appId, 'reautofill').catch(() => null);
                const applied = !!confirmed?.ok;
                const prevStatus = String(st?.status || '');
                await setQueueState({
                    reautofilling: false,
                    status: applied
                        ? 'running'
                        : (/awaiting_next/i.test(prevStatus) ? 'awaiting_next' : 'running'),
                    currentTabId: tabId,
                    ...(applied ? { missingRequired: [] } : {})
                });
                sendResponse({
                    ok: true,
                    filled: result?.filled || 0,
                    submitClicked: !!result?.submitClicked,
                    incomplete: applied ? false : !!result?.incomplete,
                    success: applied,
                    tabId,
                    applicationId: appId,
                    reopened
                });
            } catch (err) {
                await setQueueState({ reautofilling: false }).catch(() => {});
                await logCourseEvent(appId, 'reautofill_failed', {
                    error: err?.message || String(err)
                }).catch(() => {});
                throw err;
            }
        })().catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
        return true;
    }

    if (msg?.type === 'BIDDER_UPDATE_STATE' || msg?.type === 'BIDDER_SUBMIT') {
        (async () => {
            const st = await getQueueState();
            const prefs = await getBidderPrefs();
            const appId = Number(
                msg.applicationId
                || st?.currentId
                || st?.captchaApplicationId
                || st?.lastApplicationId
                || 0
            ) || null;

            const cleanUrl = (raw) => {
                const s = String(raw || '').trim();
                if (!s) return '';
                if (/[?&]error=true\b/i.test(s) || /\/embed\/job_board/i.test(s)) return '';
                if (isAshbyJobDescriptionUrl(s)) return ashbyApplicationUrl(s);
                return s;
            };
            const urlHint = cleanUrl(msg.url)
                || cleanUrl(st?.currentJobUrl)
                || cleanUrl(st?.captchaJobUrl)
                || '';

            const candidateIds = [
                Number(msg.tabId || 0) || 0,
                appId ? (Number(st?.tabsByAppId?.[String(appId)] || 0) || 0) : 0,
                Number(st?.currentTabId || 0) || 0,
                Number(st?.captchaTabId || 0) || 0,
                Number(st?.lastTabId || 0) || 0
            ].filter(Boolean);

            const aliveTabs = [];
            for (const id of [...new Set(candidateIds)]) {
                try {
                    const t = await chrome.tabs.get(id);
                    if (t?.id) aliveTabs.push(t);
                } catch (_) { /* gone */ }
            }

            // Prefer a tab that already shows thank-you / Application submitted!
            // Only among URL-matching candidates when we have a job URL hint —
            // never treat "customer success" form copy on a random tab as SUCCESS.
            let tabId = null;
            const preferSuccessAmong = async (tabs) => {
                for (const t of tabs) {
                    if (!t?.id) continue;
                    if (await detectSubmitSuccess(t.id).catch(() => false)) {
                        return t.id;
                    }
                }
                return null;
            };
            const urlMatchedAlive = urlHint
                ? aliveTabs.filter((t) => {
                    const u = t.pendingUrl || t.url || '';
                    return urlsLooselyMatch(u, urlHint) || String(u).includes(
                        (() => { try { return new URL(urlHint).hostname.replace(/^www\./i, ''); } catch (_) { return ''; } })()
                    );
                })
                : aliveTabs;
            tabId = await preferSuccessAmong(urlMatchedAlive.length ? urlMatchedAlive : []);
            if (!tabId && urlHint) {
                let hintHost = '';
                try { hintHost = new URL(urlHint).hostname.replace(/^www\./i, ''); } catch (_) { /* ignore */ }
                const all = await chrome.tabs.query({}).catch(() => []);
                const hostMatched = [];
                for (const t of all || []) {
                    if (!t?.id || !t.url || /^(chrome|edge|about|devtools):/i.test(t.url)) continue;
                    const hostOk = !hintHost || String(t.url).includes(hintHost)
                        || urlsLooselyMatch(t.url, urlHint);
                    if (!hostOk) continue;
                    hostMatched.push(t);
                    if (!aliveTabs.some((a) => a.id === t.id)) aliveTabs.push(t);
                }
                tabId = await preferSuccessAmong(hostMatched);
            }
            if (!tabId) tabId = (urlMatchedAlive[0] || aliveTabs[0])?.id || null;

            if (!tabId) {
                sendResponse({
                    ok: false,
                    error: 'No apply tab open. Open tab or Process first.'
                });
                return;
            }

            // CRITICAL: detect success BEFORE ensureApplyFormVisible — that helper
            // clicks Apply again and leaves the thank-you page for a blank form.
            let detect = await detectSubmitSuccessDetail(tabId).catch(() => ({ ok: false }));
            let success = !!detect?.ok;
            if (!success) {
                await clearFalseSuccessOutlines(tabId).catch(() => {});
                await ensureScripts(tabId).catch(() => {});
                await ensureApplyFormVisible(tabId).catch(() => {});
                detect = await detectSubmitSuccessDetail(tabId).catch(() => ({ ok: false }));
                success = !!detect?.ok;
            } else {
                await ensureScripts(tabId).catch(() => {});
            }

            if (msg.type === 'BIDDER_UPDATE_STATE') {
                let requiredOk = null;
                let requiredTotal = null;
                let missing = [];
                let incomplete = null;
                if (!success) {
                    try {
                        const snap = await sendTabMessage(tabId, {
                            type: 'BIDDER_ENGINE_COLLECT'
                        }).catch(() => null);
                        const fields = Array.isArray(snap?.fields) ? snap.fields : [];
                        const required = fields.filter((f) => f.required);
                        requiredTotal = required.length;
                        const empty = required.filter((f) => !String(f.value || '').trim());
                        requiredOk = requiredTotal - empty.length;
                        missing = empty.map((f) => f.label || f.id).filter(Boolean).slice(0, 12);
                        incomplete = empty.length > 0;
                    } catch (_) { /* ignore */ }
                    // Radios-only Ashby pages may report 0 "fields" — still incomplete.
                    if (incomplete == null && /form_still_open/i.test(String(detect?.reason || ''))) {
                        incomplete = true;
                        if (requiredTotal == null) {
                            requiredTotal = Number(detect?.radioCount) || 0;
                            requiredOk = 0;
                        }
                    }
                }

                let statusEvent = 'state_refreshed';
                if (success) statusEvent = 'marked_applied';
                else if (incomplete) statusEvent = 'fill_incomplete';
                else statusEvent = 'ready_to_submit';

                if (appId) {
                    if (success) {
                        try {
                            await markApplicationApplied(appId);
                        } catch (err) {
                            console.warn('[bidder] markApplicationApplied failed', err);
                        }
                        await logCourseEvent(appId, 'marked_applied', {
                            via: 'control_update_state',
                            success: true
                        }).catch((err) => console.warn('[bidder] marked_applied log failed', err));
                        await uploadSuccessProofScreenshot(appId, tabId, {
                            stayInApp: true,
                            waitMs: 600
                        }).catch(() =>
                            uploadScreenshot(appId, 'after_submit', tabId, {
                                settleMs: 200,
                                stayInApp: true
                            })
                        );
                    } else {
                        // Clear prior false SUCCESS (customer-success regex, latch, DB applied).
                        await clearFalseSuccessOutlines(tabId).catch(() => {});
                        try {
                            await clearFalseApplicationSuccess(appId);
                        } catch (_) { /* ignore */ }
                        await logCourseEvent(appId, 'success_revoked', {
                            via: 'control_update_state',
                            reason: detect?.reason || (incomplete ? 'fill_incomplete' : 'not_thank_you'),
                            radioCount: detect?.radioCount,
                            visibleFieldCount: detect?.visibleFieldCount
                        }).catch(() => {});
                        await logCourseEvent(appId, statusEvent, {
                            via: 'control_update_state',
                            success: false,
                            incomplete: !!incomplete,
                            requiredOk,
                            requiredTotal,
                            missing
                        }).catch(() => {});
                        await uploadScreenshot(appId, 'live', tabId, {
                            settleMs: 200,
                            stayInApp: true
                        }).catch(() => {});
                    }
                }
                await setQueueState({
                    lastStatusEvent: statusEvent,
                    lastStatusAt: Date.now(),
                    lastStatusMeta: {
                        success: !!success,
                        incomplete: incomplete == null ? undefined : !!incomplete,
                        requiredOk,
                        requiredTotal,
                        missing: success ? [] : missing,
                        detectReason: detect?.reason || null
                    },
                    missingRequired: success ? [] : (missing || []),
                    liveShotAt: Date.now(),
                    currentTabId: tabId,
                    currentId: appId || st?.currentId,
                    ...(appId ? {
                        tabsByAppId: {
                            ...(st?.tabsByAppId || {}),
                            [String(appId)]: tabId
                        }
                    } : {})
                }).catch(() => {});

                sendResponse({
                    ok: true,
                    success: !!success,
                    revoked: !success,
                    incomplete,
                    requiredOk,
                    requiredTotal,
                    missing,
                    statusEvent,
                    detectReason: detect?.reason || null,
                    tabId,
                    applicationId: appId
                });
                return;
            }

            // BIDDER_SUBMIT — if already on thank-you, just mark SUCCESS.
            if (success) {
                if (appId) {
                    try { await markApplicationApplied(appId); } catch (_) { /* ignore */ }
                    await logCourseEvent(appId, 'marked_applied', {
                        via: 'control_submit_already_done'
                    }).catch(() => {});
                    await uploadSuccessProofScreenshot(appId, tabId, {
                        stayInApp: true,
                        waitMs: 400
                    }).catch(() => {});
                }
                await setQueueState({
                    lastStatusEvent: 'marked_applied',
                    lastStatusAt: Date.now(),
                    liveShotAt: Date.now(),
                    currentTabId: tabId
                }).catch(() => {});
                sendResponse({
                    ok: true,
                    clicked: false,
                    success: true,
                    alreadySubmitted: true,
                    tabId,
                    applicationId: appId
                });
                return;
            }

            const force = msg.force !== false;
            let sub = await sendTabMessage(tabId, {
                type: 'BIDDER_ENGINE_SUBMIT',
                force
            }).catch(() => null);
            if (!sub?.clicked) {
                sub = await sendTabMessage(tabId, { type: 'CLICK_SUBMIT' }).catch(() => null);
            }
            const clicked = !!(sub?.clicked);
            if (appId) {
                await logCourseEvent(appId, clicked ? 'submit_clicked' : 'submit_no_click', {
                    via: 'control_submit',
                    force: !!force,
                    ...(sub || {})
                }).catch(() => {});
            }
            if (!clicked) {
                await setQueueState({
                    lastStatusEvent: 'submit_no_click',
                    lastStatusAt: Date.now(),
                    lastStatusMeta: {
                        reason: sub?.reason || 'no_submit_control',
                        missing: sub?.missing || []
                    },
                    currentTabId: tabId
                }).catch(() => {});
                sendResponse({
                    ok: false,
                    clicked: false,
                    error: sub?.reason === 'required_incomplete'
                        ? `Submit blocked — missing: ${(sub.missing || []).slice(0, 4).join('; ') || 'required fields'}`
                        : (sub?.reason || sub?.error || 'Could not find Submit on the apply tab'),
                    missing: sub?.missing || [],
                    tabId,
                    applicationId: appId
                });
                return;
            }

            await new Promise((r) => setTimeout(r, 2200));
            success = await detectSubmitSuccess(tabId).catch(() => false);
            if (appId) {
                if (success) {
                    try { await markApplicationApplied(appId); } catch (_) { /* ignore */ }
                    await logCourseEvent(appId, 'marked_applied', { via: 'control_submit' }).catch(() => {});
                    await uploadSuccessProofScreenshot(appId, tabId, {
                        stayInApp: true,
                        waitMs: 800
                    }).catch(() =>
                        uploadScreenshot(appId, 'after_submit', tabId, { stayInApp: true })
                    );
                } else {
                    await logCourseEvent(appId, 'needs_manual', {
                        reason: 'submit_no_thanks',
                        via: 'control_submit'
                    }).catch(() => {});
                    await uploadScreenshot(appId, 'live', tabId, {
                        settleMs: 200,
                        stayInApp: true
                    }).catch(() => {});
                }
            }
            await setQueueState({
                lastStatusEvent: success ? 'marked_applied' : 'submit_clicked',
                lastStatusAt: Date.now(),
                liveShotAt: Date.now(),
                currentTabId: tabId
            }).catch(() => {});
            if (prefs.stayInApp) {
                try { await refocusStayInAppHome(); } catch (_) { /* ignore */ }
            }
            sendResponse({
                ok: true,
                clicked: true,
                success: !!success,
                tabId,
                applicationId: appId,
                submit: sub || null
            });
        })().catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
        return true;
    }

    if (msg?.type === 'BIDDER_STOP') {
        setQueueState({
            stopRequested: true,
            pauseRequested: false,
            running: false,
            status: 'stopped',
            queueEndedAt: Date.now()
        })
            .then(() => releaseQueueLock())
            .then(() => sendResponse({ ok: true }))
            .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
        return true;
    }
    if (msg?.type === 'BIDDER_PAUSE') {
        setQueueState({
            pauseRequested: true,
            status: 'paused'
        })
            .then(() => notify('Bidder', 'Paused — fix the form, then Resume').catch(() => {}))
            .then(() => sendResponse({ ok: true, paused: true }))
            .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
        return true;
    }
    if (msg?.type === 'BIDDER_RESUME') {
        setQueueState({
            pauseRequested: false,
            status: 'running'
        })
            .then(() => notify('Bidder', 'Resumed').catch(() => {}))
            .then(() => sendResponse({ ok: true, paused: false }))
            .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
        return true;
    }
    if (msg?.type === 'BIDDER_QUEUE_STATE') {
        Promise.all([getQueueState(), getUiMessageLog()])
            .then(async ([data, uiMessageLog]) => {
                const enriched = await enrichQueueSnapshot(data || {});
                sendResponse({
                    ok: true,
                    data: {
                        ...enriched,
                        uiMessageLog
                    }
                });
            })
            .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
        return true;
    }
    if (msg?.type === 'SUBMITTED_OK') {
        (async () => {
            const id = msg.applicationId || (await getSettings()).lastResult?.applicationId;
            if (!id) throw new Error('No application id');
            await markApplicationApplied(id);
            await logCourseEvent(id, 'marked_applied', { via: 'submitted_ok' });
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab?.id) {
                await uploadSuccessProofScreenshot(id, tab.id, { waitMs: 1200, settleMs: 800 });
                try { await chrome.tabs.remove(tab.id); } catch (_) {}
            }
            return { id };
        })()
            .then((data) => sendResponse({ ok: true, data }))
            .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
        return true;
    }
    if (msg?.type === 'MARK_APPLIED') {
        markApplicationApplied(msg.applicationId)
            .then((data) => sendResponse({ ok: true, data }))
            .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
        return true;
    }
    if (msg?.type === 'CONNECT_JOB_LINKS') {
        (async () => {
            const version = chrome.runtime.getManifest()?.version || '0';
            const injected = await reinjectAppBridgeIntoAppTabs();
            if (!injected) {
                return {
                    ok: false,
                    version,
                    error: `No Job Links / app tab open. Open ${appOpenHint()} then try again.`
                };
            }
            return { ok: true, version, injected };
        })()
            .then((data) => sendResponse(data))
            .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
        return true;
    }
    return false;
});

async function reinjectAppBridgeIntoAppTabs() {
    const patterns = APP_TAB_QUERY_PATTERNS;
    let tabs = [];
    try {
        tabs = await chrome.tabs.query({ url: patterns });
    } catch (_) {
        return 0;
    }
    let injected = 0;
    for (const tab of tabs) {
        if (!tab?.id) continue;
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content/app-bridge.js']
            });
            injected += 1;
        } catch (err) {
            console.warn('[bidder] reinject app-bridge failed', tab.id, err?.message || err);
        }
    }
    return injected;
}

chrome.runtime.onInstalled.addListener((details) => {
    // Reload / update: clear stuck Autofill/Bidder locks so Process works again.
    chrome.storage.local.set({
        [FILLING_KEY]: false,
        [FILLING_AT_KEY]: 0
    }).catch(() => {});
    setQueueState({
        running: false,
        status: 'idle',
        stopRequested: false,
        pauseRequested: false,
        error: null
    }).catch(() => {});
    // Re-inject into open Job Links tabs so the user does not need Ctrl+Shift+R.
    reinjectAppBridgeIntoAppTabs()
        .then((n) => console.log(`[bidder] reinjected app-bridge into ${n} tab(s) after ${details?.reason || 'install'}`))
        .catch(() => {});
});

chrome.runtime.onStartup?.addListener?.(() => {
    chrome.storage.local.set({
        [FILLING_KEY]: false,
        [FILLING_AT_KEY]: 0
    }).catch(() => {});
    reinjectAppBridgeIntoAppTabs().catch(() => {});
});

// Page → extension direct channel (no content-script required after Reload Lumi).
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
    const origin = String(sender?.origin || sender?.url || '');
    if (!isAllowedAppOrigin(origin)) {
        sendResponse({ ok: false, error: 'origin_not_allowed' });
        return false;
    }
    if (msg?.type === 'BIDDER_PING') {
        sendResponse({
            ok: true,
            version: chrome.runtime.getManifest()?.version || '0',
            extensionId: chrome.runtime.id,
            engine: 'bidder-engine-v1',
            autofillEngine: AUTOFILL_ENGINE,
            via: 'external'
        });
        return false;
    }
    if (msg?.type === 'BIDDER_PROBE_CAPTCHA_HELPERS') {
        probeCaptchaHelpers()
            .then((helpers) => sendResponse({ ok: true, ...helpers, via: 'external' }))
            .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
        return true;
    }
    if (msg?.type === 'REINJECT_APP_BRIDGE') {
        reinjectAppBridgeIntoAppTabs()
            .then((n) => sendResponse({
                ok: true,
                injected: n,
                version: chrome.runtime.getManifest()?.version || '0',
                extensionId: chrome.runtime.id,
                via: 'external'
            }))
            .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
        return true;
    }
    sendResponse({ ok: false, error: 'unsupported_external_type' });
    return false;
});

// When the service worker wakes after an update/reload, try once.
reinjectAppBridgeIntoAppTabs().catch(() => {});
startLiveLink();
