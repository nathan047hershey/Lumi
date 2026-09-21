/**
 * Diagnose fill on Resonate Greenhouse — collect fields + FILL_FORM + snapshot.
 * Run: node scripts/human-test-resonate.mjs
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.resolve(__dirname, '..', 'extension');
const APPLY_URL = process.env.LUMI_APPLY_URL
    || 'https://job-boards.greenhouse.io/resonate/jobs/5235883007';

const PROFILE = {
    first_name: 'Vinh',
    last_name: 'Ly',
    email: 'vily437@outlook.com',
    phone: '4155550199',
    city: 'Palo Alto',
    state: 'CA',
    country: 'United States',
    address: '454 Ferne Ave',
    postal_code: '94306',
    linkedin_url: 'https://www.linkedin.com/in/vinh-ly-test',
    github_url: 'https://github.com/vinh-test',
    school: 'Stanford University',
    degree: "Bachelor's Degree",
    discipline: 'Computer Science',
    work_authorization: 'Yes',
    requires_sponsorship: 'No',
    salary_range: '$144,000',
    years_of_experience: '5',
    gender: 'Male',
    how_heard: 'LinkedIn',
    earliest_start_date: '2 weeks'
};

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function main() {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumi-resonate-'));
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
    if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60000 });
    await sleep(2000);

    const page = context.pages()[0] || await context.newPage();
    await page.goto(APPLY_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForSelector('input', { timeout: 60000 });
    await page.evaluate(() => {
        document.querySelector('h2, #application, form')?.scrollIntoView({ block: 'start' });
    });
    await sleep(1000);

    const collected = await sw.evaluate(async () => {
        const tabs = await chrome.tabs.query({});
        const tab = tabs.find((t) => /greenhouse|resonate/i.test(t.url || ''));
        if (!tab?.id) return { err: 'no tab' };
        return chrome.tabs.sendMessage(tab.id, { type: 'COLLECT_FORM' });
    });

    const fields = (collected?.data?.fields || []).map((f) => ({
        label: f.label,
        kind: f.kind,
        type: f.type || f.inputType,
        combobox: !!f.combobox,
        required: !!f.required
    }));

    const fillResult = await sw.evaluate(async ({ profile }) => {
        const tabs = await chrome.tabs.query({});
        const tab = tabs.find((t) => /greenhouse|resonate/i.test(t.url || ''));
        if (!tab?.id) return { err: 'no tab' };
        return chrome.tabs.sendMessage(tab.id, {
            type: 'FILL_FORM',
            payload: {
                profile,
                answers: [],
                skipFiles: true,
                skipQuestions: true,
                profileOnly: true,
                autoSubmit: false,
                companyName: 'Resonate',
                jobRole: 'Account Manager'
            }
        });
    }, { profile: PROFILE });

    await sleep(28000);

    const snapshot = await page.evaluate(() => {
        const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 120);
        const rows = [];
        document.querySelectorAll('input:not([type=hidden]):not([type=file]), textarea').forEach((el) => {
            const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent
                || el.getAttribute('aria-label')
                || el.id
                || el.type;
            rows.push({ lab: clean(lab), val: clean(el.value), kind: 'input' });
        });
        document.querySelectorAll('.select-shell').forEach((shell) => {
            const input = shell.querySelector('input.select__input');
            const lab = document.querySelector(`label[for="${CSS.escape(input?.id || '')}"]`)?.textContent
                || clean(shell.closest('div')?.innerText).split('\n')[0];
            const single = shell.querySelector('.select__single-value')?.textContent;
            const ph = shell.querySelector('.select__placeholder')?.textContent;
            rows.push({ lab: clean(lab), val: clean(single || ph || ''), kind: 'select' });
        });
        return rows;
    });

    const report = {
        applyUrl: APPLY_URL,
        ats: collected?.data?.ats,
        fieldCount: fields.length,
        fields,
        fillStats: fillResult?.fillStats || fillResult,
        snapshot
    };
    const out = path.join(__dirname, '..', 'tmp-resonate-test.json');
    fs.writeFileSync(out, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
        ats: report.ats,
        fieldCount: report.fieldCount,
        fillStats: report.fillStats,
        kinds: fields.reduce((a, f) => ((a[f.kind] = (a[f.kind] || 0) + 1), a), {}),
        emptySelects: snapshot.filter((r) => r.kind === 'select' && /^select/i.test(r.val)).map((r) => r.lab),
        filledSelects: snapshot.filter((r) => r.kind === 'select' && r.val && !/^select/i.test(r.val)).map((r) => `${r.lab}=${r.val}`),
        phone: snapshot.find((r) => /phone/i.test(r.lab)),
        country: snapshot.find((r) => /country/i.test(r.lab))
    }, null, 2));
    console.log('Wrote', out);
    await context.close();
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
