/**
 * Shared Bid Courses filter vocabulary for Performance page + Auto Bidder.
 * Keep chip ids aligned with courseRunStatus().kind (attention = Needs you).
 */

export const BID_COURSE_STATUS_FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'success', label: 'Success' },
    { id: 'filled', label: 'Filled' },
    { id: 'attention', label: 'Needs you' },
    { id: 'failed', label: 'Failed' },
    { id: 'running', label: 'Live' }
];

export const BID_COURSE_KIND_RANK = {
    success: 0,
    filled: 1,
    attention: 2,
    failed: 3,
    running: 4,
    unknown: 5
};

/** Map run.kind → filter chip id (unknown / ready → excluded from primary chips). */
export function bidCourseFilterBucket(run) {
    if (!run || run.kind === 'unknown') return 'other';
    return run.kind;
}

export function emptyBidCourseStats() {
    return {
        all: 0,
        success: 0,
        filled: 0,
        attention: 0,
        failed: 0,
        running: 0,
        other: 0
    };
}

export function computeBidCourseStats(decoratedRows) {
    const out = emptyBidCourseStats();
    out.all = decoratedRows.length;
    for (const row of decoratedRows) {
        const b = row.bucket || bidCourseFilterBucket(row.run);
        if (out[b] != null) out[b] += 1;
        else out.other += 1;
    }
    return out;
}

export const BID_COURSE_LEGEND =
    'Success = site confirmed · Filled = form done (not confirmed) · Needs you = CAPTCHA / login · Failed = did not complete · Live = in progress';
