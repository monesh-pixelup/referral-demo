import { addMonths, addWorkingDays, istDate, type ISODate } from "../dates";
import { programConfig, type ProgramConfig } from "../program-config";
import type { Partner, Referral } from "../types";

/** "https://www.Acme.com/about" → "acme.com" */
export function normaliseDomain(input: string | null | undefined): string {
  if (!input) return "";
  return input.trim().toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#:]/)[0]
    .replace(/\.$/, "");
}

const SUFFIXES = /\b(private|pvt|limited|ltd|llp|inc|incorporated|llc|corp|corporation|co|company|technologies|tech)\b/g;

/** "Acme Technologies Pvt. Ltd." → "acme" (fallback when no domain is given). */
export function normaliseCompanyName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(SUFFIXES, " ").replace(/\s+/g, "");
}

type DupReferral = Pick<Referral, "id" | "companyName" | "companyDomain" | "registeredAt" | "stage">;

/** SPEC "Duplicate check": the earliest non-declined registration of the same company wins. */
export function findDuplicate(candidate: DupReferral, existing: DupReferral[]): DupReferral | null {
  const dom = normaliseDomain(candidate.companyDomain);
  const name = normaliseCompanyName(candidate.companyName);
  const matches = existing.filter((r) => {
    if (r.id === candidate.id || r.stage === "declined") return false;
    if (r.registeredAt >= candidate.registeredAt) return false;
    const rd = normaliseDomain(r.companyDomain);
    if (dom && rd) return dom === rd;
    return name !== "" && normaliseCompanyName(r.companyName) === name;
  });
  matches.sort((a, b) => a.registeredAt.localeCompare(b.registeredAt));
  return matches[0] ?? null;
}

/** registered_at + 5 working days, counted from the IST calendar date. */
export function decisionDueAt(registeredAt: string, config: ProgramConfig = programConfig): ISODate {
  return addWorkingDays(istDate(registeredAt), config.decisionWorkingDays);
}

export function attributionExpiresAt(introducedAt: ISODate, config: ProgramConfig = programConfig): ISODate {
  return addMonths(introducedAt, config.attributionWindowMonths);
}

/** True when signing happened inside the attribution window. */
export function withinAttribution(introducedAt: ISODate, signedAt: ISODate, config: ProgramConfig = programConfig): boolean {
  return signedAt <= attributionExpiresAt(introducedAt, config);
}

export type CheckState = "pass" | "fail" | "confirm" | "unset";
export interface CheckItem { key: string; label: string; state: CheckState; detail?: string }

/** SPEC "Qualification checks on approval". Automatic where data allows; otherwise the admin confirms. */
export function qualificationChecklist(
  referral: Pick<Referral, "companyDomain" | "firstContractValue" | "duplicateOf">,
  partner: Pick<Partner, "email">,
  config: ProgramConfig = programConfig,
): CheckItem[] {
  const partnerDomain = normaliseDomain(partner.email.split("@")[1]);
  const companyDomain = normaliseDomain(referral.companyDomain);
  const selfReferral = partnerDomain !== "" && partnerDomain === companyDomain;
  const min = config.minFirstContractPaise;
  return [
    { key: "duplicate", label: "First registration for this company", state: referral.duplicateOf ? "fail" : "pass", detail: referral.duplicateOf ? "An earlier registration exists" : undefined },
    { key: "self", label: "Not a self-referral (partner email domain ≠ company domain)", state: selfReferral ? "fail" : "pass", detail: selfReferral ? `Both are ${companyDomain}` : undefined },
    { key: "client", label: "Not a current client or a client in the last 12 months", state: "confirm" },
    { key: "conversation", label: "Not already in active conversation with us", state: "confirm" },
    { key: "warm", label: "Warm introduction to a decision-maker", state: "confirm" },
    min === null
      ? { key: "minimum", label: "Minimum first-contract size", state: "unset", detail: "Minimum not set in Settings" }
      : { key: "minimum", label: "Minimum first-contract size", state: referral.firstContractValue === null ? "confirm" : referral.firstContractValue >= min ? "pass" : "fail" },
  ];
}
