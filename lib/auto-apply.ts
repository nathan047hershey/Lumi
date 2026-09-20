import { prisma } from "./prisma";
import { scrapeJobPage } from "./scrape";
import { generateApplicationPackage, draftCv } from "./resume";

export async function scrapeJobLink(id: number) {
  const link = await prisma.jobLink.findUnique({ where: { id } });
  if (!link) return null;
  await prisma.jobLink.update({
    where: { id },
    data: { fetchStatus: "fetching" },
  });
  const url = link.sourceUrl || link.applyUrl;
  try {
    const scraped = await scrapeJobPage(url);
    const available = scraped.fetchStatus === "success" && !scraped.clearance;
    const next = await prisma.jobLink.update({
      where: { id },
      data: {
        title: scraped.title || link.title,
        company: scraped.company || link.company,
        description: scraped.description,
        fetchStatus: scraped.fetchStatus,
        fetchError: scraped.fetchError || null,
        lastFetchedAt: new Date(),
        isAvailable: available,
        metaJson: JSON.stringify({
          clearance: scraped.clearance || null,
          scrapedAt: new Date().toISOString(),
        }),
      },
    });
    if (next.fetchStatus === "success" && next.isAvailable) {
      await matchJobLink(next.id);
    }
    return next;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fetch failed";
    return prisma.jobLink.update({
      where: { id },
      data: {
        fetchStatus: "failed",
        fetchError: message.slice(0, 500),
        lastFetchedAt: new Date(),
      },
    });
  }
}

export async function scrapePending(limit = 3) {
  const due = await prisma.jobLink.findMany({
    where: { fetchStatus: { in: ["pending", "failed"] } },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });
  const results = [];
  for (const row of due) {
    results.push(await scrapeJobLink(row.id));
  }
  return results;
}

function scoreProfile(
  profile: { locationFlag: string; workExperience: string | null },
  job: { locationFlag: string; description: string | null; techstack: string },
) {
  let score = 0.7;
  if (profile.locationFlag === job.locationFlag) score += 1;
  const exp = (profile.workExperience || "").toLowerCase();
  const jd = (job.description || "").toLowerCase();
  const tokens = job.techstack.split(/[^a-z]+/).filter((t) => t.length > 2);
  if (tokens.some((token) => exp.includes(token) || jd.includes(token))) score += 0.3;
  return score;
}

export async function matchJobLink(jobLinkId: number) {
  const job = await prisma.jobLink.findUnique({
    where: { id: jobLinkId },
    include: { applications: true },
  });
  if (!job || job.fetchStatus !== "success" || !job.isAvailable || !job.description) return [];

  const profiles = await prisma.candidateProfile.findMany({
    include: { techstacks: true },
  });
  const existing = new Set(job.applications.map((app) => app.profileId));
  const ranked = profiles
    .filter((profile) => profile.techstacks.some((row) => row.techstack === job.techstack))
    .filter((profile) => !existing.has(profile.id))
    .map((profile) => ({ profile, score: scoreProfile(profile, job) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const created = [];
  for (const { profile, score } of ranked) {
    const application = await prisma.jobApplication.create({
      data: {
        profileId: profile.id,
        jobLinkId: job.id,
        companyName: job.company || "Unknown",
        jobRole: job.title,
        jobDescription: job.description || "",
        coreSkills: profile.techstacks.map((row) => row.techstack).join(", "),
        source: "auto",
        generationStatus: "pending",
        metaJson: JSON.stringify({ matchScore: score }),
      },
    });
    created.push(application);
  }
  return created;
}

export async function matchSuccessJobs(limit = 8) {
  const jobs = await prisma.jobLink.findMany({
    where: { fetchStatus: "success", isAvailable: true },
    include: { applications: true },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
  const created = [];
  for (const job of jobs) {
    created.push(...(await matchJobLink(job.id)));
  }
  return created;
}

export async function generatePendingApps(limit = 2) {
  const pending = await prisma.jobApplication.findMany({
    where: { generationStatus: "pending", source: "auto" },
    include: { profile: { include: { techstacks: true } }, jobLink: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  const ready = [];
  for (const app of pending) {
    await prisma.jobApplication.update({
      where: { id: app.id },
      data: { generationStatus: "generating" },
    });
    try {
      const job = {
        companyName: app.companyName,
        jobRole: app.jobRole,
        jobDescription: app.jobDescription,
      };
      const drafted = await draftCv(app.profile, job);
      await prisma.jobApplication.update({
        where: { id: app.id },
        data: {
          resumeMarkdown: drafted.markdown,
          answersJson: JSON.stringify(drafted.answers),
          generationStatus: "ready",
          generationError: null,
        },
      });
      ready.push(app.id);
    } catch (error) {
      await prisma.jobApplication.update({
        where: { id: app.id },
        data: {
          generationStatus: "failed",
          generationError: error instanceof Error ? error.message : "Generate failed",
        },
      });
    }
  }
  return ready;
}

export async function runTick() {
  const scraped = await scrapePending(4);
  const matched = await matchSuccessJobs(10);
  const generated = await generatePendingApps(4);
  return {
    scraped: scraped.length,
    matched: matched.length,
    generated: generated.length,
    at: new Date().toISOString(),
  };
}

export async function enqueueManualGenerate(input: Parameters<typeof generateApplicationPackage>[0]) {
  return generateApplicationPackage(input);
}
