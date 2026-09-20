import { prisma } from "./prisma";
import { DEFAULT_AUTOFILL } from "./autofill";

type PacketProfile = {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  workAuthorization?: string | null;
  requiresSponsorship?: string | null;
  disabilityStatus?: string | null;
  veteranStatus?: string | null;
  willingToRelocate?: string | null;
  salaryRange?: string | null;
  yearsOfExperience?: string | null;
  resumePrompt?: string | null;
};

export function buildAnswerPacket(
  profile: PacketProfile,
  job: { companyName: string; jobRole?: string | null },
) {
  return [
    { label: "Full name", answer: `${profile.firstName} ${profile.lastName}`.trim() },
    { label: "Email", answer: profile.email || "" },
    { label: "Phone", answer: profile.phone || "" },
    { label: "City", answer: profile.city || "" },
    { label: "Work authorization", answer: profile.workAuthorization || DEFAULT_AUTOFILL.workAuthorization },
    { label: "Requires sponsorship", answer: profile.requiresSponsorship || DEFAULT_AUTOFILL.requiresSponsorship },
    { label: "Disability status", answer: profile.disabilityStatus || DEFAULT_AUTOFILL.disabilityStatus },
    { label: "Veteran status", answer: profile.veteranStatus || DEFAULT_AUTOFILL.veteranStatus },
    { label: "Willing to relocate", answer: profile.willingToRelocate || DEFAULT_AUTOFILL.willingToRelocate },
    { label: "Salary expectation", answer: profile.salaryRange || "" },
    { label: "Years of experience", answer: profile.yearsOfExperience || DEFAULT_AUTOFILL.yearsOfExperience },
    {
      label: "Why this role?",
      answer:
        profile.resumePrompt?.trim() ||
        `I want to help ${job.companyName} ship ${job.jobRole || "this role"} with the same rigor I bring to shipping products.`,
    },
  ];
}

export async function listReadyApplications(
  userId?: number,
  role?: string,
  jobLinkIds?: number[],
  lean = false,
) {
  const assigned =
    role === "user" && userId
      ? await prisma.assignment.findMany({ where: { userId }, select: { profileId: true } })
      : [];
  const profileIds = assigned.map((row) => row.profileId);
  const where = {
    generationStatus: "ready",
    status: "pending",
    ...(role === "user" && profileIds.length ? { profileId: { in: profileIds } } : {}),
    ...(jobLinkIds?.length ? { jobLinkId: { in: jobLinkIds } } : {}),
  };
  if (lean) {
    return prisma.jobApplication.findMany({
      where,
      select: {
        id: true,
        companyName: true,
        jobRole: true,
        answersJson: true,
        profile: { select: { firstName: true, lastName: true } },
        jobLink: { select: { id: true, applyUrl: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 80,
    });
  }
  return prisma.jobApplication.findMany({
    where,
    include: { profile: true, jobLink: true },
    orderBy: { updatedAt: "desc" },
    take: 40,
  });
}

export async function markApplicationApplied(applicationId: number, userId: number) {
  const application = await prisma.jobApplication.update({
    where: { id: applicationId },
    data: { status: "applied", state: "completed" },
    include: { jobLink: true },
  });
  const existing = await prisma.bidCourse.findUnique({ where: { applicationId } });
  if (existing) {
    await prisma.bidCourse.update({
      where: { applicationId },
      data: {
        outcome: "applied",
        appliedAt: new Date(),
        events: { create: { eventType: "applied", metaJson: JSON.stringify({ source: "desk" }) } },
      },
    });
  } else {
    await prisma.bidCourse.create({
      data: {
        applicationId,
        profileId: application.profileId,
        userId,
        jobUrl: application.jobLink?.applyUrl,
        companyName: application.companyName,
        jobRole: application.jobRole,
        outcome: "applied",
        appliedAt: new Date(),
        answersJson: application.answersJson,
        events: { create: { eventType: "applied", metaJson: JSON.stringify({ source: "desk" }) } },
      },
    });
  }
  return application;
}
