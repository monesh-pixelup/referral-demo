import { describe, expect, it } from "vitest";
import { buildDemoDataset } from "./data/seed";
import { computeAlerts, partnerBalance } from "./commission";
import {
  byPartnerType, collected, filterLines, filterPayments, filterPayouts, filterReferrals, funnel, kpis, monthlyCollected, partnerRows,
} from "./queries";
import { OPEN_STAGES } from "./types";

// Fixed date so the demo is deterministic; also check a second date to catch date-edge bugs.
for (const today of ["2026-11-03", "2027-04-02"]) {
  const data = buildDemoDataset(today);

  describe(`acceptance: dashboard numbers match their lists (${today})`, () => {
    const k = kpis(data);

    it("active partners = /admin/partners?status=active", () => {
      expect(k.activePartners).toBe(partnerRows(data).filter((r) => r.partner.status === "active").length);
    });
    it("pipeline = /admin/referrals?stage=open", () => {
      expect(k.pipeline).toBe(filterReferrals(data, { stage: "open" }).length);
      expect(k.pipeline).toBe(data.referrals.filter((r) => OPEN_STAGES.includes(r.stage)).length);
    });
    it("win rate = won ÷ (won + lost) of /admin/referrals?stage=closed", () => {
      const closed = filterReferrals(data, { stage: "closed" });
      expect(k.winRate).toBeCloseTo(closed.filter((r) => r.stage === "won").length / closed.length);
    });
    it("net fees FY = /admin/payments?fy=current", () => {
      expect(k.netFeesFy).toBe(filterPayments(data, { fy: "current" }).reduce((s, p) => s + collected(p), 0));
    });
    it("commission owed = /admin/payouts?view=owed", () => {
      expect(k.owed).toBe(partnerBalance(filterLines(data, { status: "owed" })));
      expect(k.owed).toBe(partnerRows(data).reduce((s, r) => s + r.owed, 0));
    });
    it("commission paid FY = /admin/payouts?fy=current", () => {
      expect(k.paidFy).toBe(filterPayouts(data, { fy: "current" }).reduce((s, p) => s + p.grossAmount, 0));
    });
    it("funnel counts = /admin/referrals?reached=<stage>", () => {
      for (const s of funnel(data)) expect(s.reached).toBe(filterReferrals(data, { reached: s.stage }).length);
    });
    it("monthly bars = /admin/payments?month=<month>", () => {
      for (const m of monthlyCollected(data)) expect(m.amount).toBe(filterPayments(data, { month: m.month }).reduce((s, p) => s + collected(p), 0));
    });
    it("leaderboard and partner-type figures = their filtered lists", () => {
      for (const r of partnerRows(data)) {
        expect(r.referrals).toBe(filterReferrals(data, { partner: r.partner.id }).length);
        expect(r.won).toBe(filterReferrals(data, { partner: r.partner.id, stage: "won" }).length);
      }
      for (const t of byPartnerType(data)) expect(t.referrals).toBe(filterReferrals(data, { type: t.type }).length);
      expect(byPartnerType(data).reduce((s, t) => s + t.revenue, 0)).toBe(data.payments.reduce((s, p) => s + collected(p), 0));
    });
  });

  describe(`demo data integrity (${today})`, () => {
    it("every won referral has a locked rate, and every non-void payment line matches its locked rate", () => {
      const ref = new Map(data.referrals.map((r) => [r.id, r]));
      for (const r of data.referrals.filter((x) => x.stage === "won")) expect(r.lockedRateBp).not.toBeNull();
      for (const l of data.lines) expect(l.rateBp).toBe(ref.get(l.referralId)!.lockedRateBp);
    });
    it("payouts net = gross − TDS, and settle the lines linked to them", () => {
      for (const p of data.payouts) {
        expect(p.netAmount).toBe(p.grossAmount - p.tdsAmount);
        const settled = data.lines.filter((l) => l.payoutId === p.id);
        expect(settled.reduce((s, l) => s + l.amount, 0)).toBe(p.grossAmount);
      }
    });
    it("alerts are sorted overdue first", () => {
      const a = computeAlerts(data);
      const firstNotOverdue = a.findIndex((x) => !x.overdue);
      if (firstNotOverdue >= 0) expect(a.slice(firstNotOverdue).every((x) => !x.overdue)).toBe(true);
    });
  });
}
