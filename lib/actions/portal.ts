"use server";
/** Partner portal actions. The partner id always comes from the session, never the form. */
import { redirect } from "next/navigation";
import { AuthError } from "../auth";
import { registerReferral, submitInvoice, submitTaxDetails, updateMyContact, withdrawInvoice } from "../mutations";
import { bool, date, oneOf, required, rupeesToPaise, runAction, str, type ActionState } from "./run";

export async function registerReferralAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const res = await runAction(null, (ctx, user) => {
    if (user.role !== "partner" || !user.partnerId) throw new AuthError("Only partners can register referrals.");
    const r = registerReferral(ctx, user.partnerId, {
      companyName: required(fd, "companyName", "Company name"),
      companyDomain: required(fd, "companyDomain", "Company website"),
      contactName: required(fd, "contactName", "Contact name"),
      contactEmail: required(fd, "contactEmail", "Contact email"),
      contactRole: str(fd, "contactRole"),
      need: oneOf(fd, "need", ["brand", "product", "web", "other"] as const, "Need"),
      partnerNote: required(fd, "partnerNote", "How you know them"),
    });
    id = r.id;
    return "Registered.";
  });
  if (res?.ok) redirect(`/portal?registered=${id}`);
  return res;
}

/* ---------- my details & invoices ---------- */

function partnerOnly(user: { role: string; partnerId: string | null }): string {
  if (user.role !== "partner" || !user.partnerId) throw new AuthError("Only partners can do this.");
  return user.partnerId;
}

export async function updateMyContactAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(null, (ctx, user) => {
    updateMyContact(ctx, partnerOnly(user), { phone: str(fd, "phone"), company: str(fd, "company"), country: str(fd, "country") });
    return "Contact details saved.";
  });
}

export async function submitTaxDetailsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(null, (ctx, user) => {
    submitTaxDetails(ctx, partnerOnly(user), { panLast4: str(fd, "panLast4"), gstin: str(fd, "gstin"), isResidentIndia: bool(fd, "isResidentIndia") });
    return "Sent for verification. We'll apply them once checked.";
  });
}

export async function submitInvoiceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(null, (ctx, user) => {
    submitInvoice(ctx, partnerOnly(user), {
      invoiceNumber: required(fd, "invoiceNumber", "Invoice number"),
      amount: rupeesToPaise(fd, "amount", "Amount"),
      issuedOn: date(fd, "issuedOn", "Invoice date"),
      notes: str(fd, "notes"),
    });
    return "Invoice sent. It's paid in the next payout run.";
  });
}

export async function withdrawInvoiceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(null, (ctx, user) => {
    withdrawInvoice(ctx, partnerOnly(user), required(fd, "invoiceId", "Invoice"));
    return "Invoice withdrawn.";
  });
}
