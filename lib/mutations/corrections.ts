/**
 * Admin corrections for mistakes. Each one is refused once money has moved in
 * a way it would contradict (e.g. a commission line already paid out). The
 * audit log keeps the full before/after, so nothing is lost by correcting.
 */
import { commissionForPayment, findDuplicate, normaliseDomain } from "../commission";
import { formatINR } from "../money";
import { programConfig, type ProgramConfig } from "../program-config";
import { STAGE_LABEL, type Need, type PaymentKind, type Referral } from "../types";
import type { ISODate } from "../dates";
import { audit, fail, find, newId, type Ctx } from "./context";

const sys = (ctx: Ctx): Ctx => ({ ...ctx, actor: "system" });

function paymentLines(ctx: Ctx, paymentId: string) {
  return ctx.data.lines.filter((l) => l.clientPaymentId === paymentId);
}

function removeLines(ctx: Ctx, ids: Set<string>) {
  for (const l of ctx.data.lines.filter((x) => ids.has(x.id))) audit(sys(ctx), "commission_lines", l.id, "delete", { amount: l.amount, status: l.status, reason: l.reason }, null);
  ctx.data.lines = ctx.data.lines.filter((l) => !ids.has(l.id));
}

/* ---------- client payments ---------- */

function assertPaymentEditable(ctx: Ctx, paymentId: string) {
  const p = find(ctx.data.payments, paymentId, "Payment");
  if (p.refunded) fail("Undo the refund first.");
  if (paymentLines(ctx, p.id).some((l) => l.status === "paid" && !l.settledAsDiscount)) {
    fail("Its commission has already been paid out. Record a refund instead, or reverse that payout first.");
  }
  return p;
}

export interface PaymentEdit { receivedOn: ISODate; netAmount: number; kind: PaymentKind; invoiceNumber: string }

/** Fix a payment logged with the wrong date, amount, kind or invoice. Its commission is recalculated. */
export function editPayment(ctx: Ctx, paymentId: string, input: PaymentEdit, config: ProgramConfig = programConfig) {
  const p = assertPaymentEditable(ctx, paymentId);
  const r = find(ctx.data.referrals, p.referralId, "Referral");
  if (input.receivedOn > ctx.data.today) fail("The received date can't be in the future.");
  if (r.signedAt && input.receivedOn < r.signedAt) fail("The received date can't be before the contract was signed.");
  if (!(input.netAmount > 0)) fail("Enter the net amount received.");
  const invoice = input.invoiceNumber.trim();
  if (invoice && ctx.data.payments.some((x) => x.id !== p.id && x.invoiceNumber === invoice)) fail(`Invoice ${invoice} is already logged.`);

  const before = { received_on: p.receivedOn, net_amount: p.netAmount, kind: p.kind, invoice_number: p.invoiceNumber };
  p.receivedOn = input.receivedOn;
  p.netAmount = input.netAmount;
  p.kind = input.kind;
  p.invoiceNumber = invoice;
  audit(ctx, "client_payments", p.id, "update", before, { received_on: p.receivedOn, net_amount: p.netAmount, kind: p.kind, invoice_number: invoice });

  removeLines(ctx, new Set(paymentLines(ctx, p.id).map((l) => l.id)));
  const draft = commissionForPayment(r, p, config);
  if (!draft) return null;
  const line = { id: newId("com"), partnerId: r.partnerId, referralId: r.id, clientPaymentId: p.id, payoutId: null, createdOn: ctx.data.today, ...draft };
  ctx.data.lines.push(line);
  audit(sys(ctx), "commission_lines", line.id, "insert", null, { amount: line.amount, reason: line.reason, status: line.status });
  return line;
}

/** Remove a payment logged by mistake, with its unpaid commission. */
export function deletePayment(ctx: Ctx, paymentId: string) {
  const p = assertPaymentEditable(ctx, paymentId);
  removeLines(ctx, new Set(paymentLines(ctx, p.id).map((l) => l.id)));
  ctx.data.payments = ctx.data.payments.filter((x) => x.id !== p.id);
  audit(ctx, "client_payments", p.id, "delete", { net_amount: p.netAmount, received_on: p.receivedOn, invoice_number: p.invoiceNumber }, null);
  return p;
}

