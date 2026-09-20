"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Paper } from "@/components/ui";
import { fullName } from "@/lib/format";

type ReadyApp = {
  id: number;
  companyName: string;
  jobRole: string | null;
  answersJson: string | null;
  resumeMarkdown: string | null;
  profile: { firstName: string; lastName: string };
  jobLink: { applyUrl: string; fetchStatus: string } | null;
};

export function AutoBidderBoard({
  applications,
  status,
}: {
  applications: ReadyApp[];
  status?: {
    scrape: { pending: number; fetching: number; success: number; failed: number };
    bidder: { pendingGen: number; ready: number; applied: number };
  };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | "tick" | null>(null);

  async function tick() {
    setBusy("tick");
    await fetch("/api/auto-apply/tick", { method: "POST" });
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
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="grid gap-6">
      {status ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Paper>
            <p className="text-xs uppercase tracking-wide text-ink-soft">Scrape pending</p>
            <p className="display mt-2 text-3xl font-bold">{status.scrape.pending + status.scrape.fetching}</p>
          </Paper>
          <Paper>
            <p className="text-xs uppercase tracking-wide text-ink-soft">Jobs scraped</p>
            <p className="display mt-2 text-3xl font-bold">{status.scrape.success}</p>
          </Paper>
          <Paper>
            <p className="text-xs uppercase tracking-wide text-ink-soft">CVs generating</p>
            <p className="display mt-2 text-3xl font-bold">{status.bidder.pendingGen}</p>
          </Paper>
          <Paper>
            <p className="text-xs uppercase tracking-wide text-ink-soft">Ready to apply</p>
            <p className="display mt-2 text-3xl font-bold">{status.bidder.ready}</p>
          </Paper>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button onClick={tick} disabled={busy === "tick"}>
          {busy === "tick" ? "Running pipeline…" : "Run scrape + match + generate"}
        </Button>
      </div>

      {applications.length === 0 ? (
        <Paper>
          <p className="display text-xl font-semibold">No ready bids</p>
          <p className="mt-2 text-sm text-ink-soft">
            Add job links, wait for scrape, then the desk matches profiles and writes CVs. Ready packets land here.
          </p>
        </Paper>
      ) : (
        applications.map((app) => {
          const answers = app.answersJson ? (JSON.parse(app.answersJson) as Array<{ label: string; answer: string }>) : [];
          return (
            <Paper key={app.id} className="grid gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{app.companyName} — {app.jobRole || "Role"}</p>
                  <p className="text-sm text-ink-soft">{fullName(app.profile)}</p>
                </div>
                <Badge tone="copper">ready</Badge>
              </div>
              <div className="grid gap-1 text-sm">
                {answers.slice(0, 8).map((row) => (
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
        })
      )}
    </div>
  );
}
