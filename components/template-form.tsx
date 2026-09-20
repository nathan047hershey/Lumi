"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";

export function TemplateForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const form = new FormData(event.currentTarget);
    await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        description: form.get("description"),
        styleSpec: {
          font: form.get("font"),
          accent: form.get("accent"),
          density: form.get("density"),
        },
      }),
    });
    setPending(false);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <Field label="Name"><Input name="name" required /></Field>
      <Field label="Description"><Textarea name="description" /></Field>
      <Field label="Font">
        <Select name="font" defaultValue="Karla">
          <option>Karla</option>
          <option>Syne</option>
          <option>Georgia</option>
        </Select>
      </Field>
      <Field label="Accent">
        <Select name="accent" defaultValue="navy">
          <option value="navy">Navy</option>
          <option value="ink">Ink</option>
          <option value="signal">Signal red</option>
        </Select>
      </Field>
      <Field label="Density">
        <Select name="density" defaultValue="compact">
          <option value="compact">Compact</option>
          <option value="open">Open</option>
        </Select>
      </Field>
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save template"}</Button>
    </form>
  );
}
