"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { ROLES } from "@/lib/roles";

export function UserForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form.entries())),
    });
    const data = await response.json();
    setPending(false);
    if (!response.ok) {
      setError(data.error || "Could not create user");
      return;
    }
    (event.target as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <Field label="Username"><Input name="username" required /></Field>
      <Field label="Password"><Input name="password" type="password" required /></Field>
      <Field label="Role">
        <Select name="role" defaultValue="user">
          {ROLES.map((role) => (
            <option key={role} value={role}>{role}</option>
          ))}
        </Select>
      </Field>
      {error ? <p className="text-sm text-copper-deep">{error}</p> : null}
      <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Add user"}</Button>
    </form>
  );
}
