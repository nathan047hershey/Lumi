/**
 * Bid / answers clocks for Auto Bidder.
 *
 * Bid time is Process → end only. CV generate_done must never start the bid clock.
 * Answers time is answers_generating → bidder_answers_ready (or AI skip/fail).
 */

export const BID_START_EVENT_RE = /^(queue_started|opened|run_opening|autofill_engine|form_detected|form_revealed)$/i;
export const PRE_BID_EVENT_RE = /^(generate_done|cv_regenerat|package_saved|enqueue|queue_enqueued)$/i;
export const BID_END_EVENT_RE = /^(marked_applied|submit_success_detected|awaiting_manual_submit|fill_done|after_fill_done|ready_to_submit|fill_failed|item_aborted|bid_budget_exceeded|no_form|job_expired|reautofill_done)$/i;
export const ANSWERS_START_RE = /^answers_generating$/i;
export const ANSWERS_END_RE = /^(bidder_answers_ready|ai_failed|ai_skipped_budget)$/i;

function eventType(e) {
    return String(e?.event_type || e?.type || '');
}

export function eventAt(e) {
    return e?.at || e?.created_at || e?.ts || null;
}

function eventMeta(e) {
    const m = e?.meta || e?.last_event_meta || e?.meta_json || null;
    if (!m) return {};
    if (typeof m === 'string') {
        try { return JSON.parse(m) || {}; } catch { return {}; }
    }
    return typeof m === 'object' ? m : {};
}

/**
 * When the Auto Bidder actually started this job (not CV generation).
 */
export function bidClockStartAt({ events, course, queueJobStartedAt } = {}) {
    const list = Array.isArray(events) ? events : [];
    const firstBid = list.find((e) => BID_START_EVENT_RE.test(eventType(e)));
    if (firstBid) return eventAt(firstBid);
    if (queueJobStartedAt) return queueJobStartedAt;
    const firstNonPre = list.find((e) => {
        const t = eventType(e);
        return t && !PRE_BID_EVENT_RE.test(t);
    });
    if (firstNonPre) return eventAt(firstNonPre);
    // started_at used to be generate_done — never treat generation-only courses as bid start.
    if (list.some((e) => PRE_BID_EVENT_RE.test(eventType(e)))) return null;
    return course?.started_at || null;
}

/**
 * When bidding finished. Null while the job is still in progress so the clock ticks.
 */
export function bidClockEndAt({ events, course, running = false } = {}) {
    if (course?.applied_at) return course.applied_at;
    if (running) return null;
    if (course?.filled_at) return course.filled_at;
    const list = Array.isArray(events) ? events : [];
    for (let i = list.length - 1; i >= 0; i -= 1) {
        if (BID_END_EVENT_RE.test(eventType(list[i]))) return eventAt(list[i]);
    }
    return null;
}

/**
 * Answers/questions slice: start at answers_generating, end at ready/skip/fail.
 */
export function answersClockFromEvents(events) {
    const list = Array.isArray(events) ? events : [];
    const start = list.find((e) => ANSWERS_START_RE.test(eventType(e)));
    if (!start) return null;
    const startedAt = eventAt(start);
    const startIdx = list.indexOf(start);
    let end = null;
    for (let i = startIdx + 1; i < list.length; i += 1) {
        if (ANSWERS_END_RE.test(eventType(list[i]))) {
            end = list[i];
            break;
        }
    }
    const startMeta = eventMeta(start);
    const endMeta = end ? eventMeta(end) : {};
    const questions = Number(startMeta.questions || startMeta.question_count || endMeta.questions || 0) || 0;
    const answers = Number(endMeta.count || endMeta.answer_count || 0) || 0;
    if (!questions && !answers) return null;
    const finishedAt = end ? eventAt(end) : null;
    let ms = Number(endMeta.duration_ms);
    if (!Number.isFinite(ms) || ms < 0) {
        const a = startedAt ? new Date(startedAt).getTime() : NaN;
        const b = finishedAt ? new Date(finishedAt).getTime() : NaN;
        ms = Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, b - a) : null;
    }
    return {
        startedAt,
        finishedAt,
        ms,
        questions,
        answers,
        live: !end
    };
}
