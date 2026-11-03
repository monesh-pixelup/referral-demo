import { clawbackForRefund, commissionForPayment, partnerBalance, suggestTds } from "../commission";
import { formatINR } from "../money";
import { programConfig, type ProgramConfig } from "../program-config";
import type { ClientPayment, CommissionLine, PaymentKind, Payout } from "../types";
import type { ISODate } from "../dates";
import { audit, fail, find, newId, type Ctx } from "./context";

export interface PaymentInput { receivedOn: ISODate; netAmount: number; kind: PaymentKind; invoiceNumber: string }

/** SPEC "Commission line for a client payment": every payment on a won referral creates one line. */
export function logPayment(ctx: Ctx, referralId: string, input: PaymentInput, config: ProgramConfig = programConfig) {
  const r = find(ctx.data.referrals, referralId, "Referral");
  if (r.stage !== "won" || !r.signedAt) fail("Payments can only be logged on won referrals.");
  if (input.receivedOn > ctx.data.today) fail("The received date can't be in the future.");
  if (input.receivedOn < r.signedAt) fail("The received date can't be before the contract was signed.");
  if (!(input.netAmount > 0)) fail("Enter the net amount received (excluding GST).");
  const invoice = input.invoiceNumber.trim();
  if (invoice && ctx.data.payments.some((p) => p.invoiceNumber === invoice)) fail(`Invoice ${invoice} is already logged.`);

  const payment: ClientPayment = {
    id: newId("pay"), referralId, receivedOn: input.receivedOn, netAmount: input.netAmount, kind: input.kind,
    invoiceNumber: invoice, refunded: false, refundedOn: null, refundAmount: 0,
  };
  ctx.data.payments.push(payment);
  audit(ctx, "client_payments", payment.id, "insert", null, { net_amount: payment.netAmount, kind: payment.kind, invoice_number: invoice });

  const draft = commissionForPayment(r, payment, config);
  let line: CommissionLine | null = null;
  if (draft) {
    line = { id: newId("com"), partnerId: r.partnerId, referralId: r.id, clientPaymentId: payment.id, payoutId: null, createdOn: ctx.data.today, ...draft };
    ctx.data.lines.push(line);
    audit({ ...ctx, actor: "system" }, "commission_lines", line.id, "insert", null, { amount: line.amount, reason: line.reason, status: line.status });
  }
  return { payment, line };
}

/** SPEC "Clawback". Records the refund on the payment, then voids or claws back its commission. */
export function recordRefund(ctx: Ctx, paymentId: string, input: { refundedOn: ISODate; amount: number }, config: ProgramConfig = programConfig) {
  const p = find(ctx.data.payments, paymentId, "Payment");
  if (p.refunded) fail("This payment already has a refund recorded.");
  if (!(input.amount > 0)) fail("Enter the refund amount.");
  if (input.amount > p.netAmount) fail(`The refund can't exceed the payment (${formatINR(p.netAmount)}).`);
  if (input.refundedOn > ctx.data.today) fail("The refund date can't be in the future.");
  if (input.refundedOn < p.receivedOn) fail("The refund date can't be before the payment was received.");

  audit(ctx, "client_payments", p.id, "update", { refunded: false, refund_amount: 0 }, { refunded: true, refunded_on: input.refundedOn, refund_amount: input.amount });
  p.refunded = true;
  p.refundedOn = input.refundedOn;
  p.refundAmount = input.amount;

  const original = ctx.data.lines.find((l) => l.clientPaymentId === p.id && l.reason === "eligible" && l.status !== "void");
  if (!original) return { outcome: "No commission was earned on this payment, so nothing changes." };
  const res = clawbackForRefund(original, p, input.refundedOn, input.amount, config);
  const sys: Ctx = { ...ctx, actor: "system" };
  if (res.action === "none") return { outcome: `${res.why}; commission unchanged.` };
  if (res.action === "void_original") {
    audit(sys, "commission_lines", original.id, "update", { status: original.status }, { status: "void" });
    original.status = "void";
    if (res.replacement) {
      const line: CommissionLine = { id: newId("com"), partnerId: original.partnerId, referralId: original.referralId, clientPaymentId: p.id, payoutId: null, createdOn: ctx.data.today, ...res.replacement };
      ctx.data.lines.push(line);
      audit(sys, "commission_lines", line.id, "insert", null, { amount: line.amount, reason: line.reason });
      return { outcome: `Unpaid line voided and replaced with ${formatINR(line.amount)} on the amount kept.` };
    }
    return { outcome: "Unpaid commission line voided." };
  }
  const line: CommissionLine = { id: newId("com"), partnerId: original.partnerId, referralId: original.referralId, clientPaymentId: p.id, payoutId: null, createdOn: ctx.data.today, ...res.line };
  ctx.data.lines.push(line);
  audit(sys, "commission_lines", line.id, "insert", null, { amount: line.amount, reason: "clawback" });
  return { outcome: `Clawback of ${formatINR(-line.amount)} deducted from the next payout.` };
}

