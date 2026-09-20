export const ROLES = ["admin", "user", "manager", "caller", "developer"] as const;
export type AppRole = (typeof ROLES)[number];

export const TECHSTACKS = [
  "python",
  "java",
  "dotnet",
  "golang",
  "nodejs",
  "frontend",
] as const;
export type Techstack = (typeof TECHSTACKS)[number];

export function homePath(role: string, extra: string[] = []) {
  const roles = new Set([role, ...extra]);
  if (roles.has("admin")) return "/admin/dashboard";
  if (roles.has("manager")) return "/manager/dashboard";
  if (roles.has("caller")) return "/caller/dashboard";
  if (roles.has("developer")) return "/developer/dashboard";
  return "/user/dashboard";
}

export function hasRole(role: string, extra: string[], needed: AppRole | AppRole[]) {
  const have = new Set([role, ...extra]);
  const list = Array.isArray(needed) ? needed : [needed];
  return list.some((r) => have.has(r));
}

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Admin",
  user: "Bidder",
  manager: "Manager",
  caller: "Caller",
  developer: "Developer",
};
