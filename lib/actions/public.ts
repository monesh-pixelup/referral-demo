"use server";
/** Public (signed-out) actions: partner application and demo sign-in. */
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { withDataset } from "../data";
import { demoLoginEnabled, endSession, isStaff, startSession, type SessionUser } from "../auth";
import { DEMO_STAFF } from "../data/seed";
import { submitApplication } from "../mutations";
import { PARTNER_TYPE_LABEL, type PartnerType } from "../types";
import { failure, FormError, oneOf, required, str, type ActionState } from "./run";

// Simple per-IP limit for the public form (in memory; use a shared store in production).
const g = globalThis as unknown as { __pxlApplyHits?: Map<string, number[]> };
const hits: Map<string, number[]> = (g.__pxlApplyHits ??= new Map());

export async function applyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    if (str(fd, "website")) return { ok: true, message: "Thanks, we'll be in touch.", at: Date.now() }; // honeypot
    const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const recent = (hits.get(ip) ?? []).filter((t) => Date.now() - t < 60 * 60 * 1000);
    if (recent.length >= 5) throw new FormError("Too many applications from this network. Try again in an hour.");
    hits.set(ip, [...recent, Date.now()]);

    if (!fd.get("consent")) throw new FormError("Please accept the program terms.");
    await withDataset((data) => submitApplication({ data, actor: str(fd, "fullName") || "applicant", now: new Date().toISOString() }, {
      fullName: required(fd, "fullName", "Name"),
      email: required(fd, "email", "Email"),
      phone: str(fd, "phone"),
      company: str(fd, "company"),
      partnerType: oneOf(fd, "partnerType", Object.keys(PARTNER_TYPE_LABEL) as PartnerType[], "Partner type"),
      linkedinUrl: str(fd, "linkedinUrl"),
      howTheyKnowClients: required(fd, "howTheyKnowClients", "How you know potential clients"),
      country: str(fd, "country"),
    }));
    return { ok: true, message: "Application received. We'll be in touch within a few working days.", at: Date.now() };
  } catch (e) {
    return failure(e);
  }
}

/** Demo only: sign in as a staff member or a partner, no password. Replaced by Supabase magic links. */
export async function demoSignInAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let dest = "/admin";
  try {
    if (!demoLoginEnabled()) throw new FormError("Demo sign-in is turned off.");
    const account = required(fd, "account", "Account");
    let user: SessionUser;
    if (account.startsWith("staff:")) {
      const s = DEMO_STAFF.find((x) => x.email === account.slice(6));
      if (!s) throw new FormError("Unknown account.");
      user = { role: s.role, name: s.name, email: s.email, partnerId: null };
    } else {
      const partner = await withDataset((d) => d.partners.find((p) => p.id === account.slice(8)));
      if (!partner || partner.status === "removed") throw new FormError("This partner can't sign in.");
      user = { role: "partner", name: partner.fullName, email: partner.email, partnerId: partner.id };
    }
    await startSession(user);
    const next = str(fd, "next");
    const home = isStaff(user.role) ? "/admin" : "/portal";
    dest = next.startsWith(home) ? next : home;
  } catch (e) {
    return failure(e);
  }
  redirect(dest);
}

export async function signOutAction() {
  await endSession();
  redirect("/login");
}
