import { DEFAULT_AUTOFILL } from "./autofill";
import { askGroq, draftScreeningAnswers } from "./ai-answer";
import { applyAiAnswers, answersFromPlan, buildFillPlan, buildVault, type FillPlan, type LiveField } from "./fill-engine";
import { lookupJobByUrl } from "./job-lookup";
import { prisma } from "./prisma";

async function loadDefaults() {
  const settings = await prisma.appSettings.findFirst();
  return {
    ...DEFAULT_AUTOFILL,
    ...(settings?.autofillJson ? (JSON.parse(settings.autofillJson) as Record<string, string>) : {}),
  };
}

export async function planJobFill(input: {
  jobLinkId: number;
  profileId: number;
  userId: number;
  useAi?: boolean;
}) {
  const [job, profile, defaults] = await Promise.all([
    prisma.jobLink.findUnique({ where: { id: input.jobLinkId } }),
    prisma.candidateProfile.findUnique({ where: { id: input.profileId } }),
    loadDefaults(),
  ]);
  if (!job) throw new Error("Job link not found");
  if (!profile) throw new Error("Profile not found");

  const memory = await prisma.questionMemory.findMany({ where: { profileId: profile.id } });
  const existing = await prisma.jobApplication.findFirst({
    where: { jobLinkId: job.id, profileId: profile.id },
    orderBy: { updatedAt: "desc" },
  });

  let plan = buildFillPlan({
    atsUrl: job.applyUrl || job.sourceUrl || "",
    jobLinkId: job.id,
    profileId: profile.id,
    company: job.company || "Company",
    title: job.title || "Role",
    description: job.description || "",
    applyUrl: job.applyUrl,
    vault: buildVault(profile as unknown as Record<string, unknown>, defaults),
    memory,
    applicationId: existing?.id ?? null,
  });

  if (input.useAi !== false) {
    const gaps = plan.fields.filter((field) => !field.value && (field.group === "screening" || field.inputHint === "textarea"));
    if (gaps.length) {
      const drafted = await draftScreeningAnswers({
        company: plan.company,
        title: plan.title,
        description: job.description || "",
        profile,
        questions: gaps.map((field) => ({ key: field.key, label: field.label })),
      });
      if (drafted.length) plan = applyAiAnswers(plan, drafted);
    }
  }

  const answersJson = JSON.stringify(answersFromPlan(plan));
  const metaJson = JSON.stringify({
    engine: plan.engine,
    ats: plan.ats,
    coverage: plan.coverage,
    fields: plan.fields,
  });

  const application = existing
    ? await prisma.jobApplication.update({
        where: { id: existing.id },
        data: {
          companyName: plan.company,
          jobRole: plan.title,
          jobDescription: job.description || existing.jobDescription,
          answersJson,
          generationStatus: "ready",
          source: existing.source || "auto",
          metaJson,
        },
      })
    : await prisma.jobApplication.create({
        data: {
          profileId: profile.id,
          createdById: input.userId,
          jobLinkId: job.id,
          companyName: plan.company,
          jobRole: plan.title,
          jobDescription: job.description || plan.title,
          answersJson,
          generationStatus: "ready",
          source: "auto",
          metaJson,
        },
      });

  return { ...plan, applicationId: application.id, description: job.description || "" };
}

export async function planPageFill(input: { profileId: number; userId: number; pageUrl: string }) {
  const hit = await lookupJobByUrl(input.pageUrl);
  if (hit.jobLinkId) {
    return planJobFill({
      jobLinkId: hit.jobLinkId,
      profileId: input.profileId,
      userId: input.userId,
      useAi: false,
    });
  }
  const [profile, defaults] = await Promise.all([
    prisma.candidateProfile.findUnique({ where: { id: input.profileId } }),
    loadDefaults(),
  ]);
  if (!profile) throw new Error("Profile not found");
  const memory = await prisma.questionMemory.findMany({ where: { profileId: profile.id } });
  const plan = buildFillPlan({
    atsUrl: input.pageUrl,
    jobLinkId: 0,
    profileId: profile.id,
    company: hit.company || "Company",
    title: hit.title || "Role",
    description: "",
    applyUrl: input.pageUrl,
    vault: buildVault(profile as unknown as Record<string, unknown>, defaults),
    memory,
  });
  return { ...plan, applicationId: null, description: "" };
}

