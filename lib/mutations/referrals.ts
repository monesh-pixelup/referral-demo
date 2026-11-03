import {
  attributionExpiresAt, decisionDueAt, findDuplicate, lockRate, normaliseDomain, qualificationChecklist, withinAttribution,
} from "../commission";
import { formatDate, istDate, type ISODate } from "../dates";
import { programConfig, type ProgramConfig } from "../program-config";
import { STAGE_LABEL, type Need, type Referral, type Stage } from "../types";
import { audit, fail, find, newId, type Ctx } from "./context";

function addHistory(ctx: Ctx, r: Referral, to: Stage, note: string | null) {
  ctx.data.stageHistory.push({ id: newId("stg"), referralId: r.id, fromStage: r.stage, toStage: to, changedBy: ctx.actor, changedAt: ctx.now, note });
  audit(ctx, "referrals", r.id, "update", { stage: r.stage }, { stage: to, ...(note ? { note } : {}) });
  r.stage = to;
}

/* ---------- registration (partner portal) ---------- */

export interface RegisterInput {
  companyName: string;
  companyDomain: string;
  contactName: string;
  contactEmail: string;
  contactRole: string;
  need: Need;
  partnerNote: string;
}

/**
 * SPEC "Registration". Active partners only; at most N per IST day.
 * A duplicate is saved and flagged (first registration wins) so the admin
 * declines it with a reason; the partner never sees who registered first.
 */
export function registerReferral(ctx: Ctx, partnerId: string, input: RegisterInput, config: ProgramConfig = programConfig): Referral {
  const partner = find(ctx.data.partners, partnerId, "Partner");
  if (partner.status !== "active") fail("Only active partners can register new referrals.");
  const todayCount = ctx.data.referrals.filter((r) => r.partnerId === partnerId && istDate(r.registeredAt) === ctx.data.today).length;
  if (todayCount >= config.maxRegistrationsPerDay) fail(`You can register up to ${config.maxRegistrationsPerDay} referrals a day. Try again tomorrow.`);
  const companyName = input.companyName.trim();
  if (!companyName) fail("Company name is required.");

  const r: Referral = {
    id: newId("ref"), partnerId, companyName, companyDomain: normaliseDomain(input.companyDomain),
    contactName: input.contactName.trim(), contactEmail: input.contactEmail.trim().toLowerCase(), contactRole: input.contactRole.trim(),
    need: input.need, partnerNote: input.partnerNote.trim(), stage: "registered", registeredAt: ctx.now,
    decisionDueAt: decisionDueAt(ctx.now, config), decidedAt: null, decidedBy: null, declineReason: null,
    introducedAt: null, attributionExpiresAt: null, signedAt: null, firstContractValue: null, lockedRateBp: null, lockedTier: null,
    vcDiscount: false, duplicateOf: null, forfeited: false, lostReason: null, internalNotes: null,
  };
  r.duplicateOf = findDuplicate(r, ctx.data.referrals)?.id ?? null;
  ctx.data.referrals.push(r);
  ctx.data.stageHistory.push({ id: newId("stg"), referralId: r.id, fromStage: null, toStage: "registered", changedBy: ctx.actor, changedAt: ctx.now, note: null });
  audit(ctx, "referrals", r.id, "insert", null, { company: r.companyName, stage: "registered", duplicate_of: r.duplicateOf });
  return r;
}

/* ---------- decision (admin) ---------- */

/** Checklist items the admin must tick; automatic checks must pass. */
export const CONFIRM_KEYS = ["client", "conversation", "warm"] as const;

export function approveReferral(ctx: Ctx, id: string, confirmed: string[], config: ProgramConfig = programConfig) {
  const r = find(ctx.data.referrals, id, "Referral");
  if (r.stage !== "registered") fail(`Only registered referrals can be approved (this one is ${STAGE_LABEL[r.stage]}).`);
  const partner = find(ctx.data.partners, r.partnerId, "Partner");
  const checks = qualificationChecklist(r, partner, config);
  const failed = checks.filter((c) => c.state === "fail");
  if (failed.length) fail(`Can't approve: ${failed.map((c) => c.label.toLowerCase()).join("; ")}. Decline it instead.`);
  const missing = CONFIRM_KEYS.filter((k) => !confirmed.includes(k));
  if (missing.length) fail("Confirm every checklist item before approving.");
  r.decidedAt = ctx.now;
  r.decidedBy = ctx.actor;
  addHistory(ctx, r, "approved", null);
  return r;
}

export function declineReferral(ctx: Ctx, id: string, reason: string) {
  const r = find(ctx.data.referrals, id, "Referral");
  if (r.stage !== "registered") fail("Only registered referrals can be declined.");
  if (!reason.trim()) fail("A decline reason is required; the partner sees it.");
  r.decidedAt = ctx.now;
  r.decidedBy = ctx.actor;
  r.declineReason = reason.trim();
  addHistory(ctx, r, "declined", r.declineReason);
  return r;
}

