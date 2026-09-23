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
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Resume download failed (${res.status})`);
    }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = opts.downloadAs || downloadLabel(name);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return { ok: true, filename: a.download };
}