/**
 * Undo a refund recorded by mistake. The adjustment lines it created are
 * removed and the original line is restored, as long as no adjustment has
 * been settled in a payout yet.
 */
export function undoRefund(ctx: Ctx, paymentId: string) {
  const p = find(ctx.data.payments, paymentId, "Payment");
  if (!p.refunded) fail("This payment has no refund.");
  const lines = paymentLines(ctx, p.id);
  const original = lines[0];
  const adjustments = lines.slice(1);
  if (adjustments.some((l) => l.status === "paid")) fail("The refund adjustment has already been settled in a payout. Reverse that payout first.");

  audit(ctx, "client_payments", p.id, "update", { refunded: true, refunded_on: p.refundedOn, refund_amount: p.refundAmount }, { refunded: false, refund_amount: 0 });
  p.refunded = false;
  p.refundedOn = null;
  p.refundAmount = 0;
  removeLines(ctx, new Set(adjustments.map((l) => l.id)));
  const r = find(ctx.data.referrals, p.referralId, "Referral");
  if (original && original.status === "void" && original.reason === "eligible" && !r.forfeited) {
    audit(sys(ctx), "commission_lines", original.id, "update", { status: "void" }, { status: "pending" });
    original.status = "pending";
  }
  return p;
}

/* ---------- payouts ---------- */

export interface PayoutEdit { tdsAmount: number; partnerInvoiceNumber: string; bankReference: string; notes: string }

/** Fix a payout's references or the TDS figure (net is recalculated). */
export function editPayout(ctx: Ctx, payoutId: string, input: PayoutEdit) {
  const x = find(ctx.data.payouts, payoutId, "Payout");
  if (input.tdsAmount < 0 || input.tdsAmount > x.grossAmount) fail("TDS must be between zero and the gross amount.");
  if (!input.partnerInvoiceNumber.trim()) fail("Enter the partner's invoice number.");
  if (!input.bankReference.trim()) fail("Enter the bank transfer reference (UTR).");
  const before = { tds_amount: x.tdsAmount, net_amount: x.netAmount, partner_invoice_number: x.partnerInvoiceNumber, bank_reference: x.bankReference, notes: x.notes };
  x.tdsAmount = input.tdsAmount;
  x.netAmount = x.grossAmount - input.tdsAmount;
  x.partnerInvoiceNumber = input.partnerInvoiceNumber.trim();
  x.bankReference = input.bankReference.trim();
  x.notes = input.notes.trim() || null;
  audit(ctx, "payouts", x.id, "update", before, { tds_amount: x.tdsAmount, net_amount: x.netAmount, partner_invoice_number: x.partnerInvoiceNumber, bank_reference: x.bankReference, notes: x.notes });
  return x;
}

/**
 * Reverse a payout recorded by mistake: its lines go back to pending.
 * Only the partner's latest payout, so later TDS suggestions stay consistent.
 */
export function reversePayout(ctx: Ctx, payoutId: string) {
  const x = find(ctx.data.payouts, payoutId, "Payout");
  const later = ctx.data.payouts.filter((p) => p.partnerId === x.partnerId && p.id !== x.id && (p.paidOn > x.paidOn || (p.paidOn === x.paidOn && ctx.data.payouts.indexOf(p) > ctx.data.payouts.indexOf(x))));
  if (later.length) fail("Only the partner's most recent payout can be reversed.");
  const lines = ctx.data.lines.filter((l) => l.payoutId === x.id);
  for (const l of lines) {
    audit(sys(ctx), "commission_lines", l.id, "update", { status: "paid", payout_id: x.id }, { status: "pending", payout_id: null });
    l.status = "pending";
    l.payoutId = null;
  }
  for (const inv of ctx.data.invoices.filter((i) => i.payoutId === x.id)) {
    inv.status = "submitted";
    inv.payoutId = null;
  }
  ctx.data.payouts = ctx.data.payouts.filter((p) => p.id !== x.id);
  audit(ctx, "payouts", x.id, "delete", { gross_amount: x.grossAmount, tds_amount: x.tdsAmount, paid_on: x.paidOn, bank_reference: x.bankReference }, null);
  return { payout: x, lines: lines.length, message: `Payout of ${formatINR(x.grossAmount)} reversed; ${lines.length} line${lines.length === 1 ? "" : "s"} back to pending.` };
}

