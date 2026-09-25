'use client';

export default function PrivacyPage() {
    return (
        <main className="mx-auto min-h-screen max-w-3xl px-6 py-16 text-foreground">
            <h1 className="font-[family-name:var(--font-display,Sora,sans-serif)] text-3xl font-semibold tracking-tight text-white">
                Lumi Auto Bidder — Privacy Policy
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">Last updated: September 20, 2026</p>

            <div className="mt-10 space-y-6 text-sm leading-relaxed text-foreground/80">
                <section className="space-y-2">
                    <h2 className="text-base font-semibold text-foreground">Overview</h2>
                    <p>
                        Lumi Auto Bidder (“the Extension”) helps users autofill job application forms and
                        coordinate with the Lumi web app. This policy describes what data the Extension
                        handles when you install it from the Chrome Web Store.
                    </p>
                </section>

                <section className="space-y-2">
                    <h2 className="text-base font-semibold text-foreground">Data the Extension accesses</h2>
                    <ul className="list-disc space-y-1 pl-5">
                        <li>Account credentials you enter to sign in to your Lumi workspace (sent to your Lumi API URL).</li>
                        <li>Job application page content needed to detect and fill form fields.</li>
                        <li>Settings you configure in the popup (API URL, frontend URL, profile selection, bidder preferences).</li>
                        <li>Optional Outlook / mailbox OTPs when you connect mail through Lumi.</li>
                    </ul>
                </section>

                <section className="space-y-2">
                    <h2 className="text-base font-semibold text-foreground">How data is used</h2>
                    <p>
                        Data is used only to provide autofill, auto-bid, and related Lumi desk features.
                        The Extension sends requests to the Lumi API base URL you configure (for example
                        your Vercel deployment). We do not sell personal data.
                    </p>
                </section>

                <section className="space-y-2">
                    <h2 className="text-base font-semibold text-foreground">Storage</h2>
                    <p>
                        Preferences and session tokens are stored in Chrome local extension storage on your
                        device. Server-side records (profiles, applications, mail sync) are stored in your
                        Lumi deployment according to that deployment’s configuration.
                    </p>
                </section>

                <section className="space-y-2">
                    <h2 className="text-base font-semibold text-foreground">Permissions</h2>
                    <ul className="list-disc space-y-1 pl-5">
                        <li><strong className="text-foreground">tabs / scripting / activeTab / host access</strong> — read and fill job application pages.</li>
                        <li><strong className="text-foreground">storage</strong> — save settings and session state.</li>
                        <li><strong className="text-foreground">notifications / alarms</strong> — status alerts and background sync checks.</li>
                        <li><strong className="text-foreground">optional debugger / management</strong> — requested only when advanced fill or captcha-helper detection needs them; you can deny these.</li>
                    </ul>
                </section>

                <section className="space-y-2">
                    <h2 className="text-base font-semibold text-foreground">Contact</h2>
                    <p>
                        Questions about this policy: contact your Lumi workspace administrator, or open an
                        issue on the Lumi project repository associated with your deployment.
                    </p>
                </section>
            </div>
        </main>
    );
}
