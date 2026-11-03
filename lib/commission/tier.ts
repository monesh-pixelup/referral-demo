import { addMonths, inRange, type ISODate } from "../dates";
import { programConfig, tierRule, type ProgramConfig, type TierRule } from "../program-config";
import type { Partner, Referral } from "../types";

type TierPartner = Pick<Partner, "id" | "portfolioAgreement">;
type TierReferral = Pick<Referral, "id" | "partnerId" | "stage" | "signedAt">;

/** Converted referrals with signed_at in [date − window, date], excluding one referral. */
export function winsInWindow(
  partner: TierPartner, referrals: TierReferral[], date: ISODate,
  excludeReferralId?: string, config: ProgramConfig = programConfig,
): number {
  const from = addMonths(date, -config.tierWindowMonths);
  return referrals.filter(
    (r) => r.partnerId === partner.id && r.stage === "won" && r.signedAt !== null
      && r.id !== excludeReferralId && inRange(r.signedAt, from, date),
  ).length;
}

/**
 * SPEC tierAt: portfolio agreement → Strategic; otherwise by won referrals in
 * the rolling window. Pass the converting referral as excludeReferralId to get
 * "the tier held before this conversion" (upgrades are never retroactive).
 */
export function tierAt(
  partner: TierPartner, referrals: TierReferral[], date: ISODate,
  excludeReferralId?: string, config: ProgramConfig = programConfig,
): TierRule {
  if (partner.portfolioAgreement) return tierRule("strategic", config);
  const n = winsInWindow(partner, referrals, date, excludeReferralId, config);
  const reached = [...config.tiers].sort((a, b) => b.minWins - a.minWins).find((t) => n >= t.minWins);
  return reached ?? config.tiers[0];
}

/** The rate and tier to lock when a referral moves to won. Call once; never recompute. */
export function lockRate(
  partner: TierPartner, referrals: TierReferral[], referral: Pick<Referral, "id" | "signedAt">,
  config: ProgramConfig = programConfig,
): { lockedRateBp: number; lockedTier: TierRule["name"] } {
  if (!referral.signedAt) throw new Error("signed_at is required when stage = won");
  const t = tierAt(partner, referrals, referral.signedAt, referral.id, config);
  return { lockedRateBp: t.rateBp, lockedTier: t.name };
}

/** Progress copy for the portal: "1 more conversion to Growth Partner". */
export function nextTierProgress(
  partner: TierPartner, referrals: TierReferral[], date: ISODate, config: ProgramConfig = programConfig,
): { current: TierRule; next: TierRule | null; wins: number; needed: number } {
  const current = tierAt(partner, referrals, date, undefined, config);
  const wins = winsInWindow(partner, referrals, date, undefined, config);
  const next = partner.portfolioAgreement
    ? null
    : [...config.tiers].sort((a, b) => a.minWins - b.minWins).find((t) => t.minWins > wins) ?? null;
  return { current, next, wins, needed: next ? next.minWins - wins : 0 };
}
