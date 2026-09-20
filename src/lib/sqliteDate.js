/**
 * SQLite CURRENT_TIMESTAMP / datetime('now') is UTC without a zone
 * ("2026-09-08 21:06:00"). `new Date(that)` treats it as local, which
 * shifts Job Links generation clocks by the browser offset.
 */
export function parseSqliteUtcMs(value) {
    if (value == null || value === '') return NaN;
    if (typeof value === 'number') {
        if (!Number.isFinite(value) || value <= 0) return NaN;
        return value < 1e12 ? value * 1000 : value;
    }
    const s = String(value).trim();
    if (!s) return NaN;
    if (/[zZ]|[+-]\d{2}:\d{2}$/.test(s)) {
        const t = Date.parse(s);
        return Number.isFinite(t) ? t : NaN;
    }
    const iso = s.includes('T') ? s : s.replace(' ', 'T');
    const t = Date.parse(`${iso}Z`);
    return Number.isFinite(t) ? t : NaN;
}

export function sqliteUtcToIso(value) {
    const t = parseSqliteUtcMs(value);
    if (!Number.isFinite(t)) return null;
    return new Date(t).toISOString();
}
