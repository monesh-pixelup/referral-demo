import { describe, expect, it } from "vitest";
import { addMonths } from "../dates";
import { rupees, formatINR } from "../money";
import { programConfig } from "../program-config";
import type { Referral, Stage } from "../types";
import {
  clawbackForRefund, commissionForPayment, decisionDueAt, findDuplicate, lockRate,
  normaliseDomain, partnerBalance, qualificationChecklist, suggestTds, tierAt,
  withinAttribution, nextTierProgress,
} from "./index";

const partner = { id: "p1", portfolioAgreement: false };
const won = (id: string, signedAt: string, partnerId = "p1") => ({ id, partnerId, stage: "won" as Stage, signedAt });

function wonReferral(overrides: Partial<Referral> = {}) {
  return { stage: "won" as Stage, forfeited: false, signedAt: "2026-01-10", lockedRateBp: 1000, vcDiscount: false, ...overrides };
}

describe("tiers", () => {
  it("new partner, first deal signs, ₹10,00,000 collected → 10%, ₹1,00,000", () => {
    const refs = [won("r1", "2026-05-01")];
    const lock = lockRate(partner, refs, refs[0]);
    expect(lock).toEqual({ lockedRateBp: 1000, lockedTier: "referrer" });
    const line = commissionForPayment(wonReferral({ lockedRateBp: lock.lockedRateBp }), { receivedOn: "2026-06-01", netAmount: rupees(10_00_000), kind: "milestone" });
    expect(line?.amount).toBe(rupees(1_00_000));
    expect(formatINR(line!.amount)).toBe("₹1,00,000");
  });

  it("partner with 3 wins in the last 12 months signs a 4th → locked at 12.5%", () => {
    const refs = [won("r1", "2026-01-05"), won("r2", "2026-03-05"), won("r3", "2026-05-05"), won("r4", "2026-07-05")];
    expect(lockRate(partner, refs, refs[3])).toEqual({ lockedRateBp: 1250, lockedTier: "growth" });
  });

  it("the 3rd win itself is locked at 10% (upgrade not retroactive)", () => {
    const refs = [won("r1", "2026-01-05"), won("r2", "2026-03-05"), won("r3", "2026-05-05")];
    expect(lockRate(partner, refs, refs[2]).lockedRateBp).toBe(1000);
    // …even though the partner is Growth from that day on.
    expect(tierAt(partner, refs, "2026-05-05").name).toBe("growth");
  });

  it("VC partner with a portfolio agreement, first deal → 15%", () => {
    const vc = { id: "p2", portfolioAgreement: true };
    const refs = [won("r1", "2026-05-01", "p2")];
    expect(lockRate(vc, refs, refs[0])).toEqual({ lockedRateBp: 1500, lockedTier: "strategic" });
  });

  it("wins older than 12 months are not counted toward tier", () => {
    const refs = [won("r1", "2024-12-01"), won("r2", "2025-01-01"), won("r3", "2025-02-01"), won("r4", "2026-06-01")];
    expect(lockRate(partner, refs, refs[3]).lockedRateBp).toBe(1000);
  });

  it("6 wins in the window → Strategic", () => {
    const refs = ["01", "02", "03", "04", "05", "06", "07"].map((m, i) => won(`r${i}`, `2026-${m}-10`));
    expect(lockRate(partner, refs, refs[6]).lockedTier).toBe("strategic");
  });

  it("only won referrals count", () => {
    const refs = [won("r1", "2026-01-05"), { ...won("r2", "2026-02-05"), stage: "lost" as Stage }, won("r3", "2026-03-05"), won("r4", "2026-04-05")];
    expect(lockRate(partner, refs, refs[3]).lockedRateBp).toBe(1000);
  });

  it("changing a rate in config affects only future locks", () => {
    const locked = lockRate(partner, [won("r1", "2026-05-01")], { id: "r1", signedAt: "2026-05-01" });
    const newConfig = { ...programConfig, tiers: programConfig.tiers.map((t) => (t.name === "referrer" ? { ...t, rateBp: 1100 } : t)) };
    // A stored locked rate is used as-is by the line calculation.
    const line = commissionForPayment(wonReferral({ lockedRateBp: locked.lockedRateBp }), { receivedOn: "2026-06-01", netAmount: rupees(1000), kind: "milestone" }, newConfig);
    expect(line?.rateBp).toBe(1000);
    expect(lockRate(partner, [won("r2", "2026-06-01")], { id: "r2", signedAt: "2026-06-01" }, newConfig).lockedRateBp).toBe(1100);
  });

  it("progress to next tier", () => {
    const refs = [won("r1", "2026-03-01"), won("r2", "2026-04-01")];
    const p = nextTierProgress(partner, refs, "2026-06-01");
    expect(p.next?.label).toBe("Growth Partner");
    expect(p.needed).toBe(1);
  });
});

