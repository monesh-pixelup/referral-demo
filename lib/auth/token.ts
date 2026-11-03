/**
 * Signed session token (HMAC-SHA256). Shared by proxy.ts and the server-side
 * auth helpers, so it imports nothing from Next. With Supabase auth this is
 * replaced by the Supabase session cookie (DECISIONS.md D-19).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Role } from "../types";

export const SESSION_COOKIE = "pxl_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export interface SessionUser {
  role: Role;
  name: string;
  email: string;
  /** Set for role = partner: the only partner whose data this user can see. */
  partnerId: string | null;
}

interface Payload extends SessionUser { exp: number }

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET (32+ characters) must be set in production.");
  return "dev-only-insecure-session-secret-change-me";
}

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const mac = (body: string) => createHmac("sha256", secret()).update(body).digest("base64url");

export function signSession(user: SessionUser, now = Date.now()): string {
  const body = b64(JSON.stringify({ ...user, exp: Math.floor(now / 1000) + SESSION_MAX_AGE } satisfies Payload));
  return `${body}.${mac(body)}`;
}

export function verifySession(token: string | undefined, now = Date.now()): SessionUser | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(mac(body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as Payload;
    if (typeof p.exp !== "number" || p.exp * 1000 < now) return null;
    if (!["admin", "team", "partner"].includes(p.role)) return null;
    return { role: p.role, name: p.name, email: p.email, partnerId: p.partnerId ?? null };
  } catch {
    return null;
  }
}
