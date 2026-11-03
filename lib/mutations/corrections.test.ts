import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildDemoDataset } from "../data/seed";
import { partnerBalance, suggestTds } from "../commission";
import { addDays } from "../dates";
import { applyProgramConfig, DEFAULT_PROGRAM_CONFIG, programConfig } from "../program-config";
import { funnel, kpis } from "../queries";
import type { Dataset } from "../types";
import {
  advanceReferral, approveReferral, createPayout, deletePayment, editPayment, editPayout, editReferral, logPayment, markWon,
  openInvoice, recordRefund, registerReferral, rejectInvoice, reversePayout, revertStage, reviewTaxDetails, submitInvoice,
  submitTaxDetails, undoRefund, updateMyContact, updateSettings, withdrawInvoice, type Ctx, type SettingsInput,
} from ".";

const TODAY = "2026-11-03";
let data: Dataset;
let ctx: Ctx;

beforeEach(() => {
  applyProgramConfig(DEFAULT_PROGRAM_CONFIG);
  data = buildDemoDataset(TODAY);
  ctx = { data, actor: "Test Admin", now: `${TODAY}T06:30:00.000Z` };
});
afterEach(() => applyProgramConfig(DEFAULT_PROGRAM_CONFIG));

const partner = (n: string) => data.partners.find((p) => p.fullName === n)!;
const pay = { paidOn: TODAY, tdsAmount: 0, partnerInvoiceNumber: "INV-T", bankReference: "UTR-T", currency: "INR", fxRate: null, notes: "" };

function wonReferral(name = "Kabir Mehta", company = "Fixco") {
  const p = partner(name);
  const r = registerReferral({ ...ctx, now: `${addDays(TODAY, -30)}T06:30:00.000Z` }, p.id, {
    companyName: company, companyDomain: `${company.toLowerCase()}.com`, contactName: "A B", contactEmail: "a@b.com", contactRole: "", need: "web", partnerNote: "x",
  });
  approveReferral(ctx, r.id, ["client", "conversation", "warm"]);
  advanceReferral(ctx, r.id, { introducedAt: addDays(TODAY, -20) });
  markWon(ctx, r.id, { signedAt: addDays(TODAY, -10), firstContractValue: 5_00_000_00, vcDiscount: false });
  return r;
}

describe("settings", () => {
  const input = (): SettingsInput => {
    const { timezone: _tz, ...rest } = structuredClone(programConfig);
    void _tz;
    return { ...rest, tiers: rest.tiers.map(({ name, rateBp, minWins }) => ({ name, rateBp, minWins })), tds: { thresholdPaise: rest.tds.thresholdPaise, rateBp: rest.tds.rateBp, noPanRateBp: rest.tds.noPanRateBp } };
  };

  it("applies new rules everywhere and keeps already-locked rates", () => {
    const r = wonReferral();
    const locked = r.lockedRateBp;
    const next = input();
    next.tiers[0].rateBp = 1100;
    next.payoutDueDays = 30;
    updateSettings(ctx, next);
    expect(programConfig.tiers[0].rateBp).toBe(1100);
    expect(r.lockedRateBp).toBe(locked);
    const { line } = logPayment(ctx, r.id, { receivedOn: TODAY, netAmount: 100_000_00, kind: "milestone", invoiceNumber: "" });
    expect(line!.dueBy).toBe(addDays(TODAY, 30));
    expect(data.audit[0].table).toBe("commission_lines");
    expect(data.audit.some((a) => a.table === "settings")).toBe(true);
  });

  it("rejects inconsistent tiers and out-of-range values", () => {
    const bad = input();
    bad.tiers[2].minWins = 2;
    expect(() => updateSettings(ctx, bad)).toThrow(/more conversions/);
    const bad2 = input();
    bad2.payoutDueDays = 0;
    expect(() => updateSettings(ctx, bad2)).toThrow(/Payout due/);
    expect(programConfig.payoutDueDays).toBe(DEFAULT_PROGRAM_CONFIG.payoutDueDays);
  });

  it("a minimum first-contract size is enforced when marking won", () => {
    const next = input();
    next.minFirstContractPaise = 10_00_000_00;
    updateSettings(ctx, next);
    expect(() => wonReferral("Kabir Mehta", "Smallco")).toThrow(/below the program minimum/);
  });
});

