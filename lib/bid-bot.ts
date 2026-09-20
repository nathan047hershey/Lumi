import { markApplicationApplied } from "./bidder";
import { collectLiveFields, fillCombos, fillDom, fillMarked, pageFillInputs, type FillField, type PageFillInput } from "./fill-engine";
import { answerLiveFields, planJobFill } from "./fill-plan";
import { prisma } from "./prisma";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type BotJobStatus =
  | "queued"
  | "mapping"
  | "opening"
  | "filling"
  | "waiting"
  | "filled"
  | "applied"
  | "failed"
  | "skipped";

export type BotJob = {
  jobLinkId: number;
  company: string;
  title: string;
  applyUrl: string;
  status: BotJobStatus;
  note: string;
  pageFilled: number;
  pageTotal: number;
};

export type BotSnapshot = {
  running: boolean;
  paused: boolean;
  submit: boolean;
  profileId: number | null;
  index: number;
  message: string;
  log: string[];
  jobs: BotJob[];
  fields: FillField[];
  ats: string;
  coverage: number;
  applicationId: number | null;
};

type HoldAction = "next" | "stop" | "skip";

type BotRuntime = BotSnapshot & {
  userId: number;
  stop: boolean;
  browser: { close: () => Promise<void> } | null;
  hold: ((action: HoldAction) => void) | null;
};

function fresh(): BotRuntime {
  return {
    running: false,
    paused: false,
    submit: false,
    profileId: null,
    userId: 0,
    index: -1,
    message: "Idle",
    log: [],
    jobs: [],
    fields: [],
    ats: "",
    coverage: 0,
    applicationId: null,
    stop: false,
    browser: null,
    hold: null,
  };
}

function slot() {
  const g = globalThis as typeof globalThis & { __lumiBidBot?: BotRuntime };
  if (!g.__lumiBidBot) g.__lumiBidBot = fresh();
  return g.__lumiBidBot;
}

function log(state: BotRuntime, line: string) {
  state.log = [`${new Date().toLocaleTimeString("en-US", { hour12: false })}  ${line}`, ...state.log].slice(0, 24);
  state.message = line;
}

export function botSnapshot(): BotSnapshot {
  const state = slot();
  return {
    running: state.running,
    paused: state.paused,
    submit: state.submit,
    profileId: state.profileId,
    index: state.index,
    message: state.message,
    log: state.log,
    jobs: state.jobs,
    fields: state.fields,
    ats: state.ats,
    coverage: state.coverage,
    applicationId: state.applicationId,
  };
}

function release(action: HoldAction) {
  const state = slot();
  state.hold?.(action);
  state.hold = null;
}

export function controlBot(action: "pause" | "resume" | "stop" | "next" | "skip") {
  const state = slot();
  if (action === "pause") state.paused = true;
  if (action === "resume") state.paused = false;
  if (action === "stop") {
    state.stop = true;
    state.paused = false;
    release("stop");
  }
  if (action === "next") release("next");
  if (action === "skip") release("skip");
  return botSnapshot();
}

