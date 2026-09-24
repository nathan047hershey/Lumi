'use strict';

const assert = require('assert');
const { pickRowsToRestore } = require('../server/services/jobLinkRestore');

const good = {
    id: 65,
    techstack: 'python',
    job_apply_url: 'https://job-boards.greenhouse.io/embed/job_app?for=machinifyinc&token=4415507009',
    company_name: 'Machinify',
    position_title: 'Sr. Analyst',
    fetch_status: 'success',
    job_description: 'JD text'
};

assert.strictEqual(pickRowsToRestore([good], { ids: [], urls: [] }).length, 1);
assert.strictEqual(pickRowsToRestore([good], { ids: [65], urls: [] }).length, 0);
assert.strictEqual(
    pickRowsToRestore([good], { ids: [], urls: [good.job_apply_url] }).length,
    0
);
assert.strictEqual(pickRowsToRestore([{ ...good, techstack: 'nope' }], { ids: [], urls: [] }).length, 0);
assert.strictEqual(pickRowsToRestore([{ ...good, job_apply_url: '' }], { ids: [], urls: [] }).length, 0);
assert.strictEqual(pickRowsToRestore([good, { ...good, id: 66 }], { ids: [], urls: [] }).length, 1);

const pending = pickRowsToRestore([{ ...good, id: 70, fetch_status: 'nope', job_description: '' }], { ids: [], urls: [] });
assert.strictEqual(pending[0].fetch_status, 'pending');

console.log('job-link restore tests passed');
