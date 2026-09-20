/**
 * Auto Bidder — Setup tab (profile, links, options, run).
 * Kept separate from AutoBidderDialog so the control panel stays easy to read and change.
 */
import { useState } from 'react';
import {
    ChevronDown,
    ChevronRight,
    ExternalLink,
    HelpCircle,
    Play,
    RefreshCw,
    SkipForward,
    Square,
    X
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select';
import LumiBidderSettings from '@/components/LumiBidderSettings';
import TeachAndCheckPanel from '@/components/TeachAndCheckPanel';
import { runStatusBadgeClass, runStatusRowClass, detectAtsFromUrl } from '@/lib/bidCourseFailure';
import ApplicationPacketPanel from '@/components/job-links/ApplicationPacketPanel';
import LumiExtensionHub from '@/components/LumiExtensionHub';

function Section({ title, hint, children, className = '' }) {
    return (
        <section className={`rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 ${className}`}>
            <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-white/70">{title}</h3>
                {hint ? <span className="text-[11px] text-white/40">{hint}</span> : null}
            </div>
            {children}
        </section>
    );
}

function LegendStrip() {
    const items = [
        { label: 'SUCCESS', className: 'text-emerald-300' },
        { label: 'FILLED', className: 'text-sky-300' },
        { label: 'FAILED', className: 'text-rose-300' },
        { label: 'CAPTCHA', className: 'text-amber-200' }
    ];
    return (
        <p className="text-[11px] text-white/45">
            {items.map((it, i) => (
                <span key={it.label}>
                    {i > 0 ? ' · ' : ''}
                    <span className={`font-semibold ${it.className}`}>{it.label}</span>
                </span>
            ))}
        </p>
    );
}

export default function AutoBidderSetupPanel({
    // Profile
    profileId,
    onProfileChange,
    selectableProfiles,
    matchedProfileOptions,
    otherProfileOptions,
    showAllProfiles,
    setShowAllProfiles,
    selectedProfile,
    profileLabel,
    profileStatusSuffix,
    profileBidOutcome,
    courses,
    jobLinkIds,
    readyPreview,
    bidReadyItems,
    requirePacketBeforeProcess,
    onPacketStatusChange,
    // Links
    selectedLinks,
    unsupportedSelected,
    linkOutcomeForProfile,
    primaryJobUrl,
    // Lumi extension
    lumiOk,
    lumiVersion,
    busy,
    onCheckLumi,
    profiles,
    // Options
    showAdvanced,
    setShowAdvanced,
    setLumiPrefs,
    unattended,
    captchaHelper,
    uploadCoverLetter,
    lumiPrefsAutoNext,
    // Studying / memory
    memoryBusy,
    refreshStudyingPanel,
    helperProbe,
    questionMemoryRows,
    onToggleQuestionMemory,
    onClearQuestionMemory,
    clearHostInput,
    setClearHostInput,
    onClearHostLessons,
    // Outlook
    outlookStatus,
    outlookBusy,
    outlookDevice,
    outlookMsg,
    connectOutlookGraph,
    disconnectOutlookGraph,
    removeOutlookMailbox,
    subscribeOutlookPush,
    // Run
    queueBlocked,
    awaitingCaptcha,
    canProcess,
    processLabel,
    onProcess,
    onResumeCaptcha,
    onReAutofill,
    onStop,
    onNext,
    onManualFill,
    onClose,
    onRefreshLists,
    loading,
    dockBusy,
    lumiOkForExt,
    // Live control
    detailRun,
    queueState,
    controlInstruct,
    setControlInstruct,
    controlInstructBusy,
    onApplyInstruction,
    // Notifications
    notifFeed,
    onClearNotifs
}) {
    const [showHelp, setShowHelp] = useState(false);
    const [showNotifs, setShowNotifs] = useState(false);

    const optionSummary = [
        requirePacketBeforeProcess !== false ? 'packet' : null,
        unattended ? 'Hands-free' : 'Attended',
        lumiPrefsAutoNext ? 'auto-next' : null,
        captchaHelper ? 'CAPTCHA helper' : null,
        uploadCoverLetter ? 'cover letter' : null
    ].filter(Boolean).join(' · ');

    const showInstruct = detailRun?.kind === 'filled'
        || detailRun?.kind === 'attention'
        || detailRun?.kind === 'failed'
        || detailRun?.kind === 'incomplete'
        || detailRun?.kind === 'running'
        || queueBlocked
        || queueState?.running
        || queueState?.coachStatus;

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden">
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1">
                <LegendStrip />

                {lumiOk !== true ? (
                    <LumiExtensionHub
                        compact
                        lumiConnected={lumiOk}
                        profileId={profileId}
                        profiles={profiles || selectableProfiles || []}
                    />
                ) : null}

                {/* Extension connection */}
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2">
                    <span
                        className={`inline-flex h-2 w-2 shrink-0 rounded-full ${
                            lumiOk === true ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]'
                                : lumiOk === false ? 'bg-amber-400' : 'bg-white/30 animate-pulse'
                        }`}
                        aria-hidden
                    />
                    <span className="min-w-0 flex-1 text-xs text-white/70">
                        {lumiOk === true
                            ? `Lumi extension v${lumiVersion}`
                            : lumiOk === false
                                ? 'Extension not connected'
                                : 'Checking extension…'}
                    </span>
                    <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={busy} onClick={onCheckLumi}>
                        Check
                    </Button>
                </div>

                {lumiOk === false && (
                    <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-50/90">
                        chrome://extensions → <strong>Reload Lumi</strong> → Check again. Or use Manual fill.
                    </p>
                )}

                <Section title="Profile" hint={selectedProfile && readyPreview.length ? `${readyPreview.length} CV ready` : null}>
                    <Select value={profileId || undefined} onValueChange={onProfileChange}>
                        <SelectTrigger id="bidder-profile" className="h-10 border-white/10 bg-black/30">
                            <SelectValue placeholder="Choose candidate profile…">
                                {selectedProfile
                                    ? `${profileLabel(selectedProfile)}${profileStatusSuffix(
                                        selectedProfile,
                                        profileBidOutcome(courses, selectedProfile.id, jobLinkIds)
                                    )}`
                                    : null}
                            </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                            {!selectableProfiles.length && (
                                <SelectItem value="__none" disabled>No profiles available</SelectItem>
                            )}
                            {jobLinkIds.length > 0 && matchedProfileOptions.length > 0 && (
                                <SelectGroup>
                                    <SelectLabel>Matched to selected links</SelectLabel>
                                    {matchedProfileOptions.map((p) => (
                                        <SelectItem key={p.id} value={String(p.id)}>
                                            {profileLabel(p)}
                                            {profileStatusSuffix(p, profileBidOutcome(courses, p.id, jobLinkIds))}
                                        </SelectItem>
                                    ))}
                                </SelectGroup>
                            )}
                            {(showAllProfiles || !matchedProfileOptions.length) && otherProfileOptions.length > 0 && (
                                <SelectGroup>
                                    <SelectLabel>
                                        {matchedProfileOptions.length ? 'Other profiles' : 'All profiles'}
                                    </SelectLabel>
                                    {otherProfileOptions.map((p) => (
                                        <SelectItem key={p.id} value={String(p.id)}>
                                            {profileLabel(p)}
                                            {profileStatusSuffix(p, profileBidOutcome(courses, p.id, jobLinkIds))}
                                        </SelectItem>
                                    ))}
                                </SelectGroup>
                            )}
                        </SelectContent>
                    </Select>
                    {jobLinkIds.length > 0 && otherProfileOptions.length > 0 && (
                        <button
                            type="button"
                            className="mt-2 text-[11px] text-white/45 underline-offset-2 hover:text-white/70 hover:underline"
                            onClick={() => setShowAllProfiles((v) => !v)}
                        >
                            {showAllProfiles ? 'Show matched only' : `Show all profiles (+${otherProfileOptions.length})`}
                        </button>
                    )}
                </Section>

                <Section
                    title="Selected links"
                    hint={jobLinkIds.length ? `${jobLinkIds.length} selected${readyPreview.length ? ` · ${readyPreview.length} ready` : ''}` : 'None'}
                >
                    {!jobLinkIds.length ? (
                        <p className="text-xs text-white/45">
                            Select rows on the Job Links table, then reopen Auto Bidder.
                        </p>
                    ) : (
                        <ul className="max-h-36 space-y-1.5 overflow-y-auto">
                            {selectedLinks.map((l) => {
                                const ready = readyPreview.some((r) => Number(r.job_link_id) === Number(l.id));
                                const ats = detectAtsFromUrl(primaryJobUrl(l));
                                const outcome = linkOutcomeForProfile(courses, l.id, profileId, ready);
                                return (
                                    <li
                                        key={l.id}
                                        className={`flex items-center gap-2 rounded-lg border border-white/[0.05] px-3 py-2 text-xs ${runStatusRowClass(outcome.kind)}`}
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate font-medium text-white/90">
                                                #{l.id} {l.company_name || '—'}
                                            </div>
                                            {l.position_title ? (
                                                <div className="truncate text-[11px] text-white/45">{l.position_title}</div>
                                            ) : null}
                                        </div>
                                        <Badge variant="outline" className="shrink-0 text-[10px]">{ats.label}</Badge>
                                        <span
                                            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${runStatusBadgeClass(outcome.kind)}`}
                                            title={outcome.label}
                                        >
                                            {outcome.short}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    {!!unsupportedSelected?.length && (
                        <p className="mt-2 text-[11px] text-amber-300/90">
                            {unsupportedSelected.length} unsupported (e.g. LinkedIn) — skipped automatically.
                        </p>
                    )}
                </Section>

                <ApplicationPacketPanel
                    bidReadyItems={bidReadyItems || []}
                    profileId={profileId}
                    requireBeforeProcess={requirePacketBeforeProcess !== false}
                    onStatusChange={onPacketStatusChange}
                />

                {/* Advanced — collapsed by default */}
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
                    <button
                        type="button"
                        className="flex w-full items-center gap-2 px-4 py-3 text-left"
                        onClick={() => setShowAdvanced((v) => !v)}
                    >
                        <span className="text-xs font-semibold uppercase tracking-wider text-white/70">Advanced</span>
                        <span className="truncate text-[11px] text-white/40">{optionSummary || 'Bidder options'}</span>
                        {showAdvanced
                            ? <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-white/40" />
                            : <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-white/40" />}
                    </button>
                    {showAdvanced ? (
                        <div className="space-y-3 border-t border-white/[0.06] px-4 py-3 text-sm">
                            <LumiBidderSettings compact onChange={setLumiPrefs} showProfileAutofillHint={false} />
                            {captchaHelper ? (
                                <p className="text-[11px] text-white/45">
                                    Install{' '}
                                    <a className="underline" href="https://chromewebstore.google.com/detail/nopecha-captcha-solver/dknlfmjaanfblgfdfebhijalfmhmjjjo" target="_blank" rel="noopener noreferrer">NopeCHA</a>
                                    {' + '}
                                    <a className="underline" href="https://chromewebstore.google.com/detail/buster-captcha-solver-for/mpbjkejclgfgadiemmefgebjfooflfhl" target="_blank" rel="noopener noreferrer">Buster</a>
                                    {' '}in the same Chrome profile as Lumi.
                                </p>
                            ) : null}

                            <div className="space-y-2 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-[11px] font-semibold uppercase tracking-wider text-white/50">Policy memory</span>
                                    <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[10px]" disabled={memoryBusy} onClick={refreshStudyingPanel}>
                                        {memoryBusy ? '…' : 'Refresh'}
                                    </Button>
                                </div>
                                <TeachAndCheckPanel compact onTaught={refreshStudyingPanel} />
                                {helperProbe?.probed ? (
                                    <p className={`text-[11px] ${helperProbe.helper_missing ? 'text-amber-300' : 'text-emerald-300/90'}`}>
                                        Helpers: {helperProbe.nopecha ? 'NopeCHA ✓' : 'NopeCHA ✗'} · {helperProbe.buster ? 'Buster ✓' : 'Buster ✗'}
                                    </p>
                                ) : null}
                                <div className="max-h-28 space-y-1 overflow-y-auto">
                                    {questionMemoryRows.length === 0 ? (
                                        <p className="text-[11px] text-white/40">No studied questions yet.</p>
                                    ) : questionMemoryRows.slice(0, 8).map((row) => (
                                        <div key={row.id} className="flex items-center justify-between gap-2 rounded border border-white/[0.05] px-2 py-1 text-[11px]">
                                            <span className="min-w-0 truncate text-white/70">{row.kind} · {row.question_text}</span>
                                            <Button type="button" size="sm" variant="ghost" className="h-6 shrink-0 px-1.5 text-[10px]" disabled={memoryBusy} onClick={() => onToggleQuestionMemory(row)}>
                                                {row.disabled ? 'Enable' : 'Off'}
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex flex-wrap gap-2 pt-1">
                                    <Button type="button" size="sm" variant="outline" className="h-7 text-[11px]" disabled={memoryBusy} onClick={onClearQuestionMemory}>
                                        Clear memory
                                    </Button>
                                    <input
                                        className="h-7 min-w-[8rem] flex-1 rounded-md border border-white/10 bg-black/30 px-2 text-[11px]"
                                        placeholder="host for fill lessons"
                                        value={clearHostInput}
                                        onChange={(e) => setClearHostInput(e.target.value)}
                                    />
                                    <Button type="button" size="sm" variant="outline" className="h-7 text-[11px]" disabled={memoryBusy || !clearHostInput.trim()} onClick={onClearHostLessons}>
                                        Clear host
                                    </Button>
                                </div>
                            </div>

                            {outlookStatus?.config?.clientIdSet !== false && (
                                <div className="space-y-2 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2">
                                    <span className="text-[11px] font-semibold uppercase tracking-wider text-white/50">Outlook mailboxes</span>
                                    {!outlookStatus?.config?.clientIdSet ? (
                                        <p className="text-[11px] text-amber-200/90">Set OUTLOOK_CLIENT_ID in server/.env and restart API.</p>
                                    ) : (outlookStatus?.accounts || []).length ? (
                                        <ul className="space-y-1">
                                            {(outlookStatus.accounts || []).map((a) => (
                                                <li key={a.id || a.email} className="flex flex-wrap items-center gap-2 text-[11px]">
                                                    <span>{a.email || a.display_name}</span>
                                                    {!a.push_enabled && subscribeOutlookPush ? (
                                                        <Button type="button" size="sm" variant="outline" className="h-6 text-[10px]" disabled={outlookBusy} onClick={() => subscribeOutlookPush(a.id)}>
                                                            Enable push
                                                        </Button>
                                                    ) : null}
                                                    <Button type="button" size="sm" variant="ghost" className="h-6 text-[10px]" disabled={outlookBusy} onClick={() => removeOutlookMailbox(a.id)}>
                                                        Remove
                                                    </Button>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="text-[11px] text-white/40">No mailboxes connected.</p>
                                    )}
                                    <div className="flex flex-wrap gap-2">
                                        <Button type="button" size="sm" disabled={outlookBusy || !outlookStatus?.config?.clientIdSet} onClick={connectOutlookGraph}>
                                            {outlookBusy ? 'Waiting…' : 'Add mailbox'}
                                        </Button>
                                        {(outlookStatus?.accounts || []).length > 0 && (
                                            <Button type="button" size="sm" variant="ghost" disabled={outlookBusy} onClick={disconnectOutlookGraph}>Remove all</Button>
                                        )}
                                    </div>
                                    {outlookDevice?.user_code ? (
                                        <p className="text-[11px]">
                                            Enter <span className="font-mono font-semibold">{outlookDevice.user_code}</span> at microsoft.com/devicelogin
                                        </p>
                                    ) : null}
                                    {outlookMsg ? <p className="text-[11px] text-white/45">{outlookMsg}</p> : null}
                                </div>
                            )}
                        </div>
                    ) : null}
                </div>

                {showInstruct && (
                    <Section title="Instruct Lumi" hint="Fix fields on the live apply tab">
                        <textarea
                            className="min-h-[52px] w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs"
                            placeholder="e.g. Type city and zip into Location"
                            value={controlInstruct}
                            disabled={controlInstructBusy || busy}
                            onChange={(e) => setControlInstruct(e.target.value)}
                        />
                        <Button
                            type="button"
                            size="sm"
                            className="mt-2 h-8"
                            disabled={controlInstructBusy || busy || !controlInstruct.trim()}
                            onClick={onApplyInstruction}
                        >
                            {controlInstructBusy ? 'Applying…' : 'Apply'}
                        </Button>
                        {queueState?.coachStatus ? (
                            <p className="mt-2 text-[11px] text-sky-300/90">{queueState.coachStatus}</p>
                        ) : null}
                    </Section>
                )}

                {notifFeed?.length > 0 && (
                    <div className="rounded-xl border border-white/[0.06] bg-black/20">
                        <div className="flex items-center gap-2 px-4 py-2.5">
                            <button
                                type="button"
                                className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs"
                                onClick={() => setShowNotifs((v) => !v)}
                            >
                                <span className="font-medium text-white/70">Activity</span>
                                <Badge variant="secondary" className="text-[10px]">{notifFeed.length}</Badge>
                                {showNotifs
                                    ? <ChevronDown className="ml-auto h-4 w-4 text-white/40" />
                                    : <ChevronRight className="ml-auto h-4 w-4 text-white/40" />}
                            </button>
                            {onClearNotifs ? (
                                <button type="button" className="shrink-0 text-[10px] text-white/40 hover:text-white/70" onClick={onClearNotifs}>
                                    Clear
                                </button>
                            ) : null}
                        </div>
                        {showNotifs ? (
                            <ul className="max-h-32 space-y-1 overflow-y-auto border-t border-white/[0.06] px-4 py-2">
                                {notifFeed.map((n) => (
                                    <li key={n.id} className="text-[11px] text-white/55">{n.short}</li>
                                ))}
                            </ul>
                        ) : null}
                    </div>
                )}

                <div className="rounded-xl border border-white/[0.06] bg-black/20">
                    <button
                        type="button"
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs text-white/60"
                        onClick={() => setShowHelp((v) => !v)}
                    >
                        <HelpCircle className="h-4 w-4 text-primary" />
                        How it works
                        {showHelp
                            ? <ChevronDown className="ml-auto h-4 w-4" />
                            : <ChevronRight className="ml-auto h-4 w-4" />}
                    </button>
                    {showHelp ? (
                        <ol className="list-decimal space-y-1.5 border-t border-white/[0.06] px-4 py-3 pl-8 text-[11px] text-white/50">
                            <li>Pick a profile with a ready CV.</li>
                            <li>Confirm selected links show CV READY.</li>
                            <li>Prepare the <strong className="text-white/80">Application packet</strong> and review policy answers.</li>
                            <li>Click <strong className="text-white/80">Process</strong> — watch the live monitor (bottom-right).</li>
                            <li>CAPTCHA → Resume. Incomplete form → Re-autofill or Instruct.</li>
                            <li>Review results under the <strong className="text-white/80">Courses</strong> tab.</li>
                        </ol>
                    ) : null}
                </div>
            </div>

            {/* Sticky run bar */}
            <div className="shrink-0 border-t border-white/[0.08] bg-[hsl(240_6%_8%)] px-1 pt-3">
                {queueBlocked && (
                    <p className="mb-2 text-[11px] text-amber-200/90">
                        Queue active — Resume CAPTCHA or Stop before starting a new batch.
                    </p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="gradient" className="h-9 min-w-[7rem] font-semibold" disabled={!canProcess} onClick={onProcess}>
                        <Play className="h-4 w-4" />
                        {processLabel}
                    </Button>
                    {queueBlocked && awaitingCaptcha && (
                        <Button size="sm" className="h-9" disabled={busy || dockBusy} onClick={onResumeCaptcha}>
                            Resume CAPTCHA
                        </Button>
                    )}
                    {queueBlocked && (
                        <Button size="sm" variant="outline" className="h-9" disabled={busy || dockBusy || lumiOkForExt !== true} onClick={onReAutofill}>
                            <RefreshCw className="h-4 w-4" />
                            Re-autofill
                        </Button>
                    )}
                    <Button size="sm" variant="outline" className="h-9" disabled={busy || !profileId} onClick={onManualFill} title="Open apply tabs — use Web Fill bookmarklet if extension is not installed">
                        <ExternalLink className="h-4 w-4" />
                        Web Fill / Manual
                    </Button>
                    <Button size="sm" variant="outline" className="h-9" disabled={busy || lumiOkForExt !== true} onClick={onStop}>
                        <Square className="h-4 w-4" />
                        Stop
                    </Button>
                    {!queueBlocked && (
                        <Button size="sm" variant="ghost" className="h-9" disabled={busy || lumiOkForExt !== true} onClick={onNext}>
                            <SkipForward className="h-4 w-4" />
                            Next
                        </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-9" disabled={loading} onClick={onRefreshLists}>
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                    <Button size="sm" variant="ghost" className="ml-auto h-9" onClick={onClose}>
                        <X className="h-4 w-4" />
                        Close
                    </Button>
                </div>
            </div>
        </div>
    );
}
