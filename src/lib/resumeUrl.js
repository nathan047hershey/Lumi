/** Build an authenticated /resumes URL (JWT via query for window.open). */
export function resumeOpenUrl(relativePath) {
    const raw = String(relativePath || '').trim().replace(/^\/+/, '').replace(/^resumes\//, '');
    if (!raw) return '/resumes/';
    const segments = raw.split('/').map((part) => encodeURIComponent(decodeURIComponent(part)));
    let url = `/resumes/${segments.join('/')}`;
    const token = localStorage.getItem('token');
    if (token) {
        url += `?token=${encodeURIComponent(token)}`;
    }
    return url;
}

/** Open a resume file in a new tab (requires login). */
export function openResume(relativePath) {
    window.open(resumeOpenUrl(relativePath), '_blank', 'noopener');
}