export function startBot(input: {
  userId: number;
  profileId: number;
  submit: boolean;
  jobs: Array<{ jobLinkId: number; company: string; title: string; applyUrl: string }>;
}) {
  const state = slot();
  if (state.running) return botSnapshot();
  void state.browser?.close().catch(() => undefined);
  Object.assign(state, fresh(), {
    running: true,
    submit: input.submit,
    profileId: input.profileId,
    userId: input.userId,
    jobs: input.jobs.slice(0, 8).map((job) => ({
      ...job,
      status: "queued" as const,
      note: "",
      pageFilled: 0,
      pageTotal: 0,
    })),
  });
  log(state, input.submit ? "Bot started. It will fill and submit." : "Bot started. It fills, then waits for you.");
  void runBot();
  return botSnapshot();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitWhilePaused(state: BotRuntime) {
  while (state.paused && !state.stop) await sleep(300);
}

function waitForPerson(state: BotRuntime) {
  return new Promise<HoldAction>((resolve) => {
    state.hold = resolve;
  });
}

async function openApplyIfNeeded(page: import("playwright").Page) {
  const form = page.locator("#first_name, #email, input[type='email'], input[name*='first_name']");
  if (await form.count()) return;
  const apply = page.getByRole("link", { name: /^apply/i }).or(page.getByRole("button", { name: /^apply/i })).first();
  if (await apply.count()) {
    await apply.click({ timeout: 4000 }).catch(() => undefined);
    await page.waitForTimeout(1500);
  }
}

async function dismissCookies(page: import("playwright").Page) {
  const known = page.locator("#onetrust-accept-btn-handler, button[aria-label='Accept cookies'], button[id*='cookie-accept']").first();
  if (await known.count()) await known.click({ timeout: 1500 }).catch(() => undefined);
}

async function fillEveryFrame(
  page: import("playwright").Page,
  fn: typeof fillDom,
  fields: PageFillInput[],
) {
  let filled = 0;
  let total = 0;
  const missing: string[] = [];
  for (const frame of page.frames()) {
    const result = await frame.evaluate(fn, fields).catch(() => null);
    if (!result) continue;
    filled += result.filled;
    total = Math.max(total, result.total);
    missing.push(...result.missing);
  }
  return { filled, total, missing };
}

async function answerEveryFrame(
  page: import("playwright").Page,
  state: BotRuntime,
  job: BotJob,
  plan: { company: string; title: string; description?: string },
) {
  let apiFilled = 0;
  let apiAsked = 0;
  for (const frame of page.frames()) {
    const live = await frame.evaluate(collectLiveFields).catch(() => []);
    if (!live.length) continue;
    apiAsked += live.length;
    log(state, `Asking API for ${live.length} open question${live.length === 1 ? "" : "s"} on ${job.company}`);
    const answers = await answerLiveFields({
      profileId: state.profileId || 0,
      company: plan.company,
      title: plan.title,
      description: plan.description || "",
      fields: live,
    });
    if (!answers.length) continue;
    const api = await frame.evaluate(fillMarked, answers.map((row) => ({ id: row.id, answer: row.answer }))).catch(() => null);
    apiFilled += api?.filled || 0;
    log(state, `API filled ${api?.filled || 0} of ${live.length}`);
  }
  return { apiFilled, apiAsked };
}

async function clickCombos(page: import("playwright").Page, fields: PageFillInput[]) {
  let filled = 0;
  const payload = fields.map((field) => ({ label: field.label, value: field.value, aliases: field.aliases }));
  for (const frame of page.frames()) {
    const result = await frame.evaluate(fillCombos, payload).catch(() => null);
    filled += result?.filled || 0;
  }
  return filled;
}

async function attachResume(page: import("playwright").Page, markdown: string, company: string) {
  const text = markdown.trim();
  if (!text) return 0;
  const dir = join(tmpdir(), "lumi-resumes");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${company.replace(/[^\w]+/g, "-").slice(0, 40) || "resume"}.txt`);
  writeFileSync(file, text, "utf8");
  let attached = 0;
  for (const frame of page.frames()) {
    const inputs = frame.locator("input[type='file']");
    const count = await inputs.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      const ok = await inputs.nth(index).setInputFiles(file).then(() => true).catch(() => false);
      if (ok) attached += 1;
    }
  }
  return attached;
}

async function clickSubmit(page: import("playwright").Page) {
  const button = page.getByRole("button", { name: /submit application/i }).first();
  if (await button.count()) {
    await button.click({ timeout: 5000 });
    return true;
  }
  const input = page.locator("input[type='submit'][value*='Submit']").first();
  if (await input.count()) {
    await input.click({ timeout: 5000 });
    return true;
  }
  return false;
}

async function runBot() {
  const state = slot();
  let browser: import("playwright").Browser | null = null;
  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch({ channel: "chrome", headless: false });
    state.browser = browser;
    const page = await browser.newPage();
    for (let index = 0; index < state.jobs.length; index += 1) {
      if (state.stop) break;
      await waitWhilePaused(state);
      if (state.stop) break;
      state.index = index;
      const job = state.jobs[index];
      job.status = "mapping";
      log(state, `Mapping ${job.company}`);
      let plan;
      try {
        plan = await planJobFill({
          jobLinkId: job.jobLinkId,
          profileId: state.profileId || 0,
          userId: state.userId,
          useAi: false,
        });
      } catch (error) {
        job.status = "failed";
        job.note = error instanceof Error ? error.message : "Could not map this job";
        log(state, job.note);
        continue;
      }
      state.fields = plan.fields;
      state.ats = plan.ats.label;
      state.coverage = plan.coverage;
      state.applicationId = plan.applicationId;
      job.status = "opening";
      log(state, `Opening ${plan.ats.label} · ${job.company}`);
      try {
        await page.goto(plan.applyUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForSelector("input, textarea, select, [role='combobox']", { timeout: 8000 }).catch(() => undefined);
        await dismissCookies(page);
        await openApplyIfNeeded(page);
        await page.waitForTimeout(800);
        job.status = "filling";
        const inputs = pageFillInputs(plan);
        const result = await fillEveryFrame(page, fillDom, inputs);
        const combos = await clickCombos(page, inputs);
        let api = await answerEveryFrame(page, state, job, plan);
        await page.waitForTimeout(500);
        const second = await answerEveryFrame(page, state, job, plan);
        api = { apiFilled: api.apiFilled + second.apiFilled, apiAsked: api.apiAsked + second.apiAsked };
        const packet = plan.applicationId
          ? await prisma.jobApplication.findUnique({ where: { id: plan.applicationId }, select: { resumeMarkdown: true } })
          : null;
        const attached = await attachResume(page, packet?.resumeMarkdown || "", job.company);
        const advance = page.getByRole("button", { name: /^(next|continue)$/i }).first();
        if (await advance.count()) {
          await advance.click({ timeout: 3000 }).catch(() => undefined);
          await page.waitForTimeout(900);
          await fillEveryFrame(page, fillDom, inputs);
          await clickCombos(page, inputs);
        }
        job.pageFilled = result.filled + combos + api.apiFilled + attached;
        job.pageTotal = result.total + api.apiAsked;
        const parts = [`Vault ${result.filled}`, combos ? `menus ${combos}` : "", api.apiFilled ? `API ${api.apiFilled}` : "", attached ? `resume attached` : ""].filter(Boolean);
        job.note = parts.join(", ");
        log(state, `${job.company}: ${job.note}`);
        if (state.submit) {
          const clicked = await clickSubmit(page).catch(() => false);
          if (clicked && plan.applicationId) {
            await markApplicationApplied(plan.applicationId, state.userId);
            job.status = "applied";
            log(state, `Submitted ${job.company}`);
            await sleep(1200);
            continue;
          }
          log(state, `No submit button on ${job.company}. Waiting.`);
        }
        job.status = "waiting";
        log(state, `Filled ${job.company}. Submit in Chrome, then Next.`);
        const action = await waitForPerson(state);
        if (action === "stop" || state.stop) break;
        if (action === "skip") {
          job.status = "skipped";
          continue;
        }
        job.status = "filled";
      } catch (error) {
        job.status = "failed";
        job.note = error instanceof Error ? error.message : "Fill failed";
        log(state, `${job.company} failed: ${job.note}`);
      }
    }
    log(state, state.stop ? "Bot stopped. Chrome stays open." : "Queue done. Chrome stays open on the last form.");
  } catch (error) {
    log(state, error instanceof Error ? error.message : "Could not open Chrome");
  } finally {
    state.running = false;
    state.paused = false;
  }
}
