import {
    Check,
    Clock,
    ExternalLink,
    Loader2,
    MoreHorizontal,
    Pencil,
    RefreshCw,
    Trash2,
    Zap
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { formatEasternDateTime } from '@/lib/easternTime';
import { cvGenerationTimeLabel, useNowTick } from '@/lib/cvGenerationTime';

/**
 * Derive add-link pipeline stage for a row.
 * Scraping (JD) → Generating (CVs) → Ready / Failed
 */
export function linkPipelineStage(row) {
    const fs = String(row?.fetch_status || 'pending');
    const jdReady = !!(row?.job_description && String(row.job_description).trim());
    const profiles = Array.isArray(row?.available_profiles) ? row.available_profiles : [];
    const genBusy = profiles.some((p) =>
        /^(pending|generating)$/i.test(String(p.generation_status || ''))
    );
    const scrapeFailed = /^(failed|dead)$/i.test(fs) && !jdReady;

    if (scrapeFailed) return 'failed';
    if (!jdReady || /^(pending|fetching)$/i.test(fs)) return 'scraping';
    if (genBusy) return 'generating';
    return 'ready';
}

const STAGE_META = {
    scraping: {
        label: 'Scraping JD',
        hint: 'Fetching job description…',
        className: 'border-sky-400/40 bg-sky-500/15 text-sky-100',
        spin: true
    },
    generating: {
        label: 'Generating CVs',
        hint: 'JD ready — generating resumes…',
        className: 'border-violet-400/40 bg-violet-500/15 text-violet-100',
        spin: true
    },
    ready: {
        label: 'Ready',
        hint: 'Scrape and CV pipeline complete',
        className: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200',
        spin: false
    },
    failed: {
        label: 'Scrape failed',
        hint: 'Could not fetch job description',
        className: 'border-red-500/45 bg-red-500/15 text-red-200',
        spin: false
    }
};

function StatusBadge({ row }) {
    const stage = linkPipelineStage(row);
    const meta = STAGE_META[stage] || STAGE_META.ready;
    const title = stage === 'failed'
        ? (row.fetch_error || meta.hint)
        : meta.hint;

    return (
        <span
            className={cn(
                'inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-[11px] font-semibold',
                meta.className
            )}
            title={title}
        >
            {meta.spin ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            {meta.label}
        </span>
    );
}

/** Compact step rail — only while work is in flight */
function PipelineRail({ row }) {
    const stage = linkPipelineStage(row);
    if (stage === 'ready' || stage === 'failed') return null;

    const steps = [
        { id: 'scraping', label: '1. Scrape' },
        { id: 'generating', label: '2. Generate' },
        { id: 'ready', label: '3. Ready' }
    ];
    const order = { scraping: 0, generating: 1, ready: 2 };
    const activeIdx = order[stage] ?? 0;

    return (
        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
            {steps.map((step, idx) => {
                const done = idx < activeIdx;
                const active = idx === activeIdx;
                return (
                    <span key={step.id} className="inline-flex items-center gap-1">
                        {idx > 0 ? <span className="text-white/20">→</span> : null}
                        <span
                            className={cn(
                                'rounded px-1.5 py-0.5 font-medium',
                                active && 'bg-sky-500/20 text-sky-100',
                                done && 'text-emerald-300/90',
                                !done && !active && 'text-white/30'
                            )}
                        >
                            {step.label}
                        </span>
                    </span>
                );
            })}
        </div>
    );
}

function profileChipMeta(p) {
    if (p.status === 'rejected' || p.state === 'rejected' || p.state === 'cancelled' || p.bid_outcome === 'rejected') {
        return { label: 'Rejected', className: 'text-red-300' };
    }
    if (p.status === 'applied' || p.bid_applied || p.bid_outcome === 'applied') {
        return { label: 'Applied', className: 'text-emerald-300' };
    }
    if (p.status === 'interview' || p.bid_outcome === 'interview') {
        return { label: 'Interview', className: 'text-sky-300' };
    }
    if (p.bid_filled && !p.bid_applied) {
        return { label: 'Filled', className: 'text-sky-300' };
    }
    if (p.generation_status === 'ready') {
        return { label: 'CV ready', className: 'text-teal-300' };
    }
    if (p.generation_status === 'failed') {
        return { label: 'CV failed', className: 'text-orange-300' };
    }
    if (p.generation_status === 'generating') {
        return { label: 'CV…', className: 'text-blue-300' };
    }
    if (p.generation_status === 'pending') {
        return { label: 'Queued', className: 'text-blue-300/80' };
    }
    return { label: 'No CV', className: 'text-white/40' };
}

function profileChipRank(p) {
    const label = profileChipMeta(p).label;
    if (label === 'Applied') return 0;
    if (label === 'Interview') return 1;
    if (label === 'Filled') return 2;
    if (label === 'CV ready') return 3;
    if (label === 'Rejected' || label === 'CV failed') return 4;
    if (label === 'CV…' || label === 'Queued') return 5;
    return 6;
}

function shortName(p) {
    const first = String(p.first_name || '').trim();
    const last = String(p.last_name || '').trim();
    if (first && last) return `${first} ${last[0]}.`;
    if (first) return first;
    if (last) return last;
    return `#${p.profile_id}`;
}

function ProfilesLine({ profiles }) {
    const list = [...(Array.isArray(profiles) ? profiles : [])].sort(
        (a, b) => profileChipRank(a) - profileChipRank(b)
    );
    const live = list.some((p) => String(p.generation_status || '') === 'generating');
    const now = useNowTick(live);

    if (!list.length) {
        return <p className="text-[11px] text-white/35">No matching profiles yet</p>;
    }

    return (
        <ul className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
            {list.map((p) => {
                const meta = profileChipMeta(p);
                const gen = cvGenerationTimeLabel(p, { now });
                const name = `${p.first_name || ''} ${p.last_name || ''}`.trim() || `#${p.profile_id}`;
                return (
                    <li
                        key={p.profile_id}
                        className="inline-flex min-w-0 items-baseline gap-1.5"
                        title={gen ? `${name}: ${meta.label} (${gen})` : `${name}: ${meta.label}`}
                    >
                        <span className="truncate font-medium text-white/80">{shortName(p)}</span>
                        <span className={cn('shrink-0 font-semibold', meta.className)}>{meta.label}</span>
                        {meta.label === 'CV…' ? (
                            <Loader2 className="h-2.5 w-2.5 shrink-0 animate-spin text-blue-300" />
                        ) : null}
                    </li>
                );
            })}
        </ul>
    );
}

export default function JobLinkRowCard({
    row,
    rowNumber,
    techLabel,
    availability,
    jd,
    selected,
    onSelect,
    onOpen,
    onToggleAvailable,
    onBid,
    onRefetch,
    refetching,
    onView,
    onEdit,
    onDelete,
    addedLabel
}) {
    const applyUrl = row.job_apply_url || row.source_url || row.linkedin_url || '';
    const company = row.company_name || row.position_title || `Job link ${row.id}`;
    const subtitle = [
        row.position_title && row.company_name ? row.position_title : null,
        row.location,
        techLabel,
        row.location_flag || 'US'
    ].filter(Boolean).join(' · ');
    const stage = linkPipelineStage(row);
    const busy = stage === 'scraping' || stage === 'generating';
    const addedAt = (addedLabel && addedLabel !== '—')
        ? addedLabel
        : (row.created_at ? formatEasternDateTime(row.created_at) : '');
    const addedVisible = addedAt && addedAt !== '—';

    return (
        <article
            className={cn(
                'rounded-xl border border-white/[0.08] bg-[hsl(222_22%_10%/0.9)] transition-colors',
                'hover:border-white/15 hover:bg-[hsl(222_22%_12%/0.95)]',
                selected && 'border-primary/45 bg-primary/[0.07]',
                busy && 'border-sky-500/25'
            )}
        >
            <div className="flex gap-3 p-3 sm:p-3.5">
                <Checkbox
                    checked={selected}
                    onCheckedChange={onSelect}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Select job ${rowNumber}`}
                    className="mt-1 shrink-0"
                />

                <div className="min-w-0 flex-1 space-y-2">
                    {/* Line 1: identity + status */}
                    <div className="flex flex-wrap items-start justify-between gap-2">
                        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                <span className="font-mono text-[10px] tabular-nums text-white/35">#{rowNumber}</span>
                                <span className="truncate text-[15px] font-semibold leading-snug text-white hover:text-primary">
                                    {company}
                                </span>
                            </div>
                            <p className="mt-0.5 truncate text-[12px] text-white/45">
                                {subtitle || '—'}
                                {row.comment ? (
                                    <span className="ml-2 text-amber-200/70">· {row.comment}</span>
                                ) : null}
                            </p>
                            {addedVisible ? (
                                <p className="mt-1 inline-flex items-center gap-1.5 text-[11px] tabular-nums text-white/60">
                                    <Clock className="h-3 w-3 shrink-0 text-white/40" />
                                    <span>
                                        Added {addedAt}
                                        {row.created_by_username ? ` · ${row.created_by_username}` : ''}
                                    </span>
                                </p>
                            ) : null}
                        </button>

                        <div className="flex shrink-0 flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <StatusBadge row={row} />
                            <button type="button" onClick={onToggleAvailable} className="hover:opacity-90" title="Toggle availability">
                                <Badge variant={availability.variant} className="h-6 px-2 text-[10px]">
                                    {availability.label}
                                </Badge>
                            </button>
                        </div>
                    </div>

                    {/* Line 2: progress (only while working) */}
                    <PipelineRail row={row} />

                    {/* Line 3: profiles */}
                    <div onClick={(e) => e.stopPropagation()}>
                        <ProfilesLine profiles={row.available_profiles} />
                    </div>

                    {/* Line 4: actions */}
                    <div
                        className="flex flex-wrap items-center gap-2 pt-0.5"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <Button
                            size="sm"
                            className="h-8 gap-1.5 px-3 text-xs font-semibold"
                            title={jd?.label === 'JD empty' ? 'JD empty — refetch recommended before bidding' : 'Open Lumi for this link'}
                            onClick={onBid}
                        >
                            <Zap className="h-3.5 w-3.5" />
                            Bid
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 px-2.5 text-xs"
                            onClick={onRefetch}
                            disabled={refetching}
                            title="Refetch JD / refresh CVs"
                        >
                            <RefreshCw className={cn('h-3.5 w-3.5', refetching && 'animate-spin')} />
                            Refresh
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 px-2.5 text-xs text-white/70" onClick={onOpen}>
                            Open
                        </Button>
                        {applyUrl ? (
                            <Button variant="ghost" size="sm" className="h-8 gap-1 px-2.5 text-xs text-white/70" asChild>
                                <a href={applyUrl} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="h-3.5 w-3.5" />
                                    Apply URL
                                </a>
                            </Button>
                        ) : null}

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="ml-auto h-8 w-8 text-white/55" title="More">
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuItem onClick={onView}>Quick view</DropdownMenuItem>
                                <DropdownMenuItem onClick={onEdit}>
                                    <Pencil className="mr-2 h-3.5 w-3.5" />
                                    Edit
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={onDelete}
                                >
                                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                                    Delete
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </div>

        </article>
    );
}
