import { NextResponse } from "next/server";
import { getSessionFromRequest } from "./auth";
import { hasRole, type AppRole } from "./roles";
import type { SessionUser } from "./auth";

export async function requireUser(request: Request) {
  const user = await getSessionFromRequest(request);
  if (!user) {
    return { user: null as SessionUser | null, error: jsonError("Authentication required", 401) };
  }
  return { user, error: null };
}

export async function requireRole(request: Request, roles: AppRole | AppRole[]) {
  const { user, error } = await requireUser(request);
  if (error || !user) return { user: null as SessionUser | null, error: error || jsonError("Authentication required", 401) };
  if (!hasRole(user.role, user.extraRoles, roles)) {
    return { user: null as SessionUser | null, error: jsonError("Forbidden", 403) };
  }
  return { user, error: null };
}

export function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export function jsonOk(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}
