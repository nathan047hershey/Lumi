/**
 * False-positive SUCCESS: "customer/enterprise success" + Ashby validation
 * errors must NEVER count as submit success.
 * Greenhouse "Thank you for applying to {Company}!" MUST count as SUCCESS
 * even when leftover Track-application fields remain.
 * Run: node extension/fixtures/test_submit_success_detect.mjs
 */
import {
    SUCCESS_RE,
    SUCCESS_HEADING_RE,
    SUCCESS_NEGATIVE_RE,
    evaluateSubmitSuccessPage,
    evaluateSubmitResponse
} from '../lib/submitSuccess.js';

const checks = [];

const ashbyFormText = [
    'Practical knowledge of security and IAM concepts?',
    'How many years of experience do you have in software deployments?',
    'How many years have you worked with enterprise customers in a customer success or implementation role?',
    'None', '1 year', '2 years', '3 years', '4 years', '5+ years',
    'Have you worked at a US based company before?',
    'Submit Application'
].join('\n');

const ashbyValidationErrors = [
    'Missing entry for required field: Do you have practical knowledge of security and IAM concepts?',
    'Missing entry for required field: How many years of experience do you have managing software deployments and implementations?',
    'Missing entry for required field: How many years have you worked with enterprise success or implementation role?',
    'Missing entry for required field: Have you worked at a US based company before?',
    'Missing entry for required field: What is your understanding of enterprise infrastructure (hybrid/on-prem + cloud)?'
].join('\n');

checks.push(['bare customer success text no match', SUCCESS_RE.test(ashbyFormText) === false]);
checks.push(['word success alone no match', SUCCESS_RE.test('customer success role') === false]);
checks.push(['enterprise success no match', SUCCESS_RE.test('enterprise success or implementation') === false]);
checks.push(['successfully deploy no match', SUCCESS_RE.test('successfully deploy services') === false]);
checks.push(['confirmation alone no match', SUCCESS_RE.test('email confirmation required') === false]);
checks.push(['bare thanks no match', SUCCESS_RE.test('Thanks!') === false]);
checks.push(['bare thank you no match', SUCCESS_RE.test('Thank you!') === false]);

checks.push(['thank you for applying matches', SUCCESS_RE.test('Thank you for applying!') === true]);
checks.push(['thank you for applying to company matches', SUCCESS_RE.test('Thank you for applying to Resonate!') === true]);
checks.push(['application submitted matches', SUCCESS_RE.test('Application submitted!') === true]);
checks.push(['we have received matches', SUCCESS_RE.test('We have received your application') === true]);
checks.push(['successfully submitted matches', SUCCESS_RE.test('Successfully submitted your application') === true]);

checks.push(['heading Application submitted', SUCCESS_HEADING_RE.test('Application submitted') === true]);
checks.push(['heading Thank you for applying', SUCCESS_HEADING_RE.test('Thank you for applying') === true]);
checks.push(['heading Thank you for applying to Resonate!', SUCCESS_HEADING_RE.test('Thank you for applying to Resonate!') === true]);
checks.push(['heading Success! NO', SUCCESS_HEADING_RE.test('Success!') === false]);
checks.push(['heading customer success NO', SUCCESS_HEADING_RE.test('customer success') === false]);

checks.push(['negative catches missing entry', SUCCESS_NEGATIVE_RE.test(ashbyValidationErrors) === true]);
checks.push(['negative ignores thank-you page', SUCCESS_NEGATIVE_RE.test('Application submitted!') === false]);

const falsePos = evaluateSubmitSuccessPage({
    text: ashbyFormText,
    headings: ['Hire Hangar', 'Application'],
    radioCount: 12,
    visibleFieldCount: 2,
    hasSubmitControl: true,
    emptyVisibleFields: 2
});
checks.push(['ashby empty form not success', falsePos.ok === false]);

const validationPage = evaluateSubmitSuccessPage({
    text: ashbyValidationErrors,
    headings: ['Error'],
    radioCount: 12,
    visibleFieldCount: 0,
    hasSubmitControl: true,
    emptyVisibleFields: 0,
    hasValidationErrors: true
});
checks.push(['ashby validation errors not success', validationPage.ok === false]);
checks.push(['ashby validation reason', validationPage.reason === 'validation_errors']);

const validationByText = evaluateSubmitSuccessPage({
    text: ashbyValidationErrors + '\nenterprise success role',
    headings: [],
    radioCount: 0,
    visibleFieldCount: 0,
    hasSubmitControl: false
});
checks.push(['validation text alone blocks SUCCESS', validationByText.ok === false]);
checks.push(['validation text reason', validationByText.reason === 'validation_errors']);

const truePos = evaluateSubmitSuccessPage({
    text: 'Application submitted!\n\nReturn to the main page',
    headings: ['Application submitted!'],
    radioCount: 0,
    visibleFieldCount: 0,
    hasSubmitControl: false,
    emptyVisibleFields: 0
});
checks.push(['real thank-you is success', truePos.ok === true]);

const headingOnlyOnForm = evaluateSubmitSuccessPage({
    text: ashbyFormText,
    headings: ['Success!'],
    radioCount: 10,
    visibleFieldCount: 4,
    hasSubmitControl: true,
    emptyVisibleFields: 3
});
checks.push(['Success! heading on open form rejected', headingOnlyOnForm.ok === false]);

