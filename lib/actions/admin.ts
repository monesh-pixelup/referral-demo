"use server";
/**
 * Admin and team Server Actions. Each one re-checks permission (runAction →
 * authorize), validates the form, runs a lib/mutations function and refreshes.
 */
import { redirect } from "next/navigation";
import {
  deletePayment, editPayment, editPayout, editReferral, rejectInvoice, reversePayout, revertStage, reviewTaxDetails, undoRefund, updateSettings,
} from "../mutations";
import {
  advanceReferral, approveApplication, approveReferral, changePartnerStatus, createPayout, declineReferral, logPayment,
  markLost, markWon, recordRefund, rejectApplication, updatePartner, updateReferralNotes,
} from "../mutations";
import { formatINR } from "../money";
import { resetDemoData } from "../data";
import { authorize } from "../auth";
import { all, bool, date, failure, int, oneOf, percentToBp, required, rupeesToPaise, runAction, str, type ActionState } from "./run";

/* ---------- referrals ---------- */

export async function approveReferralAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction("referral.decide", (ctx) => {
    approveReferral(ctx, required(fd, "id", "Referral"), all(fd, "confirm"));
    return "Approved. The partner sees it in their portal.";
  });
}

export async function declineReferralAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction("referral.decide", (ctx) => {
    declineReferral(ctx, required(fd, "id", "Referral"), str(fd, "reason"));
    return "Declined. The partner sees the reason in their portal.";
  });
}

export async function advanceReferralAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction("referral.pipeline", (ctx) => {
    const r = advanceReferral(ctx, required(fd, "id", "Referral"), { introducedAt: str(fd, "introducedAt") || undefined, note: str(fd, "note") });
    return `Moved to ${r.stage}.`;
  });
}

export async function markWonAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction("referral.pipeline", (ctx) => {
    const r = markWon(ctx, required(fd, "id", "Referral"), {
      signedAt: date(fd, "signedAt", "Signing date"),
      firstContractValue: rupeesToPaise(fd, "firstContractValue", "First contract value"),
      vcDiscount: bool(fd, "vcDiscount"),
    });
    return `Marked won. Rate locked at ${(r.lockedRateBp ?? 0) / 100}%.`;
  });
}

export async function markLostAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction("referral.pipeline", (ctx) => {
    markLost(ctx, required(fd, "id", "Referral"), str(fd, "reason"));
    return "Marked lost.";
  });
}

export async function saveReferralNotesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction("referral.pipeline", (ctx) => {
    updateReferralNotes(ctx, required(fd, "id", "Referral"), str(fd, "notes"));
    return "Notes saved.";
  });
}

/* ---------- payments ---------- */

export async function logPaymentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction("payment.write", (ctx) => {
    const { line } = logPayment(ctx, required(fd, "referralId", "Referral"), {
      receivedOn: date(fd, "receivedOn", "Received date"),
      netAmount: rupeesToPaise(fd, "netAmount", "Net amount"),
      kind: oneOf(fd, "kind", ["milestone", "retainer", "repeat_work"] as const, "Payment kind"),
      invoiceNumber: str(fd, "invoiceNumber"),
    });
    if (!line) return "Payment logged. No commission line (referral not eligible).";
    if (line.status === "void") return `Payment logged. Commission line is void (${line.reason.replaceAll("_", " ")}).`;
    if (line.settledAsDiscount) return `Payment logged. ${formatINR(line.amount)} commission given to the client as a discount.`;
    return `Payment logged. ${formatINR(line.amount)} commission due by ${line.dueBy}.`;
  });
}

export async function recordRefundAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction("payment.write", (ctx) => {
    const { outcome } = recordRefund(ctx, required(fd, "paymentId", "Payment"), {
      refundedOn: date(fd, "refundedOn", "Refund date"),
      amount: rupeesToPaise(fd, "amount", "Refund amount"),
    });
    return `Refund recorded. ${outcome}`;
  });
}

/* ---------- payouts ---------- */

