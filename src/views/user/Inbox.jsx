'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    RefreshCw,
    Mail,
    Search,
    Inbox,
    Send,
    FileWarning,
    FileText,
    Plus,
    Copy,
    Check,
    X,
    Settings2
} from 'lucide-react';
import { userAPI } from '../../api';
import OutlookMailSettings, {
    loadOutlookPersistBundle,
    saveOutlookPersistBundle
} from '@/components/OutlookMailSettings';
import GmailMailSettings from '@/components/GmailMailSettings';
import { cn } from '@/lib/utils';

const FOLDERS = [
    { id: 'inbox', label: 'Inbox', icon: Inbox },
    { id: 'junkemail', label: 'Junk', icon: FileWarning },
    { id: 'sentitems', label: 'Sent', icon: Send },
    { id: 'drafts', label: 'Drafts', icon: FileText }
];

function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    const diff = now - d;
    if (diff < 86400000 && d.getDate() === now.getDate()) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (diff < 604800000) {
        return d.toLocaleDateString([], { weekday: 'short' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function mergeMailAccounts(data) {
    const outlook = [];
    const seen = new Set();
    for (const a of (data?.accounts || [])) {
        const email = String(a.email || '').trim().toLowerCase();
        const local = email.split('@')[0];
        const domain = email.split('@')[1] || '';
        const key = /^(outlook|hotmail|live|msn)\.com$/.test(domain)
            ? `${local}@microsoft-consumer`
            : (email || String(a.id));
        if (seen.has(key)) continue;
        seen.add(key);
        outlook.push({
            ...a,
            provider: 'outlook',
            optionValue: String(a.id)
        });
    }
    const gmail = (data?.gmail || []).map((a) => ({
        ...a,
        provider: 'gmail',
        optionValue: `gmail:${a.id}`
    }));
    return [...outlook, ...gmail];
}

function initials(name, email) {
    const src = String(name || email || '?').trim();
    const parts = src.split(/[\s@._-]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return src.slice(0, 2).toUpperCase();
}

export default function OutlookMailbox() {
    const [messages, setMessages] = useState([]);
    const [folderStats, setFolderStats] = useState([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState(null);
    const [selectedMsg, setSelectedMsg] = useState(null);
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState(null);
    const [accounts, setAccounts] = useState([]);
    const [folder, setFolder] = useState('inbox');
    const [mailboxId, setMailboxId] = useState('all');
    const [showConnect, setShowConnect] = useState(false);
    const [copied, setCopied] = useState(false);

    const fetchStatus = useCallback(async () => {
        try {
            const res = await userAPI.getOutlookStatus();
            setStatus(res.data);
            setAccounts(mergeMailAccounts(res.data));
            if (!(res.data?.accounts || []).length && !(res.data?.gmail || []).length) setShowConnect(true);
            return res.data;
        } catch (err) {
            console.error('Failed to fetch outlook status:', err);
            return null;
        }
    }, []);

    const fetchMessages = useCallback(async () => {
        try {
            const params = { limit: 100, folder };
            if (mailboxId && mailboxId !== 'all') params.mailbox_id = mailboxId;
            const res = await userAPI.listOutlookMessages(params);
            setMessages(res.data?.messages || []);
            setFolderStats(res.data?.folders || []);
            setError(null);
        } catch (err) {
            setError(err?.response?.data?.error || 'Failed to load messages');
        } finally {
            setLoading(false);
        }
    }, [folder, mailboxId]);

    const onAccountsChange = useCallback(async (nextAccounts, meta = {}) => {
        if (Array.isArray(nextAccounts)) {
            setAccounts((prev) => {
                const gmail = prev.filter((a) => a.provider === 'gmail');
                const outlook = nextAccounts.map((a) => ({
                    ...a,
                    provider: 'outlook',
                    optionValue: String(a.id)
                }));
                return [...outlook, ...gmail];
            });
            if (nextAccounts.length) setShowConnect(false);
        }
        await fetchStatus();
        if (meta.synced) {
            setLoading(true);
            await fetchMessages();
        }
    }, [fetchStatus, fetchMessages]);

    const onGmailChange = useCallback(async () => {
        await fetchStatus();
        await fetchMessages();
    }, [fetchStatus, fetchMessages]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const data = await fetchStatus();
            if (cancelled) return;
            if ((data?.accounts || []).length) return;
            const bundle = loadOutlookPersistBundle();
            if (!bundle) return;
            try {
                setError(null);
                const restored = await userAPI.restoreOutlookPersistBundle(bundle);
                if (cancelled) return;
                if (restored.data?.persist_bundle) {
                    saveOutlookPersistBundle(restored.data.persist_bundle);
                }
                setAccounts(mergeMailAccounts({ accounts: restored.data?.accounts || [] }));
                if ((restored.data?.accounts || []).length) {
                    setShowConnect(false);
                    setSyncing(true);
                    try {
                        await userAPI.syncOutlook();
                        await userAPI.syncGmailImap({}).catch(() => {});
                        await fetchMessages();
                        await fetchStatus();
                    } finally {
                        if (!cancelled) setSyncing(false);
                    }
                }
            } catch (err) {
                if (!cancelled) {
                    console.warn('Outlook persist restore failed:', err?.response?.data?.error || err.message);
                }
            }
        })();
        return () => { cancelled = true; };
    }, [fetchStatus, fetchMessages]);

    useEffect(() => {
        setLoading(true);
        fetchMessages();
    }, [fetchMessages]);

    // Graph's unfiltered inbox page stays frozen at connect time.
    // Pull newer mail on open and while this page stays open.
    useEffect(() => {
        if (!accounts.length) return undefined;
        let cancelled = false;
        const pull = async () => {
            try {
                await userAPI.syncOutlook({});
                await userAPI.syncGmailImap({}).catch(() => {});
            } catch (err) {
                if (!cancelled) {
                    setError(err?.response?.data?.error || err?.message || 'Sync failed');
                }
            }
            if (!cancelled) {
                await fetchMessages();
                await fetchStatus();
            }
        };
        pull();
        // Greenhouse security codes expire in ~10m — pull often while this page is open.
        const timer = setInterval(pull, 10000);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [accounts.length, fetchMessages, fetchStatus]);

    // When Outlook is connected on production HTTPS, subscribe so new mail pushes into Lumi instantly.
    useEffect(() => {
        const outlook = accounts.filter((a) => a.provider !== 'gmail');
        if (!outlook.length) return undefined;
        if (!status?.config?.pushReady && !status?.config?.publicBase) return undefined;
        const publicBase = String(status?.config?.publicBase || '');
        if (/localhost|127\.0\.0\.1/i.test(publicBase) && !status?.config?.pushReady) return undefined;
        if (outlook.every((a) => a.push_enabled)) return undefined;
        let cancelled = false;
        (async () => {
            try {
                await userAPI.subscribeOutlookPush();
                if (!cancelled) await fetchStatus();
            } catch (_) { /* poll path still works */ }
        })();
        return () => { cancelled = true; };
    }, [accounts, status?.config?.pushReady, status?.config?.publicBase, fetchStatus]);

    const handleSync = async () => {
        setSyncing(true);
        setError(null);
        try {
            await userAPI.syncOutlook({});
            await userAPI.syncGmailImap({}).catch(() => {});
            await fetchMessages();
            await fetchStatus();
        } catch (err) {
            setError(err?.response?.data?.error || 'Sync failed');
        } finally {
            setSyncing(false);
        }
    };

    const openMessage = async (msg) => {
        setSelectedMsg(msg);
        try {
            const res = await userAPI.getOutlookMessage(msg.id);
            if (res.data?.message) setSelectedMsg(res.data.message);
            if (!msg.is_read) {
                await userAPI.markOutlookMessageRead(msg.id, true);
                setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, is_read: 1 } : m)));
                setSelectedMsg((cur) => (cur?.id === msg.id ? { ...cur, is_read: 1 } : cur));
                setFolderStats((prev) => prev.map((f) => (
                    f.folder === (msg.folder || folder)
                        ? { ...f, unread: Math.max(0, Number(f.unread || 0) - 1) }
                        : f
                )));
            }
        } catch (_) { /* keep list preview */ }
    };

    const filteredMessages = useMemo(() => {
        const s = search.trim().toLowerCase();
        if (!s) return messages;
        return messages.filter((msg) => (
            (msg.subject || '').toLowerCase().includes(s)
            || (msg.from_address || '').toLowerCase().includes(s)
            || (msg.from_name || '').toLowerCase().includes(s)
            || (msg.body_preview || '').toLowerCase().includes(s)
            || (msg.otp_code || '').toLowerCase().includes(s)
        ));
    }, [messages, search]);

    const unreadByFolder = useMemo(() => {
        const map = {};
        for (const row of folderStats) {
            map[row.folder] = Number(row.unread || 0);
        }
        return map;
    }, [folderStats]);

    const copyOtp = async () => {
        if (!selectedMsg?.otp_code) return;
        try {
            await navigator.clipboard.writeText(selectedMsg.otp_code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch (_) { /* ignore */ }
    };

    const activeAccount = accounts.find((a) => String(a.optionValue || a.id) === String(mailboxId));
    const configured = !!(status?.configured || status?.config?.clientIdSet || status?.config?.configured);

    return (
        <div className="flex h-[calc(100vh-3.5rem)] min-h-[32rem] flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-[hsl(222_24%_8%/0.92)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            {/* Ribbon */}
            <div className="flex flex-shrink-0 items-center gap-3 border-b border-white/[0.06] bg-[hsl(222_28%_10%/0.95)] px-4 py-2.5">
                <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[hsl(199_95%_58%)] to-[hsl(210_90%_48%)] text-slate-950 shadow-sm">
                        <Mail className="h-4 w-4" />
                    </div>
                    <div>
                        <div className="text-sm font-semibold tracking-tight text-white/95">Mailbox</div>
                        <div className="text-[11px] text-white/45">
                            {activeAccount?.email || (accounts.length ? `${accounts.length} account${accounts.length > 1 ? 's' : ''}` : 'Outlook / Graph')}
                        </div>
                    </div>
                </div>

                <div className="relative ml-2 hidden min-w-[14rem] flex-1 md:block md:max-w-sm">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search mail"
                        className="h-8 w-full rounded-md border border-white/[0.08] bg-white/[0.04] pl-8 pr-3 text-xs text-white/90 outline-none placeholder:text-white/30 focus:border-sky-400/40 focus:bg-white/[0.06]"
                    />
                </div>

                <div className="ml-auto flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={handleSync}
                        disabled={syncing || !accounts.length}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 text-xs text-white/75 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-40"
                    >
                        <RefreshCw className={cn('h-3.5 w-3.5', syncing && 'animate-spin')} />
                        {syncing ? 'Syncing…' : 'Sync'}
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowConnect((v) => !v)}
                        className={cn(
                            'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs transition',
                            showConnect
                                ? 'border-sky-400/35 bg-sky-400/15 text-sky-200'
                                : 'border-white/[0.08] bg-white/[0.04] text-white/75 hover:bg-white/[0.08] hover:text-white'
                        )}
                    >
                        {showConnect ? <X className="h-3.5 w-3.5" /> : accounts.length ? <Settings2 className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                        {accounts.length ? 'Accounts' : 'Connect'}
                    </button>
                </div>
            </div>

            {error && (
                <div className="border-b border-rose-500/20 bg-rose-500/10 px-4 py-2 text-xs text-rose-200">
                    {error}
                </div>
            )}

            <div className="flex min-h-0 flex-1">
                {/* Folder rail */}
                <aside className="flex w-[13.5rem] flex-shrink-0 flex-col border-r border-white/[0.06] bg-[hsl(222_28%_7%)]">
                    <div className="border-b border-white/[0.06] px-3 py-3">
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
                            Account
                        </label>
                        <select
                            value={mailboxId}
                            onChange={(e) => {
                                setMailboxId(e.target.value);
                                setSelectedMsg(null);
                            }}
                            className="h-8 w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-xs text-white/85 outline-none focus:border-sky-400/40"
                        >
                            <option value="all">All mailboxes</option>
                            {accounts.map((acc) => (
                                <option key={acc.optionValue || acc.id} value={acc.optionValue || String(acc.id)}>
                                    {(acc.provider === 'gmail' ? 'Gmail · ' : 'Outlook · ') + (acc.email || acc.display_name || 'Mailbox')}
                                </option>
                            ))}
                        </select>
                    </div>

                    <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
                        {FOLDERS.map(({ id, label, icon: Icon }) => {
                            const unread = unreadByFolder[id] || 0;
                            const active = folder === id;
                            return (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => {
                                        setFolder(id);
                                        setSelectedMsg(null);
                                    }}
                                    className={cn(
                                        'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition',
                                        active
                                            ? 'bg-sky-400/15 text-sky-100 ring-1 ring-inset ring-sky-400/25'
                                            : 'text-white/55 hover:bg-white/[0.05] hover:text-white/90'
                                    )}
                                >
                                    <Icon className="h-3.5 w-3.5 flex-shrink-0 opacity-80" />
                                    <span className="flex-1 truncate font-medium">{label}</span>
                                    {unread > 0 && (
                                        <span className={cn(
                                            'rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                                            active ? 'bg-sky-300/20 text-sky-100' : 'bg-white/10 text-white/70'
                                        )}>
                                            {unread}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </nav>

                    {showConnect && (
                        <div className="max-h-[70%] space-y-2 overflow-y-auto border-t border-white/[0.06] p-2">
                            <OutlookMailSettings
                                className="!border-white/[0.08] !bg-white/[0.03]"
                                onAccountsChange={onAccountsChange}
                            />
                            <GmailMailSettings
                                className="!border-white/[0.08] !bg-white/[0.03]"
                                onAccountsChange={onGmailChange}
                            />
                        </div>
                    )}
                </aside>

                {/* Message list */}
                <section className="flex w-[22rem] flex-shrink-0 flex-col border-r border-white/[0.06] bg-[hsl(222_24%_9%/0.85)]">
                    <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
                        <div className="text-xs font-semibold text-white/80">
                            {FOLDERS.find((f) => f.id === folder)?.label || 'Mail'}
                        </div>
                        <div className="text-[11px] text-white/40">
                            {filteredMessages.length} message{filteredMessages.length === 1 ? '' : 's'}
                        </div>
                    </div>

                    <div className="border-b border-white/[0.06] px-3 py-2 md:hidden">
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
                            <input
                                type="search"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search mail"
                                className="h-8 w-full rounded-md border border-white/[0.08] bg-white/[0.04] pl-8 pr-3 text-xs text-white/90 outline-none placeholder:text-white/30"
                            />
                        </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto">
                        {loading ? (
                            <div className="flex h-full items-center justify-center text-xs text-white/40">Loading…</div>
                        ) : filteredMessages.length === 0 ? (
                            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                                <Mail className="h-8 w-8 text-white/20" />
                                <p className="text-sm text-white/55">No messages here</p>
                                {!accounts.length && (
                                    <p className="text-xs text-white/35">
                                        {configured
                                            ? 'Connect an Outlook mailbox, then Sync.'
                                            : 'Set OUTLOOK_CLIENT_ID on the server to enable Graph.'}
                                    </p>
                                )}
                                {!!accounts.length && (
                                    <button
                                        type="button"
                                        onClick={handleSync}
                                        disabled={syncing}
                                        className="mt-1 text-xs text-sky-300 hover:text-sky-200"
                                    >
                                        Sync from Outlook
                                    </button>
                                )}
                            </div>
                        ) : (
                            filteredMessages.map((msg) => {
                                const active = selectedMsg?.id === msg.id;
                                const unread = !msg.is_read;
                                return (
                                    <button
                                        key={msg.id}
                                        type="button"
                                        onClick={() => openMessage(msg)}
                                        className={cn(
                                            'flex w-full gap-3 border-b border-white/[0.04] px-3 py-2.5 text-left transition',
                                            active ? 'bg-sky-400/12' : 'hover:bg-white/[0.04]',
                                            unread && !active && 'bg-white/[0.02]'
                                        )}
                                    >
                                        <div className={cn(
                                            'mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
                                            unread
                                                ? 'bg-sky-400/20 text-sky-100'
                                                : 'bg-white/[0.06] text-white/50'
                                        )}>
                                            {initials(msg.from_name, msg.from_address)}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-start justify-between gap-2">
                                                <span className={cn(
                                                    'truncate text-xs',
                                                    unread ? 'font-semibold text-white/95' : 'text-white/65'
                                                )}>
                                                    {msg.from_name || msg.from_address || 'Unknown'}
                                                </span>
                                                <span className="flex-shrink-0 text-[10px] tabular-nums text-white/35">
                                                    {formatDate(msg.received_at)}
                                                </span>
                                            </div>
                                            <div className={cn(
                                                'mt-0.5 truncate text-xs',
                                                unread ? 'text-white/85' : 'text-white/50'
                                            )}>
                                                {msg.subject || '(No subject)'}
                                            </div>
                                            <div className="mt-0.5 flex items-center gap-1.5">
                                                <span className="truncate text-[11px] text-white/35">
                                                    {(msg.body_preview || '').slice(0, 72)}
                                                </span>
                                                {msg.otp_code && (
                                                    <span className="flex-shrink-0 rounded bg-emerald-400/15 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
                                                        {msg.otp_code}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </section>

                {/* Reading pane */}
                <section className="flex min-w-0 flex-1 flex-col bg-[hsl(222_22%_10%/0.7)]">
                    {selectedMsg ? (
                        <>
                            <div className="border-b border-white/[0.06] px-5 py-4">
                                <h2 className="text-lg font-semibold tracking-tight text-white/95">
                                    {selectedMsg.subject || '(No subject)'}
                                </h2>
                                <div className="mt-3 flex items-start gap-3">
                                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-400/30 to-sky-600/20 text-xs font-semibold text-sky-100">
                                        {initials(selectedMsg.from_name, selectedMsg.from_address)}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-sm text-white/90">
                                            {selectedMsg.from_name || selectedMsg.from_address || 'Unknown'}
                                        </div>
                                        <div className="truncate text-xs text-white/40">
                                            {selectedMsg.from_address}
                                        </div>
                                        <div className="mt-1 text-[11px] text-white/35">
                                            {selectedMsg.received_at
                                                ? new Date(selectedMsg.received_at).toLocaleString()
                                                : ''}
                                        </div>
                                    </div>
                                    {selectedMsg.otp_code && (
                                        <div className="flex-shrink-0 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-center">
                                            <div className="text-[10px] uppercase tracking-wider text-emerald-300/70">OTP</div>
                                            <div className="mt-0.5 font-mono text-xl font-bold text-emerald-300">
                                                {selectedMsg.otp_code}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={copyOtp}
                                                className="mt-1 inline-flex items-center gap-1 text-[11px] text-emerald-300/80 hover:text-emerald-200"
                                            >
                                                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                                                {copied ? 'Copied' : 'Copy'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-white/75">
                                    {selectedMsg.body_text || selectedMsg.body_preview || '(Empty message)'}
                                </pre>
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.03]">
                                <Mail className="h-7 w-7 text-white/25" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-white/60">Select a message</p>
                                <p className="mt-1 max-w-xs text-xs text-white/35">
                                    Outlook-style reading pane for synced Graph mail, OTPs, and job alerts.
                                </p>
                            </div>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
