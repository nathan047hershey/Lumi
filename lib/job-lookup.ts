import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";

export type JobLookup = {
  found: boolean;
  jobLinkId: number | null;
  applicationId: number | null;
  company: string;
  title: string;
  description: string;
  status: string;
  profileName: string;
  applyUrl: string;
  message: string;
};

function parsed(raw: string) {
  const trimmed = raw.trim();
  try {
    const url = new URL(trimmed);
    const parts = url.pathname.split("/").filter(Boolean);
    const tail = parts[parts.length - 1] || "";
    const normalized = `${url.origin}${url.pathname}`.replace(/\/+$/, "");
    let company = "";
    const host = url.hostname.toLowerCase();
    if (host.endsWith("greenhouse.io")) {
      company = host.startsWith("boards.") || host.startsWith("job-boards.") ? parts[0] || "" : host.split(".")[0];
    } else if (host.endsWith("lever.co") || host.endsWith("ashbyhq.com")) {
      company = parts[0] || "";
    }
    company = company.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
    return { raw: trimmed, host, tail, normalized, company };
  } catch {
    return { raw: trimmed, host: "", tail: "", normalized: trimmed, company: "" };
  }
}

export async function lookupJobByUrl(rawUrl: string): Promise<JobLookup> {
  const url = parsed(rawUrl);
  const empty: JobLookup = {
    found: false,
    jobLinkId: null,
    applicationId: null,
    company: url.company,
    title: "",
    description: "",
    status: "",
    profileName: "",
    applyUrl: url.raw,
    message: url.raw ? "No saved job for that URL. Company was guessed from the link." : "Paste a job URL first.",
  };
  if (!url.raw) return empty;

  const or: Prisma.JobLinkWhereInput[] = [
    { applyUrl: url.raw },
    { applyUrl: url.normalized },
    { sourceUrl: url.raw },
    { sourceUrl: url.normalized },
  ];
  if (url.tail.length >= 8) {
    or.push({ applyUrl: { contains: url.tail } }, { sourceUrl: { contains: url.tail } });
  }

  const links = await prisma.jobLink.findMany({
    where: { OR: or },
    include: {
      applications: {
        orderBy: { updatedAt: "desc" },
        take: 1,
        include: { profile: true },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 8,
  });

  const link = links.find((row) => {
    const hay = `${row.applyUrl} ${row.sourceUrl || ""}`.toLowerCase();
    return !url.host || hay.includes(url.host);
  }) || links[0];

  if (!link) {
    return { ...empty, message: url.company ? `No saved job. Guessed company “${url.company}”.` : "No saved job for that URL." };
  }

  const application = link.applications[0];
  const profileName = application ? `${application.profile.firstName} ${application.profile.lastName}`.trim() : "";
  return {
    found: true,
    jobLinkId: link.id,
    applicationId: application?.id ?? null,
    company: link.company || url.company,
    title: link.title || "",
    description: link.description || application?.jobDescription || "",
    status: application?.status || "",
    profileName,
    applyUrl: link.applyUrl,
    message: application
      ? `Matched application #${application.id}${profileName ? ` · ${profileName}` : ""} · ${application.status}`
      : `Matched job link #${link.id}`,
  };
}