export async function savePlanEdits(input: {
  applicationId: number;
  profileId: number;
  fields: FillPlan["fields"];
}) {
  const answersJson = JSON.stringify(
    input.fields.filter((field) => field.value).map((field) => ({
      label: field.label,
      answer: field.value,
      source: field.source,
      key: field.key,
    })),
  );
  const application = await prisma.jobApplication.update({
    where: { id: input.applicationId },
    data: { answersJson, metaJson: JSON.stringify({ engine: "lumi-fill-v1", fields: input.fields }) },
  });

  for (const field of input.fields) {
    if (!field.value || (field.source !== "memory" && field.group !== "screening")) continue;
    const existing = await prisma.questionMemory.findFirst({
      where: { profileId: input.profileId, questionLabel: field.label },
    });
    if (existing) {
      await prisma.questionMemory.update({ where: { id: existing.id }, data: { answer: field.value } });
    } else {
      await prisma.questionMemory.create({
        data: { profileId: input.profileId, questionLabel: field.label, answer: field.value },
      });
    }
  }
  return application;
}

export async function answerLiveFields(input: {
  profileId: number;
  company: string;
  title: string;
  description: string;
  fields: LiveField[];
}) {
  if (!input.fields.length) return [] as Array<{ id: string; label: string; answer: string }>;
  const profile = await prisma.candidateProfile.findUnique({ where: { id: input.profileId } });
  if (!profile) return [];
  const memory = await prisma.questionMemory.findMany({ where: { profileId: profile.id } });
  const remembered = new Map(memory.map((row) => [row.questionLabel.trim().toLowerCase(), row.answer]));

  const ready: Array<{ id: string; label: string; answer: string }> = [];
  const pending: LiveField[] = [];
  for (const field of input.fields) {
    const saved = remembered.get(field.label.trim().toLowerCase());
    if (saved) ready.push({ id: field.id, label: field.label, answer: saved });
    else pending.push(field);
  }

  if (pending.length) {
    const drafted = await askGroq(
      {
        candidate: `${profile.firstName} ${profile.lastName}`.trim(),
        years: profile.yearsOfExperience || "",
        city: [profile.city, profile.state, profile.country].filter(Boolean).join(", "),
        summary: (profile.resumePrompt || "").slice(0, 700),
        experience: (profile.workExperience || "").slice(0, 2200),
        education: (profile.education || "").slice(0, 800),
        locked: [
          profile.workAuthorization && `Authorized to work: ${profile.workAuthorization}`,
          profile.requiresSponsorship && `Needs sponsorship: ${profile.requiresSponsorship}`,
          profile.gender && `Gender: ${profile.gender}`,
          profile.disabilityStatus && `Disability: ${profile.disabilityStatus}`,
          profile.veteranStatus && `Veteran: ${profile.veteranStatus}`,
          profile.hispanicLatino && `Hispanic or Latino: ${profile.hispanicLatino}`,
          profile.raceEthnicity && `Race: ${profile.raceEthnicity}`,
          profile.willingToRelocate && `Willing to relocate: ${profile.willingToRelocate}`,
          profile.salaryRange && `Salary: ${profile.salaryRange}`,
        ].filter(Boolean).join("\n"),
        company: input.company,
        title: input.title,
        job: input.description.slice(0, 1600),
      },
      pending.map((field) => ({ id: field.id, label: field.label, options: field.options })),
    );
    for (const row of drafted) {
      const field = pending.find((item) => item.id === row.id);
      if (!field) continue;
      ready.push({ id: row.id, label: field.label, answer: row.answer });
      await rememberAnswer(profile.id, field.label, row.answer);
    }
  }
  return ready;
}

export async function rememberAnswer(profileId: number, questionLabel: string, answer: string) {
  const existing = await prisma.questionMemory.findFirst({ where: { profileId, questionLabel } });
  if (existing) {
    return prisma.questionMemory.update({ where: { id: existing.id }, data: { answer } });
  }
  return prisma.questionMemory.create({ data: { profileId, questionLabel, answer } });
}