describe("commission lines", () => {
  it("retainer payment 13 months after signing → 0, outside_12_months", () => {
    const line = commissionForPayment(wonReferral({ signedAt: "2025-01-10" }), { receivedOn: addMonths("2025-01-10", 13), netAmount: rupees(50_000), kind: "retainer" });
    expect(line).toMatchObject({ amount: 0, reason: "outside_12_months" });
  });

  it("retainer payment within 12 months earns commission", () => {
    const line = commissionForPayment(wonReferral({ signedAt: "2025-01-10" }), { receivedOn: "2026-01-10", netAmount: rupees(50_000), kind: "retainer" });
    expect(line).toMatchObject({ amount: rupees(5_000), reason: "eligible" });
  });

  it("repeat project signed and paid within 12 months → locked rate", () => {
    const line = commissionForPayment(wonReferral({ lockedRateBp: 1250, signedAt: "2026-01-10" }), { receivedOn: "2026-09-01", netAmount: rupees(2_00_000), kind: "repeat_work" });
    expect(line).toMatchObject({ amount: rupees(25_000), rateBp: 1250, reason: "eligible", status: "pending" });
  });

  it("due_by is received_on + 15 days", () => {
    expect(commissionForPayment(wonReferral(), { receivedOn: "2026-03-20", netAmount: 100, kind: "milestone" })?.dueBy).toBe("2026-04-04");
  });

  it("no line for a referral that is not won", () => {
    expect(commissionForPayment(wonReferral({ stage: "proposal" }), { receivedOn: "2026-03-20", netAmount: 100, kind: "milestone" })).toBeNull();
  });

  it("forfeited referral → void line", () => {
    expect(commissionForPayment(wonReferral({ forfeited: true }), { receivedOn: "2026-03-20", netAmount: 100_00, kind: "milestone" })).toMatchObject({ status: "void", reason: "forfeited", amount: 0 });
  });

  it("VC discount → line settled as a client discount, not owed", () => {
    const line = commissionForPayment(wonReferral({ vcDiscount: true, lockedRateBp: 1500 }), { receivedOn: "2026-03-20", netAmount: rupees(1_00_000), kind: "milestone" })!;
    expect(line).toMatchObject({ amount: rupees(15_000), settledAsDiscount: true, status: "paid" });
    expect(partnerBalance([line])).toBe(0);
  });

  it("rounds to the nearest paisa", () => {
    expect(commissionForPayment(wonReferral({ lockedRateBp: 1250 }), { receivedOn: "2026-03-20", netAmount: 3333, kind: "milestone" })?.amount).toBe(417);
  });

  it("worked example: Growth Partner, ₹10,00,000 across milestones → ₹1,25,000", () => {
    const ref = wonReferral({ lockedRateBp: 1250 });
    const milestones = [3_00_000, 3_00_000, 2_50_000, 1_50_000];
    const total = milestones.reduce((s, m) => s + commissionForPayment(ref, { receivedOn: "2026-03-01", netAmount: rupees(m), kind: "milestone" })!.amount, 0);
    expect(formatINR(total)).toBe("₹1,25,000");
  });
});

describe("clawback", () => {
  const payment = { receivedOn: "2026-03-01", netAmount: rupees(1_00_000) };
  const paidLine = { status: "paid" as const, rateBp: 1000, reason: "eligible" as const, settledAsDiscount: false };

  it("refund 30 days after receipt, line already paid → negative clawback line", () => {
    const r = clawbackForRefund(paidLine, payment, "2026-03-31", rupees(1_00_000));
    expect(r).toMatchObject({ action: "clawback", line: { amount: -rupees(10_000), reason: "clawback" } });
  });

  it("partial refund → clawback on the refunded part only", () => {
    const r = clawbackForRefund(paidLine, payment, "2026-03-15", rupees(40_000));
    expect(r.action === "clawback" && r.line.amount).toBe(-rupees(4_000));
  });

  it("refund 75 days after receipt → no clawback", () => {
    expect(clawbackForRefund(paidLine, payment, "2026-05-15", rupees(1_00_000)).action).toBe("none");
  });

  it("refund while the original line is still pending → void it instead", () => {
    const r = clawbackForRefund({ ...paidLine, status: "pending" }, payment, "2026-03-10", rupees(1_00_000));
    expect(r).toEqual({ action: "void_original", replacement: null });
  });

  it("partial refund on a pending line → void and replace with the kept amount", () => {
    const r = clawbackForRefund({ ...paidLine, status: "pending" }, payment, "2026-03-10", rupees(25_000));
    expect(r.action === "void_original" && r.replacement?.amount).toBe(rupees(7_500));
  });

  it("negative balance carries forward", () => {
    expect(partnerBalance([{ status: "pending", amount: -500_00, settledAsDiscount: false }, { status: "paid", amount: 9_000_00, settledAsDiscount: false }])).toBe(-500_00);
  });
});

