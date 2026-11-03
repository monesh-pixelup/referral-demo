/**
 * Partner self-service (portal) and the admin steps that go with it.
 * Contact details apply at once. Tax details (PAN, GST, residency) change the
 * TDS a partner pays, so they wait for an admin to verify them.
 */
import { partnerBalance } from "../commission";
import { formatINR } from "../money";
import type { ISODate } from "../dates";
import type { PartnerInvoice } from "../types";
import { audit, diff, fail, find, newId, type Ctx } from "./context";
import { payableLines } from "./payments";

const PAN4 = /^[A-Z0-9]{4}$/;
const GSTIN = /^[0-9A-Z]{15}$/;

export function updateMyContact(ctx: Ctx, partnerId: string, input: { phone: string; company: string; country: string }) {
  const p = find(ctx.data.partners, partnerId, "Partner");
  const next = { phone: input.phone.trim(), company: input.company.trim(), country: input.country.trim() || p.country };
  const d = diff(p, next);
  if (!Object.keys(d.after).length) return p;
  Object.assign(p, next);
  audit(ctx, "partners", p.id, "update", d.before, d.after);
  return p;
}

export function submitTaxDetails(ctx: Ctx, partnerId: string, input: { panLast4: string; gstin: string; isResidentIndia: boolean }) {
  const p = find(ctx.data.partners, partnerId, "Partner");
  const pan = input.panLast4.trim().toUpperCase();
  const gstin = input.gstin.trim().toUpperCase();
  if (pan && !PAN4.test(pan)) fail("Enter only the last 4 characters of your PAN.");
  if (input.isResidentIndia && !pan) fail("Enter the last 4 characters of your PAN.");
  if (gstin && !GSTIN.test(gstin)) fail("A GSTIN is 15 letters and digits.");
  if (pan === (p.panLast4 ?? "") && gstin === (p.gstin ?? "") && input.isResidentIndia === p.isResidentIndia) fail("These match the details we already have.");
  p.pendingDetails = { panLast4: pan || null, gstin: gstin || null, isResidentIndia: input.isResidentIndia, submittedAt: ctx.now };
  audit(ctx, "partners", p.id, "update", null, { pending_details: p.pendingDetails });
  return p;
}

/** Admin: accept (apply to the partner) or discard the submitted tax details. */
export function reviewTaxDetails(ctx: Ctx, partnerId: string, accept: boolean) {
  const p = find(ctx.data.partners, partnerId, "Partner");
  const d = p.pendingDetails;
  if (!d) fail("There are no submitted details to review.");
  if (accept) {
    const before = { pan_last4: p.panLast4, gstin: p.gstin, is_resident_india: p.isResidentIndia };
    p.panLast4 = d.panLast4;
    p.panOnFile = d.panLast4 !== null;
    p.gstin = d.gstin;
    p.gstRegistered = d.gstin !== null;
    p.isResidentIndia = d.isResidentIndia;
    audit(ctx, "partners", p.id, "update", before, { pan_last4: p.panLast4, gstin: p.gstin, is_resident_india: p.isResidentIndia, verified: true });
  } else {
    audit(ctx, "partners", p.id, "update", { pending_details: d }, { pending_details: null, discarded: true });
  }
  p.pendingDetails = null;
  return p;
}

/* ---------- invoices ---------- */

export interface InvoiceInput { invoiceNumber: string; amount: number; issuedOn: ISODate; notes: string }

/** The partner invoices what they're owed. One open invoice at a time. */
export function submitInvoice(ctx: Ctx, partnerId: string, input: InvoiceInput): PartnerInvoice {
  find(ctx.data.partners, partnerId, "Partner");
  const owed = partnerBalance(payableLines(ctx, partnerId, ctx.data.today));
  if (owed <= 0) fail("Nothing is owed to you right now.");
  if (ctx.data.invoices.some((i) => i.partnerId === partnerId && i.status === "submitted")) fail("You already have an invoice waiting to be paid. Withdraw it to send a new one.");
  const number = input.invoiceNumber.trim();
  if (!number) fail("Enter your invoice number.");
  if (ctx.data.invoices.some((i) => i.partnerId === partnerId && i.invoiceNumber === number && i.status !== "rejected")) fail(`You've already used invoice number ${number}.`);
  if (!(input.amount > 0)) fail("Enter the invoice amount.");
  if (input.amount > owed) fail(`The invoice can't be more than you're owed (${formatINR(owed)}).`);
  if (input.issuedOn > ctx.data.today) fail("The invoice date can't be in the future.");
  const inv: PartnerInvoice = {
    id: newId("inv"), partnerId, invoiceNumber: number, amount: input.amount, issuedOn: input.issuedOn, submittedAt: ctx.now,
    status: "submitted", payoutId: null, rejectReason: null, notes: input.notes.trim() || null,
  };
  ctx.data.invoices.push(inv);
  audit(ctx, "partner_invoices", inv.id, "insert", null, { invoice_number: number, amount: inv.amount });
  return inv;
}

export function withdrawInvoice(ctx: Ctx, partnerId: string, invoiceId: string) {
  const inv = find(ctx.data.invoices, invoiceId, "Invoice");
  if (inv.partnerId !== partnerId) fail("Invoice not found");
  if (inv.status !== "submitted") fail("Only an unpaid invoice can be withdrawn.");
  ctx.data.invoices = ctx.data.invoices.filter((i) => i.id !== inv.id);
  audit(ctx, "partner_invoices", inv.id, "delete", { invoice_number: inv.invoiceNumber, amount: inv.amount }, null);
  return inv;
}

export function rejectInvoice(ctx: Ctx, invoiceId: string, reason: string) {
  const inv = find(ctx.data.invoices, invoiceId, "Invoice");
  if (inv.status !== "submitted") fail("Only a submitted invoice can be rejected.");
  if (!reason.trim()) fail("A reason is required; the partner sees it.");
  inv.status = "rejected";
  inv.rejectReason = reason.trim();
  audit(ctx, "partner_invoices", inv.id, "update", { status: "submitted" }, { status: "rejected", reject_reason: inv.rejectReason });
  return inv;
}

export const openInvoice = (ctx: Pick<Ctx, "data">, partnerId: string) =>
  ctx.data.invoices.find((i) => i.partnerId === partnerId && i.status === "submitted") ?? null;
