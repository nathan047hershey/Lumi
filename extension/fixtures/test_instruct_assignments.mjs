import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { parseAssignmentFills } = require('../../server/services/fillInstructionService.js');

const snapshot = [
    { id: 'd1', label: 'Disability Status', kind: 'disability_status', value: '' },
    { id: 's1', label: 'Will you require visa sponsorship?', kind: 'requires_sponsorship', value: '' },
    { id: 'c1', label: 'Location (city)', kind: 'city', value: '' }
];

const checks = [];
const a = parseAssignmentFills('Disability = No', snapshot);
checks.push(['disability assignment', a.length === 1 && a[0].answer === 'No' && a[0].id === 'd1']);
const b = parseAssignmentFills('Sponsorship: No; Location is Reston, VA', snapshot);
checks.push(['two assignments', b.length === 2]);
checks.push(['sponsor matched', b.some((x) => x.id === 's1' && x.answer === 'No')]);
checks.push(['location matched', b.some((x) => /Reston/i.test(x.answer))]);
const c = parseAssignmentFills('pause', snapshot);
checks.push(['pause is not assignment', c.length === 0]);

let failed = 0;
for (const [name, ok] of checks) {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
    if (!ok) failed += 1;
}
if (failed) process.exit(1);
console.log(`\nAll ${checks.length} instruct assignment checks passed.`);
