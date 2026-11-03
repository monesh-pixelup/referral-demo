/**
 * Data Access Layer for the signed-in user. Pages call requireStaff() /
 * requirePartner(); every Server Action calls authorize() again, because
 * actions are reachable by direct POST.
 */
import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getDataset } from "../data";
import { can, isStaff, type Permission } from "./permissions";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession, verifySession, type SessionUser } from "./token";

export type { SessionUser } from "./token";
export { can, isStaff, type Permission } from "./permissions";

export class AuthError extends Error {
  constructor(message = "You don't have permission to do that.") {
    super(message);
    this.name = "AuthError";
  }
}

/** The current user, or null. Partners whose record is gone or removed are signed out. */
export async function getUser(): Promise<SessionUser | null> {
  await connection(); // expiry check reads the clock, so this always runs at request time
  const user = verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) return null;
  if (user.role === "partner") {
    const data = await getDataset();
    const partner = data.partners.find((p) => p.id === user.partnerId);
    if (!partner || partner.status === "removed") return null;
  }
  return user;
}

export async function requireStaff(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect("/login?next=/admin");
  if (!isStaff(user.role)) redirect("/portal");
  return user;
}

export async function requirePartner(): Promise<SessionUser & { partnerId: string }> {
  const user = await getUser();
  if (!user) redirect("/login?next=/portal");
  if (user.role !== "partner" || !user.partnerId) redirect("/admin");
  return user as SessionUser & { partnerId: string };
}

/** The dataset, for admin pages only: checks the session before any data is read. */
export async function getStaffDataset() {
  await requireStaff();
  return getDataset();
}

/** For Server Actions and Route Handlers: throws instead of redirecting. */
export async function authorize(perm?: Permission): Promise<SessionUser> {
  const user = await getUser();
  if (!user) throw new AuthError("Your session has expired. Sign in again.");
  if (perm && !can(user.role, perm)) throw new AuthError();
  return user;
}

export async function startSession(user: SessionUser) {
  (await cookies()).set(SESSION_COOKIE, signSession(user), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_MAX_AGE,
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Demo sign-in is on in development, and in production only with DEMO_LOGIN=on. */
export const demoLoginEnabled = () => process.env.NODE_ENV !== "production" || process.env.DEMO_LOGIN === "on";
