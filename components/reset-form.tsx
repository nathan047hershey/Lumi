"use client";

import { useState } from "react";
import { Button, Field, Input } from "@/components/ui";

export function ResetForm() {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: form.get("username"),
        newPassword: form.get("newPassword"),
      }),
    });
    const data = await response.json();
    setPending(false);
    setMessage(response.ok ? "Password reset." : data.error || "Could not reset");
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <Field label="Username"><Input name="username" required /></Field>
      <Field label="New password"><Input name="newPassword" type="password" required minLength={8} /></Field>
      {message ? <p className="text-sm">{message}</p> : null}
      <Button type="submit" disabled={pending}>{pending ? "Resetting…" : "Reset password"}</Button>
    </form>
  );
}
