"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";

type ProfileOption = { id: number; firstName: string; lastName: string };
type JobOption = {
  id: number;
  title: string | null;
  company: string | null;
  description: string | null;
  applyUrl?: string | null;
  sourceUrl?: string | null;
};

export function GenerateForm({
  profiles,
  jobs,
  doneHref = "/user/applications",
  defaultJobId,
}: {
  profiles: ProfileOption[];
  jobs: JobOption[];
  doneHref?: string;
  defaultJobId?: number;
}) {
  const router = useRouter();
  const initial = jobs.find((job) => job.id === defaultJobId);
  const [pending, setPending] = useState(false);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [error, setError] = useState("");
  const [lookupNote, setLookupNote] = useState("");
  const [jobLinkId, setJobLinkId] = useState(initial ? String(initial.id) : "");
  const [company, setCompany] = useState(initial?.company || "");
  const [role, setRole] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [jobUrl, setJobUrl] = useState(initial?.applyUrl || initial?.sourceUrl || "");
  const [extra, setExtra] = useState<JobOption | null>(null);

  const options = useMemo(() => {
    if (!extra || jobs.some((job) => job.id === extra.id)) return jobs;
    return [extra, ...jobs];
  }, [jobs, extra]);

  function applyJob(id: string) {
    setJobLinkId(id);
    const job = options.find((row) => String(row.id) === id);
    if (!job) return;
    setCompany(job.company || "");
    setRole(job.title || "");
    setDescription(job.description || "");
    setJobUrl(job.applyUrl || job.sourceUrl || "");
    setLookupNote("");
  }

  async function lookup() {
    if (!jobUrl.trim()) {
      setLookupNote("Paste a job URL first.");
      return;
    }
    setLookupBusy(true);
    setLookupNote("");
    setError("");
    const response = await fetch(`/api/jobs/by-url?url=${encodeURIComponent(jobUrl.trim())}`);
    const data = await response.json();
    setLookupBusy(false);
    if (!response.ok) {
      setLookupNote(data.error || "Lookup failed.");
      return;
    }
    if (data.company) setCompany(data.company);
    if (data.title) setRole(data.title);
    if (data.description) setDescription(data.description);
    if (data.applyUrl) setJobUrl(data.applyUrl);
    if (data.jobLinkId) {
      setJobLinkId(String(data.jobLinkId));
      if (!jobs.some((job) => job.id === data.jobLinkId)) {
        setExtra({
          id: data.jobLinkId,
          company: data.company,
          title: data.title,
          description: data.description,
          applyUrl: data.applyUrl,
        });
      }
    }
    setLookupNote(data.message || (data.found ? "Matched." : "No saved job for that URL."));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId: Number(form.get("profileId")),
        jobLinkId: Number(jobLinkId) || undefined,
        companyName: company,
        jobRole: role,
        jobDescription: description,
      }),
    });
    const data = await response.json();
    setPending(false);
    if (!response.ok) {
      setError(data.error || "Could not generate");
      return;
    }
    router.push(doneHref);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <Field label="Profile">
        <Select name="profileId" required>
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.firstName} {profile.lastName}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Job URL">
        <div className="flex gap-2">
          <Input
            value={jobUrl}
            onChange={(event) => setJobUrl(event.target.value)}
            placeholder="https://boards.greenhouse.io/…"
          />
          <Button type="button" variant="ink" disabled={lookupBusy} onClick={lookup}>
            {lookupBusy ? "Looking…" : "Lookup"}
          </Button>
        </div>
      </Field>
      {lookupNote ? <p className="text-sm text-ink/70">{lookupNote}</p> : null}
      <Field label="Existing job link">
        <Select value={jobLinkId} onChange={(event) => applyJob(event.target.value)}>
          <option value="">Manual job</option>
          {options.map((job) => (
            <option key={job.id} value={job.id}>
              {job.company || "Company"} — {job.title || "Role"}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company"><Input value={company} onChange={(event) => setCompany(event.target.value)} /></Field>
        <Field label="Role"><Input value={role} onChange={(event) => setRole(event.target.value)} /></Field>
      </div>
      <Field label="Job description">
        <Textarea required value={description} onChange={(event) => setDescription(event.target.value)} />
      </Field>
      {error ? <p className="text-sm text-copper-deep">{error}</p> : null}
      <Button type="submit" disabled={pending}>{pending ? "Writing with Groq…" : "Generate CV"}</Button>
    </form>
  );
}
