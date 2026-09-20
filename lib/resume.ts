import { chatJson } from "./ai-answer";
import { prisma } from "./prisma";

type ProfileLite = {
  firstName: string;
  lastName: string;
  middleName?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  country?: string | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  workExperience?: string | null;
  education?: string | null;
  resumePrompt?: string | null;
  yearsOfExperience?: string | null;
};

export function renderResumeMarkdown(
  profile: ProfileLite,
  job: { companyName: string; jobRole?: string | null; jobDescription: string },
) {
  const name = [profile.firstName, profile.middleName, profile.lastName].filter(Boolean).join(" ");
  const place = [profile.city, profile.country].filter(Boolean).join(", ");
  return [
    `# ${name}`,
    job.jobRole ? `**${job.jobRole}** — ${job.companyName}` : `**${job.companyName}**`,
    "",
    [profile.email, profile.phone, place].filter(Boolean).join(" · "),
    [profile.linkedinUrl, profile.githubUrl].filter(Boolean).join(" · "),
    "",
    "## Summary",
    profile.resumePrompt?.trim() ||
      `Operator-ready candidate with ${profile.yearsOfExperience || "several"} years of experience, tailored for ${job.companyName}.`,
    "",
    "## Experience",
    profile.workExperience?.trim() || "Experience to be completed.",
    "",
    "## Education",
    profile.education?.trim() || "Education to be completed.",
    "",
    "## Role fit",
    job.jobDescription.slice(0, 800),
  ].join("\n");
}

export async function draftCv(profile: ProfileLite & {
  workAuthorization?: string | null;
  requiresSponsorship?: string | null;
  techstacks?: Array<{ techstack: string }>;
}, job: { companyName: string; jobRole?: string | null; jobDescription: string }) {
  const fallback = renderResumeMarkdown(profile, job);
  const drafted = await chatJson<{
    resumeMarkdown?: string;
    coverLetter?: string;
    answers?: Array<{ label: string; answer: string }>;
  }>(
    "You write a tailored resume and cover letter. Reply with JSON {\"resumeMarkdown\":\"\",\"coverLetter\":\"\",\"answers\":[{\"label\":\"\",\"answer\":\"\"}]}. Use only employers, schools, dates, and skills present in the profile. Never invent companies or degrees. Keep contact details exactly as given. Resume markdown uses # Name, ## Summary, ## Experience, ## Education, ## Skills. Answers are short application replies for this job.",
    JSON.stringify({
      name: [profile.firstName, profile.middleName, profile.lastName].filter(Boolean).join(" "),
      email: profile.email,
      phone: profile.phone,
      city: profile.city,
      country: profile.country,
      linkedin: profile.linkedinUrl,
      github: profile.githubUrl,
      years: profile.yearsOfExperience,
      skills: profile.techstacks?.map((row) => row.techstack) || [],
      summary: (profile.resumePrompt || "").slice(0, 800),
      experience: (profile.workExperience || "").slice(0, 3500),
      education: (profile.education || "").slice(0, 1200),
      workAuthorization: profile.workAuthorization,
      sponsorship: profile.requiresSponsorship,
      company: job.companyName,
      role: job.jobRole,
      jobDescription: job.jobDescription.slice(0, 2500),
    }),
    45000,
  );
  const markdown = drafted?.resumeMarkdown?.trim();
  const cover = drafted?.coverLetter?.trim();
  const answers = (drafted?.answers || []).filter((row) => row.label && row.answer);
  return {
    markdown: markdown
      ? `${markdown}${cover ? `\n\n## Cover letter\n\n${cover}` : ""}`
      : fallback,
    answers: answers.length
      ? answers
      : [
          { label: "Why this role?", answer: `I want to help ${job.companyName} ship ${job.jobRole || "this role"}.` },
          { label: "Work authorization", answer: profile.workAuthorization || "See profile" },
          { label: "Sponsorship", answer: profile.requiresSponsorship || "No" },
        ],
    usedApi: Boolean(markdown),
  };
}

export async function generateApplicationPackage(input: {
  profileId: number;
  createdById?: number;
  jobLinkId?: number;
  companyName: string;
  jobRole?: string;
  jobDescription: string;
}) {
  const profile = await prisma.candidateProfile.findUnique({
    where: { id: input.profileId },
    include: { techstacks: true },
  });
  if (!profile) throw new Error("Profile not found");

  const drafted = await draftCv(profile, input);
  const markdown = drafted.markdown;
  const answers = drafted.answers;

  const application = await prisma.jobApplication.create({
    data: {
      profileId: profile.id,
      createdById: input.createdById,
      jobLinkId: input.jobLinkId,
      companyName: input.companyName,
      jobRole: input.jobRole,
      jobDescription: input.jobDescription,
      coreSkills: profile.techstacks.map((t) => t.techstack).join(", "),
      resumeMarkdown: markdown,
      answersJson: JSON.stringify(answers),
      generationStatus: "ready",
      source: "user",
    },
  });

  if (input.createdById) {
    await prisma.bidCourse.create({
      data: {
        applicationId: application.id,
        profileId: profile.id,
        userId: input.createdById,
        jobUrl: undefined,
        companyName: input.companyName,
        jobRole: input.jobRole,
        outcome: "unknown",
        answersJson: JSON.stringify(answers),
        events: {
          create: { eventType: "generated", metaJson: JSON.stringify({ applicationId: application.id }) },
        },
      },
    });
  }

  return application;
}
