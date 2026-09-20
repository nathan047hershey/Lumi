/**
 * OutlookMailSettings - Microsoft Graph / Outlook mailboxes.
 * Supports multiple mailboxes with individual add/remove.
 */
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { userAPI } from '@/api';
import { Trash2, Plus } from 'lucide-react';

export default function OutlookMailSettings({ className = '', onAccountsChange } = {}) {
    const [status, setStatus] = useState(null);
    const [busy, setBusy] = useState(false);
    const [device, setDevice] = useState(null);
    const [msg, setMsg] = useState('');
    const [removingId, setRemovingId] = useState(null);

    const refresh = useCallback(async () => {
        try {
            const { data } = await userAPI.getOutlookStatus();
            setStatus(data || null);
            onAccountsChange?.(data?.accounts || []);
            return data;
        } catch (_) {
            setStatus(null);
            onAccountsChange?.([]);
            return null;
        }
    }, [onAccountsChange]);

    useEffect(() => { refresh(); }, [refresh]);

    useEffect(() => {
        if (!device?.device_code) return;
        let cancelled = false;
        let poll = 0;
        const tick = async () => {
            if (cancelled) return;
            try {
                const { data } = await userAPI.pollOutlookDeviceCode(device.device_code);
                if (cancelled) return;
                // API returns { status: 'connected', account } — not access_token.
                if (data?.status === 'connected' || data?.account) {
                    setDevice(null);
                    setMsg(`Connected ${data.account?.email || ''}`.trim());
                    setBusy(false);
                    await refresh();
                    try {
                        await userAPI.syncOutlook(
                            data.account?.id ? { mailbox_id: data.account.id } : {}
                        );
                    } catch (_) { /* sync best-effort; UI can retry */ }
                    const latest = await refresh();
                    onAccountsChange?.(latest?.accounts || [], { synced: true });
                    return;
                }
                if (data?.status === 'error') {
                    setMsg(data.error || 'Connect failed');
                    setDevice(null);
                    setBusy(false);
                    return;
                }
                if (++poll < 90) setTimeout(tick, 2000);
                else {
                    setMsg('Timed out — click Add mailbox and try again.');
                    setDevice(null);
                    setBusy(false);
                }
            } catch (err) {
                if (cancelled) return;
                const errMsg = err?.response?.data?.error || err.message || '';
                // Real failures (declined / expired) should stop; transient keep polling.
                if (/declined|expired|invalid_grant|device_code/i.test(errMsg) && !/pending/i.test(errMsg)) {
                    setMsg(errMsg);
                    setDevice(null);
                    setBusy(false);
                    return;
                }
                if (++poll < 90) setTimeout(tick, 2000);
                else {
                    setMsg('Timed out — click Add mailbox and try again.');
                    setDevice(null);
                    setBusy(false);
                }
            }
        };
        setTimeout(tick, 1500);
        return () => { cancelled = true; };
    }, [device, refresh, onAccountsChange]);

    const connect = async () => {
        setBusy(true); setMsg(''); setDevice(null);
        try {
            const { data } = await userAPI.startOutlookDeviceCode();
            if (data.device_code) {
                setDevice(data);
                setMsg('Sign in at microsoft.com/devicelogin, then wait here — do not close this panel.');
            } else {
                setMsg(data.error || 'Failed');
                setBusy(false);
            }
        } catch (err) {
            setMsg(err.response?.data?.error || err.message);
            setBusy(false);
        }
    };

    const removeMailbox = async (id, email) => {
        if (!window.confirm('Remove ' + (email || 'this mailbox') + '?')) return;
        setRemovingId(id);
        try {
            await userAPI.disconnectOutlookMailbox(id);
            setMsg('Removed.');
            await refresh();
        } catch (err) {
            setMsg(err.response?.data?.error || err.message);
        } finally {
            setRemovingId(null);
        }
    };

    const disconnectAll = async () => {
        if (!window.confirm('Remove ALL mailboxes?')) return;
        setBusy(true);
        try {
            await userAPI.disconnectOutlook();
            await refresh();
            setMsg('All removed.');
        } catch (err) {
            setMsg(err.response?.data?.error || err.message);
        } finally {
            setBusy(false);
        }
    };

    const accounts = status?.accounts || [];

    return (
        <div className={`space-y-3 rounded-lg border border-border/60 bg-background/40 px-3 py-3 ${className}`}>
            <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Microsoft Outlook / Graph</span>
                {accounts.length > 0 && (
                    <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" disabled={busy} onClick={disconnectAll}>
                        Remove all
                    </Button>
                )}
            </div>
            <p className="text-xs text-muted-foreground">Connect Outlook/Hotmail mailboxes. Microsoft Graph is free.</p>
            {status?.config?.clientIdSet
                ? <p className="text-xs text-emerald-300/80">Graph ready</p>
                : <p className="text-xs text-amber-200/90">Set OUTLOOK_CLIENT_ID in server/.env</p>}
            {accounts.length > 0 ? (
                <ul className="space-y-1.5">
                    {accounts.map((a) => (
                        <li key={a.id || a.email} className="flex items-center justify-between gap-2 rounded border border-border/40 bg-background/30 px-2.5 py-1.5">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="truncate text-xs font-medium">{a.email || a.display_name || 'Mailbox'}</span>
                                <span className="text-[10px] text-muted-foreground">{a.push_enabled ? 'push ON' : 'push off'}</span>
                            </div>
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-5 w-5 p-0"
                                disabled={removingId === a.id || busy}
                                onClick={() => removeMailbox(a.id, a.email)}
                                title="Remove"
                            >
                                <Trash2 className="h-3 w-3" />
                            </Button>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-xs text-muted-foreground">No mailboxes connected.</p>
            )}
            <Button type="button" size="sm" disabled={busy || !status?.config?.clientIdSet} onClick={connect}>
                <Plus className="mr-1 h-3 w-3" />
                {busy ? 'Waiting for Microsoft…' : 'Add mailbox'}
            </Button>
            {device?.user_code && (
                <div className="rounded border border-sky-400/25 bg-sky-400/10 p-2">
                    <p className="text-xs text-sky-100/90">
                        Keep this page open. Sign in at:{' '}
                        <a
                            className="underline"
                            href={device.verification_uri || 'https://microsoft.com/devicelogin'}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            {device.verification_uri || 'microsoft.com/devicelogin'}
                        </a>
                    </p>
                    <p className="mt-1 text-xs text-sky-100/90">
                        Code: <span className="font-mono font-semibold">{device.user_code}</span>
                    </p>
                </div>
            )}
            {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
        </div>
    );
}
