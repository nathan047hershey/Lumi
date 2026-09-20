"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Pause, Play, SkipForward, Square, X } from "lucide-react";
import { Badge, Button, cn } from "@/components/ui";
import type { FieldGroup, FieldSource, FillField } from "@/lib/fill-engine";
import { fullName } from "@/lib/format";

type ProfileOption = { id: number; firstName: string; lastName: string; middleName?: string | null };
type QueueJob = { id: number; company: string | null; title: string | null; applyUrl?: string };
type BotJob = {
  jobLinkId: number;
  company: string;
  title: string;
  applyUrl: string;
  status: string;
  note: string;
  pageFilled: number;
  pageTotal: number;
};
type BotState = {
  running: boolean;
  paused: boolean;
  submit: boolean;
  index: number;
  message: string;
  log: string[];
  jobs: BotJob[];
  fields: FillField[];
  ats: string;
  coverage: number;
  applicationId: number | null;
};

function askExtension(type: string, extra: Record<string, unknown> = {}, timeout = 2500) {
  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return new Promise<BotState>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("Load the Lumi extension, then reload this page."));
    }, timeout);
    function onMessage(event: MessageEvent) {
      const data = event.data;
      if (data?.type !== "JOB_APPLY_BIDDER_EXTENSION_REPLY" || data.requestId !== requestId) return;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      if (data.error && !data.jobs) reject(new Error(data.error));
      else resolve(data as BotState);
    }
    window.addEventListener("message", onMessage);
    window.postMessage({ type, requestId, ...extra }, "*");
  });
}

const EMPTY_BOT: BotState = {
  running: false,
  paused: false,
  submit: false,
  index: -1,
  message: "",
  log: [],
  jobs: [],
  fields: [],
  ats: "",
  coverage: 0,
  applicationId: null,
};

const GROUPS: Array<{ id: FieldGroup; label: string }> = [
  { id: "identity", label: "Identity" },
  { id: "links", label: "Links" },
  { id: "work", label: "Work" },
  { id: "education", label: "Education" },
  { id: "eeo", label: "EEO" },
  { id: "screening", label: "Screening" },
  { id: "files", label: "Files" },
];

const SOURCE: Record<FieldSource, { label: string; className: string }> = {
  vault: { label: "Vault", className: "border-copper/40 bg-copper/15 text-copper" },
  memory: { label: "Memory", className: "border-forest/40 bg-forest/15 text-forest" },
  default: { label: "Default", className: "border-white/10 bg-white/5 text-ink-soft" },
  ai: { label: "AI", className: "border-copper/25 bg-copper/10 text-copper-deep" },
  gap: { label: "Needs you", className: "border-[hsl(12_80%_50%/0.45)] bg-[hsl(12_80%_50%/0.12)] text-[hsl(12_80%_70%)]" },
};

const STATUS: Record<string, string> = {
  queued: "Queued",
  mapping: "Mapping",
  opening: "Opening",
  filling: "Filling",
  waiting: "Your turn",
  filled: "Filled",
  applied: "Applied",
  failed: "Failed",
  skipped: "Skipped",
};