export async function createPayoutAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let partnerId = "";
  const res = await runAction("payout.write", (ctx) => {
    partnerId = required(fd, "partnerId", "Partner");
    const currency = oneOf(fd, "currency", ["INR", "AED", "USD", "EUR", "GBP", "SGD"] as const, "Currency");
    const fx = str(fd, "fxRate");
    createPayout(ctx, partnerId, {
      paidOn: date(fd, "paidOn", "Payment date"),
      tdsAmount: rupeesToPaise(fd, "tdsAmount", "TDS", { allowZero: true }),
      partnerInvoiceNumber: str(fd, "partnerInvoiceNumber"),
      bankReference: str(fd, "bankReference"),
      currency,
      fxRate: fx ? Number(fx) : null,
      notes: str(fd, "notes"),
    });
    return "Payout recorded.";
  });
  if (res?.ok) redirect(`/admin/payouts?partner=${partnerId}`);
  return res;
}

/* ---------- partners ---------- */

export async function updatePartnerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction("partner.write", (ctx) => {
    updatePartner(ctx, required(fd, "id", "Partner"), {
      phone: str(fd, "phone"), company: str(fd, "company"), country: str(fd, "country"),
      isResidentIndia: bool(fd, "isResidentIndia"), panLast4: str(fd, "panLast4"), gstin: str(fd, "gstin"),
      bankDetailsOnFile: bool(fd, "bankDetailsOnFile"), agreementSignedAt: str(fd, "agreementSignedAt") || null,
      portfolioAgreement: bool(fd, "portfolioAgreement"), notes: str(fd, "notes"),
    });
    return "Partner saved.";
  });
}

export async function changePartnerStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction("partner.write", (ctx) => {
    const { partner, voided } = changePartnerStatus(ctx, required(fd, "id", "Partner"), {
      status: oneOf(fd, "status", ["active", "notice_period", "left", "removed"] as const, "Status"),
      effectiveOn: date(fd, "effectiveOn", "Date"),
      reason: str(fd, "reason"),
      forfeit: bool(fd, "forfeit"),
    });
    return `Status set to ${partner.status.replace("_", " ")}.${voided ? ` ${voided} unpaid commission line${voided === 1 ? "" : "s"} forfeited.` : ""}`;
  });
}

/* ---------- applications ---------- */

export async function approveApplicationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction("application.review", (ctx) => {
    const partner = approveApplication(ctx, required(fd, "id", "Application"));
    return `${partner.fullName} is now a partner. Record the signed agreement on their page.`;
  });
}

export async function rejectApplicationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction("application.review", (ctx) => {
    rejectApplication(ctx, required(fd, "id", "Application"), str(fd, "reason"));
    return "Application rejected.";
  });
}

/* ---------- demo ---------- */

export async function resetDemoAction(): Promise<ActionState> {
  try {
    await authorize("demo.reset");
    await resetDemoData();
  } catch (e) {
    return failure(e);
  }
  redirect("/admin");
}

/* ---------- corrections (admin) ---------- */

export async function editPaymentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction("correction", (ctx) => {
    const line = editPayment(ctx, required(fd, "paymentId", "Payment"), {
      receivedOn: date(fd, "receivedOn", "Received date"),
      netAmount: rupeesToPaise(fd, "netAmount", "Net amount"),
      kind: oneOf(fd, "kind", ["milestone", "retainer", "repeat_work"] as const, "Payment kind"),
      invoiceNumber: str(fd, "invoiceNumber"),
    });
    return `Payment corrected.${line ? ` Commission recalculated: ${formatINR(line.amount)}.` : ""}`;
  });
}

export async function deletePaymentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction("correction", (ctx) => {
    deletePayment(ctx, required(fd, "paymentId", "Payment"));
    return "Payment deleted with its unpaid commission.";
  });
}

export async function undoRefundAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction("correction", (ctx) => {
    undoRefund(ctx, required(fd, "paymentId", "Payment"));
    return "Refund undone; commission restored.";
  });
}

