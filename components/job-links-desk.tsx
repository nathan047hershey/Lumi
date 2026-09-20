"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bot } from "lucide-react";
import { FillCockpit } from "@/components/fill-cockpit";
import { JobLinkActions } from "@/components/job-link-actions";
import { Badge, Button, Empty, Paper } from "@/components/ui";

type LinkRow = {
  id: number;
  company: string | null;
  title: string | null;
  description: string | null;
  fetchStatus: string;
  techstack: string;
  applyUrl?: string;
  applications: unknown[];
};

export function JobLinksDesk({
  links,
  detailPrefix,
  readyCount,
}: {
  links: LinkRow[];
  detailPrefix: string;
  readyCount: number;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const [open, setOpen] = useState(false);
  const [focusIds, setFocusIds] = useState<number[]>([]);

  const allIds = useMemo(() => links.map((link) => link.id), [links]);

  function toggle(id: number) {
    setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  }

  function openFill(ids: number[]) {
    setFocusIds(ids.length ? ids.slice(0, 8) : allIds.slice(0, 8));
    setOpen(true);
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-soft">
          {selected.length ? `${selected.length} selected` : `${links.length} jobs`}
          {readyCount ? ` · ${readyCount} ready packets` : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            type="button"
            className="h-10"
            onClick={() => setSelected(selected.length === allIds.length ? [] : allIds)}
          >
            {selected.length === allIds.length && allIds.length ? "Clear" : "Select all"}
          </Button>
          <Button type="button" className="h-10" onClick={() => openFill(selected)}>
            <Bot className="h-4 w-4" />
            Auto bid{selected.length ? ` (${Math.min(selected.length, 8)})` : ""}
          </Button>
        </div>
      </div>

      {links.length === 0 ? <Empty title="No jobs yet" body="Add an apply URL." /> : null}

      {links.map((link) => (
        <Paper key={link.id} className="grid gap-2">
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1.5 h-4 w-4 accent-[hsl(199_95%_55%)]"
              checked={selected.includes(link.id)}
              onChange={() => toggle(link.id)}
              aria-label={`Select ${link.company || "job"}`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <Link href={`${detailPrefix}/${link.id}`} className="min-w-0">
                  <p className="font-semibold">{link.company || "Company"} — {link.title || "Untitled"}</p>
                </Link>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" type="button" className="h-8 px-3 text-xs" onClick={() => openFill([link.id])}>
                    Bid
                  </Button>
                  <JobLinkActions id={link.id} />
                  <Badge tone={link.fetchStatus === "success" ? "forest" : "copper"}>{link.fetchStatus}</Badge>
                </div>
              </div>
              <p className="mt-1 line-clamp-3 text-sm text-ink-soft">{link.description}</p>
              <p className="mt-1 text-xs text-ink-soft">{link.techstack} · {link.applications.length} applications</p>
            </div>
          </div>
        </Paper>
      ))}

      <FillCockpit
        open={open}
        onClose={() => setOpen(false)}
        jobs={links.filter((link) => focusIds.includes(link.id)).map((link) => ({
          id: link.id,
          company: link.company,
          title: link.title,
          applyUrl: link.applyUrl,
        }))}
      />
    </div>
  );
}
