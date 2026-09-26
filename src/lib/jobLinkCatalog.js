const CATALOG_KEY = 'lumi.jobLinks.catalog.v1';
const VISIBLE_KEY = 'lumi.jobLinks.visible.v1';
const MAX_ROWS = 400;

function slimProfile(profile) {
    if (!profile || typeof profile !== 'object') return null;
    const { draft_html, ...rest } = profile;
    return rest;
}

function slimRow(row) {
    if (!row || typeof row !== 'object') return null;
    const apply = String(row.job_apply_url || '').trim();
    const id = parseInt(row.id, 10);
    const techstack = String(row.techstack || '').trim();
    if (!apply || !Number.isInteger(id) || id <= 0 || !techstack) return null;
    return {
        id,
        techstack,
        job_apply_url: apply,
        source_url: row.source_url || null,
        job_description: row.job_description || null,
        company_name: row.company_name || null,
        position_title: row.position_title || null,
        location: row.location || null,
        location_flag: row.location_flag || null,
        comment: row.comment || null,
        fetch_status: row.fetch_status || null,
        is_available: row.is_available === 0 || row.is_available === false ? 0 : 1,
        created_at: row.created_at || null,
        available_profiles: Array.isArray(row.available_profiles)
            ? row.available_profiles.map(slimProfile).filter(Boolean)
            : []
    };
}

function readStoredRows(key, { honorCleared = false } = {}) {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) || 'null');
        if (!parsed || !Array.isArray(parsed.rows)) return [];
        if (honorCleared && parsed.cleared) return [];
        return parsed.rows;
    } catch (_) {
        return [];
    }
}

function writeCatalog(rows) {
    try {
        localStorage.setItem(CATALOG_KEY, JSON.stringify({
            at: Date.now(),
            rows: rows.slice(0, MAX_ROWS)
        }));
    } catch (_) { /* private mode or quota */ }
}

/** Every job link this browser has loaded. Survives a server update. */
export function readJobLinkCatalog() {
    const map = new Map();
    const absorb = (rows) => {
        for (const row of rows || []) {
            const slim = slimRow(row);
            if (!slim) continue;
            map.set(slim.job_apply_url, { ...map.get(slim.job_apply_url), ...slim });
        }
    };
    absorb(readStoredRows(CATALOG_KEY));
    absorb(readStoredRows(VISIBLE_KEY));
    return [...map.values()].slice(0, MAX_ROWS);
}

export function rememberJobLinks(rows) {
    const map = new Map(readJobLinkCatalog().map((row) => [row.job_apply_url, row]));
    for (const row of rows || []) {
        const slim = slimRow(row);
        if (!slim) continue;
        map.set(slim.job_apply_url, { ...map.get(slim.job_apply_url), ...slim });
    }
    const next = [...map.values()].slice(-MAX_ROWS);
    writeCatalog(next);
    return next;
}

export function forgetJobLink(row) {
    const apply = String(row?.job_apply_url || '').trim();
    const id = parseInt(row?.id, 10);
    const next = readJobLinkCatalog().filter((item) => {
        if (apply && item.job_apply_url === apply) return false;
        if (Number.isInteger(id) && id > 0 && item.id === id) return false;
        return true;
    });
    writeCatalog(next);
    return next;
}
