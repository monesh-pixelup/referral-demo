import { beforeEach, describe, expect, it } from "vitest";
import { buildDemoDataset } from "../data/seed";
import { partnerBalance } from "../commission";
import { addDays } from "../dates";
import { kpis } from "../queries";
import type { Dataset } from "../types";
import {
  MutationError, advanceReferral, approveApplication, approveReferral, changePartnerStatus, createPayout, declineReferral,
  logPayment, markLost, markWon, payoutPreview, recordRefund, registerReferral, rejectApplication, submitApplication,
  updatePartner, type Ctx,
} from ".";

const TODAY = "2026-11-03";
let data: Dataset;
let ctx: Ctx;
const now = `${TODAY}T06:30:00.000Z`; // 12:00 IST

beforeEach(() => {
  data = buildDemoDataset(TODAY);
  ctx = { data, actor: "Test Admin", now };
});

const partnerByName = (n: string) => data.partners.find((p) => p.fullName === n)!;
/** Registration 30 days ago, so later stage dates are valid. */
const past = () => ({ ...ctx, now: `${addDays(TODAY, -30)}T06:30:00.000Z` });
const input = (company: string, domain: string) => ({
  companyName: company, companyDomain: domain, contactName: "Jane Doe", contactEmail: "Jane@Example.com",
  contactRole: "CEO", need: "brand" as const, partnerNote: "Warm intro",
});

/** Register → approve → introduce → won, returning the referral. */
function wonReferral(partnerName = "Kabir Mehta", company = "Testco Widgets", signedAt = addDays(TODAY, -1)) {
  const p = partnerByName(partnerName);
  const r = registerReferral({ ...past(), actor: p.fullName }, p.id, input(company, `${company.toLowerCase().replace(/\W/g, "")}.com`));
  approveReferral(ctx, r.id, ["client", "conversation", "warm"]);
  advanceReferral(ctx, r.id, { introducedAt: addDays(TODAY, -20) });
  markWon(ctx, r.id, { signedAt, firstContractValue: 10_00_000_00, vcDiscount: false });
  return r;
}

describe("registration", () => {
  it("creates a registered referral with a decision date and history", () => {
    const p = partnerByName("Ananya Rao");
    const r = registerReferral(ctx, p.id, input("New Co", "https://www.NewCo.com/about"));
    expect(r.stage).toBe("registered");
    expect(r.companyDomain).toBe("newco.com");
    expect(r.decisionDueAt > TODAY).toBe(true);
    expect(data.stageHistory.filter((h) => h.referralId === r.id)).toHaveLength(1);
    expect(data.audit[0].rowId).toBe(r.id);
  });

  it("flags a duplicate of an earlier registration", () => {
    const p = partnerByName("Arjun Das");
    const first = data.referrals.find((r) => r.stage !== "declined" && r.partnerId !== p.id)!;
    const r = registerReferral(ctx, p.id, input(first.companyName, first.companyDomain));
    expect(r.duplicateOf).toBe(first.id);
  });

  it("rejects partners who are not active", () => {
    expect(() => registerReferral(ctx, partnerByName("Vikram Singh").id, input("X", "x.com"))).toThrow(MutationError);
    expect(() => registerReferral(ctx, partnerByName("Rohan Gupta").id, input("X", "x.com"))).toThrow(/active/);
  });

  it("enforces the daily limit", () => {
    const p = partnerByName("Neel Shah");
    for (let i = 0; i < 20; i++) registerReferral(ctx, p.id, input(`Co ${i}`, `co${i}.com`));
    expect(() => registerReferral(ctx, p.id, input("Co 21", "co21.com"))).toThrow(/20 referrals a day/);
  });
});

