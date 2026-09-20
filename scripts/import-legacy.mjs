import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";

const ROOT = path.resolve("c:/Vincent/Projects/02.Lumi");
const LEGACY_DB = path.join(ROOT, "_legacy_data", "database.sqlite");
const ENV_PATH = path.join(ROOT, "lumi", ".env");

const TECH = new Set(["python", "java", "dotnet", "golang", "nodejs", "frontend"]);
const ROLES = new Set(["admin", "user", "caller", "manager", "developer"]);
const APP_STATUS = new Set(["pending", "applied", "rejected", "interview"]);
const APP_STATE = new Set(["in_progress", "completed", "cancelled", "rejected"]);
const GEN = new Set(["pending", "generating", "ready", "failed"]);
const OUTCOME = new Set(["unknown", "applied", "interview", "rejected"]);
const IV_STATUS = new Set(["requested", "scheduled", "completed", "cancelled"]);

function loadDotEnv() {
  if (!fs.existsSync(ENV_PATH)) return;
  for (const raw of fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const cut = line.indexOf("=");
    if (cut < 1) continue;
    const key = line.slice(0, cut).trim();
    let value = line.slice(cut + 1);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function asDate(value) {
  if (value == null || value === "") return undefined;
  const text = String(value).trim();
  const parsed = new Date(text.includes("T") ? text : text.replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function asBool(value) {
  return value === 1 || value === true || value === "1";
}

function asText(value) {
  if (value == null) return null;
  const text = String(value);
  return text.trim() === "" ? null : text;
}

function pickJson(row, keys) {
  const out = {};
  for (const key of keys) {
    if (row[key] != null && row[key] !== "") out[key] = row[key];
  }
  return Object.keys(out).length ? JSON.stringify(out) : null;
}

function oneOf(value, allowed, fallback) {
  const text = String(value || "").trim();
  return allowed.has(text) ? text : fallback;
}

function upsertEnv(updates) {
  const current = {};
  if (fs.existsSync(ENV_PATH)) {
    for (const raw of fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const cut = line.indexOf("=");
      if (cut < 1) continue;
      current[line.slice(0, cut).trim()] = line.slice(cut + 1);
    }
  }
  const next = { ...current, ...updates, DATABASE_URL: current.DATABASE_URL || "file:./dev.db" };
  const body = Object.keys(next)
    .sort((a, b) => a.localeCompare(b))
    .map((key) => `${key}=${next[key]}`)
    .join("\n") + "\n";
  fs.writeFileSync(ENV_PATH, body);
  return Object.keys(updates);
}

function mergeSettingsKeys(row) {
  const updates = {};
  if (row.deepseek_api_key && !process.env.DEEPSEEK_API_KEY) updates.DEEPSEEK_API_KEY = row.deepseek_api_key;
  if (row.minimax_api_key_1 && !process.env.MINIMAX_API_KEY) updates.MINIMAX_API_KEY = row.minimax_api_key_1;
  if (row.minimax_api_key_2 && !process.env.MINIMAX_API_KEY_2) updates.MINIMAX_API_KEY_2 = row.minimax_api_key_2;
  if (row.local_llm_base_url) updates.LOCAL_LLM_BASE_URL = row.local_llm_base_url;
  if (row.local_llm_model) updates.LOCAL_LLM_MODEL = row.local_llm_model;
  if (row.local_llm_api_key && !process.env.LOCAL_LLM_API_KEY) updates.LOCAL_LLM_API_KEY = row.local_llm_api_key;
  if (row.local_llm_enabled != null) updates.LOCAL_LLM_ENABLED = String(row.local_llm_enabled);
  if (row.groq_api_keys) {
    let keys = [];
    try {
      const parsed = JSON.parse(row.groq_api_keys);
      if (Array.isArray(parsed)) keys = parsed;
      else if (parsed && typeof parsed === "object") keys = Object.values(parsed);
    } catch {
      keys = String(row.groq_api_keys)
        .split(/[\n,]/)
        .map((part) => part.trim())
        .filter(Boolean);
    }
    keys = [...new Set(keys.filter(Boolean))];
    if (keys[0] && !process.env.GROQ_API_KEY) updates.GROQ_API_KEY = keys[0];
    keys.forEach((key, index) => {
      const name = `GROQ_API_KEY_${index + 1}`;
      if (!process.env[name]) updates[name] = key;
    });
  }
  return Object.keys(updates).length ? upsertEnv(updates) : [];
}

loadDotEnv();
process.env.DATABASE_URL ||= "file:./dev.db";

const old = new DatabaseSync(LEGACY_DB, { readOnly: true });
const prisma = new PrismaClient();
const counts = {};

async function main() {
  const users = old.prepare("SELECT * FROM users ORDER BY id").all();
  const userIds = new Set(users.map((row) => row.id));

  await prisma.inboxMessage.deleteMany();
  await prisma.bidCourseEvent.deleteMany();
  await prisma.bidCourse.deleteMany();
  await prisma.interview.deleteMany();
  await prisma.questionMemory.deleteMany();
  await prisma.jobApplication.deleteMany();
  await prisma.assignment.deleteMany();
  await prisma.profileTechstack.deleteMany();
  await prisma.jobLink.deleteMany();
  await prisma.mailbox.deleteMany();
  await prisma.bidderPref.deleteMany();
  await prisma.developerProfile.deleteMany();
  await prisma.callerProfile.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.candidateProfile.deleteMany();
  await prisma.user.deleteMany();
  await prisma.resumeTemplate.deleteMany();
  await prisma.appSettings.deleteMany();

  for (const row of users) {
    await prisma.user.create({
      data: {
        id: row.id,
        username: row.username,
        passwordHash: row.password_hash,
        role: oneOf(row.role, ROLES, "user"),
        createdAt: asDate(row.created_at) || new Date(),
      },
    });
    const developer = {
      technicalSkills: asText(row.technical_skills),
      availability: asText(row.availability),
      contactEmail: asText(row.contact_email),
      contactTelegram: asText(row.contact_telegram),
      contactWhatsapp: asText(row.contact_whatsapp),
      contactPhone: asText(row.contact_phone),
      resumeNote: asText(row.developer_resume),
    };
    if (Object.values(developer).some(Boolean)) {
      await prisma.developerProfile.create({ data: { userId: row.id, ...developer } });
    }
  }
  counts.users = users.length;

  const extraRoles = old.prepare("SELECT * FROM user_roles ORDER BY id").all();
  for (const row of extraRoles) {
    if (!userIds.has(row.user_id) || !ROLES.has(row.role)) continue;
    await prisma.userRole.create({
      data: { id: row.id, userId: row.user_id, role: row.role },
    });
  }
  counts.userRoles = extraRoles.length;

  const profiles = old.prepare("SELECT * FROM candidate_profiles ORDER BY id").all();
  const profileIds = new Set(profiles.map((row) => row.id));
  for (const row of profiles) {
    await prisma.candidateProfile.create({
      data: {
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        middleName: asText(row.middle_name),
        email: asText(row.email),
        phone: asText(row.phone),
        city: asText(row.city),
        state: asText(row.state),
        country: asText(row.country),
        postalCode: asText(row.postal_code),
        address: asText(row.address),
        linkedinUrl: asText(row.linkedin_url),
        githubUrl: asText(row.github_url),
        websiteUrl: asText(row.website_url),
        portfolioUrl: asText(row.portfolio_url),
        salaryRange: asText(row.salary_range),
        locationFlag: asText(row.location_flag) || "US",
        workExperience: asText(row.work_experience),
        education: asText(row.education),
        resumePrompt: asText(row.resume_prompt),
        gender: asText(row.gender),
        workAuthorization: asText(row.work_authorization),
        requiresSponsorship: asText(row.requires_sponsorship),
        disabilityStatus: asText(row.disability_status),
        veteranStatus: asText(row.veteran_status),
        raceEthnicity: asText(row.race_ethnicity),
        yearsOfExperience: asText(row.years_of_experience),
        educationLevel: asText(row.education_level),
        willingToRelocate: asText(row.willing_to_relocate),
        willingToTravel: asText(row.willing_to_travel),
        noticePeriod: asText(row.notice_period),
        earliestStartDate: asText(row.earliest_start_date),
        over18: asText(row.over_18),
        hispanicLatino: asText(row.hispanic_latino),
        howHeard: asText(row.how_heard),
        securityClearance: asText(row.security_clearance),
        preferredName: asText(row.preferred_name),
        school: asText(row.school),
        degree: asText(row.degree),
        discipline: asText(row.discipline),
        birthdate: asText(row.birthdate),
        preferredTemplateId: row.preferred_template_id || null,
        preferredTemplateKind: asText(row.preferred_template_kind),
        createdAt: asDate(row.created_at) || new Date(),
        updatedAt: asDate(row.updated_at) || new Date(),
      },
    });
  }
  counts.profiles = profiles.length;

  const stacks = old.prepare("SELECT * FROM profile_techstacks").all();
  for (const row of stacks) {
    if (!profileIds.has(row.profile_id) || !TECH.has(row.techstack)) continue;
    await prisma.profileTechstack.create({
      data: { profileId: row.profile_id, techstack: row.techstack },
    });
  }
  counts.techstacks = stacks.length;

  const assigns = old.prepare("SELECT * FROM user_profile_assignments ORDER BY id").all();
  const defaultProfile = new Map();
  for (const row of assigns) {
    if (!userIds.has(row.user_id) || !profileIds.has(row.profile_id)) continue;
    await prisma.assignment.create({
      data: {
        id: row.id,
        userId: row.user_id,
        profileId: row.profile_id,
        isDefault: asBool(row.is_default),
        assignedAt: asDate(row.assigned_at) || new Date(),
      },
    });
    if (asBool(row.is_default) || !defaultProfile.has(row.user_id)) {
      defaultProfile.set(row.user_id, row.profile_id);
    }
  }
  counts.assignments = assigns.length;

  const links = old.prepare("SELECT * FROM job_links ORDER BY id").all();
  const linkIds = new Set();
  const usedApply = new Set();
  for (const row of links) {
    let applyUrl = String(row.job_apply_url || "").trim() || `legacy-empty-${row.id}`;
    if (usedApply.has(applyUrl)) applyUrl = `${applyUrl}#legacy-${row.id}`;
    usedApply.add(applyUrl);
    await prisma.jobLink.create({
      data: {
        id: row.id,
        sourceUrl: asText(row.source_url),
        applyUrl,
        company: asText(row.company_name),
        title: asText(row.position_title),
        description: asText(row.job_description),
        techstack: oneOf(row.techstack, TECH, "python"),
        locationFlag: asText(row.location_flag) || "US",
        fetchStatus: asText(row.fetch_status) || "pending",
        metaJson: pickJson(row, [
          "location",
          "is_available",
          "clearance_required",
          "comment",
          "fetch_error",
          "closed_reason",
          "last_fetched_at",
          "consecutive_failures",
        ]),
        createdAt: asDate(row.created_at) || new Date(),
        updatedAt: asDate(row.updated_at) || new Date(),
      },
    });
    linkIds.add(row.id);
  }
  counts.jobLinks = links.length;

  const apps = old.prepare("SELECT * FROM job_applications ORDER BY id").all();
  const appIds = new Set();
  const courseByApp = new Map(
    old.prepare("SELECT * FROM bid_courses").all().map((row) => [row.application_id, row]),
  );
  for (const row of apps) {
    if (!profileIds.has(row.profile_id)) continue;
    const course = courseByApp.get(row.id);
    await prisma.jobApplication.create({
      data: {
        id: row.id,
        profileId: row.profile_id,
        createdById: userIds.has(row.applier_id) ? row.applier_id : null,
        jobLinkId: linkIds.has(row.job_link_id) ? row.job_link_id : null,
        companyName: row.company_name || "Unknown",
        jobRole: asText(row.job_role),
        jobDescription: row.job_description || "",
        coreSkills: asText(row.core_skills),
        resumeMarkdown: asText(row.draft_html),
        answersJson: course?.answers_json || null,
        status: oneOf(row.status, APP_STATUS, "pending"),
        state: oneOf(row.state, APP_STATE, "in_progress"),
        source: row.source === "auto" ? "auto" : "user",
        generationStatus: oneOf(row.generation_status, GEN, "pending"),
        generationError: asText(row.generation_error),
        metaJson: pickJson(row, [
          "resume_filename",
          "job_url",
          "reject_reason",
          "otp_code",
          "match_score",
          "filled_at",
          "generation_ms",
          "template_id",
          "font_family",
        ]),
        createdAt: asDate(row.created_at) || new Date(),
        updatedAt: asDate(row.updated_at) || new Date(),
      },
    });
    appIds.add(row.id);
  }
  counts.applications = appIds.size;

  const courses = old.prepare("SELECT * FROM bid_courses ORDER BY id").all();
  const courseIds = new Set();
  for (const row of courses) {
    if (!appIds.has(row.application_id) || !userIds.has(row.user_id) || !profileIds.has(row.profile_id)) continue;
    await prisma.bidCourse.create({
      data: {
        id: row.id,
        applicationId: row.application_id,
        profileId: row.profile_id,
        userId: row.user_id,
        jobUrl: asText(row.job_url),
        companyName: asText(row.company_name),
        jobRole: asText(row.job_role),
        outcome: oneOf(row.outcome, OUTCOME, "unknown"),
        answersJson: asText(row.answers_json),
        startedAt: asDate(row.started_at) || new Date(),
        appliedAt: asDate(row.applied_at) || null,
      },
    });
    courseIds.add(row.id);
  }
  counts.bidCourses = courseIds.size;

  const events = old.prepare("SELECT * FROM bid_course_events ORDER BY id").all();
  let eventCount = 0;
  for (const row of events) {
    if (!courseIds.has(row.course_id)) continue;
    await prisma.bidCourseEvent.create({
      data: {
        id: row.id,
        courseId: row.course_id,
        eventType: row.event_type || "event",
        metaJson: asText(row.meta_json),
        at: asDate(row.at) || new Date(),
      },
    });
    eventCount += 1;
  }
  counts.bidCourseEvents = eventCount;

  const interviews = old.prepare("SELECT * FROM interviews ORDER BY id").all();
  const requests = old.prepare("SELECT * FROM interview_requests ORDER BY id").all();
  const seenApps = new Set();
  for (const row of [...interviews, ...requests]) {
    if (!appIds.has(row.application_id) || seenApps.has(row.application_id)) continue;
    const scheduled = asDate(row.scheduled_date && row.scheduled_time ? `${row.scheduled_date}T${row.scheduled_time}` : row.scheduled_date);
    await prisma.interview.create({
      data: {
        applicationId: row.application_id,
        callerId: userIds.has(row.created_by) ? row.created_by : null,
        status: oneOf(row.status, IV_STATUS, "requested"),
        interviewType: asText(row.interview_type),
        scheduledAt: scheduled || null,
        timezone: asText(row.timezone),
        meetingLink: asText(row.meeting_link),
        notes: asText(row.notes || row.user_notes),
        createdAt: asDate(row.created_at) || new Date(),
        updatedAt: asDate(row.updated_at) || new Date(),
      },
    });
    seenApps.add(row.application_id);
  }
  counts.interviews = seenApps.size;

  const callers = old.prepare("SELECT * FROM caller_profile_inputs").all();
  for (const row of callers) {
    if (!userIds.has(row.caller_id)) continue;
    await prisma.callerProfile.create({
      data: {
        userId: row.caller_id,
        profileInfo: asText(row.profile_info),
        yearsOfExperience: asText(row.years_of_experience),
        mainTechStack: asText(row.main_tech_stack),
        availability: asText(row.availability),
        location: asText(row.location),
        email: asText(row.email),
        whatsapp: asText(row.whatsapp),
        telegram: asText(row.telegram),
      },
    });
  }
  counts.callerProfiles = callers.length;

  const adminTemplates = old.prepare("SELECT * FROM resume_templates ORDER BY id").all();
  for (const row of adminTemplates) {
    await prisma.resumeTemplate.create({
      data: {
        id: row.id,
        name: row.name,
        description: asText(row.description),
        kind: "admin",
        styleSpec: row.style_spec || "{}",
        isDefault: asBool(row.is_default),
        createdAt: asDate(row.created_at) || new Date(),
      },
    });
  }
  const userTemplates = old.prepare("SELECT * FROM user_resume_templates ORDER BY id").all();
  let nextTemplateId = (adminTemplates.at(-1)?.id || 0) + 1000;
  for (const row of userTemplates) {
    await prisma.resumeTemplate.create({
      data: {
        id: nextTemplateId,
        name: row.name,
        description: asText(row.description),
        kind: row.kind || "user",
        userId: userIds.has(row.user_id) ? row.user_id : null,
        styleSpec: row.style_spec || "{}",
        isDefault: asBool(row.is_default),
        createdAt: asDate(row.created_at) || new Date(),
      },
    });
    nextTemplateId += 1;
  }
  counts.templates = adminTemplates.length + userTemplates.length;

  const memories = old.prepare("SELECT * FROM bidder_question_memory").all();
  let memoryCount = 0;
  for (const row of memories) {
    const profileId = defaultProfile.get(row.user_id);
    if (!profileId) continue;
    await prisma.questionMemory.create({
      data: {
        profileId,
        questionLabel: row.question_text || row.question_norm || "question",
        answer: row.answer_text || "",
        updatedAt: asDate(row.updated_at) || new Date(),
      },
    });
    memoryCount += 1;
  }
  counts.questionMemory = memoryCount;

  const lessons = old.prepare("SELECT * FROM bidder_fill_lessons").all();
  const prefsByUser = new Map();
  for (const row of lessons) {
    if (!userIds.has(row.user_id)) continue;
    const list = prefsByUser.get(row.user_id) || [];
    list.push({
      host: row.host,
      fieldKey: row.field_key,
      instruction: row.instruction,
      ats: row.ats,
    });
    prefsByUser.set(row.user_id, list);
  }
  for (const [userId, lessonsForUser] of prefsByUser) {
    await prisma.bidderPref.create({
      data: { userId, json: JSON.stringify({ lessons: lessonsForUser }) },
    });
  }
  counts.bidderPrefs = prefsByUser.size;

  const mailboxes = old.prepare("SELECT * FROM outlook_mailboxes").all();
  for (const row of mailboxes) {
    if (!userIds.has(row.user_id)) continue;
    const mailbox = await prisma.mailbox.create({
      data: {
        userId: row.user_id,
        provider: "outlook",
        email: row.email,
        status: row.last_error ? "error" : "connected",
        secretJson: pickJson(row, [
          "access_token",
          "refresh_token",
          "expires_at",
          "scope",
          "subscription_id",
          "subscription_expires_at",
          "client_state",
          "display_name",
        ]),
        createdAt: asDate(row.connected_at) || new Date(),
      },
    });
    const messages = old.prepare("SELECT * FROM outlook_messages WHERE mailbox_id = ? ORDER BY id").all(row.id);
    for (const message of messages) {
      await prisma.inboxMessage.create({
        data: {
          mailboxId: mailbox.id,
          fromAddr: message.from_address || message.from_name || "unknown",
          subject: message.subject || "(no subject)",
          snippet: asText(message.body_preview || message.body_text),
          otpCode: asText(message.otp_code),
          receivedAt: asDate(message.received_at) || new Date(),
        },
      });
    }
    counts.inboxMessages = (counts.inboxMessages || 0) + messages.length;
  }
  counts.mailboxes = mailboxes.length;

  const settings = old.prepare("SELECT * FROM app_settings WHERE id = 1").get() || {};
  const copiedSettingKeys = mergeSettingsKeys(settings);
  await prisma.appSettings.create({
    data: {
      id: 1,
      aiProvider: oneOf(settings.ai_provider, new Set(["groq", "minimax", "deepseek"]), "groq"),
      aiModel: "llama-3.3-70b-versatile",
      updatedAt: asDate(settings.updated_at) || new Date(),
    },
  });
  counts.settingsKeysFromDb = copiedSettingKeys.length;

  console.log("Imported legacy desk", counts);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    old.close();
    await prisma.$disconnect();
  });
