"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";

export function SettingsForm({
  aiProvider,
  aiModel,
}: {
  aiProvider: string;
  aiModel: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const form = new FormData(event.currentTarget);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form.entries())),
    });
    setPending(false);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <Field label="AI provider">
        <Select name="aiProvider" defaultValue={aiProvider}>
          <option value="groq">Groq</option>
          <option value="minimax">MiniMax</option>
          <option value="deepseek">DeepSeek</option>
        </Select>
      </Field>
      <Field label="Model"><Input name="aiModel" defaultValue={aiModel} /></Field>
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save settings"}</Button>
    </form>
  );
}
