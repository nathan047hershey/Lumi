export function fullName(profile: { firstName: string; middleName?: string | null; lastName: string }) {
  return [profile.firstName, profile.middleName, profile.lastName].filter(Boolean).join(" ");
}

export function formatWhen(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
