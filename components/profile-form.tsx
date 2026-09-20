"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { TECHSTACKS } from "@/lib/roles";

type ProfileValues = {
  id?: number;
  firstName?: string;
  lastName?: string;
  middleName?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  salaryRange?: string | null;
  locationFlag?: string | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  workAuthorization?: string | null;
  requiresSponsorship?: string | null;
  preferredName?: string | null;
  address?: string | null;
  postalCode?: string | null;
  websiteUrl?: string | null;
  educationLevel?: string | null;
  school?: string | null;
  degree?: string | null;
  discipline?: string | null;
  willingToRelocate?: string | null;
  willingToTravel?: string | null;
  earliestStartDate?: string | null;
  howHeard?: string | null;
  securityClearance?: string | null;
  hispanicLatino?: string | null;
  raceEthnicity?: string | null;
  gender?: string | null;
  disabilityStatus?: string | null;
  veteranStatus?: string | null;
  noticePeriod?: string | null;
  yearsOfExperience?: string | null;
  workExperience?: string | null;
  education?: string | null;
  resumePrompt?: string | null;
  techstacks?: Array<{ techstack: string }>;
};

export function ProfileForm({
  profile,
  redirectTo,
}: {
  profile?: ProfileValues;
  redirectTo: string;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const selected = new Set((profile?.techstacks || []).map((t) => t.techstack));

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const techstacks = TECHSTACKS.filter((stack) => form.getAll("techstacks").includes(stack));
    const payload = Object.fromEntries(form.entries());
    const response = await fetch(profile?.id ? `/api/profiles/${profile.id}` : "/api/profiles", {
      method: profile?.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, techstacks }),
    });
    const data = await response.json();
    setPending(false);
    if (!response.ok) {
      setError(data.error || "Could not save profile");
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name"><Input name="firstName" required defaultValue={profile?.firstName} /></Field>
        <Field label="Last name"><Input name="lastName" required defaultValue={profile?.lastName} /></Field>
        <Field label="Middle name"><Input name="middleName" defaultValue={profile?.middleName || ""} /></Field>
        <Field label="Preferred name"><Input name="preferredName" defaultValue={profile?.preferredName || ""} /></Field>
        <Field label="Email"><Input name="email" type="email" defaultValue={profile?.email || ""} /></Field>
        <Field label="Phone"><Input name="phone" defaultValue={profile?.phone || ""} /></Field>
        <Field label="City"><Input name="city" defaultValue={profile?.city || ""} /></Field>
        <Field label="Country"><Input name="country" defaultValue={profile?.country || ""} /></Field>
        <Field label="Salary"><Input name="salaryRange" defaultValue={profile?.salaryRange || ""} /></Field>
        <Field label="Region"><Input name="locationFlag" defaultValue={profile?.locationFlag || "US"} /></Field>
        <Field label="LinkedIn"><Input name="linkedinUrl" defaultValue={profile?.linkedinUrl || ""} /></Field>
        <Field label="GitHub"><Input name="githubUrl" defaultValue={profile?.githubUrl || ""} /></Field>
        <Field label="Work authorization"><Input name="workAuthorization" defaultValue={profile?.workAuthorization || ""} /></Field>
        <Field label="Sponsorship"><Input name="requiresSponsorship" defaultValue={profile?.requiresSponsorship || ""} /></Field>
        <Field label="Gender"><Input name="gender" defaultValue={profile?.gender || ""} /></Field>
        <Field label="Disability"><Input name="disabilityStatus" defaultValue={profile?.disabilityStatus || ""} /></Field>
        <Field label="Veteran"><Input name="veteranStatus" defaultValue={profile?.veteranStatus || ""} /></Field>
        <Field label="State"><Input name="state" defaultValue={profile?.state || ""} /></Field>
        <Field label="Postal code"><Input name="postalCode" defaultValue={profile?.postalCode || ""} /></Field>
        <Field label="Address"><Input name="address" defaultValue={profile?.address || ""} /></Field>
        <Field label="Website"><Input name="websiteUrl" defaultValue={profile?.websiteUrl || ""} /></Field>
        <Field label="Years of experience"><Input name="yearsOfExperience" defaultValue={profile?.yearsOfExperience || ""} /></Field>
        <Field label="School"><Input name="school" defaultValue={profile?.school || ""} /></Field>
        <Field label="Degree"><Input name="degree" defaultValue={profile?.degree || ""} /></Field>
        <Field label="Field of study"><Input name="discipline" defaultValue={profile?.discipline || ""} /></Field>
        <Field label="Education level"><Input name="educationLevel" defaultValue={profile?.educationLevel || ""} /></Field>
        <Field label="Willing to relocate"><Input name="willingToRelocate" defaultValue={profile?.willingToRelocate || ""} /></Field>
        <Field label="Willing to travel"><Input name="willingToTravel" defaultValue={profile?.willingToTravel || ""} /></Field>
        <Field label="Earliest start"><Input name="earliestStartDate" defaultValue={profile?.earliestStartDate || ""} /></Field>
        <Field label="How heard"><Input name="howHeard" defaultValue={profile?.howHeard || ""} /></Field>
        <Field label="Clearance"><Input name="securityClearance" defaultValue={profile?.securityClearance || ""} /></Field>
        <Field label="Hispanic / Latino"><Input name="hispanicLatino" defaultValue={profile?.hispanicLatino || ""} /></Field>
        <Field label="Race / ethnicity"><Input name="raceEthnicity" defaultValue={profile?.raceEthnicity || ""} /></Field>
      </div>
      <fieldset className="grid gap-2">
        <legend className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-soft">Tech stacks</legend>
        <div className="flex flex-wrap gap-3">
          {TECHSTACKS.map((stack) => (
            <label key={stack} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="techstacks" value={stack} defaultChecked={selected.has(stack)} />
              {stack}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Experience"><Textarea name="workExperience" defaultValue={profile?.workExperience || ""} /></Field>
      <Field label="Education"><Textarea name="education" defaultValue={profile?.education || ""} /></Field>
      <Field label="Resume voice"><Textarea name="resumePrompt" defaultValue={profile?.resumePrompt || ""} /></Field>
      {error ? <p className="text-sm text-copper-deep">{error}</p> : null}
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save profile"}</Button>
    </form>
  );
}
