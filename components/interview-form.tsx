"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";

export function InterviewForm({
  applications,
  callers = [],
}: {
  applications: Array<{ id: number; companyName: string; jobRole: string | null }>;
  callers?: Array<{ id: number; username: string }>;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/interviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        applicationId: Number(form.get("applicationId")),
        callerId: form.get("callerId") ? Number(form.get("callerId")) : undefined,
        status: form.get("status") || "scheduled",
        interviewType: form.get("interviewType"),
        scheduledAt: form.get("scheduledAt") || undefined,
        meetingLink: form.get("meetingLink"),
        notes: form.get("notes"),
      }),
    });
    const data = await response.json();
    setPending(false);
    if (!response.ok) {
      setError(data.error || "Could not save the interview");
      return;
    }
    router.refresh();
    event.currentTarget.reset();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <Field label="Application">
        <Select name="applicationId" required defaultValue="">
          <option value="" disabled>Choose a package</option>
          {applications.map((app) => (
            <option key={app.id} value={app.id}>{app.companyName} — {app.jobRole || "Role"}</option>
          ))}
        </Select>
      </Field>
      {callers.length ? (
        <Field label="Caller">
          <Select name="callerId" defaultValue="">
            <option value="">Unassigned</option>
            {callers.map((caller) => (
              <option key={caller.id} value={caller.id}>{caller.username}</option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Field label="Type">
        <Select name="interviewType" defaultValue="video">
          <option value="phone">Phone</option>
          <option value="video">Video</option>
          <option value="onsite">Onsite</option>
        </Select>
      </Field>
      <Field label="When">
        <Input name="scheduledAt" type="datetime-local" />
      </Field>
      <Field label="Meeting link">
        <Input name="meetingLink" placeholder="https://" />
      </Field>
      <Field label="Status">
        <Select name="status" defaultValue="scheduled">
          <option value="requested">Requested</option>
          <option value="scheduled">Scheduled</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </Select>
      </Field>
      <Field label="Notes">
        <Textarea name="notes" />
      </Field>
      {error ? <p className="text-sm text-copper-deep">{error}</p> : null}
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save interview"}</Button>
    </form>
  );
}
