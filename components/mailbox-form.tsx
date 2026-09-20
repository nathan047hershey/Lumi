"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";

export function MailboxForm({ users }: { users: Array<{ id: number; username: string }> }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const form = new FormData(event.currentTarget);
    await fetch("/api/mailboxes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form.entries())),
    });
    setPending(false);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <Field label="User">
        <Select name="userId">
          {users.map((user) => (
            <option key={user.id} value={user.id}>{user.username}</option>
          ))}
        </Select>
      </Field>
      <Field label="Provider">
        <Select name="provider" defaultValue="demo">
          <option value="demo">Demo</option>
          <option value="outlook">Outlook</option>
          <option value="gmail">Gmail</option>
        </Select>
      </Field>
      <Field label="Email"><Input name="email" type="email" required /></Field>
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Connect mailbox"}</Button>
    </form>
  );
}