describe("payment corrections", () => {
  it("editing a payment recalculates its commission", () => {
    const r = wonReferral();
    const { payment } = logPayment(ctx, r.id, { receivedOn: TODAY, netAmount: 1_00_000_00, kind: "milestone", invoiceNumber: "F-1" });
    const line = editPayment(ctx, payment.id, { receivedOn: TODAY, netAmount: 2_00_000_00, kind: "milestone", invoiceNumber: "F-1" })!;
    expect(payment.netAmount).toBe(2_00_000_00);
    const lines = data.lines.filter((l) => l.clientPaymentId === payment.id);
    expect(lines).toHaveLength(1);
    expect(line.amount).toBe(Math.round((2_00_000_00 * r.lockedRateBp!) / 10_000));
  });

  it("refuses to edit or delete a payment whose commission is paid", () => {
    const r = wonReferral();
    const { payment } = logPayment(ctx, r.id, { receivedOn: TODAY, netAmount: 1_00_000_00, kind: "milestone", invoiceNumber: "" });
    createPayout(ctx, r.partnerId, pay);
    expect(() => editPayment(ctx, payment.id, { receivedOn: TODAY, netAmount: 1, kind: "milestone", invoiceNumber: "" })).toThrow(/already been paid/);
    expect(() => deletePayment(ctx, payment.id)).toThrow(/already been paid/);
  });

  it("deleting a payment removes it and its unpaid line", () => {
    const r = wonReferral();
    const owedBefore = kpis(data).owed;
    const { payment } = logPayment(ctx, r.id, { receivedOn: TODAY, netAmount: 1_00_000_00, kind: "milestone", invoiceNumber: "" });
    deletePayment(ctx, payment.id);
    expect(data.payments.find((p) => p.id === payment.id)).toBeUndefined();
    expect(data.lines.filter((l) => l.clientPaymentId === payment.id)).toHaveLength(0);
    expect(kpis(data).owed).toBe(owedBefore);
  });

  it("undoing a refund on an unpaid line restores it", () => {
    const r = wonReferral();
    const { payment, line } = logPayment(ctx, r.id, { receivedOn: TODAY, netAmount: 1_00_000_00, kind: "milestone", invoiceNumber: "" });
    recordRefund(ctx, payment.id, { refundedOn: TODAY, amount: 40_000_00 });
    expect(line!.status).toBe("void");
    undoRefund(ctx, payment.id);
    expect(payment.refunded).toBe(false);
    expect(line!.status).toBe("pending");
    expect(data.lines.filter((l) => l.clientPaymentId === payment.id)).toHaveLength(1);
  });

  it("undoing a refund after payout removes the clawback", () => {
    const r = wonReferral();
    const { payment } = logPayment(ctx, r.id, { receivedOn: TODAY, netAmount: 1_00_000_00, kind: "milestone", invoiceNumber: "" });
    createPayout(ctx, r.partnerId, pay);
    recordRefund(ctx, payment.id, { refundedOn: TODAY, amount: 1_00_000_00 });
    expect(data.lines.some((l) => l.clientPaymentId === payment.id && l.reason === "clawback")).toBe(true);
    undoRefund(ctx, payment.id);
    expect(data.lines.some((l) => l.clientPaymentId === payment.id && l.reason === "clawback")).toBe(false);
  });
});

describe("payout corrections", () => {
  it("reversing the latest payout puts its lines back to pending", () => {
    const p = partner("Tara Fernandes");
    const owed = partnerBalance(data.lines.filter((l) => l.partnerId === p.id));
    const payout = createPayout(ctx, p.id, pay);
    expect(partnerBalance(data.lines.filter((l) => l.partnerId === p.id))).toBe(0);
    reversePayout(ctx, payout.id);
    expect(partnerBalance(data.lines.filter((l) => l.partnerId === p.id))).toBe(owed);
    expect(data.payouts.find((x) => x.id === payout.id)).toBeUndefined();
  });

  it("only the latest payout can be reversed", () => {
    const p = partner("Ananya Rao");
    const older = data.payouts.filter((x) => x.partnerId === p.id).sort((a, b) => a.paidOn.localeCompare(b.paidOn))[0];
    expect(() => reversePayout(ctx, older.id)).toThrow(/most recent/);
  });

  it("editing a payout's TDS recalculates net", () => {
    const x = data.payouts[0];
    editPayout(ctx, x.id, { tdsAmount: 100_00, partnerInvoiceNumber: "NEW-1", bankReference: "UTR-NEW", notes: "" });
    expect(x.netAmount).toBe(x.grossAmount - 100_00);
    expect(x.bankReference).toBe("UTR-NEW");
  });
});

