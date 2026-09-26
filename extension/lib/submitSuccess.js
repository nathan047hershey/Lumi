/**
 * Thank-you / submitted confirmation only.
 * NEVER match bare "success" / "customer success" / "enterprise success".
 */
export const SUCCESS_RE = /\b(?:thank\s*you\s+for\s+(?:your\s+)?(?:application|applying|submitting)|thanks\s+for\s+(?:your\s+)?(?:application|applying|submitting)|application\s+(?:has\s+been\s+)?(?:received|submitted|complete(?:d)?)|your\s+application\s+(?:has\s+been\s+)?(?:submitted|received|sent|complete(?:d)?)|we\s*(?:['’]?ve|have)\s+received\s+(?:your\s+)?application|successfully\s+submitted(?:\s+your\s+application)?|application\s+submitted\s+successfully|submission\s+(?:was\s+)?successful|confirmation\s+of\s+your\s+application)\b/i;

/** Short confirmation headings — Greenhouse: "Thank you for applying to Resonate!" */
export const SUCCESS_HEADING_RE = /^(?:application\s+)?(?:submitted|received|complete(?:d)?)!?$|^(?:thank\s*you|thanks)(?:\s+for\s+(?:applying(?:\s+to\s+.+)?|your\s+application(?:\s+to\s+.+)?))?[!.,]?$/i;

/**
 * Hard NO — validation / open-form copy must never count as submit SUCCESS.
 */
export const SUCCESS_NEGATIVE_RE = /\b(?:missing\s+entry\s+for\s+required\s+field|please\s+(?:complete|fill|answer)\s+(?:all\s+)?required|required\s+field(?:s)?\s+(?:are\s+)?missing|field\s+is\s+required|this\s+field\s+is\s+required|form\s+contain(?:s)?\s+errors?|fix\s+out\s+this\s+field|you\s+must\s+(?:select|answer|complete))\b/i;

/**
 * Confirmation copy that beats leftover Track-application / sign-in fields.
 * Includes Greenhouse "Thank you for applying to {Company}!".
 */
export const STRONG_THANK_YOU_RE = /thank\s*you\s+for\s+(?:your\s+)?application|thanks\s+for\s+(?:your\s+)?application|thank\s*you\s+for\s+applying\s+to\b|thanks\s+for\s+applying\s+to\b|application\s+submitted|we\s*(?:['’]?ve|have)\s+received\s+(?:your\s+)?application|your\s+application\s+has\s+been\s+routed|your\s+application\s+has\s+been\s+(?:received|submitted)/i;

function headingList(headings) {
    return (Array.isArray(headings) ? headings : []).map((h) => String(h || '').replace(/\s+/g, ' ').trim());
}

function isStrongThankYou(body, headings) {
    const text = String(body || '');
    if (STRONG_THANK_YOU_RE.test(text)) return true;
    return headingList(headings).some((h) => STRONG_THANK_YOU_RE.test(h));
}

const JOB_CLOSED_RE = /\b(?:no longer (?:available|accepting)|job (?:has been )?closed|position (?:has been )?filled|this (?:job|position) (?:is|has been) (?:closed|filled))\b/i;

/**
 * The apply POST is the proof. 2xx with no field-error payload is accepted.
 * A validation payload is not. Unrelated requests are ignored.
 */
export function evaluateSubmitResponse({ url = '', status = 0, body = '' } = {}) {
    const u = String(url || '');
    const b = String(body || '');
    const applyPost = /greenhouse|job_app|lever\.co|ashbyhq|myworkday|smartrecruiters|icims|workable|\/applications?\b/i.test(u);
    if (!applyPost) return null;
    const code = Number(status) || 0;
    if (code >= 400 && code < 500) return { ok: false, reason: 'validation_errors' };
    if (!(code >= 200 && code < 300)) return null;
    if (/success["']?\s*:\s*false/i.test(b)) return { ok: false, reason: 'validation_errors' };
    if (/"errors?"\s*:/.test(b) && /required|invalid|blank|missing/i.test(b)) {
        return { ok: false, reason: 'validation_errors' };
    }
    if (/<(?:form|input)\b/i.test(b) && b.length > 400) return null;
    return { ok: true, reason: 'submit_accepted' };
}

/**
 * Applied when the submit response was accepted, or the apply form was
 * replaced by that site's confirmation view. A thank-you sentence on an
 * open form is not a finished bid.
 */
export function evaluateSubmitSuccessPage({
    text = '',
    headings = [],
    radioCount = 0,
    visibleFieldCount = 0,
    hasSubmitControl = false,
    emptyVisibleFields = 0,
    hasValidationErrors = false,
    formPresent = null,
    confirmationShell = false,
    confirmationMounted = false,
    applicationIdInUrl = false,
    submitAccepted = false,
    formReplacedAfterAttempt = false,
    atsHost = false
} = {}) {
    const body = String(text || '');
    const heads = headingList(headings);
    const headingHit = heads.some((h) => SUCCESS_HEADING_RE.test(h));
    const bodyHit = SUCCESS_RE.test(body);
    const shell = !!confirmationShell || !!applicationIdInUrl || !!confirmationMounted;
    const formOpen = formPresent === true
        || (formPresent == null && !!hasSubmitControl && (
            Number(visibleFieldCount) >= 1 || Number(radioCount) >= 1
        ));

    if (submitAccepted) {
        return { ok: true, reason: 'submit_accepted' };
    }

    if (hasValidationErrors || SUCCESS_NEGATIVE_RE.test(body)) {
        return { ok: false, reason: 'validation_errors' };
    }
    if (JOB_CLOSED_RE.test(body)) {
        return { ok: false, reason: 'job_closed' };
    }

    if (shell && !formOpen) {
        if (applicationIdInUrl && !confirmationShell && !confirmationMounted) {
            return { ok: true, reason: 'application_id' };
        }
        return { ok: true, reason: confirmationMounted && !confirmationShell ? 'confirmation_view' : 'confirmation_shell' };
    }
    if (formOpen) {
        return { ok: false, reason: (bodyHit || headingHit) ? 'form_still_open' : 'no_match' };
    }
    if (formReplacedAfterAttempt && atsHost) {
        const textLooksLikeForm = /\bsubmit\b/i.test(body) && /\b(?:resume|cv)\b/i.test(body);
        const confirmationPage = body.length >= 40 && body.length <= 6000 && heads.length >= 1;
        if (!textLooksLikeForm && confirmationPage) {
            return { ok: true, reason: 'form_replaced' };
        }
    }
    if (!bodyHit && !headingHit) return { ok: false, reason: 'no_match' };
    return {
        ok: true,
        reason: isStrongThankYou(body, heads) ? 'strong_thank_you' : (bodyHit ? 'body' : 'heading')
    };
}

/** Pick the best frame result: any SUCCESS wins; else keep the most informative fail. */
export function pickSubmitSuccessResult(frameResults) {
    const list = Array.isArray(frameResults) ? frameResults.filter(Boolean) : [];
    let bestFail = { ok: false, reason: 'no_result' };
    for (const signals of list) {
        const ev = evaluateSubmitSuccessPage(signals);
        const sample = String(signals?.text || signals?.sample || '').slice(0, 160);
        const packed = {
            ...ev,
            sample,
            radioCount: signals?.radioCount,
            visibleFieldCount: signals?.visibleFieldCount,
            emptyVisibleFields: signals?.emptyVisibleFields
        };
        if (ev.ok) return packed;
        if (ev.reason === 'validation_errors' || ev.reason === 'form_still_open') {
            bestFail = packed;
        } else if (bestFail.reason === 'no_result' || bestFail.reason === 'no_match') {
            bestFail = packed;
        }
    }
    return bestFail;
}
