import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import type { AppRole } from "./roles";

export const SESSION_COOKIE = "lumi_session";
const TOKEN_HOURS = 72;

export type SessionUser = {
  id: number;
  username: string;
  role: AppRole;
  extraRoles: AppRole[];
};

function secretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
}

export async function signToken(user: SessionUser) {
  return new SignJWT({
    id: user.id,
    username: user.username,
    role: user.role,
    extraRoles: user.extraRoles,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_HOURS}h`)
    .sign(secretKey());
}

export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const id = Number(payload.id);
    const username = String(payload.username || "");
    const role = String(payload.role || "") as AppRole;
    const extraRoles = Array.isArray(payload.extraRoles)
      ? (payload.extraRoles as AppRole[])
      : [];
    if (!id || !username || !role) return null;
    return { id, username, role, extraRoles };
  } catch {
    return null;
  }
}

export async function loadUserRoles(userId: number, primary: AppRole): Promise<SessionUser["extraRoles"]> {
  const rows = await prisma.userRole.findMany({ where: { userId } });
  return rows.map((r) => r.role as AppRole).filter((r) => r !== primary);
}

export async function authenticate(username: string, password: string) {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) return null;
  const ok = bcrypt.compareSync(password, user.passwordHash);
  if (!ok) return null;
  const extraRoles = await loadUserRoles(user.id, user.role as AppRole);
  return {
    id: user.id,
    username: user.username,
    role: user.role as AppRole,
    extraRoles,
  } satisfies SessionUser;
}

export async function getSessionFromRequest(request: Request) {
  const header = request.headers.get("authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE)?.value || null;
  const token = bearer || cookie;
  if (!token) return null;
  return verifyToken(token);
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TOKEN_HOURS * 60 * 60,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export function publicUser(user: SessionUser) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    additional_roles: user.extraRoles,
  };
}
