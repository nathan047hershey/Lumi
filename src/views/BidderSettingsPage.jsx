/**
 * Dedicated Auto Bidder settings page — runtime prefs, timing, extension sync.
 */
import { useEffect } from 'react';
import { Link } from '@/next/router';
import { Bot, PenLine, Zap } from 'lucide-react';
import AppPage from '@/components/AppPage';
import PageCommandBar from '@/components/PageCommandBar';
import LumiBidderSettings from '@/components/LumiBidderSettings';
import LumiExtensionHub from '@/components/LumiExtensionHub';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

function autofillPathForRole(role) {
    const r = String(role || 'user').toLowerCase();
    if (r === 'admin') return '/admin/autofill-settings';
    if (r === 'manager') return '/manager/autofill-settings';
    return '/user/autofill-settings';
}

function jobLinksPathForRole(role) {
    const r = String(role || 'user').toLowerCase();
    if (r === 'admin') return '/admin/pipeline';
    if (r === 'manager') return '/manager/dashboard';
    return '/user/pipeline';
}

export default function BidderSettingsPage() {
    const { user } = useAuth();
    const role = String(user?.role || 'user').toLowerCase();
    const autofillHref = autofillPathForRole(role);
    const jobLinksHref = jobLinksPathForRole(role);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        const hash = window.location.hash;
        if (hash !== '#lumi-bidder-settings' && hash !== '#bidder-timing') return undefined;
        const t = window.setTimeout(() => {
            document.getElementById(hash.slice(1))?.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }, 120);
        return () => window.clearTimeout(t);
    }, []);

    return (
        <AppPage
            title="Auto Bidder"
            description="Hands-free apply: AFK, CAPTCHA helpers, fill timing — synced to the Chrome extension."
        >
            <PageCommandBar
                title="Auto Bidder settings"
                description="Control queue behavior, waits, and how Lumi fills apply forms."
                actions={(
                    <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" className="h-10 gap-1.5" asChild>
                            <Link to={autofillHref}>
                                <PenLine className="h-4 w-4" />
                                Profile autofill answers
                            </Link>
                        </Button>
                        <Button type="button" variant="secondary" className="h-10 gap-1.5" asChild>
                            <Link to={jobLinksHref}>
                                <Bot className="h-4 w-4" />
                                Open Job Links
                            </Link>
                        </Button>
                    </div>
                )}
            />

            <LumiExtensionHub profiles={[]} />

            <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
                <section
                    id="lumi-bidder-settings"
                    className={cn(
                        'scroll-mt-6 overflow-hidden rounded-2xl border border-white/[0.07] bg-[hsl(222_24%_9%/0.75)] p-4 sm:p-5',
                        'shadow-[0_16px_48px_-28px_rgba(0,0,0,0.65)]'
                    )}
                >
                    <div className="mb-4 flex items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                            <Zap className="h-4 w-4" />
                        </span>
                        <div>
                            <h2 className="text-base font-semibold tracking-tight">Runtime</h2>
                            <p className="mt-0.5 text-sm text-white/40">
                                AFK, auto-submit, CAPTCHA helpers — Save & sync to Lumi
                            </p>
                        </div>
                    </div>
                    <LumiBidderSettings
                        showTitle={false}
                        showProfileAutofillHint={false}
                        showTiming={false}
                    />
                </section>

                <section
                    id="bidder-timing"
                    className={cn(
                        'scroll-mt-6 overflow-hidden rounded-2xl border border-white/[0.07] bg-[hsl(222_24%_9%/0.75)] p-4 sm:p-5',
                        'shadow-[0_16px_48px_-28px_rgba(0,0,0,0.65)]'
                    )}
                >
                    <div className="mb-4 flex items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300">
                            <Bot className="h-4 w-4" />
                        </span>
                        <div>
                            <h2 className="text-base font-semibold tracking-tight">Fill timing</h2>
                            <p className="mt-0.5 text-sm text-white/40">
                                How long to wait for forms and between jobs. Lower = faster; too low can miss fields.
                            </p>
                        </div>
                    </div>
                    <LumiBidderSettings
                        showTitle={false}
                        showProfileAutofillHint={false}
                        showRuntime={false}
                        showTiming
                    />
                </section>
            </div>

            <p className="text-xs text-muted-foreground">
                Fixed answers (visa, EEO, start date) live on{' '}
                <Link className="underline" to={autofillHref}>
                    Autofill Settings
                </Link>
                . This page controls the Auto Bidder queue only.
            </p>
        </AppPage>
    );
}
