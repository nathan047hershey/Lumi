/**
 * Install Lumi extension OR use Web Fill (bookmarklet) when extension cannot be installed.
 */
import { useCallback, useEffect, useState } from 'react';
import { Download, Bookmark, Copy, Check, Puzzle, Loader2 } from 'lucide-react';
import { userAPI } from '@/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select';

function apiBaseFromWindow() {
    if (typeof window === 'undefined') return '';
    const env = process.env.NEXT_PUBLIC_API_URL || '';
    if (env) return String(env).replace(/\/+$/, '');
    const { origin, port, hostname } = window.location;
    // Express serving UI+API on :9017 — same origin (no /api prefix).
    if (port === '9017' || port === '8001') return origin;
    // Next.js / Vercel — Express is mounted under /api.
    if (
        port === '3000' || port === '5173' || port === '4173'
        || hostname.endsWith('.vercel.app')
        || hostname.endsWith('.vercel.sh')
        || !port
    ) {
        return `${origin}/api`;
    }
    return origin;
}

function frontendBaseFromWindow() {
    if (typeof window === 'undefined') return '';
    return window.location.origin;
}

export default function LumiExtensionHub({
    compact = false,
    profileId = '',
    applicationId = null,
    profiles = [],
    lumiConnected = null
}) {
    const [extVersion, setExtVersion] = useState('');
    const [bookmarklet, setBookmarklet] = useState('');
    const [webProfileId, setWebProfileId] = useState(profileId ? String(profileId) : '');
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState('');
    const [err, setErr] = useState('');

    const apiBase = apiBaseFromWindow();
    const frontendBase = frontendBaseFromWindow();

    useEffect(() => {
        userAPI.getExtensionInfo().then(({ data }) => {
            setExtVersion(data?.version || '');
        }).catch(() => {});
    }, []);

    useEffect(() => {
        if (profileId) setWebProfileId(String(profileId));
    }, [profileId]);

    const downloadExtension = async () => {
        setBusy(true);
        setErr('');
        try {
            const { data, headers } = await userAPI.downloadExtension();
            const ctype = String(headers?.['content-type'] || '');
            if (ctype.includes('application/json') || (data instanceof Blob && data.type.includes('json'))) {
                const text = data instanceof Blob ? await data.text() : String(data);
                let msg = 'Download failed';
                try { msg = JSON.parse(text)?.error || msg; } catch { /* ignore */ }
                throw new Error(msg);
            }
            const blob = data instanceof Blob
                ? data
                : new Blob([data], { type: 'application/zip' });
            if (blob.size < 100) throw new Error('Extension package was empty — try again');
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `lumi-extension-v${extVersion || 'latest'}.zip`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 2000);
        } catch (e) {
            let msg = e?.message || 'Download failed';
            const data = e?.response?.data;
            if (data instanceof Blob) {
                try {
                    const parsed = JSON.parse(await data.text());
                    if (parsed?.error) msg = parsed.error;
                } catch { /* ignore */ }
            } else if (data?.error) {
                msg = data.error;
            }
            setErr(msg);
        } finally {
            setBusy(false);
        }
    };

    const generateBookmarklet = useCallback(async () => {
        if (!webProfileId) {
            setErr('Choose a profile for Web Fill');
            return;
        }
        setBusy(true);
        setErr('');
        try {
            const params = { profile_id: Number(webProfileId) };
            if (applicationId) params.application_id = Number(applicationId);
            const { data } = await userAPI.getWebFillBookmarklet(params);
            setBookmarklet(data?.bookmarklet || '');
        } catch (e) {
            setErr(e?.response?.data?.error || e?.message || 'Could not generate bookmarklet');
            setBookmarklet('');
        } finally {
            setBusy(false);
        }
    }, [webProfileId, applicationId]);

    useEffect(() => {
        if (webProfileId && lumiConnected === false) {
            generateBookmarklet();
        }
    }, [webProfileId, lumiConnected, generateBookmarklet]);

    const copyText = async (text, key) => {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            setCopied(key);
            setTimeout(() => setCopied(''), 2000);
        } catch {
            setErr('Copy failed — select and copy manually');
        }
    };

    const profileOptions = profiles.length
        ? profiles
        : (webProfileId ? [{ id: webProfileId, first_name: 'Profile', last_name: `#${webProfileId}` }] : []);

    return (
        <div className={`rounded-xl border border-primary/25 bg-primary/5 ${compact ? 'px-3 py-3' : 'px-4 py-4'}`}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
                <Puzzle className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                    Lumi extension
                </span>
                {extVersion ? (
                    <Badge variant="outline" className="text-[10px]">v{extVersion}</Badge>
                ) : null}
                {lumiConnected === true ? (
                    <Badge className="bg-emerald-600/90 text-[10px]">Connected</Badge>
                ) : lumiConnected === false ? (
                    <Badge variant="destructive" className="text-[10px]">Not connected</Badge>
                ) : null}
            </div>

            <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
                {lumiConnected === false
                    ? 'No extension detected. Install Lumi below, or use Web Fill (no install) on the apply page.'
                    : 'Share these steps with teammates who need autofill on their PC.'}
            </p>

            {err ? <p className="mb-2 text-[11px] text-rose-300">{err}</p> : null}

            <div className="space-y-3">
                <div className="rounded-lg border border-border bg-black/25 p-3">
                    <p className="mb-2 text-[11px] font-semibold text-foreground/80">Option A — Install extension (recommended)</p>
                    <ol className="mb-3 list-decimal space-y-1 pl-4 text-[11px] text-muted-foreground">
                        <li>Download and unzip the extension package.</li>
                        <li>Open <code className="text-foreground/80">chrome://extensions</code> → Developer mode → Load unpacked → select the <code className="text-foreground/80">extension</code> folder.</li>
                        <li>In the Lumi popup set API URL to <strong className="text-foreground/80">{apiBase}</strong> and Frontend to <strong className="text-foreground/80">{frontendBase}</strong>.</li>
                        <li>Reload the extension, then click Check Lumi in Auto Bidder.</li>
                    </ol>
                    <Button type="button" size="sm" variant="secondary" className="h-8 gap-1.5" disabled={busy} onClick={downloadExtension}>
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                        Download Lumi extension (.zip)
                    </Button>
                </div>

                <div className="rounded-lg border border-border bg-black/25 p-3">
                    <p className="mb-2 text-[11px] font-semibold text-foreground/80">Option B — Web Fill (no extension)</p>
                    <p className="mb-2 text-[11px] text-muted-foreground">
                        For users who cannot install extensions: copy the bookmarklet, add it as a browser bookmark,
                        open the job apply page, then click the bookmark to fill the form.
                    </p>
                    {profileOptions.length > 1 ? (
                        <Select value={webProfileId} onValueChange={setWebProfileId}>
                            <SelectTrigger className="mb-2 h-8 text-xs">
                                <SelectValue placeholder="Profile for Web Fill" />
                            </SelectTrigger>
                            <SelectContent>
                                {profileOptions.map((p) => (
                                    <SelectItem key={p.id} value={String(p.id)}>
                                        {p.first_name} {p.last_name} (#{p.id})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5" disabled={busy || !webProfileId} onClick={generateBookmarklet}>
                            <Bookmark className="h-3.5 w-3.5" />
                            Generate bookmarklet
                        </Button>
                        {bookmarklet ? (
                            <Button
                                type="button"
                                size="sm"
                                className="h-8 gap-1.5"
                                onClick={() => copyText(bookmarklet, 'bm')}
                            >
                                {copied === 'bm' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                {copied === 'bm' ? 'Copied' : 'Copy bookmarklet'}
                            </Button>
                        ) : null}
                    </div>
                    {bookmarklet ? (
                        <p className="mt-2 text-[10px] text-amber-200/90">
                            Create a new bookmark → paste as URL → on the apply form click it.
                            Regenerate after logout. Resume upload may need manual attach in Web Fill mode.
                        </p>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
