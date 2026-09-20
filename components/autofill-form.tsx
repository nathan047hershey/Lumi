"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { DEFAULT_AUTOFILL, DEFAULT_BIDDER_PREFS, SHARED_AUTOFILL_KEYS } from "@/lib/autofill";

export function AutofillForm({
  autofill,
  bidderPrefs,
  canEdit,
}: {
  autofill: Record<string, string>;
  bidderPrefs: Record<string, boolean>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const values = { ...DEFAULT_AUTOFILL, ...autofill };
  const prefs = { ...DEFAULT_BIDDER_PREFS, ...bidderPrefs };

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit) return;
    setPending(true);
    const form = new FormData(event.currentTarget);
    const next: Record<string, string> = {};
    for (const key of SHARED_AUTOFILL_KEYS) next[key] = String(form.get(key) || "");
    await fetch("/api/autofill", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        applyToAll: form.get("applyToAll") === "on",
        autofill: next,
        bidderPrefs: {
          afkMode: form.get("afkMode") === "on",
          autoSubmit: form.get("autoSubmit") === "on",
          captchaAssist: form.get("captchaAssist") === "on",
          waitForOtp: form.get("waitForOtp") === "on",
        },
      }),
    });
    setPending(false);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {SHARED_AUTOFILL_KEYS.map((key) => (
          <Field key={key} label={key}>
            <Input name={key} defaultValue={values[key] || ""} disabled={!canEdit} />
          </Field>
        ))}
      </div>
      <fieldset className="grid gap-2">
        <legend className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-soft">Bidder runtime</legend>
        {[
          ["afkMode", "AFK mode"],
          ["autoSubmit", "Auto submit"],
          ["captchaAssist", "Captcha assist"],
          ["waitForOtp", "Wait for email OTP"],
        ].map(([name, label]) => (
          <label key={name} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name={name} defaultChecked={Boolean(prefs[name])} disabled={!canEdit} />
            {label}
          </label>
        ))}
      </fieldset>
      {canEdit ? (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="applyToAll" />
            Save these fixed answers onto every profile
          </label>
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save autofill"}</Button>
        </>
      ) : (
        <p className="text-sm text-ink-soft">Ask an admin or manager to change public autofill defaults.</p>
      )}
    </form>
  );
}
