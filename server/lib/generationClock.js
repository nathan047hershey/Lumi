/**
 * CV generate clock: one span from first "Generating" until Ready/Failed.
 * SQLite CURRENT_TIMESTAMP is UTC without a zone.
 */

function sqliteUtcToIso(value) {
    if (value == null || value === '') return null;
    if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
    const s = String(value).trim();
    if (!s) return null;
    if (/[zZ]|[+-]\d{2}:\d{2}$/.test(s)) {
        const d = new Date(s);
        return Number.isFinite(d.getTime()) ? d.toISOString() : null;
    }
    const iso = s.includes('T') ? s : s.replace(' ', 'T');
    const d = new Date(`${iso}Z`);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function parseSqliteUtcMs(value) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return value < 1e12 ? value * 1000 : value;
    }
    const iso = sqliteUtcToIso(value);
    if (!iso) return NaN;
    return Date.parse(iso);
}

/** Elapsed ms from generate start to end (or now). */
function generationDurationMs(startedAt, finishedAt = Date.now()) {
    const start = parseSqliteUtcMs(startedAt);
    if (!Number.isFinite(start) || start <= 0) return null;
    const end = finishedAt == null ? Date.now() : parseSqliteUtcMs(finishedAt);
    const endMs = Number.isFinite(end) ? end : Date.now();
    return Math.max(1, endMs - start);
}

module.exports = {
    sqliteUtcToIso,
    parseSqliteUtcMs,
    generationDurationMs
};
