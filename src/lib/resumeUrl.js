import { resolveApiBaseUrl } from '@/lib/apiBaseUrl';

function resumeFilename(relativePath) {
    return String(relativePath || '')
        .trim()
        .replace(/^\/+/, '')
        .replace(/^resumes\//, '')
        .split(/[/\\]/)
        .filter(Boolean)
        .pop() || '';
}

function downloadLabel(filename) {
    const raw = resumeFilename(filename);
    if (!raw) return 'Candidate.docx';
    const m = String(raw).match(/^resume_([^_]+)_([^_]+)_/i);
    if (m) return `${m[1]}_${m[2]}.docx`;
    return raw;
}

const CV_DRAFT_KEY = 'lumi.cvDrafts.v1';

export function rememberCvDraft({ filename, draft_html, profile_id }) {
    const name = resumeFilename(filename);
    const html = String(draft_html || '').trim();
    const profileId = Number(profile_id);
    if (!name || !html || !profileId) return;
    try {
        const all = JSON.parse(localStorage.getItem(CV_DRAFT_KEY) || '{}');
        all[name] = { html, profile_id: profileId, at: Date.now() };
        const entries = Object.entries(all)
            .sort((a, b) => Number(b[1]?.at) - Number(a[1]?.at))
            .slice(0, 20);
        localStorage.setItem(CV_DRAFT_KEY, JSON.stringify(Object.fromEntries(entries)));
    } catch (_) { /* private mode or quota */ }
}

function readCvDraft(filename) {
    const name = resumeFilename(filename);
    if (!name) return null;
    try {
        const all = JSON.parse(localStorage.getItem(CV_DRAFT_KEY) || '{}');
        const row = all[name];
        if (!row?.html || !row.profile_id) return null;
        if (Date.now() - Number(row.at) > 7 * 24 * 60 * 60 * 1000) return null;
        return row;
    } catch (_) {
        return null;
    }
}

/** Authenticated URL for /api/user/resumes (Bearer or ?token=). */
export function resumeOpenUrl(relativePath) {
    const name = resumeFilename(relativePath);
    if (!name) return '/api/user/resumes/';
    const base = resolveApiBaseUrl();
    let url = `${base}/user/resumes/${encodeURIComponent(name)}`;
    const token = localStorage.getItem('token');
    if (token) url += `?token=${encodeURIComponent(token)}`;
    return url;
}

/** Open a resume file in a new tab (requires login). */
export function openResume(relativePath) {
    window.open(resumeOpenUrl(relativePath), '_blank', 'noopener');
}

/** Download the CV as a real file (works on Vercel — rebuilds if /tmp is empty). */
export async function downloadResumeAuthenticated(relativePath, opts = {}) {
    const name = resumeFilename(relativePath);
    if (!name) throw new Error('No resume filename');
    const token = localStorage.getItem('token');
    const url = resumeOpenUrl(name);
    const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    let blob = null;
    if (res.ok) {
        blob = await res.blob();
    } else {
        const draft = readCvDraft(name);
        if (!draft) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `Resume download failed (${res.status})`);
        }
        const built = await fetch(`${resolveApiBaseUrl()}/user/resumes/${encodeURIComponent(name)}/from-draft`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ draft_html: draft.html, profile_id: draft.profile_id })
        });
        if (!built.ok) {
            const err = await built.json().catch(() => ({}));
            throw new Error(err.error || `Resume download failed (${built.status})`);
        }
        blob = await built.blob();
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = opts.downloadAs || downloadLabel(name);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return { ok: true, filename: a.download };
}