export async function editPayoutAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction("correction", (ctx) => {
    editPayout(ctx, required(fd, "payoutId", "Payout"), {
      tdsAmount: rupeesToPaise(fd, "tdsAmount", "TDS", { allowZero: true }),
      partnerInvoiceNumber: str(fd, "partnerInvoiceNumber"),
      bankReference: str(fd, "bankReference"),
      notes: str(fd, "notes"),
    });
    return "Payout corrected.";
  });
}

export async function reversePayoutAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction("correction", (ctx) => reversePayout(ctx, required(fd, "payoutId", "Payout")).message);
}

export async function revertStageAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction("correction", (ctx) => {
    const r = revertStage(ctx, required(fd, "id", "Referral"));
    return `Moved back to ${r.stage}.`;
  });
}

export async function editReferralAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction("correction", (ctx) => {
    const r = editReferral(ctx, required(fd, "id", "Referral"), {
      companyName: required(fd, "companyName", "Company name"),
      companyDomain: str(fd, "companyDomain"),
      contactName: str(fd, "contactName"),
      contactEmail: str(fd, "contactEmail"),
      contactRole: str(fd, "contactRole"),
      need: oneOf(fd, "need", ["brand", "product", "web", "other"] as const, "Need"),
    });
    return `Details saved.${r.duplicateOf ? " Note: this now matches an earlier registration." : ""}`;
  });
}

/* ---------- partner submissions (admin) ---------- */

export async function reviewTaxDetailsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction("partner.write", (ctx) => {
    const accept = str(fd, "decision") === "accept";
    reviewTaxDetails(ctx, required(fd, "id", "Partner"), accept);
    return accept ? "Details verified and applied. TDS suggestions now use them." : "Submitted details discarded.";
  });
}

export async function rejectInvoiceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction("payout.write", (ctx) => {
    rejectInvoice(ctx, required(fd, "invoiceId", "Invoice"), str(fd, "reason"));
    return "Invoice rejected. The partner sees the reason and can send a new one.";
  });
}

/* ---------- settings (admin) ---------- */

export async function updateSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction("settings.write", (ctx) => {
    const min = str(fd, "minFirstContract");
    updateSettings(ctx, {
      tiers: (["referrer", "growth", "strategic"] as const).map((name) => ({
        name, rateBp: percentToBp(fd, `${name}Rate`, "Tier rate"), minWins: int(fd, `${name}MinWins`, "Conversions needed"),
      })),
      tierWindowMonths: int(fd, "tierWindowMonths", "Tier window"),
      decisionWorkingDays: int(fd, "decisionWorkingDays", "Decision time"),
      attributionWindowMonths: int(fd, "attributionWindowMonths", "Attribution window"),
      attributionClosingWarnDays: int(fd, "attributionClosingWarnDays", "Attribution warning"),
      retainerCommissionMonths: int(fd, "retainerCommissionMonths", "Retainer commission period"),
      repeatWorkMonths: int(fd, "repeatWorkMonths", "Repeat-work period"),
      payoutDueDays: int(fd, "payoutDueDays", "Payout due"),
      payoutDueWarnDays: int(fd, "payoutDueWarnDays", "Payout warning"),
      clawbackWindowDays: int(fd, "clawbackWindowDays", "Clawback window"),
      minFirstContractPaise: min ? rupeesToPaise(fd, "minFirstContract", "Minimum first contract") : null,
      noticePeriodDays: int(fd, "noticePeriodDays", "Notice period"),
      tds: {
        thresholdPaise: rupeesToPaise(fd, "tdsThreshold", "TDS threshold", { allowZero: true }),
        rateBp: percentToBp(fd, "tdsRate", "TDS rate"),
        noPanRateBp: percentToBp(fd, "tdsNoPanRate", "TDS rate without PAN"),
      },
      maxRegistrationsPerDay: int(fd, "maxRegistrationsPerDay", "Daily registration limit"),
    });
    return "Settings saved. They apply from now on; rates already locked don't change.";
  });
}
