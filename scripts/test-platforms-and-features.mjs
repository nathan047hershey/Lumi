/**
 * Every job-link platform filter, bidder ATS id, Workday URL shape,
 * Greenhouse canonical apply URL, and Eastern date preset.
 * Run: node scripts/test-platforms-and-features.mjs
 */
import assert from 'assert';
import { createRequire } from 'module';
import { mergeCvStatusForward } from '../src/lib/cvStatusMerge.js';
import { detectAtsFromUrl } from '../extension/lib/atsDetect.js';

const require = createRequire(import.meta.url);
const { JOB_LINK_PLATFORMS, platformFilterSql } = require('../server/services/scraper/jobLinkPlatform');
const { parseWorkdayJobUrl } = require('../server/services/scraper/providers');
const { canonicalizeGreenhouseApplyUrl } = require('../server/services/scraper/greenhouseUrl');
const { datePresetRange } = require('../server/utils/time');

function like(value, pattern) {
    const re = new RegExp(
        `^${pattern.toLowerCase()
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
            .replace(/%/g, '.*')
            .replace(/_/g, '.')}$`
    );
    return re.test(String(value || '').toLowerCase());
}

function sqlMatches(filter, url) {
    if (!filter) return false;
    const params = filter.params;
    let pi = 0;
    const clauses = filter.sql.split(/ OR | AND /);
    // Evaluate the param pairs in order: each urlMatchSql consumes two likes.
    const hits = [];
    for (let i = 0; i < params.length; i += 2) {
        hits.push(like(url, params[i]) || like(url, params[i + 1]));
    }
    if (filter.sql.trim().startsWith('NOT')) return !hits.some(Boolean);
    return hits.some(Boolean);
}

const samples = [
    ['greenhouse', 'https://job-boards.greenhouse.io/embed/job_app?for=acme&token=1'],
    ['lever', 'https://jobs.lever.co/acme/11111111-1111-1111-1111-111111111111/apply'],
    ['ashby', 'https://jobs.ashbyhq.com/acme/11111111-1111-1111-1111-111111111111'],
    ['gem', 'https://jobs.gem.com/acme/11111111-1111-1111-1111-111111111111'],
    ['workday', 'https://acme.wd5.myworkdayjobs.com/en-US/External/job/New-York/Engineer_R123'],
    ['icims', 'https://careers-acme.icims.com/jobs/123/job'],
    ['smartrecruiters', 'https://jobs.smartrecruiters.com/Acme/123'],
    ['bamboohr', 'https://acme.bamboohr.com/careers/1'],
    ['oracle', 'https://fa-acme.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX/job/1'],
    ['linkedin', 'https://www.linkedin.com/jobs/view/1'],
    ['rippling', 'https://ats.rippling.com/acme/jobs/1'],
    ['jobvite', 'https://jobs.jobvite.com/acme/job/1'],
    ['paycom', 'https://www.paycomonline.net/v4/ats/web.php/jobs/ViewJobDetails?clientkey=x'],
    ['applytojob', 'https://acme.applytojob.com/apply/1'],
    ['paylocity', 'https://recruiting.paylocity.com/recruiting/jobs/Details/1'],
    ['successfactors', 'https://career5.successfactors.com/career?company=acme'],
    ['successfactors', 'https://acme.sapsf.com/career?company=acme']
];

const ids = new Set(JOB_LINK_PLATFORMS.map((p) => p.id));
for (const [id] of samples) assert.ok(ids.has(id), `missing platform ${id}`);

for (const [id, url] of samples) {
    const own = platformFilterSql(id);
    assert.ok(sqlMatches(own, url), `${id} filter missed ${url}`);
    for (const other of JOB_LINK_PLATFORMS) {
        if (other.id === id || other.id === 'generic') continue;
        assert.ok(!sqlMatches(platformFilterSql(other.id), url), `${url} also matched ${other.id}`);
    }
    assert.ok(!sqlMatches(platformFilterSql('generic'), url), `${url} counted as generic`);
    assert.strictEqual(detectAtsFromUrl(url).id, id, `ATS detect ${url}`);
}

assert.strictEqual(detectAtsFromUrl('https://example.com/jobs/1').id, 'generic');
assert.ok(sqlMatches(platformFilterSql('generic'), 'https://example.com/jobs/1'));

const wd = parseWorkdayJobUrl(samples.find((s) => s[0] === 'workday')[1]);
assert.strictEqual(wd.company, 'acme');
assert.strictEqual(wd.wd, 'wd5');
assert.strictEqual(wd.site, 'External');
assert.strictEqual(wd.slug, 'Engineer_R123');
const wdShort = parseWorkdayJobUrl('https://acme.wd1.myworkdayjobs.com/External/job/Engineer');
assert.strictEqual(wdShort.site, 'External');
assert.strictEqual(wdShort.slug, 'Engineer');

const canon = canonicalizeGreenhouseApplyUrl(
    'https://job-boards.greenhouse.io/embed/job_app?for=machinifyinc&token=4415507009&jr_id=abc'
);
assert.strictEqual(
    canon,
    'https://job-boards.greenhouse.io/embed/job_app?for=machinifyinc&token=4415507009'
);

const now = new Date('2026-09-24T06:15:00.000Z'); // 2:15 AM EDT
for (const preset of ['today', 'past_24h', 'this_week', 'past_week']) {
    const range = datePresetRange(preset, now);
    assert.ok(range && range.created_after < range.created_before, preset);
}
const today = datePresetRange('today', now);
assert.ok('2026-09-24 05:15:00' >= today.created_after && '2026-09-24 05:15:00' < today.created_before);
assert.ok('2026-09-24 01:15:00' < today.created_after);

const merged = mergeCvStatusForward(
    [{ id: 1, fetch_status: 'success', job_description: 'jd', available_profiles: [{ profile_id: 2, generation_status: 'ready', resume_filename: 'a.docx' }] }],
    [{ id: 1, fetch_status: 'success', job_description: 'jd', available_profiles: [{ profile_id: 2, generation_status: null }, { profile_id: 3, generation_status: 'generating' }] }]
);
assert.strictEqual(merged[0].available_profiles[0].generation_status, 'ready');
assert.strictEqual(merged[0].available_profiles[1].generation_status, 'generating');

console.log(`platforms and features passed (${samples.length} platform URLs)`);
