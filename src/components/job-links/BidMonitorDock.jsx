/**
 * Floating Auto Bidder Control Panel — draggable, clean status → actions → live preview.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    ExternalLink,
    FileText,
    GripVertical,
    Maximize2,
    Pause,
    Pencil,
    Play,
    Plus,
    RefreshCw,
    Settings2,
    SkipForward,
    Square,
    Trash2,
    X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import BidProgressBar from '@/components/job-links/BidProgressBar';
import { runStatusBadgeClass, runStatusHeadline, formatTotalElapsed } from '@/lib/bidCourseFailure';
import { shortenNotifyText, shortenOutcomeLabel } from '@/lib/bidderNotifyCopy';
import { Link } from '@/next/router';
import { useAuth } from '@/context/AuthContext';

const POS_KEY = 'lumi_bid_monitor_pos_v2';
const DOCK_W = 460;
const DOCK_H_MIN = 56;

function bidderSettingsPath(role) {
    const r = String(role || 'user').toLowerCase();
    if (r === 'admin') return '/admin/bidder-settings';
    if (r === 'manager') return '/manager/bidder-settings';
    return '/user/bidder-settings';
}

function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
}

function defaultPos() {
    if (typeof window === 'undefined') return { x: 16, y: 16 };
    return {
        x: Math.max(16, window.innerWidth - DOCK_W - 20),
        y: 16
    };
}

function loadPos() {
    try {
        const raw = localStorage.getItem(POS_KEY);
        if (!raw) return defaultPos();
        const p = JSON.parse(raw);
        if (typeof p?.x === 'number' && typeof p?.y === 'number') {
            const maxY = Math.max(8, window.innerHeight - 120);
            return {
                x: clamp(p.x, 8, Math.max(8, window.innerWidth - 120)),
                y: clamp(p.y, 8, maxY)
            };
        }
    } catch (_) { /* ignore */ }
    return defaultPos();
}