describe("decision", () => {
  it("approves only when every manual check is confirmed", () => {
    const r = registerReferral(ctx, partnerByName("Ananya Rao").id, input("Approve Me", "approveme.com"));
    expect(() => approveReferral(ctx, r.id, ["client"])).toThrow(/Confirm every/);
    approveReferral(ctx, r.id, ["client", "conversation", "warm"]);
    expect(r.stage).toBe("approved");
    expect(r.decidedBy).toBe("Test Admin");
  });

  it("refuses to approve a duplicate or self-referral", () => {
    const dup = data.referrals.find((r) => r.stage === "registered" && r.duplicateOf)!;
    expect(() => approveReferral(ctx, dup.id, ["client", "conversation", "warm"])).toThrow(/Can't approve/);
    const dev = partnerByName("Dev Malhotra");
    const self = data.referrals.find((r) => r.partnerId === dev.id && r.companyDomain === "brightpath.io")!;
    expect(() => approveReferral(ctx, self.id, ["client", "conversation", "warm"])).toThrow(/self-referral/);
  });

  it("declines with a required reason", () => {
    const r = registerReferral(ctx, partnerByName("Ananya Rao").id, input("Decline Me", "declineme.com"));
    expect(() => declineReferral(ctx, r.id, " ")).toThrow(/reason/);
    declineReferral(ctx, r.id, "Already a client");
    expect(r.stage).toBe("declined");
    expect(r.declineReason).toBe("Already a client");
  });
});

describe("pipeline and conversion", () => {
  it("introduction starts the 6-month attribution window", () => {
    const r = registerReferral(past(), partnerByName("Ananya Rao").id, input("Intro Co", "introco.com"));
    approveReferral(ctx, r.id, ["client", "conversation", "warm"]);
    advanceReferral(ctx, r.id, { introducedAt: "2026-11-01" });
    expect(r.stage).toBe("introduced");
    expect(r.attributionExpiresAt).toBe("2027-05-01");
    advanceReferral(ctx, r.id);
    advanceReferral(ctx, r.id);
    expect(r.stage).toBe("proposal");
    expect(() => advanceReferral(ctx, r.id)).toThrow(/can't move forward/);
  });

  it("locks the rate from the tier held before the conversion", () => {
    const r = wonReferral("Kabir Mehta");
    expect(r.stage).toBe("won");
    expect(r.lockedRateBp).toBeGreaterThan(0);
    expect(r.lockedTier).not.toBeNull();
  });

  it("refuses to mark won after the attribution window closes", () => {
    const expired = data.referrals.find((r) => r.attributionExpiresAt && r.attributionExpiresAt < TODAY && ["introduced", "discovery", "proposal"].includes(r.stage))!;
    expect(() => markWon(ctx, expired.id, { signedAt: TODAY, firstContractValue: 100_00, vcDiscount: false })).toThrow(/attribution window/);
  });

  it("allows the VC discount only for VC partners", () => {
    const p = partnerByName("Kabir Mehta");
    const r = registerReferral(past(), p.id, input("Disc Co", "discco.com"));
    approveReferral(ctx, r.id, ["client", "conversation", "warm"]);
    advanceReferral(ctx, r.id, { introducedAt: addDays(TODAY, -5) });
    expect(() => markWon(ctx, r.id, { signedAt: TODAY, firstContractValue: 100_00, vcDiscount: true })).toThrow(/VC/);
  });

  it("marks lost with a reason", () => {
    const r = registerReferral(ctx, partnerByName("Ananya Rao").id, input("Lost Co", "lostco.com"));
    approveReferral(ctx, r.id, ["client", "conversation", "warm"]);
    markLost(ctx, r.id, "Went in-house");
    expect(r.stage).toBe("lost");
  });
});

describe("payments, refunds and payouts", () => {
  it("a payment creates a pending line at the locked rate, due in 15 days", () => {
    const r = wonReferral();
    const { line } = logPayment(ctx, r.id, { receivedOn: TODAY, netAmount: 2_00_000_00, kind: "milestone", invoiceNumber: "T-1" });
    expect(line).not.toBeNull();
    expect(line!.status).toBe("pending");
    expect(line!.amount).toBe(Math.round((2_00_000_00 * r.lockedRateBp!) / 10_000));
    expect(line!.dueBy).toBe(addDays(TODAY, 15));
  });

  it("rejects payments before signing and duplicate invoices", () => {
    const r = wonReferral();
    expect(() => logPayment(ctx, r.id, { receivedOn: addDays(TODAY, -30), netAmount: 100, kind: "milestone", invoiceNumber: "" })).toThrow(/before the contract/);
    logPayment(ctx, r.id, { receivedOn: TODAY, netAmount: 100_00, kind: "milestone", invoiceNumber: "DUP-1" });
    expect(() => logPayment(ctx, r.id, { receivedOn: TODAY, netAmount: 100_00, kind: "milestone", invoiceNumber: "DUP-1" })).toThrow(/already logged/);
  });

  it("a full refund on an unpaid line voids it", () => {
    const r = wonReferral();
    const { payment, line } = logPayment(ctx, r.id, { receivedOn: TODAY, netAmount: 1_00_000_00, kind: "milestone", invoiceNumber: "T-2" });
    recordRefund(ctx, payment.id, { refundedOn: TODAY, amount: 1_00_000_00 });
    expect(line!.status).toBe("void");
    expect(data.lines.filter((l) => l.clientPaymentId === payment.id && l.status === "pending")).toHaveLength(0);
  });

  it("a refund after payout creates a negative clawback line", () => {
    const r = wonReferral("Kabir Mehta", "Clawback Co", addDays(TODAY, -10));
    const { payment } = logPayment(ctx, r.id, { receivedOn: addDays(TODAY, -5), netAmount: 1_00_000_00, kind: "milestone", invoiceNumber: "T-3" });
    // Back-date the line so it falls into a payout today.
    const partnerId = r.partnerId;
    createPayout(ctx, partnerId, { paidOn: TODAY, tdsAmount: 0, partnerInvoiceNumber: "INV-9", bankReference: "UTR1", currency: "INR", fxRate: null, notes: "" });
    const res = recordRefund(ctx, payment.id, { refundedOn: TODAY, amount: 50_000_00 });
    expect(res.outcome).toMatch(/Clawback/);
    const claw = data.lines.find((l) => l.clientPaymentId === payment.id && l.reason === "clawback")!;
    expect(claw.amount).toBe(-Math.round((50_000_00 * r.lockedRateBp!) / 10_000));
    expect(claw.status).toBe("pending");
  });

  it("a payout settles every pending line and stores suggested and final TDS", () => {
    const p = partnerByName("Tara Fernandes");
    const preview = payoutPreview(ctx, p.id, TODAY);
    expect(preview.gross).toBeGreaterThan(0);
    const payout = createPayout(ctx, p.id, { paidOn: TODAY, tdsAmount: preview.tds.amount + 1, partnerInvoiceNumber: "AR-1", bankReference: "UTR2", currency: "INR", fxRate: null, notes: "" });
    expect(payout.grossAmount).toBe(preview.gross);
    expect(payout.tdsSuggested).toBe(preview.tds.amount);
    expect(payout.tdsAmount).toBe(preview.tds.amount + 1);
    expect(payout.netAmount).toBe(payout.grossAmount - payout.tdsAmount);
    expect(partnerBalance(data.lines.filter((l) => l.partnerId === p.id && l.createdOn <= TODAY))).toBe(0);
    expect(() => createPayout(ctx, p.id, { paidOn: TODAY, tdsAmount: 0, partnerInvoiceNumber: "AR-2", bankReference: "UTR3", currency: "INR", fxRate: null, notes: "" })).toThrow(/Nothing is owed/);
  });

  it("dashboard 'owed' falls by exactly the payout gross", () => {
    const before = kpis(data).owed;
    const p = partnerByName("Tara Fernandes");
    const payout = createPayout(ctx, p.id, { paidOn: TODAY, tdsAmount: 0, partnerInvoiceNumber: "AR-3", bankReference: "UTR4", currency: "INR", fxRate: null, notes: "" });
    expect(kpis(data).owed).toBe(before - payout.grossAmount);
  });
});

describe("partners and applications", () => {
  it("approving an application creates an active partner", () => {
    const app = data.applications.find((a) => a.status === "new")!;
    const p = approveApplication(ctx, app.id);
    expect(p.status).toBe("active");
    expect(app.status).toBe("approved");
    expect(app.partnerId).toBe(p.id);
    expect(() => approveApplication(ctx, app.id)).toThrow(/already been reviewed/);
  });

  it("rejects duplicate applications and existing partners", () => {
    const base = { fullName: "A", phone: "", company: "", partnerType: "other" as const, linkedinUrl: "", howTheyKnowClients: "", country: "India" };
    submitApplication(ctx, { ...base, email: "new.person@example.com" });
    expect(() => submitApplication(ctx, { ...base, email: "NEW.person@example.com" })).toThrow(/already have/);
    expect(() => submitApplication(ctx, { ...base, email: partnerByName("Ananya Rao").email })).toThrow(/already belongs/);
    const app = data.applications.find((a) => a.email === "new.person@example.com")!;
    rejectApplication(ctx, app.id, "Not a fit");
    expect(app.status).toBe("rejected");
  });

  it("stores only the last 4 PAN characters", () => {
    const p = partnerByName("Priya Nair");
    const patch = { phone: p.phone, company: p.company, country: p.country, isResidentIndia: true, gstin: "", bankDetailsOnFile: true, agreementSignedAt: p.agreementSignedAt, portfolioAgreement: false, notes: "" };
    expect(() => updatePartner(ctx, p.id, { ...patch, panLast4: "ABCDE1234F" })).toThrow(/last 4/);
    updatePartner(ctx, p.id, { ...patch, panLast4: "234f" });
    expect(p.panOnFile).toBe(true);
    expect(p.panLast4).toBe("234F");
  });

  it("removal with forfeit voids unpaid commission", () => {
    const p = partnerByName("Tara Fernandes");
    expect(partnerBalance(data.lines.filter((l) => l.partnerId === p.id))).toBeGreaterThan(0);
    const { voided } = changePartnerStatus(ctx, p.id, { status: "removed", effectiveOn: TODAY, reason: "Conduct breach", forfeit: true });
    expect(voided).toBeGreaterThan(0);
    expect(partnerBalance(data.lines.filter((l) => l.partnerId === p.id))).toBe(0);
    expect(p.removalReason).toBe("Conduct breach");
  });

  it("notice period ends after 30 days", () => {
    const p = partnerByName("Ananya Rao");
    changePartnerStatus(ctx, p.id, { status: "notice_period", effectiveOn: TODAY, reason: "", forfeit: false });
    expect(p.leftAt).toBe(addDays(TODAY, 30));
  });
});
