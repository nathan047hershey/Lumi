"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { TECHSTACKS } from "@/lib/roles";

export function JobLinkForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/job-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form.entries())),
    });
    const data = await response.json();
    setPending(false);
    if (!response.ok) {
      setError(data.error || "Could not add job");
      return;
    }
    (event.target as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <Field label="Apply URL"><Input name="applyUrl" required placeholder="https://" /></Field>
      <Field label="Source URL"><Input name="sourceUrl" placeholder="Optional job post URL" /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company"><Input name="company" /></Field>
        <Field label="Title"><Input name="title" /></Field>
      </div>
      <Field label="Tech stack">
        <Select name="techstack" defaultValue="frontend">
          {TECHSTACKS.map((stack) => (
            <option key={stack} value={stack}>{stack}</option>
          ))}
        </Select>
      </Field>
      <Field label="Description (optional — we fetch if empty)">
        <Textarea name="description" />
      </Field>
      {error ? <p className="text-sm text-copper-deep">{error}</p> : null}
      <Button type="submit" disabled={pending}>{pending ? "Adding…" : "Add job link"}</Button>
    </form>
  );
}