describe("referral corrections", () => {
  it("undoing a win clears the locked rate and the funnel count", () => {
    const r = wonReferral();
    const wonBefore = funnel(data).find((s) => s.stage === "won")!.reached;
    revertStage(ctx, r.id);
    expect(r.stage).toBe("introduced");
    expect(r.lockedRateBp).toBeNull();
    expect(r.signedAt).toBeNull();
    expect(funnel(data).find((s) => s.stage === "won")!.reached).toBe(wonBefore - 1);
  });

  it("refuses to undo a win once a payment is logged", () => {
    const r = wonReferral();
    logPayment(ctx, r.id, { receivedOn: TODAY, netAmount: 100_00, kind: "milestone", invoiceNumber: "" });
    expect(() => revertStage(ctx, r.id)).toThrow(/Delete this referral's client payments/);
  });

  it("undoing an approval returns it to registered", () => {
    const r = wonReferral();
    revertStage(ctx, r.id); revertStage(ctx, r.id); revertStage(ctx, r.id);
    expect(r.stage).toBe("registered");
    expect(r.decidedAt).toBeNull();
    expect(() => revertStage(ctx, r.id)).toThrow(/no earlier stage/);
  });

  it("editing a registered referral re-runs the duplicate check; company is locked after decision", () => {
    const existing = data.referrals.find((x) => x.stage === "won")!;
    const p = partner("Neel Shah");
    const r = registerReferral(ctx, p.id, { companyName: "Typo Co", companyDomain: "typo.co", contactName: "A", contactEmail: "a@a.com", contactRole: "", need: "web", partnerNote: "x" });
    expect(r.duplicateOf).toBeNull();
    editReferral(ctx, r.id, { companyName: existing.companyName, companyDomain: existing.companyDomain, contactName: "A", contactEmail: "a@a.com", contactRole: "", need: "web" });
    expect(r.duplicateOf).toBe(existing.id);
    expect(() => editReferral(ctx, existing.id, { companyName: "Other", companyDomain: existing.companyDomain, contactName: "", contactEmail: "", contactRole: "", need: "web" })).toThrow(/awaiting a decision/);
  });
});

describe("partner details and invoices", () => {
  it("contact details apply at once; tax details wait for verification", () => {
    const p = partner("Kabir Mehta");
    updateMyContact(ctx, p.id, { phone: "+91 1", company: "New Studio", country: "India" });
    expect(p.company).toBe("New Studio");
    submitTaxDetails(ctx, p.id, { panLast4: "9z9z", gstin: "", isResidentIndia: true });
    expect(p.panLast4).toBe("5502");
    expect(p.pendingDetails?.panLast4).toBe("9Z9Z");
    reviewTaxDetails(ctx, p.id, true);
    expect(p.panLast4).toBe("9Z9Z");
    expect(p.pendingDetails).toBeNull();
  });

  it("verifying a PAN drops the suggested TDS from 20%", () => {
    const p = partner("Priya Nair");
    const gross = partnerBalance(data.lines.filter((l) => l.partnerId === p.id));
    const before = suggestTds(p, TODAY, gross, data.payouts.filter((x) => x.partnerId === p.id)).amount;
    reviewTaxDetails(ctx, p.id, true);
    const after = suggestTds(p, TODAY, gross, data.payouts.filter((x) => x.partnerId === p.id)).amount;
    expect(before).toBe(Math.round(gross * 0.2));
    expect(after).toBeLessThan(before);
  });

  it("discarding submitted details leaves the record unchanged", () => {
    const p = partner("Priya Nair");
    reviewTaxDetails(ctx, p.id, false);
    expect(p.panOnFile).toBe(false);
    expect(p.pendingDetails).toBeNull();
  });

  it("an invoice can't exceed what's owed; one open at a time; payout settles it", () => {
    const p = partner("Tara Fernandes");
    const owed = partnerBalance(data.lines.filter((l) => l.partnerId === p.id));
    expect(() => submitInvoice(ctx, p.id, { invoiceNumber: "TF-1", amount: owed + 1, issuedOn: TODAY, notes: "" })).toThrow(/more than you're owed/);
    const inv = submitInvoice(ctx, p.id, { invoiceNumber: "TF-1", amount: owed, issuedOn: TODAY, notes: "" });
    expect(() => submitInvoice(ctx, p.id, { invoiceNumber: "TF-2", amount: 1, issuedOn: TODAY, notes: "" })).toThrow(/already have an invoice/);
    const payout = createPayout(ctx, p.id, { ...pay, partnerInvoiceNumber: "TF-1" });
    expect(inv.status).toBe("paid");
    expect(inv.payoutId).toBe(payout.id);
    reversePayout(ctx, payout.id);
    expect(inv.status).toBe("submitted");
  });

  it("partners withdraw their own invoices; admins reject with a reason", () => {
    const p = partner("Tara Fernandes");
    const inv = submitInvoice(ctx, p.id, { invoiceNumber: "TF-9", amount: 100, issuedOn: TODAY, notes: "" });
    expect(() => withdrawInvoice(ctx, partner("Kabir Mehta").id, inv.id)).toThrow(/not found/);
    withdrawInvoice(ctx, p.id, inv.id);
    expect(openInvoice(ctx, p.id)).toBeNull();
    const inv2 = submitInvoice(ctx, p.id, { invoiceNumber: "TF-10", amount: 100, issuedOn: TODAY, notes: "" });
    expect(() => rejectInvoice(ctx, inv2.id, "")).toThrow(/reason/);
    rejectInvoice(ctx, inv2.id, "Amount doesn't match");
    expect(inv2.status).toBe("rejected");
  });

  it("can't invoice when nothing is owed", () => {
    expect(() => submitInvoice(ctx, partner("Kabir Mehta").id, { invoiceNumber: "K-1", amount: 100, issuedOn: TODAY, notes: "" })).toThrow(/Nothing is owed/);
  });
});
