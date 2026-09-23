const STORAGE_KEY = 'lumi.jobLinks.listState';
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Local calendar day (YYYY-MM-DD). Do not use toISOString — that is UTC. */
export function localYmd(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export function asYmd(value) {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    return YMD_RE.test(trimmed) ? trimmed : '';
}

/** Minutes to add to local time to get UTC. Matches Date#getTimezoneOffset. */
export function clientTzOffsetMinutes() {
    return new Date().getTimezoneOffset();
}

/** DatePicker onChange may pass a native event or a YYYY-MM-DD string. */
export function dateInputValue(e) {
    if (e == null) return '';
    if (typeof e === 'string') return asYmd(e);
    if (typeof e?.target?.value === 'string') return asYmd(e.target.value);
    return '';
}

function ymdToLocalMidnight(ymd) {
    const [y, m, d] = String(ymd).split('-').map((n) => parseInt(n, 10));
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function toSqliteUtc(d) {
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Inclusive local calendar-day window as UTC sqlite datetimes.
 * Today 2026-09-22 in EDT is [2026-09-22 04:00:00, 2026-09-23 04:00:00).
 */
export function localDayUtcRange(fromYmd, toYmd) {
    const from = asYmd(fromYmd);
    const to = asYmd(toYmd) || from;
    const startYmd = from || to;
    if (!startYmd) return null;
    const start = ymdToLocalMidnight(startYmd);
    const end = ymdToLocalMidnight(to || startYmd);
    if (!start || !end) return null;
    end.setDate(end.getDate() + 1);
    const created_after = toSqliteUtc(start);
    const created_before = toSqliteUtc(end);
    if (!created_after || !created_before) return null;
    return { created_after, created_before };
}

export const EMPTY_JOB_LINKS_LIST_STATE = {
    page: 1,
    search: '',
    techstack: 'all',
    platform: 'all',
    available: 'all',
    bidState: 'all',
    hasGeneratedResume: false,
    dateFrom: '',
    dateTo: '',
    today: false,
    sort: 'latest'
};

export function parseJobLinksListState(searchParams) {
    const pageRaw = parseInt(searchParams?.get?.('page') || '1', 10);
    const sortRaw = String(searchParams?.get?.('sort') || 'latest').toLowerCase();
    const sort = ['latest', 'oldest', 'updated', 'title', 'company'].includes(sortRaw)
        ? sortRaw
        : 'latest';
    return {
        page: Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1,
        search: searchParams?.get?.('search') || '',
        techstack: searchParams?.get?.('techstack') || 'all',
        platform: searchParams?.get?.('platform') || 'all',
        available: searchParams?.get?.('available') || 'all',
        bidState: searchParams?.get?.('bid_state') || 'all',
        hasGeneratedResume: searchParams?.get?.('has_generated_resume') === '1',
        dateFrom: asYmd(searchParams?.get?.('date_from') || ''),
        dateTo: asYmd(searchParams?.get?.('date_to') || ''),
        today: searchParams?.get?.('today') === '1',
        sort
    };
}

export function jobLinksListStateHasMemory(state) {
    if (!state) return false;
    return state.page > 1
        || !!state.search
        || state.techstack !== 'all'
        || state.platform !== 'all'
        || state.available !== 'all'
        || (state.bidState && state.bidState !== 'all')
        || !!state.hasGeneratedResume
        || !!state.dateFrom
        || !!state.dateTo
        || !!state.today
        || (state.sort && state.sort !== 'latest');
}

export function jobLinksListStateToQuery(state) {
    const next = new URLSearchParams();
    if (!state) return '';
    if (state.page > 1) next.set('page', String(state.page));
    if (state.search) next.set('search', state.search);
    if (state.techstack && state.techstack !== 'all') next.set('techstack', state.techstack);
    if (state.platform && state.platform !== 'all') next.set('platform', state.platform);
    if (state.available && state.available !== 'all') next.set('available', state.available);
    if (state.bidState && state.bidState !== 'all') next.set('bid_state', state.bidState);
    if (state.hasGeneratedResume) next.set('has_generated_resume', '1');
    if (state.dateFrom) next.set('date_from', state.dateFrom);
    if (state.dateTo) next.set('date_to', state.dateTo);
    if (state.today) next.set('today', '1');
    if (state.sort && state.sort !== 'latest') next.set('sort', state.sort);
    const q = next.toString();
    return q ? `?${q}` : '';
}

export function readSavedJobLinksListState() {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        return { ...EMPTY_JOB_LINKS_LIST_STATE, ...parsed };
    } catch {
        return null;
    }
}

export function writeSavedJobLinksListState(state) {
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
            ...EMPTY_JOB_LINKS_LIST_STATE,
            ...(state || {})
        }));
    } catch {
        /* ignore quota / private mode */
    }
}

function pinTodayDates(state) {
    if (!state?.today) {
        return {
            ...state,
            dateFrom: asYmd(state?.dateFrom || ''),
            dateTo: asYmd(state?.dateTo || '')
        };
    }
    const today = localYmd();
    return { ...state, dateFrom: today, dateTo: today };
}

export function resolveJobLinksListState(searchParams) {
    const fromUrl = parseJobLinksListState(searchParams);
    if (jobLinksListStateHasMemory(fromUrl)) return pinTodayDates(fromUrl);
    const saved = readSavedJobLinksListState();
    if (saved && jobLinksListStateHasMemory(saved)) return pinTodayDates(saved);
    return pinTodayDates(fromUrl);
}

export function jobLinksListQueryFromLocation(search) {
    if (search && search !== '?') return search.startsWith('?') ? search : `?${search}`;
    const saved = readSavedJobLinksListState();
    return jobLinksListStateToQuery(saved);
}
