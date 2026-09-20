/**
 * Shared autofill primitives — single ATS detection for fill.js + bidderFill.js.
 * Loaded after controlMatch.js, before fill.js and bidderFill.js.
 */
(function () {
    if (window.__lumiFillShared) return;

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    function detectAts() {
        const host = (window.__BIDDER_SPOOF_HOST || location.hostname || '').toLowerCase();
        const href = (window.__BIDDER_SPOOF_HREF || location.href || '').toLowerCase();
        if (host.includes('linkedin.com') || href.includes('linkedin.com/jobs')) {
            return 'linkedin';
        }
        if (host.includes('greenhouse.io') || host.includes('boards.greenhouse') || host.includes('job-boards.greenhouse')) {
            return 'greenhouse';
        }
        if (host.includes('lever.co') || host.includes('jobs.lever.co')) {
            return 'lever';
        }
        if (host.includes('ashbyhq.com') || host.includes('jobs.ashbyhq.com') || host.includes('ashby')) {
            return 'ashby';
        }
        if (
            host.includes('myworkdayjobs.com')
            || host.includes('workdayjobs.com')
            || host.includes('wd1.myworkdayjobs')
            || host.includes('wd5.myworkdayjobs')
            || host.includes('myworkday')
            || host.includes('workday')
        ) {
            return 'workday';
        }
        if (host.includes('smartrecruiters.com')) {
            return 'smartrecruiters';
        }
        if (host.includes('icims.com')) {
            return 'icims';
        }
        if (host.includes('bamboohr.com')) {
            return 'bamboohr';
        }
        if (host.includes('rippling.com') || host.includes('ats.rippling')) {
            return 'rippling';
        }
        if (
            host.includes('oraclecloud.com')
            || host.includes('.oracle.com/hcm')
            || /fa\.[a-z0-9]+\.oraclecloud\.com/i.test(host)
        ) {
            return 'oracle';
        }
        if (document.querySelector('#greenhouse-job-application, [data-provider="Greenhouse"]')) {
            return 'greenhouse';
        }
        if (document.querySelector(
            'form.application-form, #application-form, .main-header-text.apply, [data-qa="btn-submit"]'
        )) {
            return 'lever';
        }
        if (document.querySelector(
            '[class*="ashby"], [data-testid*="ashby"], #ashby_embed.ashby-application-form, .ashby-application-form'
        )) {
            return 'ashby';
        }
        if (document.querySelector(
            '[data-automation-id="jobPostingPage"], [data-automation-id="applyManually"], '
            + '[data-automation-id="contactInfoSection"], [data-automation-id="formField-legalName"], '
            + '[data-automation-id="formField-email"], [data-automation-id="bottom-submit"]'
        )) {
            return 'workday';
        }
        if (document.querySelector('.jobapp-form, [class*="smartrecruiters"], #st-jobApplicationForm')) {
            return 'smartrecruiters';
        }
        if (document.querySelector('.iCIMS_Forms, #icims_content_iframe, [class*="iCIMS"]')) {
            return 'icims';
        }
        if (document.querySelector('.BambooHR-ATS-board, #bhrApplicantForm')) {
            return 'bamboohr';
        }
        if (
            document.querySelector(
                '[data-automation-id*="oracle"], .apply-flow-page, .job-application-form, '
                + 'input[name*="candidate"], form[action*="oraclecloud"]'
            )
            || /oraclecloud|oracle\.com\/hcm/i.test(location.href)
        ) {
            return 'oracle';
        }
        return 'generic';
    }

    window.__lumiFillShared = {
        sleep,
        detectAts,
        ENGINE_FILL_V3: 'autofill-engine-v3',
        ENGINE_BIDDER_V1: 'bidder-engine-v1'
    };
}());
