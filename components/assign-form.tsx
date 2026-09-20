"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Select } from "@/components/ui";

export function AssignForm({
  users,
  profiles,
}: {
  users: Array<{ id: number; username: string }>;
  profiles: Array<{ id: number; firstName: string; lastName: string }>;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const form = new FormData(event.currentTarget);
    await fetch("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: Number(form.get("userId")),
        profileId: Number(form.get("profileId")),
      }),
    });
    setPending(false);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <Field label="Bidder">
        <Select name="userId">
          {users.map((user) => (
            <option key={user.id} value={user.id}>{user.username}</option>
          ))}
        </Select>
      </Field>
      <Field label="Profile">
        <Select name="profileId">
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>{profile.firstName} {profile.lastName}</option>
          ))}
        </Select>
      </Field>
      <Button type="submit" disabled={pending}>{pending ? "Assigning…" : "Assign profile"}</Button>
    </form>
  );
}