describe("TDS", () => {
  const indian = { isResidentIndia: true, panOnFile: true };

  it("Indian partner, FY payouts ₹15,000 then ₹10,000 → 0, then ₹500 with catch-up", () => {
    const first = suggestTds(indian, "2026-05-10", rupees(15_000), []);
    expect(first.amount).toBe(0);
    const second = suggestTds(indian, "2026-08-10", rupees(10_000), [{ paidOn: "2026-05-10", grossAmount: rupees(15_000), tdsAmount: 0 }]);
    expect(second.amount).toBe(rupees(500));
  });

  it("payouts from the previous FY are ignored", () => {
    expect(suggestTds(indian, "2026-04-10", rupees(10_000), [{ paidOn: "2026-03-10", grossAmount: rupees(15_000), tdsAmount: 0 }]).amount).toBe(0);
  });

  it("partner without PAN, payout ₹5,000 → ₹1,000 (20%)", () => {
    expect(suggestTds({ isResidentIndia: true, panOnFile: false }, "2026-05-10", rupees(5_000), []).amount).toBe(rupees(1_000));
  });

  it("non-resident partner → 0 with a confirm-with-CA note", () => {
    const t = suggestTds({ isResidentIndia: false, panOnFile: false }, "2026-05-10", rupees(50_000), []);
    expect(t).toMatchObject({ amount: 0, manual: true });
    expect(t.note).toMatch(/confirm withholding with CA/);
  });

  it("exactly ₹20,000 in the FY is not over the threshold", () => {
    expect(suggestTds(indian, "2026-05-10", rupees(20_000), []).amount).toBe(0);
  });
});

describe("registration and attribution", () => {
  const ref = (id: string, domain: string, registeredAt: string, stage: Stage = "registered", companyName = "Acme") =>
    ({ id, companyName, companyDomain: domain, registeredAt, stage });

  it("same company registered by two partners → second flagged duplicate_of first", () => {
    const first = ref("a", "https://www.acme.com/", "2026-05-01T05:00:00Z");
    const second = ref("b", "acme.com", "2026-05-03T05:00:00Z");
    expect(findDuplicate(second, [first, second])?.id).toBe("a");
    expect(findDuplicate(first, [first, second])).toBeNull();
  });

  it("a declined earlier registration does not block", () => {
    const first = ref("a", "acme.com", "2026-05-01T05:00:00Z", "declined");
    expect(findDuplicate(ref("b", "acme.com", "2026-05-03T05:00:00Z"), [first])).toBeNull();
  });

  it("falls back to the company name when there is no domain", () => {
    const first = ref("a", "", "2026-05-01T05:00:00Z", "approved", "Acme Technologies Pvt. Ltd.");
    expect(findDuplicate(ref("b", "", "2026-05-03T05:00:00Z", "registered", "ACME"), [first])?.id).toBe("a");
  });

  it("normalises domains", () => {
    expect(normaliseDomain("HTTPS://WWW.Acme.co.in/about?x=1")).toBe("acme.co.in");
  });

  it("registration on a Friday → decision due the following Friday", () => {
    // 6 Nov 2026 is a Friday; 10:00 IST.
    expect(decisionDueAt("2026-11-06T04:30:00Z")).toBe("2026-11-13");
  });

  it("uses the IST date of the timestamp (late-night UTC = next day IST)", () => {
    // 2026-11-05 20:00 UTC = Fri 6 Nov 01:30 IST
    expect(decisionDueAt("2026-11-05T20:00:00Z")).toBe("2026-11-13");
  });

  it("intro 1 Jan, signs 2 Jul → outside 6-month window", () => {
    expect(withinAttribution("2026-01-01", "2026-07-02")).toBe(false);
    expect(withinAttribution("2026-01-01", "2026-07-01")).toBe(true);
  });

  it("qualification checklist flags a self-referral and an unset minimum", () => {
    const list = qualificationChecklist({ companyDomain: "acme.com", firstContractValue: null, duplicateOf: null }, { email: "ravi@acme.com" });
    expect(list.find((c) => c.key === "self")?.state).toBe("fail");
    expect(list.find((c) => c.key === "minimum")?.state).toBe("unset");
  });
});
