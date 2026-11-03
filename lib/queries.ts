/**
 * Filters and metrics shared by the dashboard, the lists and the CSV exports.
 * A dashboard number and the list it links to run through the same filter
 * function, so they always agree (SPEC acceptance: "Every dashboard number
 * matches the filtered list it links to").
 */
import { partnerBalance, tierAt } from "./commission";
import { addMonths, fyRange, istDate, monthKey } from "./dates";
import {
  ALL_STAGES, FUNNEL_STAGES, OPEN_STAGES,
  type ClientPayment, type CommissionLine, type Dataset, type Partner, type PartnerType,
  type Payout, type Referral, type Stage,
} from "./types";

export type Params = Record<string, string | string[] | undefined>;
const one = (p: Params, k: string) => { const v = p[k]; return Array.isArray(v) ? v[0] : v || undefined; };

/* ---------- referrals ---------- */

export interface ReferralFilter { stage?: string; partner?: string; type?: string; from?: string; to?: string; reached?: string; q?: string }
export const referralFilterFrom = (p: Params): ReferralFilter => ({
  stage: one(p, "stage"), partner: one(p, "partner"), type: one(p, "type"),
  from: one(p, "from"), to: one(p, "to"), reached: one(p, "reached"), q: one(p, "q"),
});

export function stagesReached(data: Dataset): Map<string, Set<Stage>> {
  const m = new Map<string, Set<Stage>>();
  for (const h of data.stageHistory) {
    if (!m.has(h.referralId)) m.set(h.referralId, new Set());
    m.get(h.referralId)!.add(h.toStage);
  }
  return m;
}

export function stageSet(stage: string | undefined): Stage[] | null {
  if (!stage) return null;
  if (stage === "open") return OPEN_STAGES;
  if (stage === "closed") return ["won", "lost"];
  return stage.split(",").filter((s): s is Stage => (ALL_STAGES as string[]).includes(s));
}

export function filterReferrals(data: Dataset, f: ReferralFilter): Referral[] {
  const partnerType = new Map(data.partners.map((p) => [p.id, p.partnerType]));
  const stages = stageSet(f.stage);
  const reached = f.reached ? stagesReached(data) : null;
  const q = f.q?.toLowerCase();
  return data.referrals
    .filter((r) => !stages || stages.includes(r.stage))
    .filter((r) => !f.partner || r.partnerId === f.partner)
    .filter((r) => !f.type || partnerType.get(r.partnerId) === f.type)
    .filter((r) => !f.from || istDate(r.registeredAt) >= f.from)
    .filter((r) => !f.to || istDate(r.registeredAt) <= f.to)
    .filter((r) => !reached || reached.get(r.id)?.has(f.reached as Stage))
    .filter((r) => !q || r.companyName.toLowerCase().includes(q) || r.companyDomain.includes(q))
    .sort((a, b) => b.registeredAt.localeCompare(a.registeredAt));
}

/* ---------- payments ---------- */

export interface PaymentFilter { month?: string; fy?: string; partner?: string; type?: string; referral?: string; kind?: string }
export const paymentFilterFrom = (p: Params): PaymentFilter => ({
  month: one(p, "month"), fy: one(p, "fy"), partner: one(p, "partner"), type: one(p, "type"), referral: one(p, "referral"), kind: one(p, "kind"),
});

/** Net fees collected = net amount less refunds (SPEC: net fees exclude refunds). */
export const collected = (p: ClientPayment) => p.netAmount - p.refundAmount;

export function filterPayments(data: Dataset, f: PaymentFilter): ClientPayment[] {
  const ref = new Map(data.referrals.map((r) => [r.id, r]));
  const partnerType = new Map(data.partners.map((p) => [p.id, p.partnerType]));
  const fy = f.fy === "current" ? fyRange(data.today) : null;
  return data.payments
    .filter((p) => !f.month || monthKey(p.receivedOn) === f.month)
    .filter((p) => !fy || (p.receivedOn >= fy.start && p.receivedOn <= fy.end))
    .filter((p) => !f.partner || ref.get(p.referralId)?.partnerId === f.partner)
    .filter((p) => !f.type || partnerType.get(ref.get(p.referralId)!.partnerId) === f.type)
    .filter((p) => !f.referral || p.referralId === f.referral)
    .filter((p) => !f.kind || p.kind === f.kind)
    .sort((a, b) => b.receivedOn.localeCompare(a.receivedOn));
}

/* ---------- commission lines & payouts ---------- */

export interface LineFilter { status?: string; partner?: string; reason?: string }
export const lineFilterFrom = (p: Params): LineFilter => ({ status: one(p, "status"), partner: one(p, "partner"), reason: one(p, "reason") });

export function filterLines(data: Dataset, f: LineFilter): CommissionLine[] {
  return data.lines
    .filter((l) => !f.status || (f.status === "owed" ? l.status === "pending" && !l.settledAsDiscount : l.status === f.status))
    .filter((l) => !f.partner || l.partnerId === f.partner)
    .filter((l) => !f.reason || l.reason === f.reason)
    .sort((a, b) => b.createdOn.localeCompare(a.createdOn));
}

