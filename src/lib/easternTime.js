import { parseSqliteUtcMs } from '@/lib/sqliteDate';

/** App-wide wall clock. Winter EST / summer EDT. */
export const EASTERN_TZ = 'America/New_York';

function easternParts(d, extra = {}) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: EASTERN_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        ...extra
    }).formatToParts(d);
    const out = {};
    for (const p of parts) {
        if (p.type !== 'literal') out[p.type] = p.value;
    }
    return out;
}

/** Calendar day in Eastern Time (YYYY-MM-DD). */
export function easternYmd(d = new Date()) {
    const p = easternParts(d);
    return `${p.year}-${p.month}-${p.day}`;
}

/**
 * UTC instant for YYYY-MM-DD HH:MM:SS on the Eastern clock.
 */
export function easternLocalToUtcDate(ymd, hour = 0, minute = 0, second = 0) {
    const [Y, M, D] = String(ymd).split('-').map((n) => parseInt(n, 10));
    if (!Y || !M || !D) return null;
    let utc = Date.UTC(Y, M - 1, D, hour, minute, second);
    const p = easternParts(new Date(utc));
    const gotHour = p.hour === '24' ? 0 : parseInt(p.hour, 10);
    const got = Date.UTC(
        parseInt(p.year, 10),
        parseInt(p.month, 10) - 1,
        parseInt(p.day, 10),
        gotHour,
        parseInt(p.minute, 10),
        parseInt(p.second, 10)
    );
    const want = Date.UTC(Y, M - 1, D, hour, minute, second);
    return new Date(utc + (want - got));
}

function toSqliteUtc(d) {
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Inclusive Eastern calendar-day window as UTC sqlite datetimes.
 * 2026-09-22 EST/EDT → [Eastern midnight, next Eastern midnight).
 */
export function easternDayUtcRange(fromYmd, toYmd) {
    const from = String(fromYmd || '').trim();
    const to = String(toYmd || '').trim() || from;
    const startYmd = from || to;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startYmd) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        return null;
    }
    const start = easternLocalToUtcDate(startYmd, 0, 0, 0);
    const endDay = easternLocalToUtcDate(to, 0, 0, 0);
    if (!start || !endDay) return null;
    const end = new Date(endDay.getTime() + 24 * 60 * 60 * 1000);
    const created_after = toSqliteUtc(start);
    const created_before = toSqliteUtc(end);
    if (!created_after || !created_before) return null;
    return { created_after, created_before };
}

/** Minutes to add to Eastern local time to get UTC (same sign as Date#getTimezoneOffset). */
export function easternTzOffsetMinutes(d = new Date()) {
    const p = easternParts(d);
    const hour = p.hour === '24' ? 0 : parseInt(p.hour, 10);
    const asIfUtc = Date.UTC(
        parseInt(p.year, 10),
        parseInt(p.month, 10) - 1,
        parseInt(p.day, 10),
        hour,
        parseInt(p.minute, 10),
        parseInt(p.second, 10)
    );
    return Math.round((asIfUtc - d.getTime()) / 60000);
}

function parseDisplayMs(value) {
    if (value instanceof Date) {
        const t = value.getTime();
        return Number.isFinite(t) ? t : NaN;
    }
    return parseSqliteUtcMs(value);
}

export function formatEasternDateTime(value) {
    const ms = parseDisplayMs(value);
    if (!Number.isFinite(ms)) return '—';
    return new Date(ms).toLocaleString('en-US', {
        timeZone: EASTERN_TZ,
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short'
    });
}

function formatRelativeAge(deltaMs) {
    const sec = Math.max(0, Math.round(deltaMs / 1000));
    if (sec < 45) return 'just now';
    const min = Math.round(sec / 60);
    if (min < 60) return `${min} min ago`;
    const hr = Math.round(min / 60);
    if (hr < 36) return `${hr} hr ago`;
    const day = Math.round(hr / 24);
    return `${day} day${day === 1 ? '' : 's'} ago`;
}

/** Added-time label: recent rows show age so a stale calendar date is obvious. */
export function formatAddedTimeLabel(value, now = Date.now()) {
    const ms = parseDisplayMs(value);
    if (!Number.isFinite(ms)) return '—';
    const abs = formatEasternDateTime(new Date(ms));
    const delta = Number(now) - ms;
    if (!Number.isFinite(delta) || delta < 0) return abs;
    if (delta < 36 * 60 * 60 * 1000) {
        return `${formatRelativeAge(delta)} · ${abs}`;
    }
    return abs;
}
