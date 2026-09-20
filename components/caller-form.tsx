"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Input, Textarea } from "@/components/ui";

export function CallerForm({
  values,
}: {
  values?: {
    profileInfo?: string | null;
    yearsOfExperience?: string | null;
    mainTechStack?: string | null;
    availability?: string | null;
    location?: string | null;
    email?: string | null;
    telegram?: string | null;
  };
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const form = new FormData(event.currentTarget);
    await fetch("/api/caller/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form.entries())),
    });
    setPending(false);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <Field label="Desk note"><Textarea name="profileInfo" defaultValue={values?.profileInfo || ""} /></Field>
      <Field label="Years"><Input name="yearsOfExperience" defaultValue={values?.yearsOfExperience || ""} /></Field>
      <Field label="Stack"><Input name="mainTechStack" defaultValue={values?.mainTechStack || ""} /></Field>
      <Field label="Availability"><Input name="availability" defaultValue={values?.availability || ""} /></Field>
      <Field label="Location"><Input name="location" defaultValue={values?.location || ""} /></Field>
      <Field label="Email"><Input name="email" defaultValue={values?.email || ""} /></Field>
      <Field label="Telegram"><Input name="telegram" defaultValue={values?.telegram || ""} /></Field>
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save desk"}</Button>
    </form>
  );
}
