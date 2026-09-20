/**
 * ATS liveness for “this posting is gone”.
 *
 * Order (research + career-ops / OpenJobs):
 *   1. Apply form present → open
 *   2. Listing-only chrome (“N jobs found”) → not expired
 *   3. Greenhouse ?error=true / dead board landing
 *   4. Lever apply URL HTTP 404/410 (never api.lever.co)
 *   5. High-confidence banners (Greenhouse, Workday, SuccessFactors, Ashby)
 *
 * Do not match JD boilerplate or other-job cards on a live board.
 */

const PREFIX_CHARS = 1200;

export const JOB_CLOSED_BANNER_RE = new RegExp([
    'the job you are looking for is no longer (?:open|available)',
    'sorry[,.]? this job is no longer (?:open|available)',
    'this job(?: posting)? is no longer (?:open|available)',
    "the page you are looking for doesn['’]?t exist",
    'the page you are looking for does not exist',
    'this job cannot be viewed at this time',
    'has either been deleted or is no longer available for application'
].join('|'), 'i');

/** Ashby heading only — "job not found" is too common in body/nav. */
export const JOB_CLOSED_HEADING_RE = /^(job not found|page not found|404|not found)$/i;

/** Workday / board listing chrome — never expire from this alone. */
export const JOB_LISTING_ONLY_RE = /\b\d+\s+jobs?\s+found\b|\bcurrent openings\b/i;

export function inspectJobClosedUrl(url) {
    const raw = String(url || '').trim();
    const empty = {
        host: '',
        path: '',
        isLeverApi: false,
        isLeverApply: false,
        isGreenhouse: false,
        isWorkday: false,
        isAshby: false,
        boardNoToken: false,
        ghError: /[?&]error=true\b/i.test(raw)
    };
    try {
        const u = new URL(raw);
        const host = (u.hostname || '').replace(/^www\./i, '');
        const path = u.pathname || '';
        const error = u.searchParams.get('error');
        const token = u.searchParams.get('token');
        const isLeverApi = /(^|\.)api\.lever\.co$/i.test(host);
        const isLeverApply = /(^|\.)lever\.co$/i.test(host) && !isLeverApi;
        const isGreenhouse = /greenhouse\.io$/i.test(host);
        const isWorkday = /myworkdayjobs\.com$/i.test(host) || /\.workday\./i.test(host);
        const isAshby = /ashbyhq\.com$/i.test(host);
        const boardNoToken = isGreenhouse && (
            /\/embed\/job_board\/?$/i.test(path)
            || /\/job_board\/?$/i.test(path)
            || (/\/jobs\/?$/i.test(path) && !token)
        );
        const ghError = isGreenhouse && (error === 'true' || error === '1');
        return {
            host,
            path,
            isLeverApi,
            isLeverApply,
            isGreenhouse,
            isWorkday,
            isAshby,
            boardNoToken,
            ghError
        };
    } catch {
        return empty;
    }
}

export function matchJobClosedBanner(text) {
    const blob = String(text || '').replace(/\s+/g, ' ').trim();
    if (!blob) return null;
    const m = blob.match(JOB_CLOSED_BANNER_RE);
    if (!m) return null;
    const idx = Math.max(0, (m.index || 0) - 24);
    return {
        closed: true,
        match: m[0],
        snippet: blob.slice(idx, idx + 160)
    };
}

function headingLooksGone(headingText, title) {
    const bits = [headingText, title]
        .flatMap((s) => String(s || '').split(/\n+/))
        .map((s) => s.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
    for (const line of bits) {
        if (JOB_CLOSED_HEADING_RE.test(line)) {
            return { closed: true, match: line, snippet: line, via: 'heading' };
        }
    }
    return null;
}

/**
 * @param {{
 *   text?: string,
 *   formReady?: boolean,
 *   fieldCount?: number,
 *   alertText?: string,
 *   headingText?: string,
 *   title?: string,
 *   url?: string,
 *   httpStatus?: number
 * }} signals
 */
export function analyzeJobClosedPage(signals = {}) {
    const formReady = !!signals.formReady || Number(signals.fieldCount) >= 2;
    if (formReady) {
        return { closed: false, reason: 'form_present' };
    }

    const urlInfo = inspectJobClosedUrl(signals.url);
    if (urlInfo.isLeverApi) {
        return { closed: false, reason: 'lever_api_ignored' };
    }

    const prefix = String(signals.text || '').replace(/\s+/g, ' ').trim().slice(0, PREFIX_CHARS);
    const listingOnly = JOB_LISTING_ONLY_RE.test(prefix)
        && !matchJobClosedBanner(signals.alertText)
        && !matchJobClosedBanner(signals.headingText)
        && !matchJobClosedBanner(prefix)
        && !urlInfo.ghError;
    if (listingOnly) {
        return { closed: false, reason: 'listing_page' };
    }

    if (urlInfo.ghError) {
        return {
            closed: true,
            match: 'error=true',
            snippet: String(signals.url || '').slice(0, 160),
            via: 'greenhouse_error_url'
        };
    }

    const status = Number(signals.httpStatus) || 0;
    if (urlInfo.isLeverApply && (status === 404 || status === 410)) {
        return {
            closed: true,
            match: `HTTP ${status}`,
            snippet: String(signals.url || '').slice(0, 160),
            via: 'lever_http'
        };
    }

    const alertHit = matchJobClosedBanner(signals.alertText);
    if (alertHit) return { ...alertHit, via: 'alert' };
    const headBanner = matchJobClosedBanner(signals.headingText);
    if (headBanner) return { ...headBanner, via: 'heading' };
    const goneHead = headingLooksGone(signals.headingText, signals.title);
    if (goneHead && (urlInfo.isAshby || urlInfo.isLeverApply || urlInfo.isWorkday)) {
        return goneHead;
    }
    const prefixHit = matchJobClosedBanner(prefix);
    if (prefixHit) return { ...prefixHit, via: 'prefix' };

    return { closed: false };
}

export function matchJobClosedPageText(text, extra = {}) {
    const result = analyzeJobClosedPage({ text, ...extra });
    return result.closed ? result : null;
}

export function pageLooksJobClosed(text, extra = {}) {
    return !!analyzeJobClosedPage({ text, ...extra }).closed;
}