export interface PayoutFilter { partner?: string; fy?: string }
export const payoutFilterFrom = (p: Params): PayoutFilter => ({ partner: one(p, "partner"), fy: one(p, "fy") });

export function filterPayouts(data: Dataset, f: PayoutFilter): Payout[] {
  const fy = f.fy === "current" ? fyRange(data.today) : null;
  return data.payouts
    .filter((p) => !f.partner || p.partnerId === f.partner)
    .filter((p) => !fy || (p.paidOn >= fy.start && p.paidOn <= fy.end))
    .sort((a, b) => b.paidOn.localeCompare(a.paidOn));
}

/* ---------- partners ---------- */

export interface PartnerRow {
  partner: Partner;
  tier: ReturnType<typeof tierAt>;
  referrals: number;
  open: number;
  won: number;
  collected: number;
  owed: number;
  paidFy: number;
}

export function partnerRows(data: Dataset): PartnerRow[] {
  const fy = fyRange(data.today);
  return data.partners.map((partner) => {
    const refs = data.referrals.filter((r) => r.partnerId === partner.id);
    return {
      partner,
      tier: tierAt(partner, data.referrals, data.today),
      referrals: refs.length,
      open: refs.filter((r) => OPEN_STAGES.includes(r.stage)).length,
      won: refs.filter((r) => r.stage === "won").length,
      collected: filterPayments(data, { partner: partner.id }).reduce((s, p) => s + collected(p), 0),
      owed: partnerBalance(data.lines.filter((l) => l.partnerId === partner.id)),
      paidFy: data.payouts.filter((p) => p.partnerId === partner.id && p.paidOn >= fy.start && p.paidOn <= fy.end).reduce((s, p) => s + p.grossAmount, 0),
    };
  });
}

export interface PartnerFilter { status?: string; type?: string; tier?: string; q?: string }
export const partnerFilterFrom = (p: Params): PartnerFilter => ({ status: one(p, "status"), type: one(p, "type"), tier: one(p, "tier"), q: one(p, "q") });

export function filterPartnerRows(rows: PartnerRow[], f: PartnerFilter): PartnerRow[] {
  const q = f.q?.toLowerCase();
  return rows
    .filter((r) => !f.status || r.partner.status === f.status)
    .filter((r) => !f.type || r.partner.partnerType === f.type)
    .filter((r) => !f.tier || r.tier.name === f.tier)
    .filter((r) => !q || r.partner.fullName.toLowerCase().includes(q) || r.partner.company.toLowerCase().includes(q))
    .sort((a, b) => b.collected - a.collected || b.referrals - a.referrals);
}

/* ---------- dashboard ---------- */

export function kpis(data: Dataset) {
  const fy = fyRange(data.today);
  const closed = filterReferrals(data, { stage: "closed" });
  const won = closed.filter((r) => r.stage === "won").length;
  return {
    fy,
    activePartners: data.partners.filter((p) => p.status === "active").length,
    pipeline: filterReferrals(data, { stage: "open" }).length,
    winRate: closed.length ? won / closed.length : null,
    won, closed: closed.length,
    netFeesFy: filterPayments(data, { fy: "current" }).reduce((s, p) => s + collected(p), 0),
    owed: partnerBalance(filterLines(data, { status: "owed" })),
    paidFy: filterPayouts(data, { fy: "current" }).reduce((s, p) => s + p.grossAmount, 0),
  };
}

export function funnel(data: Dataset) {
  const reached = stagesReached(data);
  const counts = FUNNEL_STAGES.map((stage) => ({
    stage,
    reached: data.referrals.filter((r) => reached.get(r.id)?.has(stage)).length,
    current: data.referrals.filter((r) => r.stage === stage).length,
  }));
  return counts.map((c, i) => ({ ...c, conversion: i === 0 || counts[i - 1].reached === 0 ? null : c.reached / counts[i - 1].reached }));
}

export function monthlyCollected(data: Dataset, months = 12) {
  const start = addMonths(`${monthKey(data.today)}-01`, -(months - 1));
  const keys = Array.from({ length: months }, (_, i) => monthKey(addMonths(start, i)));
  return keys.map((month) => ({ month, amount: filterPayments(data, { month }).reduce((s, p) => s + collected(p), 0) }));
}

export function byPartnerType(data: Dataset) {
  const types: PartnerType[] = ["growth_marketer", "designer_freelancer", "vc_accelerator", "other"];
  return types.map((type) => {
    const refs = filterReferrals(data, { type });
    return {
      type,
      referrals: refs.length,
      won: refs.filter((r) => r.stage === "won").length,
      revenue: filterPayments(data, { type }).reduce((s, p) => s + collected(p), 0),
    };
  });
}
