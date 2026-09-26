const LINKS_KEY = 'lumi.bid.pageLinks.v1';

function applyUrl(row) {
    return row?.job_apply_url || row?.job_url || row?.source_url || '';
}

export function slimBidLink(row) {
    if (!row?.id) return null;
    return {
        id: row.id,
        company_name: row.company_name,
        position_title: row.position_title,
        job_url: applyUrl(row),
        job_apply_url: row.job_apply_url,
        source_url: row.source_url,
        techstack: row.techstack,
        job_description: row.job_description,
        available_profiles: row.available_profiles || []
    };
}

export function parseBidLinkIds(idsKey) {
    return String(idsKey || '')
        .split(',')
        .map((s) => Number(s))
        .filter((n) => Number.isInteger(n) && n > 0);
}

export function readLumiBidLinks(ids) {
    try {
        const raw = JSON.parse(sessionStorage.getItem(LINKS_KEY) || '[]');
        const list = Array.isArray(raw) ? raw.map(slimBidLink).filter(Boolean) : [];
        if (!ids?.length) return list;
        const want = new Set(ids.map(Number));
        return list.filter((row) => want.has(Number(row.id)));
    } catch {
        return [];
    }
}

export function rememberLumiBidLinks(rows) {
    const list = (Array.isArray(rows) ? rows : []).map(slimBidLink).filter(Boolean);
    try {
        sessionStorage.setItem(LINKS_KEY, JSON.stringify(list));
    } catch { /* ignore */ }
    return list;
}
