'use strict';

const GEN_RANK = {
    ready: 4,
    failed: 3,
    generating: 2,
    pending: 1
};

function generationRank(status) {
    return GEN_RANK[String(status || '')] || 0;
}

function preferProfile(previous, incoming) {
    if (!previous) return incoming;
    if (!incoming) return previous;
    if (generationRank(previous.generation_status) > generationRank(incoming.generation_status)) {
        return {
            ...incoming,
            generation_status: previous.generation_status,
            resume_filename: previous.resume_filename || incoming.resume_filename,
            draft_html: previous.draft_html || incoming.draft_html,
            application_id: previous.application_id || incoming.application_id,
            generation_finished_at: previous.generation_finished_at || incoming.generation_finished_at
        };
    }
    return incoming;
}

/** Keep CV status moving forward. A later empty server copy must not flip Ready back to No CV. */
function mergeCvStatusForward(previousRows, nextRows) {
    const prevById = new Map((previousRows || []).map((row) => [row.id, row]));
    return (nextRows || []).map((row) => {
        const prev = prevById.get(row.id);
        if (!prev) return row;
        const prevProfiles = new Map((prev.available_profiles || []).map((p) => [p.profile_id, p]));
        const profiles = (row.available_profiles || []).map((p) => preferProfile(prevProfiles.get(p.profile_id), p));
        const seen = new Set(profiles.map((p) => p.profile_id));
        for (const old of prev.available_profiles || []) {
            if (!seen.has(old.profile_id) && generationRank(old.generation_status) > 0) {
                profiles.push(old);
            }
        }
        const keepDescription = prev.fetch_status === 'success' && prev.job_description && row.fetch_status !== 'success';
        return {
            ...row,
            fetch_status: keepDescription ? 'success' : row.fetch_status,
            job_description: row.job_description || prev.job_description || null,
            company_name: row.company_name || prev.company_name,
            position_title: row.position_title || prev.position_title,
            available_profiles: profiles
        };
    });
}

export { mergeCvStatusForward, generationRank };
