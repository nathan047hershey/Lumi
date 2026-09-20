import { PrismaClient, Role, Techstack } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const password = (plain: string) => bcrypt.hashSync(plain, 10);

  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      passwordHash: password("LumiAdmin!26"),
      role: Role.admin,
    },
  });

  const bidder = await prisma.user.upsert({
    where: { username: "bidder" },
    update: {},
    create: {
      username: "bidder",
      passwordHash: password("LumiBidder!26"),
      role: Role.user,
    },
  });

  await prisma.user.upsert({
    where: { username: "manager" },
    update: {},
    create: {
      username: "manager",
      passwordHash: password("LumiManager!26"),
      role: Role.manager,
    },
  });

  const caller = await prisma.user.upsert({
    where: { username: "caller" },
    update: {},
    create: {
      username: "caller",
      passwordHash: password("LumiCaller!26"),
      role: Role.caller,
    },
  });

  const developer = await prisma.user.upsert({
    where: { username: "developer" },
    update: {},
    create: {
      username: "developer",
      passwordHash: password("LumiDev!26"),
      role: Role.developer,
    },
  });

  await prisma.appSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, aiProvider: "groq", aiModel: "llama-3.3-70b-versatile" },
  });

  await prisma.resumeTemplate.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: "Signal compact",
      description: "Default navy board skin",
      kind: "admin",
      styleSpec: JSON.stringify({ font: "Karla", accent: "navy", density: "compact" }),
      isDefault: true,
    },
  });

  const profile = await prisma.candidateProfile.upsert({
    where: { id: 1 },
    update: {},
    create: {
      firstName: "Ava",
      lastName: "Moreau",
      email: "ava.moreau@example.com",
      phone: "+1 415 555 0148",
      city: "Austin",
      state: "TX",
      country: "United States",
      linkedinUrl: "https://linkedin.com/in/avamoreau",
      githubUrl: "https://github.com/avamoreau",
      salaryRange: "160k–185k",
      locationFlag: "US",
      yearsOfExperience: "8",
      educationLevel: "Bachelor",
      workAuthorization: "US Citizen",
      requiresSponsorship: "No",
      workExperience:
        "Staff frontend engineer at Relic (2021–now). Previously senior engineer at Northline. Built design systems, hiring platforms, and ATS integrations.",
      education: "B.S. Computer Science, UT Austin",
      resumePrompt: "Keep the voice precise and warm. Lead with shipping speed and taste.",
    },
  });

  await prisma.profileTechstack.upsert({
    where: { profileId_techstack: { profileId: profile.id, techstack: Techstack.frontend } },
    update: {},
    create: { profileId: profile.id, techstack: Techstack.frontend },
  });
  await prisma.profileTechstack.upsert({
    where: { profileId_techstack: { profileId: profile.id, techstack: Techstack.nodejs } },
    update: {},
    create: { profileId: profile.id, techstack: Techstack.nodejs },
  });

  await prisma.assignment.upsert({
    where: { userId_profileId: { userId: bidder.id, profileId: profile.id } },
    update: { isDefault: true },
    create: { userId: bidder.id, profileId: profile.id, isDefault: true },
  });

  const job = await prisma.jobLink.upsert({
    where: { applyUrl: "https://jobs.example.com/apply/lumi-staff-frontend" },
    update: {},
    create: {
      sourceUrl: "https://jobs.example.com/lumi-staff-frontend",
      applyUrl: "https://jobs.example.com/apply/lumi-staff-frontend",
      company: "Northline",
      title: "Staff Frontend Engineer",
      description:
        "Northline is hiring a staff frontend engineer to lead the candidate desk. React, TypeScript, and taste required. Remote US.",
      techstack: Techstack.frontend,
      locationFlag: "US",
      fetchStatus: "success",
    },
  });

  const application = await prisma.jobApplication.upsert({
    where: { id: 1 },
    update: {},
    create: {
      profileId: profile.id,
      createdById: bidder.id,
      jobLinkId: job.id,
      companyName: "Northline",
      jobRole: "Staff Frontend Engineer",
      jobDescription: job.description || "",
      coreSkills: "React, TypeScript, design systems",
      status: "pending",
      source: "user",
      generationStatus: "ready",
      resumeMarkdown:
        "# Ava Moreau\nStaff Frontend Engineer\n\n## Summary\nEight years shipping hiring products and design systems.\n",
    },
  });

  await prisma.bidCourse.upsert({
    where: { applicationId: application.id },
    update: {},
    create: {
      applicationId: application.id,
      profileId: profile.id,
      userId: bidder.id,
      jobUrl: job.applyUrl,
      companyName: "Northline",
      jobRole: "Staff Frontend Engineer",
      outcome: "unknown",
      events: { create: { eventType: "created", metaJson: "{\"source\":\"seed\"}" } },
    },
  });

  await prisma.callerProfile.upsert({
    where: { userId: caller.id },
    update: {},
    create: {
      userId: caller.id,
      profileInfo: "Interview desk for US frontend and Node roles.",
      yearsOfExperience: "6",
      mainTechStack: "frontend",
      availability: "Weekdays 10–6 CT",
      location: "Austin, TX",
      email: "caller@lumi.local",
    },
  });

  await prisma.developerProfile.upsert({
    where: { userId: developer.id },
    update: {},
    create: {
      userId: developer.id,
      technicalSkills: "TypeScript, Next.js, Prisma",
      availability: "Evenings CT",
      contactEmail: "dev@lumi.local",
      contactTelegram: "@lumi-dev",
    },
  });

  await prisma.mailbox.upsert({
    where: { userId: bidder.id },
    update: {},
    create: {
      userId: bidder.id,
      provider: "demo",
      email: "ava.moreau@inbox.lumi",
      status: "connected",
      messages: {
        create: {
          fromAddr: "noreply@greenhouse.io",
          subject: "Your Northline verification code",
          snippet: "Enter 482193 to continue your application.",
          otpCode: "482193",
        },
      },
    },
  });

  console.log("Seeded Lumi desk", { admin: admin.username, bidder: bidder.username });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
