"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { fullName } from "@/lib/format";

type ProfileOption = { id: number; firstName: string; lastName: string; middleName?: string | null };
type MemoryRow = { id: number; profileId: number; questionLabel: string; answer: string };

export function MemoryBoard({
  profiles,
  rows,
}: {
  profiles: ProfileOption[];
  rows: MemoryRow[];
}) {
  const router = useRouter();
  const [profileId, setProfileId] = useState(profiles[0]?.id || 0);
  const [label, setLabel] = useState("");
  const [answer, setAnswer] = useState("");
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState("");
  const visible = useMemo(() => rows.filter((row) => row.profileId === profileId), [rows, profileId]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!profileId || !label.trim() || !answer.trim()) return;
    setPending(true);
    setNote("");
    const response = await fetch("/api/bidder/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId, questionLabel: label.trim(), answer: answer.trim() }),
    });
    setPending(false);
    if (!response.ok) {
      setNote("Could not save that answer.");
      return;
    }
    setLabel("");
    setAnswer("");
    setNote("Saved. The bot reuses this answer next time.");
    router.refresh();
  }

  if (profiles.length === 0) return <p className="text-sm text-ink-soft">No profiles yet.</p>;

  return (
    <div className="grid gap-4">
      <Field label="Profile">
        <select
          className="h-11 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm"
          value={profileId}
          onChange={(event) => setProfileId(Number(event.target.value))}
        >
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>{fullName(profile)}</option>
          ))}
        </select>
      </Field>
      <form onSubmit={save} className="grid gap-3">
        <Field label="Question">
          <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Are you authorized to work in the US?" />
        </Field>
        <Field label="Saved answer">
          <Textarea value={answer} onChange={(event) => setAnswer(event.target.value)} />
        </Field>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save answer"}</Button>
        {note ? <p className="text-sm text-ink-soft">{note}</p> : null}
      </form>
      <div className="grid gap-2">
        {visible.length === 0 ? <p className="text-sm text-ink-soft">No saved answers for this profile yet.</p> : null}
        {visible.map((row) => (
          <button
            key={row.id}
            type="button"
            className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2 text-left"
            onClick={() => {
              setLabel(row.questionLabel);
              setAnswer(row.answer);
            }}
          >
            <p className="text-sm font-semibold">{row.questionLabel}</p>
            <p className="mt-1 line-clamp-2 text-sm text-ink-soft">{row.answer}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