function Coverage({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const dash = 2 * Math.PI * 18;
  return (
    <div className="relative h-14 w-14">
      <svg viewBox="0 0 44 44" className="h-14 w-14 -rotate-90">
        <circle cx="22" cy="22" r="18" fill="none" stroke="hsl(222 16% 20%)" strokeWidth="4" />
        <circle
          cx="22"
          cy="22"
          r="18"
          fill="none"
          stroke="hsl(199 95% 55%)"
          strokeWidth="4"
          strokeDasharray={`${dash * value} ${dash}`}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[11px] font-semibold">{pct}%</span>
    </div>
  );
}

export function FillCockpit({
  open,
  onClose,
  jobs,
}: {
  open: boolean;
  onClose: () => void;
  jobs: QueueJob[];
}) {
  const router = useRouter();
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [profileId, setProfileId] = useState<number | "">("");
  const [submit, setSubmit] = useState(false);
  const [bot, setBot] = useState<BotState>(EMPTY_BOT);
  const [fields, setFields] = useState<FillField[]>([]);
  const [note, setNote] = useState("");

  const sameQueue = bot.jobs.length > 0 && bot.jobs.every((row) => jobs.some((job) => job.id === row.jobLinkId));
  const queue = sameQueue
    ? bot.jobs
    : jobs.map((job) => ({
        jobLinkId: job.id,
        company: job.company || "Company",
        title: job.title || "Role",
        applyUrl: job.applyUrl || "",
        status: "queued",
        note: "",
        pageFilled: 0,
        pageTotal: 0,
      }));
  const active = sameQueue ? bot.jobs[bot.index] || null : null;

  useEffect(() => {
    if (!open) return;
    fetch("/api/profiles")
      .then((response) => response.json())
      .then((data) => {
        const list = (data.profiles || []) as ProfileOption[];
        setProfiles(list);
        setProfileId((current) => current || list[0]?.id || "");
      });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onMessage(event: MessageEvent) {
      const data = event.data;
      if (data?.type !== "JOB_APPLY_BIDDER_QUEUE_STATE" || !data.state) return;
      setBot(data.state);
    }
    window.addEventListener("message", onMessage);
    askExtension("JOB_APPLY_BIDDER_PING").then(setBot).catch(() => {
      setNote("Load the Lumi extension from the Extension page, then reload this desk.");
    });
    return () => window.removeEventListener("message", onMessage);
  }, [open]);

  async function command(action: string) {
    setNote("");
    const type = {
      start: "JOB_APPLY_BIDDER_PROCESS_QUEUE",
      pause: "JOB_APPLY_BIDDER_PAUSE",
      resume: "JOB_APPLY_BIDDER_RESUME",
      stop: "JOB_APPLY_BIDDER_STOP",
      next: "JOB_APPLY_BIDDER_NEXT",
      skip: "JOB_APPLY_BIDDER_SKIP",
    }[action];
    if (!type) return;
    try {
      const data = await askExtension(type, {
        profileId,
        submit,
        jobs: jobs.map((job) => ({
          id: job.id,
          company: job.company,
          title: job.title,
          applyUrl: job.applyUrl,
        })),
      });
      setBot(data);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Extension did not answer.");
    }
  }

  function patchField(key: string, value: string) {
    setFields((current) =>
      current.map((field) =>
        field.key === key ? { ...field, value, source: value ? "memory" : "gap", confidence: value ? 0.99 : 0 } : field,
      ),
    );
  }

  async function copyAnswers() {
    const text = fields.filter((field) => field.value).map((field) => `${field.label}: ${field.value}`).join("\n");
    await navigator.clipboard.writeText(text);
    setNote("Answer sheet copied.");
  }

  const grouped = useMemo(() => {
    return GROUPS.map((group) => ({ ...group, fields: fields.filter((field) => field.group === group.id) })).filter(
      (group) => group.fields.length,
    );
  }, [fields]);

  if (!open) return null;
  const waiting = active?.status === "waiting";

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center p-3 sm:p-5">
      <button type="button" className="absolute inset-0 bg-black/75 backdrop-blur-sm" aria-label="Close auto bid" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-6xl overflow-hidden rounded-[1.6rem] border border-white/[0.08] bg-[hsl(222_26%_8%)] shadow-[0_40px_90px_-28px_rgba(0,0,0,0.85)]">
        <aside className="hidden w-72 shrink-0 flex-col border-r border-white/[0.06] bg-black/20 md:flex">
          <div className="border-b border-white/[0.06] px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-copper">Auto bid</p>
            <p className="mt-1 text-sm text-ink-soft">{queue.length} in queue · Chrome on this PC</p>
          </div>
          <div className="min-h-0 flex-1 space-y-1 overflow-auto p-2">
            {queue.map((row) => (
              <div
                key={row.jobLinkId}
                className={cn(
                  "rounded-xl px-3 py-2.5",
                  row.jobLinkId === active?.jobLinkId ? "bg-copper/15 text-ink" : "text-ink-soft",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold">{row.company}</p>
                  <span className="text-[10px] uppercase tracking-wide text-copper">{STATUS[row.status] || row.status}</span>
                </div>
                <p className="truncate text-xs opacity-70">{row.title}</p>
                {row.note ? <p className="mt-1 line-clamp-2 text-[11px] opacity-70">{row.note}</p> : null}
              </div>
            ))}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] px-5 py-4">
            <div className="min-w-0 flex-1">
              <h2 className="display text-2xl font-semibold">
                {active ? `${active.company} — ${active.title}` : "Auto bid bot"}
              </h2>
              <p className="text-sm text-ink-soft">
                {bot.message || "Start the bot. The Lumi extension opens each apply page in Chrome and fills it."}
              </p>
            </div>
            {bot.coverage ? <Coverage value={bot.coverage} /> : null}
            <button type="button" onClick={onClose} className="rounded-lg p-2 text-white/50 hover:bg-white/5 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-5 py-3">
            <select
              className="h-10 min-w-48 rounded-xl border border-white/10 bg-black/30 px-3 text-sm"
              value={profileId}
              onChange={(event) => setProfileId(event.target.value ? Number(event.target.value) : "")}
              disabled={bot.running}
            >
              <option value="">Choose profile</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>{fullName(profile)}</option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm text-ink-soft">
              <input type="checkbox" checked={submit} onChange={(event) => setSubmit(event.target.checked)} disabled={bot.running} />
              Submit after fill
            </label>
            {bot.running ? (
              <>
                <Button type="button" variant="ghost" onClick={() => command(bot.paused ? "resume" : "pause")}>
                  <Pause className="h-4 w-4" />
                  {bot.paused ? "Resume" : "Pause"}
                </Button>
                <Button type="button" onClick={() => command("next")} disabled={!waiting && !bot.paused}>
                  <Play className="h-4 w-4" />
                  Next job
                </Button>
                <Button type="button" variant="ghost" onClick={() => command("skip")}>
                  <SkipForward className="h-4 w-4" />
                  Skip
                </Button>
                <Button type="button" variant="ghost" onClick={() => command("stop")}>
                  <Square className="h-4 w-4" />
                  Stop
                </Button>
              </>
            ) : (
              <Button type="button" onClick={() => command("start")} disabled={!profileId || jobs.length === 0}>
                <Play className="h-4 w-4" />
                Start bot
              </Button>
            )}
            {bot.ats ? <Badge tone="copper">{bot.ats}</Badge> : null}
            {active?.pageTotal ? <Badge>{active.pageFilled}/{active.pageTotal} on page</Badge> : null}
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
            {fields.length === 0 ? (
              <div className="grid h-full place-items-center text-center">
                <div className="max-w-md">
                  <p className="display text-xl font-semibold">Chrome fills the apply page</p>
                  <p className="mt-2 text-sm text-ink-soft">
                    Load the Lumi extension, pick a profile, and start. It opens the job in Chrome, fills name, email, and the locked answers, then asks the API for every question still open.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid gap-6">
                {grouped.map((group) => (
                  <section key={group.id}>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-soft">{group.label}</p>
                    <div className="grid gap-2">
                      {group.fields.map((field) => (
                        <FieldRow key={field.key} field={field} onChange={(value) => patchField(field.key, value)} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>

          <footer className="grid gap-2 border-t border-white/[0.06] px-5 py-3">
            {note ? <p className="text-sm text-ink-soft">{note}</p> : null}
            {bot.log[0] ? <p className="font-mono text-xs text-ink-soft">{bot.log[0]}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" type="button" onClick={copyAnswers} disabled={!fields.length}>
                <Copy className="h-4 w-4" />
                Copy answers
              </Button>
              <Button
                variant="ghost"
                type="button"
                disabled={!bot.applicationId}
                onClick={async () => {
                  await fetch("/api/bidder/process", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ applicationId: bot.applicationId }),
                  });
                  setNote("Marked applied.");
                  router.refresh();
                }}
              >
                <Check className="h-4 w-4" />
                Mark applied
              </Button>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

function FieldRow({ field, onChange }: { field: FillField; onChange: (value: string) => void }) {
  const look = SOURCE[field.source];
  const Control = field.inputHint === "textarea" ? "textarea" : "input";
  return (
    <label className="grid gap-1.5 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2.5 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)_88px] md:items-center">
      <span className="text-sm font-medium">
        {field.label}
        {field.required ? <span className="ml-1 text-copper">*</span> : null}
      </span>
      <Control
        value={field.value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.inputHint === "file" ? "Attach on the apply page" : "Empty — type an answer"}
        className={cn(
          "w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm outline-none focus:border-copper",
          field.inputHint === "textarea" ? "min-h-20 py-2" : "h-10",
        )}
      />
      <span className={cn("justify-self-start rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide md:justify-self-end", look.className)}>
        {look.label}
      </span>
    </label>
  );
}