export default function BidMonitorDock({
    open,
    minimized,
    onMinimizedChange,
    onClose,
    onExpandDialog,
    onFullscreen,
    title,
    statusLine,
    statusComment = '',
    shotStage,
    imgSrc,
    imgErr,
    loading,
    updatedLabel,
    lastRefreshedAt = null,
    frameIndex = 0,
    frameCount = 0,
    onPrevFrame,
    onNextFrame,
    followLive = true,
    onFollowLive,
    progressPct = 0,
    progressLabel = '',
    progressTone = 'sky',
    progressStepIndex = -1,
    controlsBusy = false,
    awaitingCaptcha = false,
    captchaTabMissing = false,
    ownedTabAlive = null,
    queueRunning = false,
    queuePaused = false,
    ownedTabId = null,
    ownedTabUrl = '',
    ownedTabMapped = false,
    successConfirming = false,
    openTabLabel = 'Open',
    onOpenApplyTab,
    onResumeCaptcha,
    onSkipCaptcha,
    onReAutofill,
    onUpdateState = null,
    onSubmitApply = null,
    onInstructLumi = null,
    coachStatus = '',
    onNextJob,
    onPauseQueue = null,
    onResumeQueue = null,
    onStopQueue,
    onProcess = null,
    canProcess = false,
    processLabel = 'Process',
    cvFilename = '',
    cvDownloadUrl = '',
    cvEditHref = '',
    cvHtml = '',
    onLoadCv = null,
    courseAnswers = [],
    onListFormQuestions = null,
    onApplyAnswers = null,
    outcomeKind = '',
    outcomeShort = '',
    outcomeLabel = '',
    /** pending | applied | rejected | interview */
    applicationStatus = '',
    /** Extension run phase e.g. filling, waiting_submit */
    runPhase = '',
    /** Queue status string */
    queueStatus = '',
    missingFields = [],
    lastError = '',
    lastEventType = '',
    companyName = '',
    jobRole = '',
    notifFeed = [],
    onClearNotifs = null,
    jobStartedAt = null,
    jobEndedAt = null,
    answersStartedAt = null,
    answersEndedAt = null,
    answersQuestionCount = 0,
    answersReadyCount = 0,
    queueStartedAt = null,
    queueEndedAt = null,
    queueIndex = 0,
    queueTotal = 0,
    settingsHref = ''
}) {
    const { user } = useAuth();
    const settingsLink = settingsHref || bidderSettingsPath(user?.role);
    const [mounted, setMounted] = useState(false);
    const [pos, setPos] = useState(() => ({ x: 16, y: 16 }));
    const [, setTick] = useState(0);
    const dragRef = useRef(null);
    const [answerDrafts, setAnswerDrafts] = useState([]);
    const [answersBusy, setAnswersBusy] = useState(false);
    const [answersMsg, setAnswersMsg] = useState('');
    const answersSigRef = useRef('');
    const [dockTab, setDockTab] = useState('live');
    const [instructText, setInstructText] = useState('');
    const [instructBusy, setInstructBusy] = useState(false);
    const [instructMsg, setInstructMsg] = useState('');
    const [showAsk, setShowAsk] = useState(false);
    const [cvPreviewHtml, setCvPreviewHtml] = useState('');
    const [cvPreviewBusy, setCvPreviewBusy] = useState(false);
    const [cvPreviewErr, setCvPreviewErr] = useState('');
    const autoLoadedQsRef = useRef('');
    const cvLoadKeyRef = useRef('');
    const onLoadCvRef = useRef(onLoadCv);
    onLoadCvRef.current = onLoadCv;

    useEffect(() => {
        setMounted(true);
        setPos(loadPos());
    }, []);

    useEffect(() => {
        const list = Array.isArray(courseAnswers) ? courseAnswers : [];
        const sig = list.map((a) => `${a?.id}|${a?.label}|${a?.answer || a?.value || ''}`).join('||');
        if (sig === answersSigRef.current) return;
        answersSigRef.current = sig;
        if (!list.length) return;
        setAnswerDrafts(list.map((a, i) => ({
            key: String(a?.id || a?.label || i),
            id: String(a?.id || a?.label || ''),
            label: String(a?.label || a?.id || `Question ${i + 1}`),
            answer: String(a?.answer ?? a?.value ?? '')
        })));
    }, [courseAnswers]);

    useEffect(() => {
        setCvPreviewHtml('');
        setCvPreviewErr('');
        cvLoadKeyRef.current = '';
    }, [cvFilename, cvEditHref]);

    useEffect(() => {
        if (cvHtml) setCvPreviewHtml(cvHtml);
    }, [cvHtml]);

    useEffect(() => {
        if (dockTab !== 'cv') return;
        const key = `${cvFilename}|${cvEditHref}`;
        if (cvPreviewHtml || cvLoadKeyRef.current === key) return;
        if (typeof onLoadCvRef.current !== 'function') {
            setCvPreviewErr('No CV for this job yet.');
            return;
        }
        let cancelled = false;
        cvLoadKeyRef.current = key;
        setCvPreviewBusy(true);
        setCvPreviewErr('');
        onLoadCvRef.current()
            .then((html) => {
                if (cancelled) return;
                const text = String(html || '').trim();
                if (!text) setCvPreviewErr('No CV yet. Generate it first.');
                else setCvPreviewHtml(text);
            })
            .catch((err) => {
                if (cancelled) return;
                cvLoadKeyRef.current = '';
                setCvPreviewErr(err?.message || 'Could not load CV');
            })
            .finally(() => {
                if (!cancelled) setCvPreviewBusy(false);
            });
        return () => { cancelled = true; };
    }, [dockTab, cvFilename, cvEditHref, cvPreviewHtml]);

    useEffect(() => {
        if (dockTab !== 'manual' || !onListFormQuestions) return;
        const sig = `${ownedTabId || ''}|${title || ''}`;
        if (autoLoadedQsRef.current === sig) return;
        autoLoadedQsRef.current = sig;
        loadQuestionsFromForm().catch(() => {});
    }, [dockTab, ownedTabId, title]);

    const loadQuestionsFromForm = async () => {
        if (!onListFormQuestions) return;
        setAnswersBusy(true);
        setAnswersMsg('');
        try {
            const qs = await onListFormQuestions();
            const incoming = Array.isArray(qs) ? qs : [];
            setAnswerDrafts((prev) => {
                const byKey = new Map(
                    prev.map((r) => [String(r.id || r.label).toLowerCase(), r])
                );
                const next = incoming.map((q, i) => {
                    const key = String(q.id || q.label || i).toLowerCase();
                    const old = byKey.get(key);
                    const live = String(q.answer ?? q.value ?? '').trim();
                    return {
                        key: String(q.id || q.label || `q-${i}`),
                        id: String(q.id || q.label || ''),
                        label: String(q.label || q.id || `Question ${i + 1}`),
                        required: !!q.required,
                        kind: q.kind || '',
                        answer: old?.answer || live
                    };
                });
                if (!next.length) {
                    return prev.length ? prev : [{
                        key: `new-${Date.now()}`,
                        id: '',
                        label: '',
                        answer: ''
                    }];
                }
                return next;
            });
            setAnswersMsg(incoming.length
                ? `Loaded ${incoming.length} question(s) from the apply form`
                : 'No questions detected — add manually');
            setDockTab('manual');
        } catch (err) {
            setAnswersMsg(err?.message || 'Could not load questions');
        } finally {
            setAnswersBusy(false);
        }
    };

    const applyManualAnswers = async () => {
        if (!onApplyAnswers) return;
        setAnswersBusy(true);
        setAnswersMsg('');
        try {
            await onApplyAnswers(answerDrafts);
            setAnswersMsg('Filled on apply tab');
        } catch (err) {
            setAnswersMsg(err?.message || 'Apply answers failed');
        } finally {
            setAnswersBusy(false);
        }
    };

    useEffect(() => {
        if (!open) return undefined;
        const needTick = lastRefreshedAt != null
            || (jobStartedAt && !jobEndedAt)
            || (queueStartedAt && !queueEndedAt)
            || (answersStartedAt && !answersEndedAt);
        if (!needTick) return undefined;
        const t = setInterval(() => setTick((n) => n + 1), 1000);
        return () => clearInterval(t);
    }, [open, lastRefreshedAt, jobStartedAt, jobEndedAt, queueStartedAt, queueEndedAt, answersStartedAt, answersEndedAt]);

    const liveUpdatedLabel = (() => {
        if (updatedLabel) return updatedLabel;
        if (lastRefreshedAt == null) return '';
        const sec = Math.max(0, Math.round((Date.now() - lastRefreshedAt) / 1000));
        return `${sec}s ago`;
    })();

    const jobTotalLabel = jobStartedAt ? formatTotalElapsed(jobStartedAt, jobEndedAt) : '';
    const answersTotalLabel = answersStartedAt ? formatTotalElapsed(answersStartedAt, answersEndedAt) : '';
    const answersQLabel = Number(answersQuestionCount) > 0
        ? `Q ${answersQuestionCount}${Number(answersReadyCount) > 0 ? `/${answersReadyCount}` : ''}`
        : '';
    const timeChip = [
        jobTotalLabel,
        answersTotalLabel ? `ans ${answersTotalLabel}` : '',
        answersQLabel
    ].filter(Boolean).join(' · ');
    const queuePosLabel = Number(queueTotal) > 0 && Number(queueIndex) > 0
        ? `${queueIndex}/${queueTotal}`
        : '';

    useEffect(() => {
        if (!open || minimized) return undefined;
        setPos((p) => {
            const maxY = Math.max(8, window.innerHeight - 160);
            const next = {
                x: clamp(p.x, 8, Math.max(8, window.innerWidth - 120)),
                y: clamp(p.y, 8, maxY)
            };
            if (next.x === p.x && next.y === p.y) return p;
            try { localStorage.setItem(POS_KEY, JSON.stringify(next)); } catch (_) { /* ignore */ }
            return next;
        });
        return undefined;
    }, [open, minimized]);

    useEffect(() => {
        if (!open) return undefined;
        const onResize = () => {
            setPos((p) => ({
                x: clamp(p.x, 8, Math.max(8, window.innerWidth - 120)),
                y: clamp(p.y, 8, Math.max(8, window.innerHeight - 160))
            }));
        };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [open]);

    const onPointerDown = useCallback((e) => {
        if (e.button !== 0) return;
        if (e.target?.closest?.('button,a')) return;
        e.preventDefault();
        const startX = e.clientX;
        const startY = e.clientY;
        const orig = { ...pos };
        dragRef.current = { startX, startY, orig };

        const onMove = (ev) => {
            const d = dragRef.current;
            if (!d) return;
            const next = {
                x: clamp(d.orig.x + (ev.clientX - d.startX), 8, Math.max(8, window.innerWidth - 120)),
                y: clamp(d.orig.y + (ev.clientY - d.startY), 8, Math.max(8, window.innerHeight - 80))
            };
            setPos(next);
        };
        const onUp = () => {
            dragRef.current = null;
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            setPos((p) => {
                try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch (_) { /* ignore */ }
                return p;
            });
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    }, [pos]);

    // Auto-open Ask when stuck / captcha
    useEffect(() => {
        if (awaitingCaptcha || outcomeKind === 'filled' || outcomeKind === 'attention' || outcomeKind === 'incomplete') {
            setShowAsk(true);
        }
    }, [awaitingCaptcha, outcomeKind]);

    if (!mounted || !open || typeof document === 'undefined') return null;

    const hasFrames = frameCount > 0;
    const canPrev = hasFrames && frameIndex > 0;
    const canNext = hasFrames && frameIndex < frameCount - 1;
    const canSteer = queueRunning || awaitingCaptcha || progressPct > 0 || queuePaused;
    const hasCv = !!(cvDownloadUrl || cvEditHref || cvFilename);
    const stuck = outcomeKind === 'filled'
        || outcomeKind === 'attention'
        || outcomeKind === 'failed'
        || outcomeKind === 'incomplete'
        || captchaTabMissing
        || ownedTabAlive === false;
    const captcha = !!awaitingCaptcha;
    const tabClosed = captchaTabMissing || ownedTabAlive === false;
    const focusLabel = ownedTabMapped && !tabClosed
        ? 'Focus'
        : (openTabLabel || 'Open');

    const outcomeBadge = outcomeKind
        ? {
            kind: outcomeKind,
            short: outcomeShort || String(outcomeKind).toUpperCase(),
            headline: runStatusHeadline(outcomeKind, outcomeShort),
            hint: outcomeLabel || ''
        }
        : null;

    const shortStatus = shortenOutcomeLabel(outcomeBadge?.hint || progressLabel || statusLine || '')
        || shortenNotifyText(statusComment)
        || (outcomeBadge ? outcomeBadge.headline : '')
        || (queueRunning ? 'Bidding…' : 'Ready');

    const appStatusRaw = String(applicationStatus || '').toLowerCase();
    const appStateMark = (() => {
        if (captcha) return { label: 'CAPTCHA', tone: 'amber' };
        if (outcomeBadge?.kind === 'success' || appStatusRaw === 'applied' || outcomeShort === 'APPLIED') {
            return { label: 'APPLIED', tone: 'emerald' };
        }
        if (outcomeShort === 'REJECTED' || appStatusRaw === 'rejected') {
            return { label: 'REJECTED', tone: 'rose' };
        }
        if (appStatusRaw === 'interview') return { label: 'INTERVIEW', tone: 'sky' };
        if (outcomeBadge?.kind === 'filled' || outcomeShort === 'FILLED') {
            return { label: 'FILLED', tone: 'sky' };
        }
        if (outcomeBadge?.kind === 'attention' || outcomeShort === 'INCOMPLETE') {
            return { label: outcomeShort || 'ATTENTION', tone: 'amber' };
        }
        if (outcomeBadge?.kind === 'failed') return { label: outcomeShort || 'FAILED', tone: 'rose' };
        if (/awaiting_cv_regen/i.test(String(queueStatus || ''))) {
            return { label: 'CV PENDING', tone: 'amber' };
        }
        if (queuePaused) return { label: 'PAUSED', tone: 'amber' };
        const queueDone = /^(?:done|stopped|empty)$/i.test(String(queueStatus || ''));
        if (!queueDone && (queueRunning || progressPct > 0)) {
            return { label: 'RUNNING', tone: 'emerald' };
        }
        if (queueDone && (outcomeShort === 'INCOMPLETE' || /cv_|incomplete/i.test(String(lastEventType || '')))) {
            return { label: 'INCOMPLETE', tone: 'amber' };
        }
        if (queueDone) return { label: 'DONE', tone: 'muted' };
        if (appStatusRaw === 'pending' || appStatusRaw) {
            return { label: String(applicationStatus || 'PENDING').toUpperCase(), tone: 'muted' };
        }
        return { label: 'IDLE', tone: 'muted' };
    })();

    const appStateToneClass = {
        emerald: 'border-emerald-400/35 bg-emerald-500/15 text-emerald-200',
        rose: 'border-rose-400/35 bg-rose-500/15 text-rose-200',
        amber: 'border-amber-400/35 bg-amber-500/15 text-amber-100',
        sky: 'border-sky-400/35 bg-sky-500/15 text-sky-200',
        muted: 'border-white/15 bg-white/5 text-white/60'
    }[appStateMark.tone] || 'border-white/15 bg-white/5 text-white/60';

    const hostSnippet = (() => {
        const raw = String(ownedTabUrl || '').trim();
        if (!raw) return '';
        try {
            const u = new URL(raw);
            return u.hostname.replace(/^www\./i, '') + (u.pathname.length > 1 ? u.pathname.slice(0, 24) : '');
        } catch {
            return raw.slice(0, 40);
        }
    })();

    const jobHeadline = [companyName, jobRole].filter(Boolean).join(' · ') || title || '';
    const phaseLabel = String(runPhase || queueStatus || '').replace(/_/g, ' ').trim();
    const missingList = Array.isArray(missingFields)
        ? missingFields.map((m) => (typeof m === 'string' ? m : (m?.label || m?.name || ''))).filter(Boolean).slice(0, 6)
        : [];
    const errSnippet = String(lastError || '').trim().slice(0, 160);
    const isApplied = outcomeKind === 'success' || /applied/i.test(String(applicationStatus || ''));
    const showEvidence = !isApplied && (stuck || tabClosed || missingList.length > 0 || !!errSnippet);
    const feedSlice = Array.isArray(notifFeed) ? notifFeed.slice(0, 6) : [];

    const btn = 'h-8 gap-1 px-2.5 text-[11px]';
    const btnIcon = 'h-3 w-3';
    const steerBusy = controlsBusy;

    /** Context-first primary + always-visible tools (Re-fill, Submit, Next, …). */
    const actionBar = (
        <div className={`space-y-1.5 rounded-xl border px-2 py-2 ${
            captcha
                ? 'border-amber-400/25 bg-amber-500/[0.06]'
                : stuck
                    ? 'border-amber-400/15 bg-white/[0.03]'
                    : 'border-white/[0.06] bg-white/[0.03]'
        }`}
        >
            <div className="flex flex-wrap gap-1.5">
                {captcha && onResumeCaptcha ? (
                    <Button type="button" size="sm" className={btn} disabled={steerBusy} onClick={onResumeCaptcha}>
                        <Play className={btnIcon} />
                        Resume
                    </Button>
                ) : null}
                {queuePaused && onResumeQueue ? (
                    <Button type="button" size="sm" variant="gradient" className={btn} disabled={steerBusy} onClick={onResumeQueue}>
                        <Play className={btnIcon} />
                        Resume queue
                    </Button>
                ) : null}
                {!captcha && !queueRunning && !queuePaused && typeof onProcess === 'function' ? (
                    <Button type="button" size="sm" variant="default" className={btn} disabled={steerBusy || !canProcess} onClick={onProcess}>
                        <Play className={btnIcon} />
                        {processLabel || 'Process'}
                    </Button>
                ) : null}
                {onOpenApplyTab ? (
                    <Button
                        type="button"
                        size="sm"
                        variant={captcha || stuck ? 'default' : 'outline'}
                        className={btn}
                        disabled={steerBusy}
                        onClick={onOpenApplyTab}
                        title={tabClosed ? 'Reopen apply tab' : 'Focus apply tab'}
                    >
                        <ExternalLink className={btnIcon} />
                        {focusLabel}
                    </Button>
                ) : null}
                {onReAutofill ? (
                    <Button
                        type="button"
                        size="sm"
                        variant={stuck && !captcha ? 'default' : 'outline'}
                        className={btn}
                        disabled={steerBusy}
                        onClick={onReAutofill}
                        title="Re-run autofill on the apply tab"
                    >
                        <RefreshCw className={btnIcon} />
                        Re-fill
                    </Button>
                ) : null}
                {onSubmitApply ? (
                    <Button
                        type="button"
                        size="sm"
                        variant={stuck && !captcha ? 'default' : 'outline'}
                        className={btn}
                        disabled={steerBusy}
                        onClick={onSubmitApply}
                        title="Click Submit on the apply tab"
                    >
                        <Play className={btnIcon} />
                        Submit
                    </Button>
                ) : null}
                {onNextJob ? (
                    <Button type="button" size="sm" variant="outline" className={btn} disabled={steerBusy || (!canSteer && !stuck)} onClick={onNextJob}>
                        <SkipForward className={btnIcon} />
                        Next
                    </Button>
                ) : null}
                {!queuePaused && onPauseQueue ? (
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={btn}
                        disabled={steerBusy || (!queueRunning && !canSteer)}
                        onClick={onPauseQueue}
                    >
                        <Pause className={btnIcon} />
                        Pause
                    </Button>
                ) : null}
                {onStopQueue ? (
                    <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        className={btn}
                        disabled={steerBusy || (!canSteer && !queueRunning && !queuePaused && !stuck && !captcha)}
                        onClick={onStopQueue}
                    >
                        <Square className={btnIcon} />
                        Stop
                    </Button>
                ) : null}
            </div>
            <div className="flex flex-wrap gap-1.5">
                {captcha && onSkipCaptcha ? (
                    <Button type="button" size="sm" variant="outline" className={btn} disabled={steerBusy} onClick={onSkipCaptcha}>
                        Skip CAPTCHA
                    </Button>
                ) : null}
                {onUpdateState ? (
                    <Button type="button" size="sm" variant="ghost" className={btn} disabled={steerBusy} onClick={onUpdateState} title="Refresh status from apply tab">
                        State
                    </Button>
                ) : null}
                {hasCv ? (
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className={btn}
                        disabled={cvPreviewBusy}
                        onClick={() => { setDockTab('cv'); }}
                        title="Preview the generated CV"
                    >
                        <FileText className={btnIcon} />
                        Preview CV
                    </Button>
                ) : null}
                {hasCv && cvDownloadUrl ? (
                    <Button type="button" size="sm" variant="ghost" className={btn} asChild>
                        <a href={cvDownloadUrl} target="_blank" rel="noreferrer">
                            <FileText className={btnIcon} />
                            CV
                        </a>
                    </Button>
                ) : null}
                {hasCv && cvEditHref ? (
                    <Button type="button" size="sm" variant="ghost" className={btn} asChild>
                        <a href={cvEditHref} target="_blank" rel="noreferrer">
                            <Pencil className={btnIcon} />
                            Edit CV
                        </a>
                    </Button>
                ) : null}
                <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 gap-1 px-2 text-[11px] text-white/45"
                    onClick={() => setShowAsk((v) => !v)}
                >
                    Ask Lumi
                </Button>
            </div>
        </div>
    );

    const compactBtn = 'h-6 gap-0.5 px-1.5 text-[10px]';
    const compactActions = (
        <div className="flex flex-wrap gap-1">
            {captcha && onResumeCaptcha ? (
                <Button type="button" size="sm" className={compactBtn} disabled={steerBusy} onClick={onResumeCaptcha}>
                    <Play className="h-2.5 w-2.5" />Resume
                </Button>
            ) : null}
            {!captcha && !queueRunning && typeof onProcess === 'function' ? (
                <Button type="button" size="sm" className={compactBtn} disabled={steerBusy || !canProcess} onClick={onProcess}>
                    <Play className="h-2.5 w-2.5" />{processLabel || 'Process'}
                </Button>
            ) : null}
            {onOpenApplyTab ? (
                <Button type="button" size="sm" variant="outline" className={compactBtn} disabled={steerBusy} onClick={onOpenApplyTab}>
                    {focusLabel}
                </Button>
            ) : null}
            {onReAutofill ? (
                <Button type="button" size="sm" variant="outline" className={compactBtn} disabled={steerBusy} onClick={onReAutofill}>
                    Re-fill
                </Button>
            ) : null}
            {onSubmitApply ? (
                <Button type="button" size="sm" variant="outline" className={compactBtn} disabled={steerBusy} onClick={onSubmitApply}>
                    Submit
                </Button>
            ) : null}
            {onNextJob ? (
                <Button type="button" size="sm" variant="outline" className={compactBtn} disabled={steerBusy || (!canSteer && !stuck)} onClick={onNextJob}>
                    Next
                </Button>
            ) : null}
            {onStopQueue ? (
                <Button type="button" size="sm" variant="destructive" className={compactBtn} disabled={steerBusy || (!canSteer && !queueRunning && !queuePaused && !stuck && !captcha)} onClick={onStopQueue}>
                    Stop
                </Button>
            ) : null}
        </div>
    );

    const applyInstruct = async () => {
        if (!onInstructLumi || !instructText.trim()) return;
        setInstructBusy(true);
        setInstructMsg('');
        try {
            const res = await onInstructLumi(instructText.trim());
            setInstructMsg(shortenNotifyText(res?.summary || res?.coach || 'Applied') || 'Applied');
            if (res?.ok !== false) setInstructText('');
        } catch (err) {
            setInstructMsg(
                shortenNotifyText(err?.message || 'Instruct failed')
                || 'Lumi offline — Reload extension'
            );
        } finally {
            setInstructBusy(false);
        }
    };

    const body = (
        <div
            className="lumi-control pointer-events-auto fixed z-[2147483000] flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[hsl(240_6%_9%/0.94)] shadow-[0_24px_64px_-20px_rgba(0,0,0,0.75),0_0_0_1px_hsla(187,85%,53%,0.12)] backdrop-blur-xl animate-in fade-in-0 zoom-in-95 duration-200"
            style={{
                left: pos.x,
                top: pos.y,
                width: minimized ? 280 : DOCK_W,
                maxWidth: 'calc(100vw - 16px)',
                minHeight: DOCK_H_MIN,
                maxHeight: minimized
                    ? undefined
                    : `min(calc(100vh - ${Math.max(8, pos.y)}px - 8px), calc(100vh - 16px))`
            }}
            role="dialog"
            aria-label="Lumi control panel"
        >
            {/* Header */}
            <div
                className="relative flex shrink-0 cursor-grab items-center gap-2 border-b border-white/[0.06] px-3 py-2 active:cursor-grabbing select-none"
                style={{
                    background: 'linear-gradient(135deg, hsla(187,85%,53%,0.12) 0%, hsla(240,6%,12%,0.9) 50%, hsla(240,5%,10%,0.95) 100%)'
                }}
                onPointerDown={onPointerDown}
                title="Drag to move"
            >
                <GripVertical className="h-3.5 w-3.5 shrink-0 text-white/30" />
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                        <span
                            className="text-[13px] font-semibold tracking-tight text-white"
                            style={{ fontFamily: 'var(--font-display)' }}
                        >
                            Lumi
                        </span>
                        {captcha ? (
                            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-200">Captcha</span>
                        ) : outcomeBadge && ['success', 'failed', 'filled', 'attention'].includes(outcomeBadge.kind) ? (
                            <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${runStatusBadgeClass(outcomeBadge.kind)}`}>
                                {outcomeBadge.short}
                            </span>
                        ) : followLive && (queueRunning || progressPct > 0) ? (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-emerald-300">
                                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                                Live
                            </span>
                        ) : null}
                        {queuePosLabel ? (
                            <span className="font-mono text-[10px] text-white/40">{queuePosLabel}</span>
                        ) : null}
                        {timeChip ? (
                            <span className="truncate font-mono text-[10px] text-white/35">{timeChip}</span>
                        ) : null}
                    </div>
                </div>
                <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0 text-white/45 hover:bg-white/10 hover:text-white" title="Settings" asChild>
                    <Link to={settingsLink} target="_blank" rel="noreferrer">
                        <Settings2 className="h-3.5 w-3.5" />
                    </Link>
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0 text-white/45 hover:bg-white/10 hover:text-white" title={minimized ? 'Expand' : 'Minimize'} onClick={() => onMinimizedChange?.(!minimized)}>
                    {minimized ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0 text-white/45 hover:bg-white/10 hover:text-white" title="Open setup" onClick={onExpandDialog}>
                    <ExternalLink className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0 text-white/45 hover:bg-white/10 hover:text-white" title="Close" onClick={onClose}>
                    <X className="h-3.5 w-3.5" />
                </Button>
            </div>

            {!minimized && (
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-3">
                    {/* Application state */}
                    <div className={`rounded-xl border px-3 py-2.5 ${
                        captcha || outcomeBadge?.kind === 'attention' || outcomeBadge?.kind === 'filled'
                            ? 'border-amber-400/20 bg-amber-500/[0.06]'
                            : outcomeBadge?.kind === 'failed'
                                ? 'border-rose-400/20 bg-rose-500/[0.06]'
                                : outcomeBadge?.kind === 'success'
                                    ? 'border-emerald-400/20 bg-emerald-500/[0.06]'
                                    : 'border-white/[0.06] bg-white/[0.03]'
                    }`}
                    >
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
                                Application state
                            </span>
                            <span className={`inline-flex shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${appStateToneClass}`}>
                                {appStateMark.label}
                            </span>
                        </div>
                        <p
                            className="text-[13px] font-semibold leading-snug text-white/95"
                            style={{ fontFamily: 'var(--font-display)' }}
                        >
                            {captcha
                                ? (tabClosed ? 'CAPTCHA — tab closed, reopen then Resume' : 'CAPTCHA — solve, then Resume')
                                : (tabClosed && !ownedTabMapped
                                    ? 'Tab closed — Open tab to continue checkout'
                                    : shortStatus)}
                        </p>
                        {jobHeadline ? (
                            <p className="mt-0.5 truncate text-[11px] text-white/55" title={jobHeadline}>{jobHeadline}</p>
                        ) : null}
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-white/45">
                            {queuePosLabel ? (
                                <span className="rounded bg-white/5 px-1.5 py-0.5 font-medium text-white/70">
                                    Job {queuePosLabel}
                                </span>
                            ) : null}
                            {phaseLabel ? (
                                <span className="rounded bg-white/5 px-1.5 py-0.5 capitalize">
                                    {phaseLabel}
                                </span>
                            ) : null}
                            {ownedTabMapped && !tabClosed ? (
                                <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300/90">
                                    Tab #{ownedTabId || '—'}
                                </span>
                            ) : tabClosed ? (
                                <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-200/90">
                                    Tab closed
                                </span>
                            ) : null}
                            {hostSnippet ? (
                                <span className="min-w-0 truncate font-mono text-white/40" title={ownedTabUrl || ''}>
                                    {hostSnippet}
                                </span>
                            ) : null}
                            {timeChip ? (
                                <span className="ml-auto font-mono tabular-nums text-cyan-300/75">{timeChip}</span>
                            ) : null}
                        </div>
                        {isApplied ? (
                            <div className="mt-2 rounded-lg border border-emerald-400/25 bg-emerald-500/[0.08] px-2.5 py-2">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-200/85">
                                    Outcome
                                </p>
                                <p className="text-[10px] leading-snug text-emerald-100/90">
                                    APPLIED — site thank-you confirmed. This bid is complete.
                                </p>
                            </div>
                        ) : showEvidence ? (
                            <div className="mt-2 space-y-1 rounded-lg border border-amber-400/20 bg-amber-500/[0.06] px-2.5 py-2">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-200/80">
                                    Checkout evidence
                                </p>
                                {tabClosed ? (
                                    <p className="text-[10px] leading-snug text-amber-100/90">
                                        Apply tab closed — Open may load an empty form. Prefer Re-fill on a Focus’d live tab when possible.
                                    </p>
                                ) : null}
                                {lastEventType ? (
                                    <p className="text-[10px] text-white/50">
                                        Last: <span className="font-mono text-white/70">{String(lastEventType).replace(/_/g, ' ')}</span>
                                    </p>
                                ) : null}
                                {errSnippet ? (
                                    <p className="text-[10px] leading-snug text-rose-200/85" title={errSnippet}>
                                        {errSnippet}
                                    </p>
                                ) : null}
                                {missingList.length ? (
                                    <p className="text-[10px] leading-snug text-amber-200/85">
                                        Missing: {missingList.join(' · ')}
                                    </p>
                                ) : null}
                                {!tabClosed && !errSnippet && !missingList.length ? (
                                    <p className="text-[10px] text-white/45">Review answers on the apply tab, then Submit or Reject.</p>
                                ) : null}
                            </div>
                        ) : missingList.length ? (
                            <p className="mt-1.5 text-[10px] leading-snug text-amber-200/85">
                                Missing: {missingList.join(' · ')}
                            </p>
                        ) : null}
                        {successConfirming ? (
                            <p className="mt-1 text-[10px] text-sky-300/80">Confirming submit…</p>
                        ) : null}
                        {(progressPct > 0 || progressLabel) ? (
                            <BidProgressBar
                                className="mt-2"
                                pct={progressPct}
                                label={progressLabel || ''}
                                tone={progressTone}
                                stepIndex={progressStepIndex}
                                compact
                            />
                        ) : null}
                    </div>

                    {/* Recent activity */}
                    {feedSlice.length ? (
                        <div className="rounded-xl border border-white/[0.06] bg-black/20 px-2.5 py-2">
                            <div className="mb-1 flex items-center justify-between gap-2">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Activity</p>
                                {typeof onClearNotifs === 'function' ? (
                                    <button type="button" className="text-[9px] text-white/40 hover:text-white/70" onClick={onClearNotifs}>
                                        Clear
                                    </button>
                                ) : null}
                            </div>
                            <ul className="max-h-[72px] space-y-0.5 overflow-y-auto">
                                {feedSlice.map((n, i) => {
                                    const kind = n.kind || 'info';
                                    const color = kind === 'error'
                                        ? 'text-rose-300/90'
                                        : kind === 'warn'
                                            ? 'text-amber-200/90'
                                            : kind === 'ok'
                                                ? 'text-emerald-300/90'
                                                : 'text-white/55';
                                    return (
                                        <li key={n.id || `${n.at}-${i}`} className={`truncate text-[10px] ${color}`}>
                                            {n.short || n.message || '—'}
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ) : null}

                    {/* Actions — always visible tools */}
                    {actionBar}

                    {/* Tabs */}
                    <div className="flex gap-1 rounded-lg bg-black/25 p-0.5">
                        <button
                            type="button"
                            className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-semibold transition ${
                                dockTab === 'live'
                                    ? 'bg-white/10 text-white'
                                    : 'text-white/45 hover:text-white/70'
                            }`}
                            onClick={() => setDockTab('live')}
                        >
                            Live
                        </button>
                        <button
                            type="button"
                            className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-semibold transition ${
                                dockTab === 'manual'
                                    ? 'bg-white/10 text-white'
                                    : 'text-white/45 hover:text-white/70'
                            }`}
                            onClick={() => setDockTab('manual')}
                        >
                            Answers{answerDrafts.length ? ` · ${answerDrafts.length}` : ''}
                        </button>
                        <button
                            type="button"
                            className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-semibold transition ${
                                dockTab === 'cv'
                                    ? 'bg-white/10 text-white'
                                    : 'text-white/45 hover:text-white/70'
                            }`}
                            onClick={() => setDockTab('cv')}
                        >
                            CV
                        </button>
                    </div>

                    {dockTab === 'live' ? (
                        <>
                            {/* Preview */}
                            <div className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-black/50">
                                {imgSrc ? (
                                    <button type="button" className="block w-full cursor-zoom-in" onClick={onFullscreen} title="Full screen">
                                        <img
                                            key={imgSrc}
                                            src={imgSrc}
                                            alt={shotStage || 'Apply page'}
                                            className={`max-h-[min(32vh,16rem)] min-h-[8rem] w-full object-contain object-top ${loading ? 'opacity-80' : ''}`}
                                        />
                                    </button>
                                ) : (
                                    <div className="flex h-28 flex-col items-center justify-center gap-1 px-3 text-center text-xs text-white/40">
                                        <span>{loading ? 'Loading…' : imgErr || progressLabel || statusLine || 'Waiting for live frames…'}</span>
                                        {!loading && !imgErr && (queueRunning || progressLabel) ? (
                                            <span className="text-[10px] text-white/30">Live frame updates while this job is open</span>
                                        ) : null}
                                    </div>
                                )}
                                <div className="absolute bottom-1.5 left-1.5 flex flex-wrap gap-1">
                                    {shotStage ? (
                                        <span className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white/90">{shotStage}</span>
                                    ) : null}
                                    {liveUpdatedLabel ? (
                                        <span className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-emerald-300">{liveUpdatedLabel}</span>
                                    ) : null}
                                </div>
                                {imgSrc ? (
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="secondary"
                                        className="absolute bottom-1.5 right-1.5 h-7 gap-1 rounded-lg px-2 text-[10px]"
                                        onClick={onFullscreen}
                                    >
                                        <Maximize2 className="h-3 w-3" />
                                    </Button>
                                ) : null}
                            </div>

                            {(hasFrames || !followLive) ? (
                                <div className="flex items-center gap-1.5">
                                    <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={!canPrev} onClick={onPrevFrame}>
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <span className="flex-1 text-center text-[10px] tabular-nums text-white/40">
                                        {hasFrames ? `${frameIndex + 1} / ${frameCount}` : '—'}
                                    </span>
                                    <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={!canNext} onClick={onNextFrame}>
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                    {!followLive && hasFrames ? (
                                        <Button type="button" size="sm" className="h-7 px-2 text-[10px]" onClick={onFollowLive}>Live</Button>
                                    ) : null}
                                </div>
                            ) : null}

                            {/* Ask Lumi — collapsed */}
                            {typeof onInstructLumi === 'function' ? (
                                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
                                    <button
                                        type="button"
                                        className="flex w-full items-center gap-2 px-3 py-2 text-left"
                                        onClick={() => setShowAsk((v) => !v)}
                                    >
                                        <span className="text-[11px] font-semibold text-white/70">Ask Lumi</span>
                                        {coachStatus ? (
                                            <span className="min-w-0 flex-1 truncate text-[10px] text-white/40">
                                                {shortenNotifyText(coachStatus) || coachStatus}
                                            </span>
                                        ) : (
                                            <span className="flex-1 text-[10px] text-white/35">Fix fields · pause · submit</span>
                                        )}
                                        {showAsk ? <ChevronUp className="h-3.5 w-3.5 text-white/35" /> : <ChevronDown className="h-3.5 w-3.5 text-white/35" />}
                                    </button>
                                    {showAsk ? (
                                        <div className="space-y-2 border-t border-white/[0.06] px-3 py-2">
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    className="h-8 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/25 px-2.5 text-[12px] text-white placeholder:text-white/35 outline-none focus:border-cyan-400/40"
                                                    placeholder="e.g. Disability = No"
                                                    value={instructText}
                                                    disabled={instructBusy || controlsBusy}
                                                    onChange={(e) => setInstructText(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' && instructText.trim() && !instructBusy) {
                                                            e.preventDefault();
                                                            applyInstruct();
                                                        }
                                                    }}
                                                />
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    className="h-8 shrink-0 px-3 text-[11px] font-semibold"
                                                    disabled={instructBusy || controlsBusy || !instructText.trim()}
                                                    onClick={applyInstruct}
                                                >
                                                    {instructBusy ? '…' : 'Go'}
                                                </Button>
                                            </div>
                                            <div className="flex flex-wrap gap-1">
                                                {['Pause', 'Disability = No', 'Sponsorship = No', 'Location from profile', 'Re-autofill', 'Submit now'].map((ex) => (
                                                    <button
                                                        key={ex}
                                                        type="button"
                                                        className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9px] text-white/50 hover:bg-white/10 hover:text-white/80"
                                                        disabled={instructBusy || controlsBusy}
                                                        onClick={() => setInstructText(ex)}
                                                    >
                                                        {ex}
                                                    </button>
                                                ))}
                                            </div>
                                            {instructMsg ? (
                                                <p className={`text-[10px] ${/offline|fail|error|reload/i.test(instructMsg) ? 'text-amber-300' : 'text-white/45'}`}>
                                                    {instructMsg}
                                                </p>
                                            ) : null}
                                        </div>
                                    ) : null}
                                </div>
                            ) : null}
                        </>
                    ) : dockTab === 'cv' ? (
                        <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-white">
                            <div className="flex items-center justify-between gap-2 border-b border-black/10 px-2 py-1">
                                <span className="truncate text-[10px] font-medium text-black/55">
                                    {cvFilename || 'CV preview'}
                                </span>
                                <button
                                    type="button"
                                    className="text-[10px] text-sky-700 hover:underline"
                                    onClick={() => {
                                        cvLoadKeyRef.current = '';
                                        setCvPreviewHtml('');
                                    }}
                                >
                                    Refresh
                                </button>
                            </div>
                            <div className="max-h-[min(46vh,24rem)] overflow-auto">
                                {cvPreviewBusy ? (
                                    <p className="px-3 py-8 text-center text-[11px] text-black/45">Loading CV…</p>
                                ) : cvPreviewErr ? (
                                    <p className="px-3 py-8 text-center text-[11px] text-black/55">{cvPreviewErr}</p>
                                ) : cvPreviewHtml ? (
                                    <div
                                        className="resume-preview"
                                        style={{ fontSize: '11px', lineHeight: 1.35, padding: '0.75rem', color: '#111', background: '#fff' }}
                                        dangerouslySetInnerHTML={{ __html: cvPreviewHtml }}
                                    />
                                ) : (
                                    <p className="px-3 py-8 text-center text-[11px] text-black/45">No CV yet.</p>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <div className="flex flex-wrap gap-1.5">
                                {onListFormQuestions ? (
                                    <Button type="button" size="sm" variant="outline" className={btn} disabled={controlsBusy || answersBusy} onClick={loadQuestionsFromForm}>
                                        From form
                                    </Button>
                                ) : null}
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className={btn}
                                    disabled={controlsBusy || answersBusy}
                                    onClick={() => {
                                        setAnswerDrafts((prev) => [
                                            ...prev,
                                            { key: `new-${Date.now()}`, id: '', label: '', answer: '' }
                                        ]);
                                    }}
                                >
                                    <Plus className="h-3 w-3" />
                                    Add
                                </Button>
                                {onApplyAnswers ? (
                                    <Button type="button" size="sm" className={btn} disabled={controlsBusy || answersBusy || !answerDrafts.length} onClick={applyManualAnswers}>
                                        Fill form
                                    </Button>
                                ) : null}
                            </div>
                            <div className="max-h-[min(42vh,18rem)] space-y-2 overflow-y-auto">
                                {answerDrafts.length === 0 ? (
                                    <p className="rounded-xl border border-dashed border-white/15 px-2 py-6 text-center text-[11px] text-white/40">
                                        From form, or Add a row.
                                    </p>
                                ) : (
                                    answerDrafts.map((row, idx) => (
                                        <div key={row.key || idx} className="space-y-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] p-2">
                                            <div className="flex items-start gap-1.5">
                                                <input
                                                    type="text"
                                                    className="h-8 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/25 px-2 text-[11px] font-medium text-white outline-none focus:border-cyan-400/40"
                                                    placeholder={row.required ? 'Question *' : 'Question'}
                                                    value={row.label}
                                                    onChange={(e) => {
                                                        const v = e.target.value;
                                                        setAnswerDrafts((prev) => prev.map((r, i) => (
                                                            i === idx ? { ...r, label: v, id: r.id || v } : r
                                                        )));
                                                    }}
                                                />
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-8 w-8 shrink-0 p-0 text-white/40 hover:text-rose-300"
                                                    disabled={controlsBusy || answersBusy}
                                                    onClick={() => setAnswerDrafts((prev) => prev.filter((_, i) => i !== idx))}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                            <textarea
                                                className="min-h-[2.5rem] w-full resize-y rounded-lg border border-white/10 bg-black/25 px-2 py-1.5 text-[11px] text-white outline-none focus:border-cyan-400/40"
                                                placeholder="Answer"
                                                rows={2}
                                                value={row.answer}
                                                onChange={(e) => {
                                                    const v = e.target.value;
                                                    setAnswerDrafts((prev) => prev.map((r, i) => (
                                                        i === idx ? { ...r, answer: v } : r
                                                    )));
                                                }}
                                            />
                                        </div>
                                    ))
                                )}
                            </div>
                            {answersMsg ? <p className="text-[10px] text-white/45">{answersMsg}</p> : null}
                        </div>
                    )}
                </div>
            )}

            {minimized && (
                <div className="space-y-1.5 border-t border-white/[0.06] px-3 py-2">
                    <div className="flex items-center gap-2">
                        <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase ${appStateToneClass}`}>
                            {appStateMark.label}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[11px] text-white/55">
                            {shortStatus || jobHeadline || title || 'Bidding…'}
                        </span>
                        {queuePosLabel ? (
                            <span className="shrink-0 font-mono text-[10px] text-white/40">{queuePosLabel}</span>
                        ) : null}
                        {timeChip ? (
                            <span className="shrink-0 font-mono text-[10px] text-white/40">{timeChip}</span>
                        ) : null}
                    </div>
                    {progressPct > 0 ? (
                        <BidProgressBar pct={progressPct} label="" tone={progressTone} stepIndex={-1} compact className="!space-y-0" />
                    ) : null}
                    <div className="flex flex-wrap gap-1">{compactActions}</div>
                </div>
            )}
        </div>
    );

    return createPortal(body, document.body);
}