/* ---------- payouts ---------- */

/** Pending cash lines included in a payout made on `paidOn`. */
export function payableLines(ctx: Pick<Ctx, "data">, partnerId: string, paidOn: ISODate) {
  return ctx.data.lines.filter((l) => l.partnerId === partnerId && l.status === "pending" && !l.settledAsDiscount && l.createdOn <= paidOn);
}

export function payoutPreview(ctx: Pick<Ctx, "data">, partnerId: string, paidOn: ISODate, config: ProgramConfig = programConfig) {
  const partner = find(ctx.data.partners, partnerId, "Partner");
  const lines = payableLines(ctx, partnerId, paidOn);
  const gross = partnerBalance(lines);
  const tds = suggestTds(partner, paidOn, Math.max(gross, 0), ctx.data.payouts.filter((x) => x.partnerId === partnerId), config);
  return { partner, lines, gross, tds };
}

export interface PayoutInput {
  paidOn: ISODate;
  tdsAmount: number;
  partnerInvoiceNumber: string;
  bankReference: string;
  currency: string;
  fxRate: number | null;
  notes: string;
}

/** SPEC "Payout": settles every pending line; TDS is suggested and the admin's figure is stored beside it. */
export function createPayout(ctx: Ctx, partnerId: string, input: PayoutInput, config: ProgramConfig = programConfig) {
  if (input.paidOn > ctx.data.today) fail("The payment date can't be in the future.");
  const { partner, lines, gross, tds } = payoutPreview(ctx, partnerId, input.paidOn, config);
  if (lines.length === 0 || gross <= 0) fail("Nothing is owed to this partner; a negative balance carries forward.");
  if (!partner.bankDetailsOnFile) fail("Bank details are not on file for this partner.");
  if (input.tdsAmount < 0 || input.tdsAmount > gross) fail("TDS must be between zero and the gross amount.");
  if (!input.partnerInvoiceNumber.trim()) fail("Enter the partner's invoice number.");
  if (!input.bankReference.trim()) fail("Enter the bank transfer reference (UTR).");
  if (input.currency !== "INR" && !input.fxRate) fail("Enter the exchange rate for a non-INR payout.");

  const payout: Payout = {
    id: newId("pyo"), partnerId, paidOn: input.paidOn, grossAmount: gross, tdsSuggested: tds.amount, tdsAmount: input.tdsAmount,
    netAmount: gross - input.tdsAmount, currency: input.currency, fxRate: input.currency === "INR" ? null : input.fxRate,
    partnerInvoiceNumber: input.partnerInvoiceNumber.trim(), bankReference: input.bankReference.trim(), tdsCertificateUrl: null,
    notes: input.notes.trim() || (tds.manual ? tds.note : null),
  };
  ctx.data.payouts.push(payout);
  audit(ctx, "payouts", payout.id, "insert", null, { gross_amount: gross, tds_suggested: tds.amount, tds_amount: input.tdsAmount, lines: lines.length });
  for (const l of lines) {
    audit({ ...ctx, actor: "system" }, "commission_lines", l.id, "update", { status: "pending" }, { status: "paid", payout_id: payout.id });
    l.status = "paid";
    l.payoutId = payout.id;
  }
  // The partner's open invoice with this number is settled by the payout.
  const inv = ctx.data.invoices.find((i) => i.partnerId === partnerId && i.status === "submitted" && i.invoiceNumber === payout.partnerInvoiceNumber);
  if (inv) {
    inv.status = "paid";
    inv.payoutId = payout.id;
    audit(ctx, "partner_invoices", inv.id, "update", { status: "submitted" }, { status: "paid", payout_id: payout.id });
  }
  return payout;
}
