/**
 * Lumi runtime settings (AFK, CAPTCHA helpers, auto-submit, fill timing).
 * CAPTCHA uses free Chrome helpers (NopeCHA + Buster) — no CapSolver/2Captcha API keys.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from '@/next/router';
import { Loader2, Save, Zap } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    loadLumiBidderPrefs,
    persistLumiBidderPrefs,
    saveLumiBidderPrefs,
    clampHumanAssistWaitSec,
    clampFormWaitSec,
    clampOpenGapMs,
    clampScreenshotSettleSec,
    clampMaxTabs,
    HANDS_FREE_LUMI_PREFS,
    FREE_HELPERS_LUMI_PREFS
} from '@/lib/lumiBidderPrefs';
import { useAuth } from '@/context/AuthContext';

function settingsPathForRole(role) {
    const r = String(role || 'user').toLowerCase();
    if (r === 'admin') return '/admin/bidder-settings';
    if (r === 'manager') return '/manager/bidder-settings';
    if (r === 'caller') return '/caller/settings';
    if (r === 'developer') return '/developer/settings';
    return '/user/bidder-settings';
}

function autofillPathForRole(role) {
    const r = String(role || 'user').toLowerCase();
    if (r === 'admin') return '/admin/autofill-settings';
    if (r === 'manager') return '/manager/autofill-settings';
    return '/user/autofill-settings';
}

/** Always free-helper CAPTCHA — strip paid API keys from prefs. */
function withoutPaidCaptchaKeys(prefs) {
    return {
        ...prefs,
        captchaHelper: true,
        capsolverApiKey: '',
        twocaptchaApiKey: '',
        clearCaptchaApiKeys: true
    };
}

