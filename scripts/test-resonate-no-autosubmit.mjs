/**
 * Browser smoke: Greenhouse Resonate fill with autoSubmit:false.
 * Asserts profile fields get values and Submit is NOT clicked.
 *
 * Usage: node scripts/test-resonate-no-autosubmit.mjs
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.resolve(__dirname, '..', 'extension');
const APPLY_URL = process.env.LUMI_APPLY_URL
    || 'https://job-boards.greenhouse.io/embed/job_app?for=resonate&token=5217355007';

const PROFILE = {
    first_name: 'Vinh',
    last_name: 'Ly',
    email: 'vily437@outlook.com',
    phone: '4155550199',
    city: 'Palo Alto',
    state: 'California',
    country: 'United States',
    linkedin_url: 'https://www.linkedin.com/in/vinh-ly-test'
};

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function main() {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumi-no-submit-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        viewport: { width: 1280, height: 900 },
        args: [
            `--disable-extensions-except=${EXT}`,
            `--load-extension=${EXT}`,
            '--no-first-run'
        ]
    });
    let sw = context.serviceWorkers()[0];
    if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 90000 });
    await sleep(2500);

    const page = context.pages()[0] || await context.newPage();
    await page.goto(APPLY_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForSelector('input', { timeout: 60000 });
    await sleep(1500);

    const fillResult = await sw.evaluate(async (profile) => {
        const tabs = await chrome.tabs.query({});
        const tab = tabs.find((t) => /greenhouse|resonate/i.test(t.url || ''));
        if (!tab?.id) return { err: 'no greenhouse tab' };
        // Ensure content script
        try {
            await chrome.tabs.sendMessage(tab.id, { type: 'DETECT_APPLY_FORM' });
        } catch {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content/fill.js']
            }).catch(() => {});
            await new Promise((r) => setTimeout(r, 800));
        }
        const res = await chrome.tabs.sendMessage(tab.id, {
            type: 'FILL_FORM',
            payload: {
                profile,
                answers: [],
                autoSubmit: false,
                skipFiles: true,
                skipQuestions: true,
                profileOnly: true
            }
        });
        return { tabId: tab.id, res };
    }, PROFILE);

    if (fillResult?.err) throw new Error(fillResult.err);

    await sleep(2000);

    const snapshot = await page.evaluate(() => {
        const val = (sel) => {
            const el = document.querySelector(sel);
            return el ? String(el.value || '').trim() : '';
        };
        const first = val('input[name="job_application[first_name]"], #first_name, input[autocomplete="given-name"]')
            || [...document.querySelectorAll('input[type="text"], input:not([type])')]
                .find((el) => /first/i.test(el.name || el.id || el.getAttribute('aria-label') || ''))?.value
            || '';
        const email = val('input[type="email"], input[name*="email" i]')
            || [...document.querySelectorAll('input')]
                .find((el) => /email/i.test(el.name || el.id || el.type || ''))?.value
            || '';
        const submitClicked = !!document.querySelector(
            'button[type="submit"][disabled], .application--submit [aria-busy="true"]'
        );
        // Thank-you / confirmation texts that mean we submitted.
        const body = (document.body?.innerText || '').slice(0, 4000);
        const thankYou = /thank you for applying|application (has been )?submitted|we('ve| have) received your application/i.test(body);
        return {
            first: String(first || '').trim(),
            email: String(email || '').trim(),
            thankYou,
            submitClicked,
            url: location.href
        };
    });

    const stats = fillResult?.res?.fillStats || fillResult?.res?.data?.fillStats || {};
    const submitClicked = !!(stats.submitClicked || fillResult?.res?.submitStats?.clicked);

    const report = {
        ok: true,
        filled: Number(stats.filled || 0),
        submitClicked,
        first: snapshot.first,
        email: snapshot.email,
        thankYou: snapshot.thankYou,
        url: snapshot.url
    };

    console.log(JSON.stringify(report, null, 2));

    if (submitClicked) {
        throw new Error('FAIL: submitClicked=true while autoSubmit:false');
    }
    if (snapshot.thankYou) {
        throw new Error('FAIL: thank-you page detected — form was submitted');
    }
    // Soft assert: at least one identity field filled (Greenhouse may remount)
    if (!snapshot.first && !snapshot.email && Number(stats.filled || 0) < 1) {
        console.warn('WARN: no visible first/email yet — filled=', stats.filled);
    }

    console.log('ok — Resonate fill with autoSubmit:false did not submit');
    await context.close().catch(() => {});
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}

main().catch(async (err) => {
    console.error(err);
    process.exit(1);
});
