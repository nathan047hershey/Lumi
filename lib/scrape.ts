import * as cheerio from "cheerio";

export type ScrapeResult = {
  title: string | null;
  company: string | null;
  description: string;
  fetchStatus: "success" | "failed";
  fetchError?: string;
  clearance?: string | null;
};

const UA = "Mozilla/5.0 (compatible; LumiDesk/1.0; +https://lumi.local)";

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function detectClearance(text: string) {
  const match = text.match(/\b(ts\/sci|top secret|secret clearance|public trust|security clearance)\b/i);
  return match ? match[1] : null;
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": UA },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`API ${response.status}`);
  return response.json();
}

function parseGreenhouse(url: string) {
  const classic = url.match(/greenhouse\.io\/([^/?#]+)\/jobs\/(\d+)/i);
  if (classic && classic[1].toLowerCase() !== "embed") {
    return { board: classic[1], jobId: classic[2] };
  }
  try {
    const parsed = new URL(url);
    const board = parsed.searchParams.get("for") || parsed.searchParams.get("board");
    const jobId = parsed.searchParams.get("token") || parsed.searchParams.get("gh_jid") || parsed.searchParams.get("job_id");
    if (board && jobId) return { board, jobId: String(jobId).replace(/\D/g, "") };
  } catch {
    return null;
  }
  return null;
}

function parseLever(url: string) {
  const match = url.match(/jobs\.lever\.co\/([^/?#]+)\/([a-f0-9-]{8,})/i);
  return match ? { company: match[1], posting: match[2] } : null;
}

function parseAshby(url: string) {
  const match = url.match(/jobs\.ashbyhq\.com\/([^/?#]+)\/([a-f0-9-]{8,})/i);
  return match ? { org: match[1], jobId: match[2] } : null;
}

async function scrapeGreenhouse(board: string, jobId: string): Promise<ScrapeResult> {
  const data = await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${jobId}`);
  const description = stripHtml(String(data.content || data.description || ""));
  if (description.length < 40) throw new Error("Greenhouse description too short");
  return {
    title: data.title || null,
    company: data.company_name || board,
    description: description.slice(0, 12000),
    fetchStatus: "success",
    clearance: detectClearance(description),
  };
}

async function scrapeLever(company: string, posting: string): Promise<ScrapeResult> {
  const data = await fetchJson(`https://api.lever.co/v0/postings/${company}/${posting}`);
  const description = String(data.descriptionPlain || stripHtml(data.description || "") || data.text || "");
  if (description.length < 40) throw new Error("Lever description too short");
  return {
    title: data.text || data.title || null,
    company: company,
    description: description.slice(0, 12000),
    fetchStatus: "success",
    clearance: detectClearance(description),
  };
}

async function scrapeAshby(org: string, jobId: string): Promise<ScrapeResult> {
  const data = await fetchJson(`https://api.ashbyhq.com/posting-api/job-board/${org}`);
  const jobs = Array.isArray(data.jobs) ? data.jobs : [];
  const job = jobs.find((row: { id?: string }) => String(row.id) === jobId) || jobs[0];
  if (!job) throw new Error("Ashby job not found");
  const description = stripHtml(String(job.descriptionHtml || job.descriptionPlain || job.description || ""));
  return {
    title: job.title || null,
    company: org,
    description: description.slice(0, 12000) || "Description could not be extracted.",
    fetchStatus: description.length >= 40 ? "success" : "failed",
    clearance: detectClearance(description),
  };
}

async function scrapeHtml(url: string): Promise<ScrapeResult> {
  const response = await fetch(url, {
    headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
    cache: "no-store",
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`Fetch failed (${response.status})`);
  const html = await response.text();
  const $ = cheerio.load(html);
  $("script, style, nav, footer").remove();
  const jsonLd = $('script[type="application/ld+json"]')
    .toArray()
    .map((node) => {
      try {
        return JSON.parse($(node).text());
      } catch {
        return null;
      }
    })
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .find((value) => value && (value["@type"] === "JobPosting" || value.jobTitle));

  const title =
    jsonLd?.title ||
    jsonLd?.jobTitle ||
    $('meta[property="og:title"]').attr("content") ||
    $("h1").first().text().trim() ||
    $("title").text().trim() ||
    null;
  const company =
    jsonLd?.hiringOrganization?.name ||
    $('meta[property="og:site_name"]').attr("content") ||
    null;
  const description = stripHtml(
    jsonLd?.description ||
      $('[class*="job-description"], [class*="description"], main, article').first().html() ||
      $("main").text() ||
      $("body").text(),
  ).slice(0, 12000);

  if (description.length < 40) {
    return {
      title,
      company,
      description: description || "Description could not be extracted.",
      fetchStatus: "failed",
      fetchError: "Page did not return a usable job description",
    };
  }
  return {
    title: title?.slice(0, 180) || null,
    company: company?.slice(0, 120) || null,
    description,
    fetchStatus: "success",
    clearance: detectClearance(description),
  };
}

export async function scrapeJobPage(url: string): Promise<ScrapeResult> {
  const greenhouse = parseGreenhouse(url);
  if (greenhouse) {
    try {
      return await scrapeGreenhouse(greenhouse.board, greenhouse.jobId);
    } catch {
      /* fall through */
    }
  }
  const lever = parseLever(url);
  if (lever) {
    try {
      return await scrapeLever(lever.company, lever.posting);
    } catch {
      /* fall through */
    }
  }
  const ashby = parseAshby(url);
  if (ashby) {
    try {
      return await scrapeAshby(ashby.org, ashby.jobId);
    } catch {
      /* fall through */
    }
  }
  return scrapeHtml(url);
}