/* ---------- pipeline (team) ---------- */

const NEXT: Partial<Record<Stage, Stage>> = { approved: "introduced", introduced: "discovery", discovery: "proposal" };
export const nextStage = (s: Stage): Stage | null => NEXT[s] ?? null;

/** approved → introduced → discovery → proposal. Introduction starts the attribution window. */
export function advanceReferral(ctx: Ctx, id: string, opts: { introducedAt?: ISODate; note?: string } = {}, config: ProgramConfig = programConfig) {
  const r = find(ctx.data.referrals, id, "Referral");
  const to = nextStage(r.stage);
  if (!to) fail(`A ${STAGE_LABEL[r.stage].toLowerCase()} referral can't move forward.`);
  if (to === "introduced") {
    const on = opts.introducedAt || ctx.data.today;
    if (on > ctx.data.today) fail("The introduction date can't be in the future.");
    if (on < istDate(r.registeredAt)) fail("The introduction date can't be before registration.");
    r.introducedAt = on;
    r.attributionExpiresAt = attributionExpiresAt(on, config);
    audit(ctx, "referrals", r.id, "update", { introduced_at: null }, { introduced_at: on, attribution_expires_at: r.attributionExpiresAt });
  }
  addHistory(ctx, r, to, opts.note?.trim() || null);
  return r;
}

export interface WonInput { signedAt: ISODate; firstContractValue: number; vcDiscount: boolean }

/**
 * SPEC "Conversion". Signing must fall inside the attribution window. The rate
 * is locked once, from the tier held before this conversion, and never recomputed.
 */
export function markWon(ctx: Ctx, id: string, input: WonInput, config: ProgramConfig = programConfig) {
  const r = find(ctx.data.referrals, id, "Referral");
  if (!["introduced", "discovery", "proposal"].includes(r.stage)) fail("Only introduced, discovery or proposal referrals can be marked won.");
  if (!r.introducedAt) fail("This referral has no introduction date.");
  if (input.signedAt > ctx.data.today) fail("The signing date can't be in the future.");
  if (input.signedAt < r.introducedAt) fail("The signing date can't be before the introduction.");
  if (!withinAttribution(r.introducedAt, input.signedAt, config)) {
    fail(`Signed after the attribution window closed on ${formatDate(r.attributionExpiresAt)}. No commission is due; mark it lost or record it outside the program.`);
  }
  if (!(input.firstContractValue > 0)) fail("Enter the first contract's net value.");
  const min = config.minFirstContractPaise;
  if (min !== null && input.firstContractValue < min) fail("The first contract is below the program minimum.");
  const partner = find(ctx.data.partners, r.partnerId, "Partner");
  if (input.vcDiscount && partner.partnerType !== "vc_accelerator") fail("Only VC / accelerator partners can pass commission to the client as a discount.");
  if (r.duplicateOf) fail("This referral is a duplicate; the first registration holds the attribution.");

  const { lockedRateBp, lockedTier } = lockRate(partner, ctx.data.referrals, { id: r.id, signedAt: input.signedAt }, config);
  const before = { signed_at: r.signedAt, locked_rate_bp: r.lockedRateBp };
  r.signedAt = input.signedAt;
  r.firstContractValue = input.firstContractValue;
  r.lockedRateBp = lockedRateBp;
  r.lockedTier = lockedTier;
  r.vcDiscount = input.vcDiscount;
  audit(ctx, "referrals", r.id, "update", before, { signed_at: r.signedAt, first_contract_value: r.firstContractValue, locked_rate_bp: lockedRateBp, locked_tier: lockedTier, vc_discount: r.vcDiscount });
  addHistory(ctx, r, "won", "Contract signed");
  return r;
}

export function markLost(ctx: Ctx, id: string, reason: string) {
  const r = find(ctx.data.referrals, id, "Referral");
  if (!["approved", "introduced", "discovery", "proposal"].includes(r.stage)) fail("Only open referrals can be marked lost.");
  if (!reason.trim()) fail("A reason is required.");
  r.lostReason = reason.trim();
  addHistory(ctx, r, "lost", r.lostReason);
  return r;
}

export function updateReferralNotes(ctx: Ctx, id: string, notes: string) {
  const r = find(ctx.data.referrals, id, "Referral");
  const next = notes.trim() || null;
  if (next === r.internalNotes) return r;
  audit(ctx, "referrals", r.id, "update", { internal_notes: r.internalNotes }, { internal_notes: next });
  r.internalNotes = next;
  return r;
}
