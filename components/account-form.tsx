"use client";

import { useState } from "react";
import { Button, Field, Input } from "@/components/ui";

export function AccountForm({ username }: { username: string }) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: form.get("currentPassword"),
        newPassword: form.get("newPassword"),
      }),
    });
    const data = await response.json();
    setPending(false);
    setMessage(response.ok ? "Password updated." : data.error || "Could not update password");
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <Field label="Username"><Input value={username} readOnly /></Field>
      <Field label="Current password"><Input name="currentPassword" type="password" required /></Field>
      <Field label="New password"><Input name="newPassword" type="password" required minLength={8} /></Field>
      {message ? <p className="text-sm">{message}</p> : null}
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Change password"}</Button>
    </form>
  );
}
