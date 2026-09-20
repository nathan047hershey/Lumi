"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Input, Textarea } from "@/components/ui";

export function DeveloperForm({
  values,
}: {
  values?: {
    technicalSkills?: string | null;
    availability?: string | null;
    contactEmail?: string | null;
    contactTelegram?: string | null;
    resumeNote?: string | null;
  };
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    await fetch("/api/developer/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries())),
    });
    setPending(false);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <Field label="Skills"><Textarea name="technicalSkills" defaultValue={values?.technicalSkills || ""} /></Field>
      <Field label="Availability"><Input name="availability" defaultValue={values?.availability || ""} /></Field>
      <Field label="Email"><Input name="contactEmail" defaultValue={values?.contactEmail || ""} /></Field>
      <Field label="Telegram"><Input name="contactTelegram" defaultValue={values?.contactTelegram || ""} /></Field>
      <Field label="Note"><Textarea name="resumeNote" defaultValue={values?.resumeNote || ""} /></Field>
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save roster card"}</Button>
    </form>
  );
}
