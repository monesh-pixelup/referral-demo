import type { Role } from "../types";

/**
 * Who can do what. Admins can do everything; the team runs the pipeline and
 * logs client payments; partners only act on their own data (DECISIONS.md D-20).
 */
export type Permission =
  | "referral.decide"     // approve / decline registrations
  | "referral.pipeline"   // introduce, discovery, proposal, won, lost, notes
  | "payment.write"       // log payments and refunds
  | "payout.write"        // create payouts
  | "partner.write"       // edit partner records and status
  | "application.review"  // approve / reject applications
  | "correction"          // edit/delete payments, undo refunds, reverse payouts, undo stage changes, edit referral details
  | "settings.write"      // change program rules
  | "demo.reset";

const TEAM: Permission[] = ["referral.pipeline", "payment.write"];

export function can(role: Role, perm: Permission): boolean {
  if (role === "admin") return true;
  if (role === "team") return TEAM.includes(perm);
  return false;
}

export const isStaff = (role: Role) => role === "admin" || role === "team";
