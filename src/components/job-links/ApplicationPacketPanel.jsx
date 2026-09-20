/**
 * Pre-bid application packet — prepare & review answers before Process (Swooped-style).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FileText, Loader2, RefreshCw } from 'lucide-react';
import { userAPI } from '@/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

function PacketJobRow({
    item,
    busy,
    onSaveAnswer
}) {
    const [open, setOpen] = useState(false);
    const [editIdx, setEditIdx] = useState(-1);
    const [editVal, setEditVal] = useState('');
    const [saving, setSaving] = useState(false);

    const label = item.company_name || `Application #${item.application_id}`;
    const role = item.job_role || '';
    const statusClass = item.ready
        ? 'text-emerald-300'
        : item.ok === false
            ? 'text-rose-300'
            : 'text-amber-200';

    const startEdit = (idx, ans) => {
        setEditIdx(idx);
        setEditVal(String(ans?.answer || ans?.value || ''));
    };

    const saveEdit = async () => {
        if (editIdx < 0 || !editVal.trim()) return;
        setSaving(true);
        try {
            await onSaveAnswer(item.application_id, {
                index: editIdx,
                label: item.answers?.[editIdx]?.label,
                answer: editVal.trim()
            });
            setEditIdx(-1);
            setEditVal('');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="rounded-lg border border-white/[0.06] bg-black/20">
            <button
                type="button"
                className="flex w-full items-start gap-2 px-3 py-2.5 text-left"
                onClick={() => setOpen((v) => !v)}
            >
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary/80" />
                <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-white/85">{label}</div>
                    {role ? <div className="truncate text-[11px] text-white/45">{role}</div> : null}
                    <div className={`mt-1 text-[10px] font-semibold uppercase tracking-wide ${statusClass}`}>
                        {item.ready
                            ? `Ready · ${item.answer_count} answers`
                            : item.error
                                ? item.error
                                : `${item.answer_count || 0} answers · review policy fields`}
                    </div>
                </div>
                {open
                    ? <ChevronDown className="h-4 w-4 shrink-0 text-white/40" />
                    : <ChevronRight className="h-4 w-4 shrink-0 text-white/40" />}
            </button>
            {open && Array.isArray(item.answers) && item.answers.length > 0 ? (
                <ul className="max-h-48 space-y-1 overflow-y-auto border-t border-white/[0.06] px-3 py-2">
                    {item.answers.map((a, idx) => {
                        const ans = String(a.answer || a.value || '').trim();
                        const isPolicy = a.lane === 'policy' || a.knockout;
                        const editing = editIdx === idx;
                        return (
                            <li key={`${item.application_id}-${a.id || idx}`} className="text-[11px]">
                                <div className="flex flex-wrap items-center gap-1">
                                    <span className="text-white/55">{a.label || a.kind || `Q${idx + 1}`}</span>
                                    {isPolicy ? (
                                        <Badge variant="outline" className="h-4 px-1 text-[9px]">policy</Badge>
                                    ) : null}
                                </div>
                                {editing ? (
                                    <div className="mt-1 flex gap-1">
                                        <input
                                            className="min-w-0 flex-1 rounded border border-white/10 bg-black/40 px-2 py-1 text-[11px]"
                                            value={editVal}
                                            disabled={saving || busy}
                                            onChange={(e) => setEditVal(e.target.value)}
                                        />
                                        <Button type="button" size="sm" className="h-7 px-2 text-[10px]" disabled={saving || busy} onClick={saveEdit}>
                                            Save
                                        </Button>
                                        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => setEditIdx(-1)}>
                                            Cancel
                                        </Button>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        className={`mt-0.5 block w-full text-left ${ans ? 'text-white/80' : 'text-amber-200/90 italic'}`}
                                        disabled={busy}
                                        onClick={() => startEdit(idx, a)}
                                    >
                                        {ans || '(empty — click to set)'}
                                    </button>
                                )}
                            </li>
                        );
                    })}
                </ul>
            ) : null}
        </div>
    );
}

export default function ApplicationPacketPanel({
    bidReadyItems = [],
    profileId,
    requireBeforeProcess = true,
    onStatusChange
}) {
    const [items, setItems] = useState([]);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const [expanded, setExpanded] = useState(true);

    const applicationIds = useMemo(
        () => bidReadyItems.map((r) => r.id).filter(Boolean),
        [bidReadyItems]
    );

    const refreshStatus = useCallback(async () => {
        if (!applicationIds.length) {
            setItems([]);
            onStatusChange?.({ ready: true, total: 0, items: [] });
            return;
        }
        try {
            const { data } = await userAPI.getBidderPacketStatus({ application_ids: applicationIds });
            const list = data?.items || [];
            setItems(list);
            onStatusChange?.({
                ready: (data?.summary?.not_ready || 0) === 0 && list.length > 0,
                total: list.length,
                items: list
            });
        } catch (e) {
            setErr(e?.response?.data?.error || e?.message || 'Could not load packet status');
        }
    }, [applicationIds, onStatusChange]);

    useEffect(() => {
        refreshStatus();
    }, [refreshStatus]);

    const prepare = async (force = false) => {
        if (!profileId || !applicationIds.length) return;
        setBusy(true);
        setErr('');
        try {
            const { data } = await userAPI.prepareBidderPacket({
                profile_id: Number(profileId),
                application_ids: applicationIds,
                force_regenerate: force
            });
            setItems(data?.items || []);
            onStatusChange?.({
                ready: (data?.summary?.ready || 0) === (data?.summary?.total || 0)
                    && (data?.summary?.total || 0) > 0,
                total: data?.summary?.total || 0,
                items: data?.items || []
            });
        } catch (e) {
            setErr(e?.response?.data?.error || e?.message || 'Prepare failed');
        } finally {
            setBusy(false);
        }
    };

    const saveAnswer = async (applicationId, payload) => {
        setBusy(true);
        setErr('');
        try {
            await userAPI.updateBidderPacketAnswer(applicationId, payload);
            await refreshStatus();
        } catch (e) {
            setErr(e?.response?.data?.error || e?.message || 'Save failed');
        } finally {
            setBusy(false);
        }
    };

    const readyCount = items.filter((i) => i.ready).length;
    const allReady = items.length > 0 && readyCount === items.length;

    if (!applicationIds.length) return null;

    return (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
            <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => setExpanded((v) => !v)}
                >
                    <FileText className="h-4 w-4 shrink-0 text-primary" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-white/70">
                        Application packet
                    </span>
                    <Badge variant="secondary" className="text-[10px]">
                        {readyCount}/{items.length || applicationIds.length} ready
                    </Badge>
                    {expanded
                        ? <ChevronDown className="ml-auto h-4 w-4 text-white/40" />
                        : <ChevronRight className="ml-auto h-4 w-4 text-white/40" />}
                </button>
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 text-[11px]"
                    disabled={busy || !profileId}
                    onClick={() => prepare(false)}
                >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    {allReady ? 'Refresh' : 'Prepare'}
                </Button>
            </div>
            {expanded ? (
                <div className="space-y-2 border-t border-white/[0.06] px-4 py-3">
                    <p className="text-[11px] text-white/45">
                        {requireBeforeProcess
                            ? 'Prepare answers before Process — policy fields (sponsorship, salary, EEO) are reviewed here first.'
                            : 'Optional: pre-generate answers so Lumi skips LLM during the bid.'}
                    </p>
                    {err ? <p className="text-[11px] text-rose-300">{err}</p> : null}
                    {!allReady && requireBeforeProcess ? (
                        <p className="text-[11px] font-medium text-amber-200/90">
                            Click Prepare before Process, or edit empty policy answers below.
                        </p>
                    ) : null}
                    <div className="space-y-2">
                        {(items.length ? items : applicationIds.map((id) => {
                            const row = bidReadyItems.find((r) => String(r.id) === String(id));
                            return {
                                application_id: id,
                                company_name: row?.company_name,
                                job_role: row?.job_role,
                                ready: false,
                                answer_count: 0,
                                answers: []
                            };
                        })).map((item) => (
                            <PacketJobRow
                                key={item.application_id}
                                item={item}
                                busy={busy}
                                onSaveAnswer={saveAnswer}
                            />
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

/** Called from Process — ensure packets exist when required. */
export async function ensurePacketsReady({ profileId, applicationIds, force = false }) {
    const ids = (Array.isArray(applicationIds) ? applicationIds : []).filter(Boolean);
    const { data: status } = await userAPI.getBidderPacketStatus({ application_ids: ids });
    const statusItems = status?.items || [];
    const byId = new Map(statusItems.map((i) => [Number(i.application_id), i]));
    const allPresent = ids.every((id) => byId.has(Number(id)));
    const allReady = allPresent && ids.every((id) => byId.get(Number(id))?.ready);
    if (!force && allReady) {
        return { ok: true, items: statusItems, prepared: false };
    }
    const { data } = await userAPI.prepareBidderPacket({
        profile_id: Number(profileId),
        application_ids: ids,
        force_regenerate: force
    });
    const failed = (data?.items || []).filter((i) => !i.ok);
    const stillNotReady = (data?.items || []).filter((i) => i.ok && !i.ready);
    if (failed.length) {
        return {
            ok: false,
            error: failed.map((f) => f.error || f.company_name).join('; '),
            items: data.items
        };
    }
    if (stillNotReady.length) {
        return {
            ok: false,
            error: `${stillNotReady.length} packet(s) need policy answers — expand Application packet and edit blanks.`,
            items: data.items
        };
    }
    return { ok: true, items: data.items, prepared: true };
}
