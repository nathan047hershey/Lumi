"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Zap } from "lucide-react";
import { Badge, Button, Paper } from "@/components/ui";
import { fullName } from "@/lib/format";

type ReadyApp = {
  id: number;
  companyName: string;
  jobRole: string | null;
  answersJson: string | null;
  profile: { firstName: string; lastName: string };
  jobLink: { id: number; applyUrl: string } | null;
};

export function AutoBidderDialog({
  open,
  onClose,
  jobLinkIds,
}: {
  open: boolean;
  onClose: () => void;
  jobLinkIds: number[];
}) {
  const router = useRouter();
  const [applications, setApplications] = useState<ReadyApp[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<number | "tick" | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setApplications([]);
    setLoading(true);
    const query = jobLinkIds.length ? `?jobLinkIds=${jobLinkIds.join(",")}` : "";
    fetch(`/api/user/bidder/ready${query}`)
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled) setApplications(Array.isArray(data.applications) ? data.applications : []);
      })
      .catch(() => {
        if (!cancelled) setApplications([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, jobLinkIds]);

  async function tick() {
    setBusy("tick");
    await fetch("/api/auto-apply/tick", { method: "POST" });
    const query = jobLinkIds.length ? `?jobLinkIds=${jobLinkIds.join(",")}` : "";
    const data = await fetch(`/api/user/bidder/ready${query}`).then((response) => response.json());
    setApplications(data.applications || []);
    setBusy(null);
    router.refresh();
  }

  async function markApplied(id: number) {
    setBusy(id);
    await fetch("/api/bidder/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationId: id }),
    });
    setApplications((current) => current.filter((app) => app.id !== id));
    setBusy(null);
    router.refresh();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-label="Close Auto Bidder" onClick={onClose} />
      <div className="relative flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/[0.08] bg-[hsl(222_24%_9%)] shadow-[0_30px_80px_-24px_rgba(0,0,0,0.8)]">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-copper">Auto Bidder</p>
            <h2 className="display text-2xl font-semibold">
              {jobLinkIds.length ? `Bid ${jobLinkIds.length} job${jobLinkIds.length === 1 ? "" : "s"}` : "Ready queue"}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-white/50 hover:bg-white/5 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2 border-b border-white/[0.06] px-5 py-3">
          <Button onClick={tick} disabled={busy === "tick"}>
            <Zap className="h-4 w-4" />
            {busy === "tick" ? "Running…" : "Scrape + generate"}
          </Button>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-auto p-5">
          {loading ? <p className="text-sm text-ink-soft">Loading ready CVs…</p> : null}
          {!loading && applications.length === 0 ? (
            <Paper>
              <p className="font-semibold">No ready bids for this selection</p>
              <p className="mt-2 text-sm text-ink-soft">Scrape the job, generate CVs, then Process from here.</p>
            </Paper>
          ) : null}
          {!loading && applications.map((app) => {
            let answers: Array<{ label: string; answer: string }> = [];
            try {
              answers = app.answersJson ? (JSON.parse(app.answersJson) as Array<{ label: string; answer: string }>) : [];
            } catch {
              answers = [];
            }
            return (
              <Paper key={app.id} className="grid gap-3">
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="font-semibold">{app.companyName} — {app.jobRole || "Role"}</p>
                    <p className="text-sm text-ink-soft">{fullName(app.profile)}</p>
                  </div>
                  <Badge tone="copper">ready</Badge>
                </div>
                <div className="grid gap-1 text-sm">
                  {answers.slice(0, 6).map((row) => (
                    <div key={row.label} className="flex justify-between gap-4">
                      <span className="text-ink-soft">{row.label}</span>
                      <span className="text-right">{row.answer || "—"}</span>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {app.jobLink?.applyUrl ? (
                    <a href={app.jobLink.applyUrl} target="_blank" rel="noreferrer">
                      <Button type="button">Open apply URL</Button>
                    </a>
                  ) : null}
                  <Button variant="ghost" type="button" disabled={busy === app.id} onClick={() => markApplied(app.id)}>
                    {busy === app.id ? "Saving…" : "Mark applied"}
                  </Button>
                </div>
              </Paper>
            );
          })}
        </div>
      </div>
    </div>
  );
}