export default function LumiBidderSettings({
    compact = false,
    onChange = null,
    showTitle = true,
    showProfileAutofillHint = true,
    showRuntime = true,
    showTiming = true,
    className = ''
}) {
    const { user } = useAuth();
    const [prefs, setPrefs] = useState(() => withoutPaidCaptchaKeys(loadLumiBidderPrefs()));
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState('');
    const [err, setErr] = useState('');

    useEffect(() => {
        const next = withoutPaidCaptchaKeys(persistLumiBidderPrefs(withoutPaidCaptchaKeys(loadLumiBidderPrefs())));
        setPrefs(next);
        onChange?.(next);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const patch = useCallback((partial) => {
        setPrefs((prev) => {
            let next = withoutPaidCaptchaKeys({ ...prev, ...partial });
            if (partial.unattended === true) next = { ...next, captchaFocus: false };
            if (partial.captchaFocus === true) next = { ...next, unattended: false };
            next = persistLumiBidderPrefs(next);
            onChange?.(next);
            // Push submit/review toggles to the extension immediately — do not wait for Save & sync.
            if (
                partial.autoSubmit != null
                || partial.reviewOnlyMode != null
            ) {
                saveLumiBidderPrefs(next).then((r) => {
                    if (r.synced) setMsg('Auto-submit synced to Lumi');
                    else if (r.error) setErr(r.error);
                }).catch(() => {});
            }
            return next;
        });
        setMsg('');
        setErr('');
    }, [onChange]);

    const handleSave = async () => {
        setSaving(true);
        setMsg('');
        setErr('');
        try {
            const toSave = withoutPaidCaptchaKeys(prefs);
            const { synced, error, prefs: savedPrefs } = await saveLumiBidderPrefs(toSave);
            setPrefs(savedPrefs || toSave);
            if (synced) setMsg('Saved and synced to Lumi');
            else setMsg(`Saved in app${error ? ` — ${error}` : ' (reload Lumi / Check Lumi to sync)'}`);
            onChange?.(savedPrefs || toSave);
        } catch (e) {
            setErr(e.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const row = (id, checked, onToggle, label) => (
        <label key={id} className="flex cursor-pointer items-start gap-2">
            <Checkbox
                id={id}
                checked={!!checked}
                onCheckedChange={(v) => onToggle(!!v)}
                className="mt-0.5"
            />
            <span className={compact ? 'text-xs' : 'text-sm'}>{label}</span>
        </label>
    );

    const numField = (id, label, value, onChangeVal, hint, { min, max, step } = {}) => (
        <div key={id} className={`space-y-1 ${compact ? 'pt-1' : 'pt-1.5'}`}>
            <Label
                htmlFor={id}
                className={compact ? 'text-[11px] text-muted-foreground' : 'text-xs text-muted-foreground'}
            >
                {label}
            </Label>
            <div className="flex flex-wrap items-center gap-2">
                <Input
                    id={id}
                    type="number"
                    min={min}
                    max={max}
                    step={step ?? 1}
                    value={value}
                    onChange={(e) => onChangeVal(e.target.value)}
                    className={compact ? 'h-7 w-24 text-[11px]' : 'h-8 w-28 text-sm'}
                />
                {hint ? (
                    <span className={compact ? 'text-[10px] text-muted-foreground' : 'text-xs text-muted-foreground'}>
                        {hint}
                    </span>
                ) : null}
            </div>
        </div>
    );

    const settingsHref = settingsPathForRole(user?.role);
    const autofillHref = `${autofillPathForRole(user?.role)}#bidder-autofill-settings`;

    return (
        <div
            id={compact || !showRuntime ? undefined : 'lumi-bidder-settings'}
            className={`space-y-3 ${className}`}
        >
            {!compact && showTitle ? (
                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-base font-semibold">
                        <Zap className="h-4 w-4 text-primary" />
                        Auto Bidder
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Hands-free apply: AFK + auto-next, Chrome open with Lumi + NopeCHA + Buster.
                    </p>
                </div>
            ) : null}
            {!compact && showProfileAutofillHint ? (
                <p className="text-xs text-muted-foreground">
                    Fixed answers (sponsorship, EEO, start date) are on{' '}
                    <Link className="underline" to={autofillHref}>Autofill Settings</Link>
                    .
                </p>
            ) : null}
            {compact ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Runtime options
                    </span>
                    <Link
                        to={settingsHref}
                        className="text-[10px] text-primary underline-offset-2 hover:underline"
                    >
                        Full settings
                    </Link>
                </div>
            ) : null}

            {showRuntime ? (
            <div className="space-y-2">
                <div className={`flex flex-wrap gap-2 ${compact ? '' : ''}`}>
                    <Button
                        type="button"
                        size={compact ? 'sm' : 'default'}
                        variant="secondary"
                        disabled={saving}
                        className={compact ? 'h-7 flex-1 text-[11px]' : ''}
                        onClick={() => {
                            const next = persistLumiBidderPrefs(withoutPaidCaptchaKeys({
                                ...prefs,
                                ...FREE_HELPERS_LUMI_PREFS
                            }));
                            setPrefs(next);
                            onChange?.(next);
                            setMsg('Free CAPTCHA helpers on — Save & sync');
                            setErr('');
                        }}
                    >
                        Free helpers (NopeCHA + Buster)
                    </Button>
                    <Button
                        type="button"
                        size={compact ? 'sm' : 'default'}
                        variant="outline"
                        disabled={saving}
                        className={compact ? 'h-7 flex-1 text-[11px]' : ''}
                        onClick={() => {
                            const next = persistLumiBidderPrefs(withoutPaidCaptchaKeys({
                                ...prefs,
                                ...HANDS_FREE_LUMI_PREFS
                            }));
                            setPrefs(next);
                            onChange?.(next);
                            setMsg('Hands-free preset — Save & sync');
                            setErr('');
                        }}
                    >
                        Hands-free
                    </Button>
                </div>
                {row('lumi-stay', prefs.stayInApp, (v) => patch({ stayInApp: v }), 'Stay in Lumi (background tabs + Live monitor)')}
                {row('lumi-afk', prefs.unattended, (v) => patch({ unattended: v }), 'Unattended / AFK (bid without you)')}
                {row(
                    'lumi-helper',
                    prefs.captchaHelper,
                    (v) => patch({ captchaHelper: v }),
                    'Wait for free helpers (NopeCHA / Buster) — required'
                )}
                <p className={compact ? 'text-[10px] text-muted-foreground' : 'text-xs text-muted-foreground'}>
                    Install NopeCHA + Buster in this Chrome profile (same as Lumi).
                </p>
                {row(
                    'lumi-packet',
                    prefs.requirePacketBeforeProcess !== false,
                    (v) => patch({ requirePacketBeforeProcess: v }),
                    'Prepare application packet before Process (review policy answers first)'
                )}
                {row(
                    'lumi-review-only',
                    !!prefs.reviewOnlyMode,
                    (v) => patch({ reviewOnlyMode: v, autoSubmit: v ? false : prefs.autoSubmit }),
                    'Review-only: fill forms but never auto-submit'
                )}
                {row('lumi-autosubmit', prefs.autoSubmit && !prefs.reviewOnlyMode, (v) => patch({ autoSubmit: v, reviewOnlyMode: v ? false : prefs.reviewOnlyMode }), 'Auto-submit when form is complete')}
                {row('lumi-autonext', prefs.autoNext, (v) => patch({ autoNext: v }), 'Auto-next job (required for hands-free)')}
                {!prefs.unattended
                    ? row(
                        'lumi-focus',
                        prefs.captchaFocus,
                        (v) => patch({ captchaFocus: v }),
                        'Attended: pause on CAPTCHA until I solve it'
                    )
                    : null}
                {row('lumi-cover', prefs.uploadCoverLetter, (v) => patch({ uploadCoverLetter: v }), 'Upload cover letter')}
                {row('lumi-sound', prefs.soundEnabled, (v) => patch({ soundEnabled: v }), 'Alert sound')}
                {numField(
                    'lumi-human-wait',
                    'Human help wait (seconds)',
                    clampHumanAssistWaitSec(prefs.humanAssistWaitSec),
                    (v) => patch({ humanAssistWaitSec: clampHumanAssistWaitSec(v) }),
                    'Notify → wait → if no Resume, skip (0 = skip immediately)',
                    { min: 0, max: 600, step: 15 }
                )}
            </div>
            ) : null}

            {showTiming ? (
            <div className={`space-y-2 ${showRuntime ? 'border-t border-white/10 pt-3' : ''}`}>
                {!showRuntime && !compact ? null : showRuntime ? (
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Fill timing
                    </div>
                ) : (
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Fill timing
                    </div>
                )}
                {numField(
                    'lumi-form-wait',
                    'Form wait (seconds)',
                    clampFormWaitSec(prefs.formWaitSec),
                    (v) => patch({ formWaitSec: clampFormWaitSec(v) }),
                    compact ? 'before skip' : 'Max wait for apply fields before skip',
                    { min: 3, max: 30, step: 1 }
                )}
                {numField(
                    'lumi-open-gap',
                    'Open gap (ms)',
                    clampOpenGapMs(prefs.openGapMs),
                    (v) => patch({ openGapMs: clampOpenGapMs(v) }),
                    compact ? 'between jobs' : 'Pause between opening jobs (0 = immediate)',
                    { min: 0, max: 10000, step: 100 }
                )}
                {!compact ? (
                    <>
                        {numField(
                            'lumi-shot-settle',
                            'Screenshot settle (seconds)',
                            clampScreenshotSettleSec(prefs.screenshotSettleSec),
                            (v) => patch({ screenshotSettleSec: clampScreenshotSettleSec(v) }),
                            'Wait after fill before capture',
                            { min: 0, max: 8, step: 1 }
                        )}
                        {numField(
                            'lumi-max-tabs',
                            'Max open tabs',
                            clampMaxTabs(prefs.maxTabs),
                            (v) => patch({ maxTabs: clampMaxTabs(v) }),
                            'Parallel apply tabs (1–5)',
                            { min: 1, max: 5, step: 1 }
                        )}
                    </>
                ) : (
                    numField(
                        'lumi-max-tabs',
                        'Max tabs',
                        clampMaxTabs(prefs.maxTabs),
                        (v) => patch({ maxTabs: clampMaxTabs(v) }),
                        '1–5',
                        { min: 1, max: 5, step: 1 }
                    )
                )}
            </div>
            ) : null}

            {showRuntime ? (
            <div className={`space-y-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/5 ${compact ? 'px-2.5 py-2' : 'px-3 py-2.5'}`}>
                <div className={`font-semibold text-emerald-200/90 ${compact ? 'text-[11px]' : 'text-xs'}`}>
                    CAPTCHA — free helpers only
                </div>
                <p className="text-[10px] text-muted-foreground">
                    Install{' '}
                    <a
                        className="underline"
                        href="https://chromewebstore.google.com/detail/nopecha-captcha-solver/dknlfmjaanfblgfdfebhijalfmhmjjjo"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        NopeCHA
                    </a>
                    {' + '}
                    <a
                        className="underline"
                        href="https://chromewebstore.google.com/detail/buster-captcha-solver-for/mpbjkejclgfgadiemmefgebjfooflfhl"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        Buster
                    </a>
                    {' '}in the same Chrome profile as Lumi.
                </p>
            </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
                <Button
                    type="button"
                    size={compact ? 'sm' : 'default'}
                    variant={compact ? 'outline' : 'default'}
                    disabled={saving}
                    onClick={handleSave}
                    className={compact ? 'h-7 gap-1 px-2 text-[11px]' : ''}
                >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    {compact ? 'Save' : 'Save & sync to Lumi'}
                </Button>
                {msg ? <span className="text-[10px] text-emerald-300/90">{msg}</span> : null}
                {err ? <span className="text-[10px] text-destructive">{err}</span> : null}
            </div>
        </div>
    );
}
