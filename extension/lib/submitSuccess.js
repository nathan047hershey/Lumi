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

/**
 * Pure success classifier (unit-tested). Rejects open apply forms even if
 * the word "success" appears in a question label or validation error.
 */
export function evaluateSubmitSuccessPage({
    text = '',
    headings = [],
    radioCount = 0,
    visibleFieldCount = 0,
    hasSubmitControl = false,
    emptyVisibleFields = 0,
    hasValidationErrors = false
} = {}) {
    const body = String(text || '');
    if (hasValidationErrors || SUCCESS_NEGATIVE_RE.test(body)) {
        return { ok: false, reason: 'validation_errors' };
    }
    const heads = headingList(headings);
    const headingHit = heads.some((h) => SUCCESS_HEADING_RE.test(h));
    const bodyHit = SUCCESS_RE.test(body);
    if (!bodyHit && !headingHit) return { ok: false, reason: 'no_match' };

    // Greenhouse thank-you pages often keep leftover fields / "Track application"
    // sign-in in the DOM. A real confirmation headline still means SUCCESS.
    const leftoverLight = Number(radioCount) < 4 && Number(visibleFieldCount) < 6;
    const headingApplyThanks = heads.some((h) => /thank\s*you\s+for\s+applying|thanks\s+for\s+applying/i.test(h));
    if (isStrongThankYou(body, heads) || (headingApplyThanks && leftoverLight)) {
        return { ok: true, reason: 'strong_thank_you' };
    }

    // Active multi-field apply form → never SUCCESS (even if a phrase matched).
    const formOpen = (radioCount >= 2 || visibleFieldCount >= 2) && hasSubmitControl;
    if (formOpen) {
        return { ok: false, reason: 'form_still_open' };
    }
    if (radioCount >= 2 && emptyVisibleFields >= 0 && hasSubmitControl) {
        return { ok: false, reason: 'form_still_open' };
    }
    return { ok: true, reason: bodyHit ? 'body' : 'heading' };
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