const thankYouButFormOpen = evaluateSubmitSuccessPage({
    text: `${ashbyFormText}\nThank you for applying`,
    headings: ['Thank you for applying'],
    radioCount: 10,
    visibleFieldCount: 4,
    hasSubmitControl: true,
    emptyVisibleFields: 3
});
checks.push(['thank-you text ignored while form open', thankYouButFormOpen.ok === false]);
checks.push(['thank-you+form reason form_still_open', thankYouButFormOpen.reason === 'form_still_open']);

const thankYouOnOpenForm = evaluateSubmitSuccessPage({
    text: 'Thank you for your application. We\'re excited to learn more about you!\nSubmit application',
    headings: ['Thank you for your application'],
    radioCount: 0,
    visibleFieldCount: 2,
    hasSubmitControl: true,
    formPresent: true,
    emptyVisibleFields: 2
});
checks.push(['thank-you words on an open form are not applied', thankYouOnOpenForm.ok === false]);
checks.push(['open form reason', thankYouOnOpenForm.reason === 'form_still_open']);

const thankYouFormGone = evaluateSubmitSuccessPage({
    text: 'Thank you for your application. Your application has been routed to our Talent Acquisition team.',
    headings: ['Thank you for your application'],
    radioCount: 0,
    visibleFieldCount: 0,
    hasSubmitControl: false,
    formPresent: false
});
checks.push(['thank-you after the form is gone is applied', thankYouFormGone.ok === true]);

const crexiConfirmation = evaluateSubmitSuccessPage({
    text: 'Thanks for reaching out!\nWe\'re excited to learn more about you.\nView more jobs at Crexi\nBack to job post\nTrack your application\nInitial screen\nTeam interview\nOnsite interview\nOffer',
    headings: ['Thanks for reaching out!'],
    radioCount: 0,
    visibleFieldCount: 0,
    hasSubmitControl: false,
    formPresent: false,
    confirmationShell: true
});
checks.push(['greenhouse confirmation shell is applied', crexiConfirmation.ok === true]);
checks.push(['confirmation shell reason', crexiConfirmation.reason === 'confirmation_shell']);
checks.push(['custom thanks sentence alone is not a match', SUCCESS_RE.test('Thanks for reaching out!') === false]);

const acceptedPost = evaluateSubmitResponse({
    url: 'https://job-boards.greenhouse.io/embed/job_app?for=crexi&token=1',
    status: 200,
    body: '{"success":true}'
});
checks.push(['greenhouse 200 is an accepted submit', acceptedPost?.ok === true]);
checks.push(['accepted submit reason', acceptedPost?.reason === 'submit_accepted']);

const rejectedPost = evaluateSubmitResponse({
    url: 'https://job-boards.greenhouse.io/embed/job_app?for=crexi&token=1',
    status: 422,
    body: '{"errors":{"resume":["is required"]}}'
});
checks.push(['greenhouse 422 is not applied', rejectedPost?.ok === false]);

const analyticsPost = evaluateSubmitResponse({
    url: 'https://www.google-analytics.com/g/collect',
    status: 200,
    body: ''
});
checks.push(['unrelated 200 is ignored', analyticsPost == null]);

const fromResponse = evaluateSubmitSuccessPage({
    text: 'Thanks for reaching out!',
    headings: ['Thanks for reaching out!'],
    formPresent: false,
    submitAccepted: true
});
checks.push(['accepted submit finishes the bid', fromResponse.ok === true]);
checks.push(['accepted submit reason on the page', fromResponse.reason === 'submit_accepted']);

const customConfirmation = evaluateSubmitSuccessPage({
    text: 'Thanks for reaching out!\nWe are excited to learn more about you.',
    headings: ['Thanks for reaching out!'],
    formPresent: false,
    atsHost: true,
    formReplacedAfterAttempt: true,
    confirmationShell: false
});
checks.push(['form replaced on the job site is applied', customConfirmation.ok === true]);
checks.push(['form replaced reason', customConfirmation.reason === 'form_replaced']);

const longConfirmation = evaluateSubmitSuccessPage({
    text: `${'Thanks for reaching out. '.repeat(80)}View more jobs.`,
    headings: [],
    formPresent: false,
    atsHost: true,
    formReplacedAfterAttempt: true
});
checks.push(['long confirmation with no heading is applied', longConfirmation.ok === true]);
checks.push(['long confirmation reason', longConfirmation.reason === 'form_replaced']);

const stillTheForm = evaluateSubmitSuccessPage({
    text: 'Attach your resume\nSubmit application',
    headings: ['Apply'],
    formPresent: true,
    atsHost: true,
    formReplacedAfterAttempt: true
});
checks.push(['open form is not applied after an attempt', stillTheForm.ok === false]);

const closedJob = evaluateSubmitSuccessPage({
    text: 'This job is no longer available.',
    headings: ['Job closed'],
    formPresent: false,
    atsHost: true,
    formReplacedAfterAttempt: true
});
checks.push(['closed job is not applied', closedJob.ok === false]);
checks.push(['closed job reason', closedJob.reason === 'job_closed']);

let failed = 0;
for (const [name, ok] of checks) {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
    if (!ok) failed += 1;
}
if (failed) {
    console.error(`\n${failed} failed`);
    process.exit(1);
}
console.log(`\nAll ${checks.length} submit-success detect checks passed.`);
