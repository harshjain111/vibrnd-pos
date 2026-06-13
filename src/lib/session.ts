import "server-only";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "./db";

const COOKIE = "pos_session";
const MAX_AGE_SECS = 60 * 60 * 24 * 7; // 7 days

function secret(): string {
  return process.env.AUTH_SECRET || "dev-insecure-secret-change-me-please-x9k1";
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** Format: <userId>.<expiresMs>.<sig> */
function makeToken(userId: string): string {
  const exp = Date.now() + MAX_AGE_SECS * 1000;
  const payload = `${userId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

function parseToken(token: string): { userId: string; exp: number } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expStr, sig] = parts;
  const payload = `${userId}.${expStr}`;
  const expected = Buffer.from(sign(payload));
  const got = Buffer.from(sig);
  if (expected.length !== got.length) return null;
  if (!timingSafeEqual(expected, got)) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return null;
  return { userId, exp };
}

export async function createSession(userId: string) {
  const token = makeToken(userId);
  const c = await cookies();
  c.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECS,
  });
}

export async function clearSession() {
  const c = await cookies();
  c.delete(COOKIE);
}

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  outletId: string;
  /** Department the user owns (HODs + Store Manager). Null for everyone
   *  else. Powers dept-scoped dashboards and the catalog filter. */
  departmentId: string | null;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const c = await cookies();
  const raw = c.get(COOKIE)?.value;
  if (!raw) return null;
  const parsed = parseToken(raw);
  if (!parsed) return null;
  const user = await db.user.findUnique({ where: { id: parsed.userId } });
  if (!user || !user.active) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    outletId: user.outletId,
    departmentId: user.departmentId ?? null,
  };
}

export const SESSION_COOKIE = COOKIE;
