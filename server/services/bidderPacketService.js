/**
 * Application packet — pre-generate bidder answers before Process (Swooped-style).
 * Answers are stored on bid_courses.answers_json + artifact answers.json for reuse at fill time.
 */
const { getOne } = require('../config/database');
const bidderBrain = require('./bidderBrainService');
const bidCourseService = require('./bidCourseService');
const artifacts = require('./bidderArtifactService');

/** Standard questions answered from profile + brain (no live form scrape required). */
const STANDARD_PACKET_QUESTIONS = [
    { id: 'work_auth', label: 'Are you legally authorized to work in the United States?', kind: 'work_authorization', lane: 'policy', knockout: true },
    { id: 'sponsor', label: 'Will you now or in the future require visa sponsorship?', kind: 'requires_sponsorship', lane: 'policy', knockout: true },
    { id: 'salary', label: 'What are your salary expectations?', kind: 'salary', lane: 'salary', answer_type: 'salary' },
    {
        id: 'salary_comfort',
        label: 'Are you comfortable with the salary range outlined in this job description?',
        kind: 'salary_comfort_yes',
        lane: 'policy',
        knockout: true,
        answer_type: 'choice',
        options: ['Yes', 'No']
    },
    { id: 'relocate', label: 'Are you willing to relocate?', kind: 'willing_to_relocate', lane: 'policy' },
    { id: 'start', label: 'When can you start?', kind: 'earliest_start_date', lane: 'written' },
    { id: 'notice', label: 'What is your notice period?', kind: 'notice_period', lane: 'written' },
    { id: 'disability', label: 'Do you have a disability?', kind: 'disability_status', lane: 'policy', knockout: true },
    { id: 'veteran', label: 'Are you a veteran?', kind: 'veteran_status', lane: 'policy', knockout: true },
    { id: 'race', label: 'What is your race or ethnicity?', kind: 'race_ethnicity', lane: 'policy' },
    { id: 'gender', label: 'Gender', kind: 'gender', lane: 'policy' },
    {
        id: 'former_emp',
        label: 'Have you ever been employed by this company or an affiliate?',
        kind: 'previous_employer_no',
        lane: 'policy',
        knockout: true,
        answer_type: 'choice',
        options: ['Yes', 'No']
    },
    {
        id: 'non_compete',
        label: 'Are you subject to a non-compete or restrictive covenant?',
        kind: 'non_compete_no',
        lane: 'policy',
        knockout: true,
        answer_type: 'choice',
        options: ['Yes', 'No']
    },
    { id: 'background', label: 'Are you willing to undergo a background check?', kind: 'background_check_yes', lane: 'policy' },
    { id: 'why_role', label: 'Why are you interested in this role?', kind: 'essay', lane: 'unique', answer_type: 'written' },
    { id: 'why_company', label: 'Why do you want to work at this company?', kind: 'essay', lane: 'unique', answer_type: 'written' },
    {
        id: 'behavioral',
        label: 'Tell us about a challenging project you led and the outcome.',
        kind: 'behavioral',
        lane: 'unique',
        unique_subtype: 'behavioral',
        answer_type: 'written'
    }
];

const MIN_ANSWERS_FOR_READY = 8;

function normalizeAnswerText(a) {
    return String(a?.answer ?? a?.value ?? '').trim();
}

function loadAnswersForApplication(applicationId) {
    const appId = parseInt(applicationId, 10);
    if (!Number.isInteger(appId) || appId <= 0) return [];
    const fromArtifact = artifacts.readAnswers(appId);
    if (fromArtifact.length) return fromArtifact;
    const course = bidCourseService.getCourseByApplicationId(appId);
    if (!course?.answers?.length) return [];
    return course.answers;
}

function assessPacket(answers) {
    const list = Array.isArray(answers) ? answers : [];
    const filled = list.filter((a) => normalizeAnswerText(a));
    const policyItems = list.filter((a) => a?.lane === 'policy' || a?.knockout);
    const policyComplete = policyItems.length === 0
        || policyItems.every((a) => normalizeAnswerText(a));
    const ready = filled.length >= MIN_ANSWERS_FOR_READY && policyComplete;
    return {
        answer_count: filled.length,
        total: list.length,
        policy_complete: policyComplete,
        ready,
        missing_policy: policyItems
            .filter((a) => !normalizeAnswerText(a))
            .map((a) => String(a.label || a.kind || a.id || 'Policy field').slice(0, 120))
    };
}

function getPacketStatus(applicationId) {
    const appId = parseInt(applicationId, 10);
    const answers = loadAnswersForApplication(appId);
    const assessment = assessPacket(answers);
    const course = bidCourseService.getCourseByApplicationId(appId);
    const app = getOne(
        `SELECT company_name, job_role, resume_filename FROM job_applications WHERE id = ?`,
        [appId]
    );
    return {
        application_id: appId,
        company_name: app?.company_name || course?.company_name || null,
        job_role: app?.job_role || course?.job_role || null,
        answers,
        ...assessment,
        prepared_at: course?.updated_at || null,
        resume_filename: app?.resume_filename || null
    };
}

