function buildInfo() {
    const version = process.env.NEXT_PUBLIC_APP_VERSION || '';
    const sha = process.env.NEXT_PUBLIC_GIT_SHA || '';
    const iso = process.env.NEXT_PUBLIC_BUILD_TIME || '';
    let updated = '';
    if (iso) {
        const date = new Date(iso);
        if (!Number.isNaN(date.getTime())) {
            updated = date.toLocaleString('en-US', {
                timeZone: 'America/New_York',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                timeZoneName: 'short'
            });
        }
    }
    return { version, sha, updated };
}

export default function BuildStamp({ className = '' }) {
    const { version, sha, updated } = buildInfo();
    if (!version && !updated) return null;

    return (
        <p className={`font-mono text-[10px] leading-snug text-white/35 ${className}`.trim()}>
            {version ? <span>v{version}</span> : null}
            {version && sha ? <span> · {sha}</span> : null}
            {updated ? (
                <span className="block text-white/45">Updated {updated}</span>
            ) : null}
        </p>
    );
}
