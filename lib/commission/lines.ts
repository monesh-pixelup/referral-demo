import { addDays, addMonths, daysBetween, type ISODate } from "../dates";
import { applyRate } from "../money";
import { programConfig, type ProgramConfig } from "../program-config";
import type { ClientPayment, CommissionLine, LineReason, LineStatus, Referral } from "../types";

export interface LineDraft {
  amount: number;
  rateBp: number;
  dueBy: ISODate;
  status: LineStatus;
  reason: LineReason;
  settledAsDiscount: boolean;
}

type LineReferral = Pick<Referral, "stage" | "forfeited" | "signedAt" | "lockedRateBp" | "vcDiscount">;
type LinePayment = Pick<ClientPayment, "receivedOn" | "netAmount" | "kind">;

/** SPEC "Commission line for a client payment", steps 1–4. Returns null when no line is created. */
export function commissionForPayment(
  referral: LineReferral, payment: LinePayment, config: ProgramConfig = programConfig,
): LineDraft | null {
  if (referral.stage !== "won" || !referral.signedAt || referral.lockedRateBp === null) return null;

  const rateBp = referral.lockedRateBp;
  const dueBy = addDays(payment.receivedOn, config.payoutDueDays);

  if (referral.forfeited) {
    return { amount: 0, rateBp, dueBy, status: "void", reason: "forfeited", settledAsDiscount: false };
  }

  const limitMonths = payment.kind === "retainer" ? config.retainerCommissionMonths
    : payment.kind === "repeat_work" ? config.repeatWorkMonths : null;
  if (limitMonths !== null && payment.receivedOn > addMonths(referral.signedAt, limitMonths)) {
    return { amount: 0, rateBp, dueBy, status: "void", reason: "outside_12_months", settledAsDiscount: false };
  }

  const amount = applyRate(payment.netAmount, rateBp);
  if (referral.vcDiscount) {
    return { amount, rateBp, dueBy, status: "paid", reason: "eligible", settledAsDiscount: true };
  }
  return { amount, rateBp, dueBy, status: "pending", reason: "eligible", settledAsDiscount: false };
}

export type ClawbackResult =
  | { action: "none"; why: string }
  | { action: "void_original"; replacement: LineDraft | null }
  | { action: "clawback"; line: LineDraft };

/**
 * SPEC "Clawback". A refund within the window creates a negative line, or voids
 * the original line if it is still unpaid. For a partial refund on a pending
 * line, the original is voided and replaced by a line on the amount kept
 * (DECISIONS.md D-07), so commission on money the client did pay is not lost.
 */
export function clawbackForRefund(
  original: Pick<CommissionLine, "status" | "rateBp" | "reason" | "settledAsDiscount">,
  payment: Pick<ClientPayment, "receivedOn" | "netAmount">,
  refundedOn: ISODate, refundAmount: number, config: ProgramConfig = programConfig,
): ClawbackResult {
  if (original.reason !== "eligible" || original.status === "void") return { action: "none", why: "No commission was earned on this payment" };
  if (original.settledAsDiscount) return { action: "none", why: "Commission was given as a client discount" };
  if (daysBetween(payment.receivedOn, refundedOn) > config.clawbackWindowDays) {
    return { action: "none", why: `Refund more than ${config.clawbackWindowDays} days after receipt` };
  }
  const dueBy = addDays(refundedOn, config.payoutDueDays);
  if (original.status === "pending") {
    const kept = payment.netAmount - refundAmount;
    return {
      action: "void_original",
      replacement: kept > 0
        ? { amount: applyRate(kept, original.rateBp), rateBp: original.rateBp, dueBy: addDays(payment.receivedOn, config.payoutDueDays), status: "pending", reason: "eligible", settledAsDiscount: false }
        : null,
    };
  }
  return {
    action: "clawback",
    line: { amount: -applyRate(refundAmount, original.rateBp), rateBp: original.rateBp, dueBy, status: "pending", reason: "clawback", settledAsDiscount: false },
  };
}

/** owed = sum(pending lines). Negative carries forward to the next payout. */
export function partnerBalance(lines: Pick<CommissionLine, "status" | "amount" | "settledAsDiscount">[]): number {
  return lines.filter((l) => l.status === "pending" && !l.settledAsDiscount).reduce((s, l) => s + l.amount, 0);
}
