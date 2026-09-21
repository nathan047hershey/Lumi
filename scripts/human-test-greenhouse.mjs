/**
 * Human-style autofill test on a real Greenhouse apply page.
 * Loads the Chrome extension, opens Figma GH, runs FILL_FORM, reports DOM values.
 *
 * Run: node scripts/human-test-greenhouse.mjs
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.resolve(__dirname, '..', 'extension');
const APPLY_URL = process.env.LUMI_APPLY_URL
    || 'https://job-boards.greenhouse.io/figma/jobs/5426468004';

const PROFILE = {
    first_name: 'Ada',
    last_name: 'Lovelace',
    email: 'ada.lovelace.lumi.test@example.com',
    phone: '4155550199',
    phone_country: 'US',
    city: 'San Francisco',
    state: 'CA',
    country: 'United States',
    linkedin_url: 'https://www.linkedin.com/in/ada-lovelace-lumi-test',
    linkedin: 'https://www.linkedin.com/in/ada-lovelace-lumi-test',
    github_url: 'https://github.com/ada-lumi-test',
    github: 'https://github.com/ada-lumi-test',
    work_authorization: 'Yes',
    requires_sponsorship: 'No',
    salary_range: '$165,000',
    gender: 'Male',
    veteran_status: 'I am not a protected veteran'
};

const ANSWERS = [
    {
        id: 'why_figma',
        label: 'Why do you want to join Figma?',
        answer: 'I want to join Figma to help teams ship clearer product design systems at scale.'
    },
    {
        id: 'work_from',
        label: 'From where do you intend to work?',
        answer: 'San Francisco, CA'
    },
    {
        id: 'auth',
        label: 'Are you authorized to work in the country for which you applied?',
        answer: 'Yes'
    },
    {
        id: 'prior',
        label: 'Have you ever worked for Figma before, as an employee or a contractor/consultant?',
        answer: 'No'
    }
];

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function main() {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumi-gh-test-'));
    // Use Playwright Chromium (not channel:chrome) — Chrome often blocks --load-extension.
    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        viewport: { width: 1280, height: 900 },
        args: [
            `--disable-extensions-except=${EXT}`,
            `--load-extension=${EXT}`,
            '--no-first-run',
            '--no-default-browser-check'
        ]
    });

    let sw = context.serviceWorkers()[0];
    if (!sw) {
        sw = await context.waitForEvent('serviceworker', { timeout: 60000 });
    }
    // Let MV3 SW settle
    await sleep(2000);

    const page = context.pages()[0] || await context.newPage();
    await page.goto(APPLY_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForSelector('input, [role="combobox"], textarea', { timeout: 60000 });

    // Scroll apply form into view (job JD sits above)
    await page.evaluate(() => {
        const h = document.querySelector('h2, #application, form');
        h?.scrollIntoView({ block: 'start' });
    });
    await sleep(800);

    // Ensure content scripts are present
    const hasFill = await page.evaluate(() => {
        try {
            return typeof chrome !== 'undefined' && !!chrome.runtime?.id;
        } catch {
            return false;
        }
    }).catch(() => false);

    // Content scripts run in isolated world — chrome may not be on page world.
    // Drive fill via extension service worker → tabs.sendMessage(FILL_FORM).
    const fillResult = await sw.evaluate(async ({ profile, answers, applyUrl }) => {
        const tabs = await chrome.tabs.query({});
        const tab = tabs.find((t) => (t.url || '').includes('greenhouse') || (t.url || '').includes(applyUrl.split('/jobs/')[0]))
            || tabs.find((t) => /figma|greenhouse/i.test(t.url || ''))
            || tabs[tabs.length - 1];
        if (!tab?.id) return { ok: false, error: 'no_tab', tabs: tabs.map((t) => t.url) };

        // Wait briefly for content scripts
        let lastErr = null;
        for (let i = 0; i < 8; i++) {
            try {
                const res = await chrome.tabs.sendMessage(tab.id, {
                    type: 'FILL_FORM',
                    payload: {
                        profile,
                        answers,
                        skipFiles: true,
                        profileOnly: false,
                        skipQuestions: false,
                        autoSubmit: false,
                        companyName: 'Figma',
                        jobRole: 'Account Executive, Enterprise',
                        jobDescription: 'Enterprise Account Executive at Figma. Annual Base Salary Range: $165,000 - $190,000 USD.'
                    }
                });
                return { ok: true, tabUrl: tab.url, res };
            } catch (err) {
                lastErr = String(err?.message || err);
                await new Promise((r) => setTimeout(r, 700));
            }
        }
        return { ok: false, error: lastErr || 'sendMessage_failed', tabUrl: tab.url };
    }, { profile: PROFILE, answers: ANSWERS, applyUrl: APPLY_URL });

    // Allow sequential combos to settle
    await sleep(25000);

    const snapshot = await page.evaluate(() => {
        const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 160);
        const labelFor = (el) => {
            const id = el.getAttribute('id');
            if (id) {
                const lab = document.querySelector(`label[for="${CSS.escape(id)}"]`);
                if (lab) return clean(lab.textContent);
            }
            const aria = el.getAttribute('aria-label');
            if (aria) return clean(aria);
            const wrap = el.closest('.field, .form-field, [class*="field"], label') || el.parentElement;
            return clean(wrap?.innerText || '').split('\n')[0];
        };

        const rows = [];
        const seen = new Set();
        const push = (label, value, kind) => {
            const key = `${label}|${value}|${kind}`;
            if (seen.has(key)) return;
            seen.add(key);
            rows.push({ label, value: clean(value), kind, empty: !clean(value) });
        };

        document.querySelectorAll('input:not([type="hidden"]):not([type="file"]):not([type="submit"]):not([type="button"]), textarea').forEach((el) => {
            if (el.disabled || el.getAttribute('aria-hidden') === 'true') return;
            push(labelFor(el) || el.name || el.id || el.type, el.value, el.tagName.toLowerCase());
        });

        document.querySelectorAll('select').forEach((el) => {
            const opt = el.options?.[el.selectedIndex];
            push(labelFor(el) || el.name || el.id, opt?.text || el.value, 'select');
        });

        document.querySelectorAll('[role="combobox"]').forEach((el) => {
            const text = el.getAttribute('aria-label')
                || el.textContent
                || el.querySelector('.select__single-value, [class*="singleValue"]')?.textContent
                || el.value
                || '';
            push(labelFor(el) || 'combobox', text, 'combobox');
        });

        // react-select control text
        document.querySelectorAll('.select__control, [class*="select__control"]').forEach((el) => {
            const val = el.querySelector('.select__single-value, [class*="singleValue"]')?.textContent
                || el.querySelector('.select__placeholder, [class*="placeholder"]')?.textContent
                || '';
            const lab = clean(el.closest('.field, .form-group, label, div')?.innerText || '').split('\n')[0];
            push(lab || 'react-select', val, 'react-select');
        });

        return {
            url: location.href,
            title: document.title,
            panel: !!document.getElementById('lumi-autofill-panel-root'),
            toast: clean(document.querySelector('[data-lumi-toast], .lumi-toast')?.textContent),
            rows
        };
    });

    const report = {
        applyUrl: APPLY_URL,
        fillResult,
        snapshot,
        expect: {
            first_name: PROFILE.first_name,
            last_name: PROFILE.last_name,
            email: PROFILE.email,
            phone: PROFILE.phone,
            linkedin: PROFILE.linkedin
        }
    };

    const out = path.join(__dirname, '..', 'tmp-gh-human-test.json');
    fs.writeFileSync(out, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    console.log('\nWrote', out);

    // Keep browser open briefly for visual check when headed
    await sleep(2000);
    await context.close();
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* ignore */ }

    const filled = (snapshot.rows || []).filter((r) => !r.empty);
    const empty = (snapshot.rows || []).filter((r) => r.empty);
    if (!fillResult?.ok) process.exit(2);
    if (filled.length < 3) process.exit(3);
    console.log(`\nFilled ${filled.length} / empty ${empty.length}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
