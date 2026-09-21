import { useState } from 'react';
import { Link } from '@/next/router';
import {
    HelpCircle,
    Play,
    RefreshCw,
    Settings2,
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
import { runStatusBadgeClass, runStatusRowClass, detectAtsFromUrl } from '@/lib/bidCourseFailure';
import ApplicationPacketPanel from '@/components/job-links/ApplicationPacketPanel';
import LumiExtensionHub from '@/components/LumiExtensionHub';
import { clampFormWaitSec, clampOpenGapMs, clampMaxTabs } from '@/lib/lumiBidderPrefs';
import { useAuth } from '@/context/AuthContext';

function bidderSettingsPath(role) {
    const r = String(role || 'user').toLowerCase();
    if (r === 'admin') return '/admin/bidder-settings';
    if (r === 'manager') return '/manager/bidder-settings';
    return '/user/bidder-settings';
}

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

export default function AutoBidderSetupPanel({
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
    selectedLinks,
    unsupportedSelected,
    linkOutcomeForProfile,
    primaryJobUrl,
    lumiOk,
    lumiVersion,
    busy,
    onCheckLumi,
    profiles,
    lumiPrefs = null,
    unattended,
    captchaHelper,
    uploadCoverLetter,
    lumiPrefsAutoNext,
    settingsHref = '',
    queueBlocked,
    awaitingCaptcha,
    canProcess,
    processLabel,
    onProcess,
    onResumeCaptcha,
    onReAutofill,
    onStop,
    onManualFill,
    onClose,
    onRefreshLists,
    loading,
    dockBusy,
    lumiOkForExt
}) {
    const { user } = useAuth();
    const [showHelp, setShowHelp] = useState(false);
    const fullSettingsHref = settingsHref || bidderSettingsPath(user?.role);

    const formWaitSec = clampFormWaitSec(lumiPrefs?.formWaitSec);
    const openGapMs = clampOpenGapMs(lumiPrefs?.openGapMs);
    const maxTabs = clampMaxTabs(lumiPrefs?.maxTabs);

    const modeLabel = unattended ? 'Hands-free' : 'Attended';
    const prefsHint = [
        modeLabel,
        lumiPrefsAutoNext ? 'auto-next' : null,
        captchaHelper ? 'CAPTCHA' : null,
        uploadCoverLetter ? 'cover' : null,
        `wait ${formWaitSec}s`,
        openGapMs > 0 ? `gap ${openGapMs}ms` : null,
        `tabs ${maxTabs}`
    ].filter(Boolean).join(' · ');

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden">
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/45">
                    <span><span className="font-semibold text-emerald-300">APPLIED</span></span>
                    <span><span className="font-semibold text-sky-300">FILLED</span></span>
                    <span><span className="font-semibold text-rose-300">REJECTED</span></span>
                    <span><span className="font-semibold text-amber-200">CAPTCHA</span></span>
                </div>

                {lumiOk !== true ? (
                    <LumiExtensionHub
                        compact
                        lumiConnected={lumiOk}
                        profileId={profileId}
                        profiles={profiles || selectableProfiles || []}
                    />
                ) : null}

                <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2">
                    <span
                        className={`inline-flex h-2 w-2 shrink-0 rounded-full ${
                            lumiOk === true
                                ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]'
                                : lumiOk === false
                                    ? 'bg-amber-400'
                                    : 'bg-white/30 animate-pulse'
                        }`}
                        aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-xs text-white/70">
                        {lumiOk === true
                            ? `Extension ready · v${lumiVersion}`
                            : lumiOk === false
                                ? 'Extension offline — Reload Lumi, then Check'
                                : 'Checking extension…'}
                    </span>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" disabled={busy} onClick={onCheckLumi}>
                        Check
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-[11px]" asChild>
                        <Link to={fullSettingsHref} target="_blank" rel="noreferrer">
                            <Settings2 className="h-3 w-3" />
                            Settings
                        </Link>
                    </Button>
                </div>

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
                            {showAllProfiles ? 'Show matched only' : `Show all (+${otherProfileOptions.length})`}
                        </button>
                    )}
                </Section>

                <Section
                    title="Jobs"
                    hint={jobLinkIds.length ? `${jobLinkIds.length} selected` : 'None'}
                >
                    {!jobLinkIds.length ? (
                        <p className="text-xs text-white/45">
                            Select rows on Job Links, then reopen Auto Bidder.
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
                            {unsupportedSelected.length} unsupported — skipped automatically.
                        </p>
                    )}
                </Section>

                <ApplicationPacketPanel
                    bidReadyItems={bidReadyItems || []}
                    profileId={profileId}
                    requireBeforeProcess={requirePacketBeforeProcess !== false}
                    onStatusChange={onPacketStatusChange}
                />

                <div className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2.5">
                    <p className="min-w-0 truncate text-[11px] text-white/45" title={prefsHint}>
                        {prefsHint}
                    </p>
                    <Button type="button" size="sm" variant="ghost" className="h-7 shrink-0 gap-1 px-2 text-[11px]" asChild>
                        <Link to={fullSettingsHref} target="_blank" rel="noreferrer">
                            Edit
                        </Link>
                    </Button>
                </div>

                <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-xl px-1 py-1 text-left text-[11px] text-white/40 hover:text-white/60"
                    onClick={() => setShowHelp((v) => !v)}
                >
                    <HelpCircle className="h-3.5 w-3.5" />
                    {showHelp ? 'Hide tips' : 'How it works'}
                </button>
                {showHelp ? (
                    <ol className="list-decimal space-y-1 px-1 pl-6 text-[11px] text-white/45">
                        <li>Pick a profile with a ready CV.</li>
                        <li>Confirm jobs and prepare the application packet.</li>
                        <li>Process — watch the floating control panel.</li>
                        <li>CAPTCHA → Resume. Stuck form → Re-fill or Ask Lumi.</li>
                    </ol>
                ) : null}
            </div>

            <div className="shrink-0 border-t border-white/[0.08] bg-[hsl(240_6%_8%)] px-1 pt-3">
                {queueBlocked && (
                    <p className="mb-2 text-[11px] text-amber-200/90">
                        Queue active — Resume or Stop before a new batch.
                    </p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="gradient" className="h-9 min-w-[7rem] font-semibold" disabled={!canProcess} onClick={onProcess}>
                        <Play className="h-4 w-4" />
                        {processLabel}
                    </Button>
                    {queueBlocked && awaitingCaptcha && (
                        <Button size="sm" className="h-9" disabled={busy || dockBusy} onClick={onResumeCaptcha}>
                            Resume
                        </Button>
                    )}
                    <Button size="sm" variant="outline" className="h-9" disabled={busy || dockBusy || lumiOkForExt !== true || !profileId} onClick={onReAutofill}>
                        <RefreshCw className="h-4 w-4" />
                        Re-fill
                    </Button>
                    <Button size="sm" variant="outline" className="h-9" disabled={busy || !profileId} onClick={onManualFill}>
                        Manual
                    </Button>
                    <Button size="sm" variant="outline" className="h-9" disabled={busy || lumiOkForExt !== true} onClick={onStop}>
                        <Square className="h-4 w-4" />
                        Stop
                    </Button>
                    <Button size="sm" variant="ghost" className="h-9 w-9 p-0" disabled={loading} onClick={onRefreshLists} title="Refresh">
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