/* ---------- referrals ---------- */

/**
 * Undo the last stage change. The history entry is removed (the audit log
 * keeps it) so the funnel's "ever reached" counts stay right. Undoing a win
 * is refused once a payment is logged, and clears the locked rate.
 */
export function revertStage(ctx: Ctx, referralId: string) {
  const r = find(ctx.data.referrals, referralId, "Referral");
  const history = ctx.data.stageHistory.filter((h) => h.referralId === r.id).sort((a, b) => a.changedAt.localeCompare(b.changedAt));
  const last = history.at(-1);
  if (!last || !last.fromStage) fail("There is no earlier stage to go back to.");
  if (last.toStage !== r.stage) fail("The stage history doesn't match the current stage; correct it manually.");
  if (r.stage === "won" && ctx.data.payments.some((p) => p.referralId === r.id)) fail("Delete this referral's client payments before undoing the win.");

  const before: Partial<Referral> = {};
  const clear = <K extends keyof Referral>(k: K, v: Referral[K]) => { (before as Record<string, unknown>)[k] = r[k]; r[k] = v; };
  if (r.stage === "won") { clear("signedAt", null); clear("firstContractValue", null); clear("lockedRateBp", null); clear("lockedTier", null); clear("vcDiscount", false); }
  if (r.stage === "lost") clear("lostReason", null);
  if (r.stage === "declined") clear("declineReason", null);
  if (r.stage === "approved" || r.stage === "declined") { clear("decidedAt", null); clear("decidedBy", null); }
  if (r.stage === "introduced") { clear("introducedAt", null); clear("attributionExpiresAt", null); }

  const from = r.stage;
  r.stage = last.fromStage;
  ctx.data.stageHistory = ctx.data.stageHistory.filter((h) => h.id !== last.id);
  audit(ctx, "referrals", r.id, "update", { stage: from, ...before }, { stage: r.stage, note: `Reverted ${STAGE_LABEL[from]}` });
  return r;
}

export interface ReferralEdit {
  companyName: string;
  companyDomain: string;
  contactName: string;
  contactEmail: string;
  contactRole: string;
  need: Need;
}

/** Fix company or contact details. While still registered, the duplicate check is re-run. */
export function editReferral(ctx: Ctx, referralId: string, input: ReferralEdit) {
  const r = find(ctx.data.referrals, referralId, "Referral");
  if (!input.companyName.trim()) fail("Company name is required.");
  const next = {
    companyName: input.companyName.trim(), companyDomain: normaliseDomain(input.companyDomain),
    contactName: input.contactName.trim(), contactEmail: input.contactEmail.trim().toLowerCase(),
    contactRole: input.contactRole.trim(), need: input.need,
  };
  if (r.stage !== "registered" && (next.companyName !== r.companyName || next.companyDomain !== r.companyDomain)) {
    fail("The company can only be changed while the referral is awaiting a decision.");
  }
  const before = { company_name: r.companyName, company_domain: r.companyDomain, contact_name: r.contactName, contact_email: r.contactEmail, contact_role: r.contactRole, need: r.need };
  Object.assign(r, next);
  if (r.stage === "registered") r.duplicateOf = findDuplicate(r, ctx.data.referrals)?.id ?? null;
  audit(ctx, "referrals", r.id, "update", before, { company_name: r.companyName, company_domain: r.companyDomain, contact_name: r.contactName, contact_email: r.contactEmail, contact_role: r.contactRole, need: r.need, duplicate_of: r.duplicateOf });
  return r;
}
