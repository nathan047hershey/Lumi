/**
 * OutlookMailSettings - Microsoft Graph / Outlook mailboxes.
 * Supports multiple mailboxes with individual add/remove.
 *
 * On Vercel, SQLite under /tmp is ephemeral — we keep an encrypted
 * persist_bundle in localStorage so reconnect survives cold starts.
 */
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { userAPI } from '@/api';
import { Trash2, Plus } from 'lucide-react';

const PERSIST_KEY = 'lumi.outlook.persist.v1';

export function saveOutlookPersistBundle(bundle) {
    try {
        if (bundle) localStorage.setItem(PERSIST_KEY, bundle);
        else localStorage.removeItem(PERSIST_KEY);
    } catch (_) { /* private mode */ }
}

export function loadOutlookPersistBundle() {
    try {
        return localStorage.getItem(PERSIST_KEY) || '';
    } catch (_) {
        return '';
    }
}

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
            if ((data?.accounts || []).length) {
                try {
                    const bundleRes = await userAPI.getOutlookPersistBundle();
                    if (bundleRes.data?.persist_bundle) {
                        saveOutlookPersistBundle(bundleRes.data.persist_bundle);
                    }
                } catch (_) { /* optional */ }
            }
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
                if (data?.status === 'connected' || data?.account) {
                    if (data.persist_bundle) saveOutlookPersistBundle(data.persist_bundle);
                    setDevice(null);
                    setMsg(`Connected ${data.account?.email || ''}`.trim());
                    setBusy(false);
                    await refresh();
                    try {
                        await userAPI.syncOutlook(
                            data.account?.id ? { mailbox_id: data.account.id } : {}
                        );
                    } catch (_) { /* sync best-effort */ }
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
                    setMsg('Timed out — click Add mailbox and try again. Keep this panel open while signing in.');
                    setDevice(null);
                    setBusy(false);
                }
            } catch (err) {
                if (cancelled) return;
                const errMsg = err?.response?.data?.error || err.message || '';
                if (/declined|expired|invalid_grant/i.test(errMsg) && !/pending/i.test(errMsg)) {
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
            if ((status?.accounts || []).length > 0) {
                window.open(
                    'https://login.microsoftonline.com/common/oauth2/v2.0/logout',
                    `ms-logout-${Date.now()}`,
                    'width=520,height=640'
                );
                setMsg('Sign out of the current Microsoft account in the popup. Then come back here — a code for the new mailbox appears next.');
                await new Promise((r) => setTimeout(r, 1200));
            }
            const { data } = await userAPI.startOutlookDeviceCode();
            if (data.device_code) {
                setDevice(data);
                setMsg('Keep this panel open. Sign in at microsoft.com/devicelogin, then wait for “Connected”.');
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
            const data = await refresh();
            if (!(data?.accounts || []).length) saveOutlookPersistBundle('');
            else {
                try {
                    const bundleRes = await userAPI.getOutlookPersistBundle();
                    saveOutlookPersistBundle(bundleRes.data?.persist_bundle || '');
                } catch (_) { /* ignore */ }
            }
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
            saveOutlookPersistBundle('');
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
            <p className="text-xs text-muted-foreground">
                Connect more than one Outlook or Hotmail. Microsoft reuses whichever account is already signed in, so adding another mailbox signs that session out first.
            </p>
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
                {busy ? 'Waiting for Microsoft…' : (accounts.length ? 'Add another mailbox' : 'Add mailbox')}
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