async function savePacketAnswers(applicationId, profileId, userId, app, answers, meta = {}) {
    const appId = parseInt(applicationId, 10);
    bidCourseService.upsertCourse({
        applicationId: appId,
        profileId,
        userId,
        jobUrl: app.job_url,
        companyName: app.company_name,
        jobRole: app.job_role,
        answers,
        eventType: 'packet_prepared',
        eventMeta: {
            answer_count: answers.length,
            ...meta
        }
    });
    artifacts.saveCoursePackage(appId, {
        jd: app.job_description,
        answers,
        meta: {
            company: app.company_name,
            role: app.job_role,
            url: app.job_url,
            packet: true,
            at: new Date().toISOString(),
            ...meta
        },
        resumeFilename: app.resume_filename,
        resumesDir: meta.resumesDir
    });
}

async function preparePacketForApplication({
    applicationId,
    profile,
    userId,
    forceRegenerate = false,
    resumesDir
}) {
    const appId = parseInt(applicationId, 10);
    const app = getOne(
        `SELECT a.*, p.first_name, p.last_name
         FROM job_applications a
         JOIN candidate_profiles p ON p.id = a.profile_id
         WHERE a.id = ?`,
        [appId]
    );
    if (!app) {
        return { application_id: appId, ok: false, error: 'Application not found' };
    }

    const existing = loadAnswersForApplication(appId);
    if (!forceRegenerate && existing.length) {
        const assessment = assessPacket(existing);
        if (assessment.ready) {
            return {
                application_id: appId,
                ok: true,
                reused: true,
                company_name: app.company_name,
                job_role: app.job_role,
                resume_filename: app.resume_filename,
                ...assessment
            };
        }
    }

    try {
        const result = await bidderBrain.generateBidderAnswers({
            profile,
            jobDescription: app.job_description || '',
            resumeHtml: app.draft_html || '',
            questions: STANDARD_PACKET_QUESTIONS,
            companyName: app.company_name || '',
            jobRole: app.job_role || '',
            userId,
            applicationId: appId,
            forceRegenerate
        });
        const answers = result.answers || [];
        await savePacketAnswers(appId, profile.id, userId, app, answers, {
            resumesDir,
            engine: result.engine_version,
            generated_count: result.generated_count,
            reused_count: result.reused_count,
            provider: result.provider
        });
        const assessment = assessPacket(answers);
        return {
            application_id: appId,
            ok: true,
            reused: !!result.reused,
            company_name: app.company_name,
            job_role: app.job_role,
            resume_filename: app.resume_filename,
            engine: result.engine_version,
            ...assessment
        };
    } catch (err) {
        return {
            application_id: appId,
            ok: false,
            error: err?.message || 'Packet preparation failed',
            company_name: app.company_name,
            job_role: app.job_role
        };
    }
}

async function preparePacketsForApplications({
    applicationIds,
    profile,
    userId,
    forceRegenerate = false,
    resumesDir
}) {
    const ids = (Array.isArray(applicationIds) ? applicationIds : [])
        .map((id) => parseInt(id, 10))
        .filter((n) => Number.isInteger(n) && n > 0);
    const items = [];
    for (const id of ids) {
        // Sequential to avoid LLM rate limits
        // eslint-disable-next-line no-await-in-loop
        const row = await preparePacketForApplication({
            applicationId: id,
            profile,
            userId,
            forceRegenerate,
            resumesDir
        });
        items.push(row);
    }
    const ready = items.filter((i) => i.ok && i.ready).length;
    const failed = items.filter((i) => !i.ok).length;
    return {
        items,
        summary: {
            total: items.length,
            ready,
            failed,
            partial: items.length - ready - failed
        }
    };
}

function updatePacketAnswer(applicationId, { index, label, answer, userId }) {
    const appId = parseInt(applicationId, 10);
    let answers = loadAnswersForApplication(appId);
    if (!answers.length) answers = [...STANDARD_PACKET_QUESTIONS.map((q) => ({ ...q, answer: '' }))];

    const idx = Number.isInteger(Number(index)) ? Number(index) : -1;
    const qLabel = String(label || '').trim();
    const ans = String(answer || '').trim();
    if (!ans) throw new Error('answer is required');

    let updated = false;
    const next = answers.map((a, i) => {
        const matchIdx = idx >= 0 && i === idx;
        const matchLabel = qLabel && String(a.label || '').trim().toLowerCase() === qLabel.toLowerCase();
        if (!matchIdx && !matchLabel) return a;
        updated = true;
        return {
            ...a,
            label: a.label || qLabel,
            answer: ans,
            value: ans,
            corrected: true,
            corrected_at: new Date().toISOString(),
            match_source: 'packet_edit'
        };
    });
    if (!updated) {
        next.push({
            id: `packet_edit_${Date.now()}`,
            label: qLabel || 'Custom question',
            answer: ans,
            value: ans,
            match_source: 'packet_edit',
            lane: 'written'
        });
    }

    const app = getOne(`SELECT * FROM job_applications WHERE id = ?`, [appId]);
    if (!app) throw new Error('Application not found');
    savePacketAnswers(appId, app.profile_id, userId, app, next, { edited: true });
    return getPacketStatus(appId);
}

module.exports = {
    STANDARD_PACKET_QUESTIONS,
    assessPacket,
    getPacketStatus,
    preparePacketForApplication,
    preparePacketsForApplications,
    updatePacketAnswer,
    loadAnswersForApplication
};
