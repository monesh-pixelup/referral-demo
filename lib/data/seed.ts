/**
 * Deterministic demo data. Dates are relative to `today`, so the demo always
 * looks current. Commission lines and payouts are NOT hand-written: they are
 * produced by replaying payments, refunds and payout runs in date order
 * through lib/commission, exactly as the server will once Supabase is wired.
 */
import {
  attributionExpiresAt, clawbackForRefund, commissionForPayment, decisionDueAt,
  findDuplicate, lockRate, partnerBalance, suggestTds,
} from "../commission";
import { addDays, addMonths, addWorkingDays, type ISODate } from "../dates";
import { rupees } from "../money";
import type {
  AuditEntry, ClientPayment, CommissionLine, Dataset, Need, Partner, PartnerApplication, PartnerInvoice, PartnerType,
  Payout, PaymentKind, Referral, Stage, StageChange,
} from "../types";

const ADMIN = "Monesh Goyal";
const TEAM = "Aditi Sharma";

/** Demo staff accounts for the demo sign-in (Supabase auth replaces these). */
export const DEMO_STAFF = [
  { name: ADMIN, email: "monesh@pixelup.in", role: "admin" as const },
  { name: TEAM, email: "aditi@pixelup.in", role: "team" as const },
];

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let idCounter = 0;
const uid = (prefix: string) => `${prefix}_${(++idCounter).toString(36).padStart(4, "0")}`;

function ts(date: ISODate, hour: number, minute = 0): string {
  return new Date(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+05:30`).toISOString();
}

interface PartnerSeed {
  key: string;
  fullName: string;
  email: string;
  company: string;
  partnerType: PartnerType;
  country: string;
  resident: boolean;
  pan: string | null;
  gstin: string | null;
  joinedDaysAgo: number;
  agreement: boolean;
  portfolio?: boolean;
  status?: Partner["status"];
  leftDaysAgo?: number;
  removalReason?: string;
  referrals: number;
  winBias: number;
  /** Payout runs are skipped for this partner from N days ago (held). */
  holdPayoutsDaysAgo?: number;
  vcDiscountShare?: number;
  notes?: string;
}

const PARTNERS: PartnerSeed[] = [
  { key: "ananya", fullName: "Ananya Rao", email: "ananya@growthloop.in", company: "GrowthLoop", partnerType: "growth_marketer", country: "India", resident: true, pan: "4821", gstin: "29ABCDE1234F1Z5", joinedDaysAgo: 520, agreement: true, referrals: 9, winBias: 0.75, notes: "Runs a D2C growth community; best source of brand projects." },
  { key: "tara", fullName: "Tara Fernandes", email: "tara@scalehouse.co", company: "ScaleHouse", partnerType: "growth_marketer", country: "India", resident: true, pan: "1937", gstin: null, joinedDaysAgo: 600, agreement: true, referrals: 11, winBias: 0.8, holdPayoutsDaysAgo: 3, notes: "Invoice for the latest payout run not received yet." },
  { key: "northstar", fullName: "Ishaan Kapoor", email: "ishaan@northstar.vc", company: "Northstar Ventures", partnerType: "vc_accelerator", country: "India", resident: true, pan: "7710", gstin: "27AAACN1234K1Z2", joinedDaysAgo: 480, agreement: true, portfolio: true, referrals: 8, winBias: 0.75, vcDiscountShare: 0.4, notes: "Portfolio agreement signed. Some portfolio companies take the commission as a discount." },
  { key: "kabir", fullName: "Kabir Mehta", email: "kabir.mehta.design@gmail.com", company: "Kabir Mehta Studio", partnerType: "designer_freelancer", country: "India", resident: true, pan: "5502", gstin: null, joinedDaysAgo: 400, agreement: true, referrals: 6, winBias: 0.5 },
  { key: "priya", fullName: "Priya Nair", email: "priya@nairgrowth.com", company: "Nair Growth", partnerType: "growth_marketer", country: "India", resident: true, pan: null, gstin: null, joinedDaysAgo: 300, agreement: true, referrals: 5, winBias: 0.7, holdPayoutsDaysAgo: 40, notes: "PAN requested twice; payouts on hold." },
  { key: "omar", fullName: "Omar Haddad", email: "omar@haddad.ae", company: "Haddad Advisory", partnerType: "other", country: "United Arab Emirates", resident: false, pan: null, gstin: null, joinedDaysAgo: 360, agreement: true, referrals: 5, winBias: 0.6, holdPayoutsDaysAgo: 35, notes: "Paid in AED. Withholding to be confirmed with CA before each payout." },
  { key: "launchpad", fullName: "Meera Joshi", email: "meera@launchpad.org.in", company: "Launchpad Accelerator", partnerType: "vc_accelerator", country: "India", resident: true, pan: "3318", gstin: "07AAATL5678M1Z9", joinedDaysAgo: 250, agreement: true, referrals: 6, winBias: 0.55 },
  { key: "arjun", fullName: "Arjun Das", email: "arjun@pixelforge.design", company: "Pixelforge", partnerType: "designer_freelancer", country: "India", resident: true, pan: "6604", gstin: null, joinedDaysAgo: 330, agreement: true, referrals: 4, winBias: 0.5 },
  { key: "dev", fullName: "Dev Malhotra", email: "dev@brightpath.io", company: "Brightpath", partnerType: "growth_marketer", country: "India", resident: true, pan: "2290", gstin: null, joinedDaysAgo: 210, agreement: true, referrals: 4, winBias: 0.5 },
  { key: "rohan", fullName: "Rohan Gupta", email: "rohan@funnelworks.in", company: "Funnelworks", partnerType: "growth_marketer", country: "India", resident: true, pan: "8873", gstin: null, joinedDaysAgo: 450, agreement: true, status: "notice_period", leftDaysAgo: -18, referrals: 5, winBias: 0.6, notes: "Gave 30 days' notice; signed referrals keep earning." },
  { key: "vikram", fullName: "Vikram Singh", email: "vikram@leadstack.biz", company: "Leadstack", partnerType: "other", country: "India", resident: true, pan: "9041", gstin: null, joinedDaysAgo: 420, agreement: true, status: "removed", leftDaysAgo: 95, removalReason: "Submitted scraped contact lists as warm introductions.", referrals: 4, winBias: 0.7 },
  { key: "leela", fullName: "Leela Krishnan", email: "leela@studiolk.in", company: "Studio LK", partnerType: "designer_freelancer", country: "India", resident: true, pan: "1188", gstin: null, joinedDaysAgo: 540, agreement: true, status: "left", leftDaysAgo: 120, referrals: 3, winBias: 0.6 },
  { key: "sneha", fullName: "Sneha Iyer", email: "sneha@iyer.studio", company: "Iyer Studio", partnerType: "designer_freelancer", country: "India", resident: true, pan: "4470", gstin: null, joinedDaysAgo: 40, agreement: false, referrals: 2, winBias: 0.4 },
  { key: "neel", fullName: "Neel Shah", email: "neel@foundersbench.com", company: "Founders Bench", partnerType: "other", country: "India", resident: true, pan: "3051", gstin: null, joinedDaysAgo: 75, agreement: true, referrals: 2, winBias: 0.4 },
];

const APPLICATIONS: { fullName: string; email: string; phone: string; company: string; partnerType: PartnerType; linkedinUrl: string; how: string; country: string; daysAgo: number; rejectReason?: string }[] = [
  { fullName: "Farah Qureshi", email: "farah@brandwell.in", phone: "+91 98201 44120", company: "Brandwell", partnerType: "growth_marketer", linkedinUrl: "https://www.linkedin.com/in/farahqureshi", how: "I run paid acquisition for 12 seed-stage D2C brands; several are planning rebrands this year.", country: "India", daysAgo: 2 },
  { fullName: "Aarav Bhatt", email: "aarav@bhatt.design", phone: "+91 99870 11234", company: "Bhatt Design", partnerType: "designer_freelancer", linkedinUrl: "https://www.linkedin.com/in/aaravbhatt", how: "Freelance product designer; clients often need a full product team I can't provide.", country: "India", daysAgo: 5 },
  { fullName: "Lena Hoffmann", email: "lena@foundry-ventures.de", phone: "+49 151 2345 6789", company: "Foundry Ventures", partnerType: "vc_accelerator", linkedinUrl: "https://www.linkedin.com/in/lenahoffmann", how: "Platform lead at an early-stage fund with Indian portfolio companies.", country: "Germany", daysAgo: 9 },
  { fullName: "Mohit Arora", email: "mohit.leads@gmail.com", phone: "+91 90000 12345", company: "", partnerType: "other", linkedinUrl: "", how: "I have a database of 50,000 startup founders.", country: "India", daysAgo: 30, rejectReason: "Lead list, not warm introductions" },
];

const COMPANIES = [
  "Kosha Foods", "Tidewater Labs", "Verdant Pay", "Lumen Health", "Nimbus Logistics", "Saffron Tea Co", "Orbit Learning",
  "Quill Legal", "Bluefin Insure", "Haveli Homes", "Monsoon Apparel", "Zest Fitness", "Cobalt Robotics", "Fernway Travel",
  "Pebble Finance", "Anvil Hardware", "Marigold Beauty", "Ripple Water", "Juniper Pets", "Atlas Freight", "Bodhi Wellness",
  "Kiln Ceramics", "Indigo Mobility", "Sprout Kids", "Granite Realty", "Velvet Audio", "Crest Dental", "Driftwood Coffee",
  "Ember Energy", "Halo Security", "Mosaic HR", "Nectar Organics", "Paper Plane Media", "Quartz Analytics", "Rangoli Crafts",
  "Summit Edtech", "Tusk Outdoor", "Umber Interiors", "Vista Optics", "Wildleaf Botanicals", "Yonder Games", "Zephyr Air",
  "Banyan Capital", "Cardamom Kitchens", "Delta Diagnostics", "Echo Voice AI", "Folio Books", "Ginger Bay Hotels", "Hive Coworking",
  "Ivory Bridal", "Jharna Beverages", "Kestrel Drones", "Lotus Ayurveda", "Mango Mobile", "Nova Batteries", "Opal Jewels",
  "Prism Payroll", "Quokka Toys", "Rover Rentals", "Sitar Music", "Teal Fintech", "Unity Clinics", "Vahan EV", "Willow Care",
  "Xeno Bio", "Yatra Bikes", "Zing Snacks", "Aurora Skin", "Bamboo Living", "Citrus CRM",
];

const FIRST = ["Rahul", "Sanya", "Vivek", "Nisha", "Aditya", "Kavya", "Siddharth", "Pooja", "Karan", "Divya", "Manav", "Ishita", "Yash", "Riya", "Aman"];
const LAST = ["Verma", "Reddy", "Bose", "Pillai", "Chopra", "Menon", "Khanna", "Desai", "Bhat", "Sethi", "Agarwal", "Kulkarni"];
const ROLES = ["Founder & CEO", "Co-founder", "Head of Marketing", "VP Product", "CMO", "Brand Lead"];
const NEEDS: Need[] = ["brand", "product", "web", "other"];
const DECLINE = ["Already a client within the last 12 months", "Already in active conversation with our team", "Cold list, not a warm introduction", "Outside our service area"];
const LOST = ["Chose an in-house team", "Budget moved to next year", "Went with a lower-cost agency", "Project paused after funding delay", "No response after proposal"];

const domainOf = (name: string) => `${name.toLowerCase().replace(/[^a-z0-9]+/g, "")}.com`;

interface Plan {
  regDaysAgo: number;
  force?: "registered" | "declined" | "closing" | "expired" | "won" | "lost";
  dupOfCompany?: string;
  company?: string;
  domain?: string;
  kind?: "project" | "retainer" | "repeat";
  refund?: { afterDays: number; fraction: number };
}

/** Hand-placed edge cases so every alert and rule shows up in the demo. */
const SPECIAL: Record<string, Plan[]> = {
  ananya: [
    { regDaysAgo: 75, force: "won", company: "Kosha Foods" }, // 3rd win after the quarter review → tier change
    { regDaysAgo: 3, force: "registered", company: "Nimbus Logistics" },
    { regDaysAgo: 140, force: "closing", company: "Orbit Learning" },
  ],
  kabir: [
    { regDaysAgo: 1, force: "registered", company: "Nimbus Logistics", dupOfCompany: "Nimbus Logistics" }, // duplicate
    { regDaysAgo: 230, force: "expired", company: "Quill Legal" },
  ],
  tara: [{ regDaysAgo: 480, force: "won", kind: "retainer", company: "Bluefin Insure" }], // retainer > 12 months
  dev: [
    { regDaysAgo: 12, force: "registered", company: "Brightpath Media", domain: "brightpath.io" }, // self-referral, decision overdue
    { regDaysAgo: 160, force: "won", kind: "project", refund: { afterDays: 25, fraction: 1 } }, // paid then refunded → clawback
  ],
  launchpad: [
    { regDaysAgo: 6, force: "registered" }, // decision due
    { regDaysAgo: 200, force: "won", kind: "project", refund: { afterDays: 75, fraction: 0.5 } }, // late refund → no clawback
  ],
  arjun: [{ regDaysAgo: 110, force: "won", kind: "project", refund: { afterDays: 5, fraction: 0.3 } }], // partial refund on pending line
  northstar: [{ regDaysAgo: 185, force: "won", kind: "repeat" }],
  sneha: [{ regDaysAgo: 4, force: "registered" }],
  vikram: [{ regDaysAgo: 150, force: "won", kind: "project" }], // payments after removal → forfeited
  priya: [{ regDaysAgo: 95, force: "won", kind: "project" }], // owed while PAN missing
  omar: [{ regDaysAgo: 90, force: "won", kind: "project" }], // non-resident, held for CA confirmation
  neel: [{ regDaysAgo: 20, force: "won", kind: "project" }],
};

export function buildDemoDataset(today: ISODate): Dataset {
  idCounter = 0;
  const rng = mulberry32(20261027);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rng() * arr.length)];
  const between = (a: number, b: number) => a + Math.floor(rng() * (b - a + 1));
  const ago = (n: number) => addDays(today, -n);

  const partners: Partner[] = [];
  const referrals: Referral[] = [];
  const stageHistory: StageChange[] = [];
  const payments: ClientPayment[] = [];
  const audit: AuditEntry[] = [];
  const meta = new Map<string, { seed: PartnerSeed; kind: Plan["kind"]; refund?: Plan["refund"] }>();
  const reserved = new Set(Object.values(SPECIAL).flat().map((pl) => pl.company).filter(Boolean));
  const companyPool = COMPANIES.filter((c) => !reserved.has(c));
  const takeCompany = (name?: string) => {
    if (name) { const i = companyPool.indexOf(name); if (i >= 0) companyPool.splice(i, 1); return name; }
    return companyPool.splice(Math.floor(rng() * companyPool.length), 1)[0] ?? `Company ${idCounter}`;
  };
  const log = (actor: string, table: string, rowId: string, action: AuditEntry["action"], at: string, before: unknown, after: unknown) =>
    audit.push({ id: uid("aud"), actor, table, rowId, action, at, before, after });

  for (const s of PARTNERS) {
    const id = uid("prt");
    const joined = ago(s.joinedDaysAgo);
    partners.push({
      id, createdAt: ts(joined, 11), fullName: s.fullName, email: s.email, phone: `+91 98${between(10000000, 99999999)}`,
      company: s.company, partnerType: s.partnerType, country: s.country, isResidentIndia: s.resident,
      panOnFile: s.pan !== null, panLast4: s.pan, gstRegistered: s.gstin !== null, gstin: s.gstin,
      bankDetailsOnFile: s.key !== "sneha", agreementSignedAt: s.agreement ? addDays(joined, 2) : null,
      portfolioAgreement: !!s.portfolio, status: s.status ?? "active",
      leftAt: s.leftDaysAgo !== undefined ? ago(s.leftDaysAgo) : null, removalReason: s.removalReason ?? null, notes: s.notes ?? null, pendingDetails: null,
    });
    if (s.key === "omar") partners[partners.length - 1].phone = "+971 50 412 7781";

    const plans: Plan[] = [...(SPECIAL[s.key] ?? [])];
    const randomCount = Math.max(0, s.referrals - plans.length);
    const activeUntil = s.leftDaysAgo !== undefined && s.leftDaysAgo > 0 ? s.leftDaysAgo + 10 : 2;
    for (let i = 0; i < randomCount; i++) {
      plans.push({ regDaysAgo: between(activeUntil, Math.max(activeUntil + 1, s.joinedDaysAgo - 5)) });
    }

    for (const plan of plans) {
      const company = takeCompany(plan.company);
      const regDate = ago(plan.regDaysAgo);
      const registeredAt = ts(regDate, between(9, 19), between(0, 59));
      const contact = `${pick(FIRST)} ${pick(LAST)}`;
      const domain = plan.domain ?? domainOf(company);
      const r: Referral = {
        id: uid("ref"), partnerId: id, companyName: company, companyDomain: domain,
        contactName: contact, contactEmail: `${contact.split(" ")[0].toLowerCase()}@${domain}`, contactRole: pick(ROLES),
        need: pick(NEEDS), partnerNote: `Spoke with ${contact.split(" ")[0]} about a ${pick(["rebrand", "new product launch", "website rebuild", "design system", "app redesign"])}; they asked for an intro.`,
        stage: "registered", registeredAt, decisionDueAt: decisionDueAt(registeredAt), decidedAt: null, decidedBy: null,
        declineReason: null, introducedAt: null, attributionExpiresAt: null, signedAt: null, firstContractValue: null,
        lockedRateBp: null, lockedTier: null, vcDiscount: false, duplicateOf: null, forfeited: false, lostReason: null, internalNotes: null,
      };
      referrals.push(r);
      meta.set(r.id, { seed: s, kind: plan.kind, refund: plan.refund });
      log(s.fullName, "referrals", r.id, "insert", registeredAt, null, { company, stage: "registered" });

      const history: { to: Stage; date: ISODate; by: string; note?: string }[] = [{ to: "registered", date: regDate, by: s.fullName }];
      const move = (to: Stage, date: ISODate, by = TEAM, note?: string) => {
        if (date > today) return false;
        history.push({ to, date, by, note }); r.stage = to; return true;
      };

      const f = plan.force;
      if (f === "registered") { /* awaiting decision */ }
      else {
        const decided = addWorkingDays(regDate, between(1, 4));
        const declined = f === "declined" || (!f && rng() < 0.12);
        if (decided <= today) {
          r.decidedAt = ts(decided, 15); r.decidedBy = ADMIN;
          if (declined) {
            r.declineReason = pick(DECLINE); move("declined", decided, ADMIN, r.declineReason);
          } else if (move("approved", decided, ADMIN)) {
            let intro = addDays(decided, between(2, 10));
            if (f === "closing") intro = addDays(addMonths(today, -6), between(8, 25));
            if (f === "expired") intro = addDays(addMonths(today, -6), -between(10, 30));
            if (move("introduced", intro, TEAM, "Intro call held")) {
              r.introducedAt = intro; r.attributionExpiresAt = attributionExpiresAt(intro);
              const disc = addDays(intro, between(6, 18));
              if (f === "expired") { move("discovery", disc); }
              else if (f === "closing") { move("discovery", disc); move("proposal", addDays(disc, 20), TEAM, "Proposal sent"); }
              else if (move("discovery", disc)) {
                const goesProposal = f === "won" || (f !== "lost" && rng() < 0.55 + s.winBias * 0.35);
                if (!goesProposal) { const d = addDays(disc, between(10, 25)); r.lostReason = pick(LOST); move("lost", d, TEAM, r.lostReason); }
                else {
                  const prop = addDays(disc, between(8, 24));
                  if (move("proposal", prop, TEAM, "Proposal sent")) {
                    const close = addDays(prop, between(8, 30));
                    const wins = f === "won" || (f !== "lost" && rng() < s.winBias);
                    if (wins) {
                      const signed = close <= r.attributionExpiresAt! ? close : addDays(r.attributionExpiresAt!, -3);
                      if (move("won", signed, TEAM, "Contract signed")) r.signedAt = signed;
                    } else {
                      r.lostReason = pick(LOST); move("lost", close, TEAM, r.lostReason);
                    }
                  }
                }
              }
            }
          }
        }
      }

      let prev: Stage | null = null;
      for (const h of history) {
        const at = h.to === "registered" ? registeredAt : ts(h.date, between(10, 18), between(0, 59));
        stageHistory.push({ id: uid("stg"), referralId: r.id, fromStage: prev, toStage: h.to, changedBy: h.by, changedAt: at, note: h.note ?? null });
        if (prev) log(h.by, "referrals", r.id, "update", at, { stage: prev }, { stage: h.to });
        prev = h.to;
      }
    }
  }

  // Duplicate check, in registration order (first registration wins).
  const byReg = [...referrals].sort((a, b) => a.registeredAt.localeCompare(b.registeredAt));
  for (const r of byReg) {
    const dup = findDuplicate(r, byReg);
    if (dup) r.duplicateOf = dup.id;
  }

  // Lock rates for won referrals using the tier held before each conversion.
  const partnerById = new Map(partners.map((p) => [p.id, p]));
  for (const r of referrals.filter((x) => x.stage === "won")) {
    const p = partnerById.get(r.partnerId)!;
    const { lockedRateBp, lockedTier } = lockRate(p, referrals, r);
    r.lockedRateBp = lockedRateBp; r.lockedTier = lockedTier;
    const m = meta.get(r.id)!;
    r.vcDiscount = !!m.seed.vcDiscountShare && rng() < m.seed.vcDiscountShare;
  }

  // Client payments.
  for (const r of referrals.filter((x) => x.stage === "won")) {
    const m = meta.get(r.id)!;
    const kind = m.kind ?? (rng() < 0.2 ? "retainer" : rng() < 0.15 ? "repeat" : "project");
    const add = (receivedOn: ISODate, net: number, k: PaymentKind) => {
      if (receivedOn > today) return null;
      const p: ClientPayment = { id: uid("pay"), referralId: r.id, receivedOn, netAmount: net, kind: k, invoiceNumber: `PXL-${receivedOn.slice(2, 4)}${receivedOn.slice(5, 7)}-${String(payments.length + 101).padStart(4, "0")}`, refunded: false, refundedOn: null, refundAmount: 0 };
      payments.push(p);
      log(TEAM, "client_payments", p.id, "insert", ts(receivedOn, 17), null, { net_amount: net, kind: k });
      return p;
    };
    const signed = r.signedAt!;
    if (kind === "retainer") {
      const fee = rupees(between(8, 25) * 10_000);
      r.firstContractValue = fee * 12;
      for (let k = 1; k <= 16; k++) add(addMonths(signed, k), fee, "retainer");
    } else {
      const total = rupees(between(30, 220) * 10_000);
      r.firstContractValue = total;
      const n = between(2, 4);
      const splits = n === 2 ? [0.5, 0.5] : n === 3 ? [0.4, 0.3, 0.3] : [0.3, 0.3, 0.25, 0.15];
      let d = addDays(signed, between(3, 10));
      let allocated = 0;
      splits.forEach((share, i) => {
        const amt = i === splits.length - 1 ? total - allocated : Math.round((total * share) / 100_00) * 100_00;
        allocated += amt;
        add(d, amt, "milestone");
        d = addDays(d, between(25, 50));
      });
      if (kind === "repeat") {
        add(addMonths(signed, between(4, 7)), rupees(between(15, 50) * 10_000), "repeat_work");
        add(addMonths(signed, 13), rupees(between(10, 20) * 10_000), "repeat_work");
      }
    }
    if (m.refund) {
      const p = payments.find((x) => x.referralId === r.id);
      if (p) {
        const on = addDays(p.receivedOn, m.refund.afterDays);
        if (on <= today) { p.refunded = true; p.refundedOn = on; p.refundAmount = Math.round(p.netAmount * m.refund.fraction); }
      }
    }
  }

  // Replay: payments → lines, refunds → clawbacks, removals → forfeits, payout runs twice monthly.
  const lines: CommissionLine[] = [];
  const payouts: Payout[] = [];
  const referralById = new Map(referrals.map((r) => [r.id, r]));
  type Ev = { date: ISODate; order: number; run: () => void };
  const events: Ev[] = [];

  for (const p of payments) {
    events.push({ date: p.receivedOn, order: 0, run: () => {
      const r = referralById.get(p.referralId)!;
      const draft = commissionForPayment(r, p);
      if (!draft) return;
      const line: CommissionLine = { id: uid("com"), partnerId: r.partnerId, referralId: r.id, clientPaymentId: p.id, payoutId: null, createdOn: p.receivedOn, ...draft };
      lines.push(line);
      log("system", "commission_lines", line.id, "insert", ts(p.receivedOn, 17, 5), null, { amount: line.amount, reason: line.reason, status: line.status });
    } });
    if (p.refunded && p.refundedOn) {
      events.push({ date: p.refundedOn, order: 1, run: () => {
        const original = lines.find((l) => l.clientPaymentId === p.id && l.reason === "eligible");
        if (!original) return;
        const res = clawbackForRefund(original, p, p.refundedOn!, p.refundAmount);
        const at = ts(p.refundedOn!, 16);
        log(TEAM, "client_payments", p.id, "update", at, { refunded: false }, { refunded: true, refund_amount: p.refundAmount });
        if (res.action === "void_original") {
          log("system", "commission_lines", original.id, "update", at, { status: original.status }, { status: "void" });
          original.status = "void";
          if (res.replacement) {
            const line: CommissionLine = { id: uid("com"), partnerId: original.partnerId, referralId: original.referralId, clientPaymentId: p.id, payoutId: null, createdOn: p.refundedOn!, ...res.replacement };
            lines.push(line);
            log("system", "commission_lines", line.id, "insert", at, null, { amount: line.amount, reason: line.reason });
          }
        } else if (res.action === "clawback") {
          const line: CommissionLine = { id: uid("com"), partnerId: original.partnerId, referralId: original.referralId, clientPaymentId: p.id, payoutId: null, createdOn: p.refundedOn!, ...res.line };
          lines.push(line);
          log("system", "commission_lines", line.id, "insert", at, null, { amount: line.amount, reason: "clawback" });
        }
      } });
    }
  }

  for (const p of partners.filter((x) => x.status === "removed" && x.leftAt)) {
    events.push({ date: p.leftAt!, order: 2, run: () => {
      // Admin marks the affected referrals (here: all open-balance referrals of the removed partner).
      for (const r of referrals.filter((x) => x.partnerId === p.id && x.stage === "won")) {
        r.forfeited = true;
        r.internalNotes = "Forfeited on removal for conduct breach.";
        log(ADMIN, "referrals", r.id, "update", ts(p.leftAt!, 12), { forfeited: false }, { forfeited: true });
        for (const l of lines.filter((x) => x.referralId === r.id && x.status === "pending")) {
          log("system", "commission_lines", l.id, "update", ts(p.leftAt!, 12), { status: "pending" }, { status: "void", reason: "forfeited" });
          l.status = "void"; l.reason = "forfeited";
        }
      }
    } });
  }

  const firstDate = payments.map((p) => p.receivedOn).sort()[0] ?? today;
  for (let d = `${firstDate.slice(0, 7)}-01`; d <= today; d = addMonths(d, 1)) {
    for (const runDate of [d, addDays(d, 15)]) {
      if (runDate > today) continue;
      events.push({ date: runDate, order: 3, run: () => {
        for (const partner of partners) {
          const s = PARTNERS.find((x) => x.fullName === partner.fullName)!;
          if (s.holdPayoutsDaysAgo !== undefined && runDate >= ago(s.holdPayoutsDaysAgo)) continue;
          const due = lines.filter((l) => l.partnerId === partner.id && l.status === "pending" && !l.settledAsDiscount && l.createdOn < runDate);
          const gross = partnerBalance(due);
          if (due.length === 0 || gross <= 0) continue;
          const earlier = payouts.filter((x) => x.partnerId === partner.id);
          const tds = suggestTds(partner, runDate, gross, earlier);
          const foreign = !partner.isResidentIndia;
          const payout: Payout = {
            id: uid("pyo"), partnerId: partner.id, paidOn: runDate, grossAmount: gross, tdsSuggested: tds.amount, tdsAmount: tds.amount,
            netAmount: gross - tds.amount, currency: foreign ? "AED" : "INR", fxRate: foreign ? 0.0441 : null,
            partnerInvoiceNumber: `${partner.fullName.split(" ").map((w) => w[0]).join("")}-INV-${String(earlier.length + 1).padStart(3, "0")}`,
            bankReference: `UTR${String(Math.floor(rng() * 1e12)).padStart(12, "0")}`,
            tdsCertificateUrl: tds.amount > 0 && runDate < addMonths(today, -3) ? `tds-certificates/${partner.id}/${runDate}.pdf` : null,
            notes: foreign ? tds.note : null,
          };
          payouts.push(payout);
          for (const l of due) { l.status = "paid"; l.payoutId = payout.id; }
          log(ADMIN, "payouts", payout.id, "insert", ts(runDate, 12), null, { gross_amount: gross, tds_amount: tds.amount, lines: due.length });
        }
      } });
    }
  }

  events.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
  for (const e of events) e.run();

  const applications: PartnerApplication[] = APPLICATIONS.map((a) => ({
    id: uid("app"), createdAt: ts(ago(a.daysAgo), 14, 20), fullName: a.fullName, email: a.email, phone: a.phone, company: a.company,
    partnerType: a.partnerType, linkedinUrl: a.linkedinUrl, howTheyKnowClients: a.how, country: a.country,
    status: a.rejectReason ? "rejected" : "new", reviewedBy: a.rejectReason ? ADMIN : null,
    reviewedAt: a.rejectReason ? ts(ago(a.daysAgo - 2), 11) : null, rejectReason: a.rejectReason ?? null, partnerId: null,
  }));
  for (const a of applications) log(a.fullName, "partner_applications", a.id, "insert", a.createdAt, null, { email: a.email });

  // Portal submissions waiting for the admin: Priya sent her PAN; Omar raised an invoice for what he's owed.
  const invoices: PartnerInvoice[] = [];
  const priya = partners.find((p) => p.fullName === "Priya Nair")!;
  priya.pendingDetails = { panLast4: "7316", gstin: null, isResidentIndia: true, submittedAt: ts(ago(1), 18, 10) };
  log(priya.fullName, "partners", priya.id, "update", priya.pendingDetails.submittedAt, null, { pending_details: priya.pendingDetails });
  const omar = partners.find((p) => p.fullName === "Omar Haddad")!;
  const omarOwed = partnerBalance(lines.filter((l) => l.partnerId === omar.id));
  if (omarOwed > 0) {
    const inv: PartnerInvoice = { id: uid("inv"), partnerId: omar.id, invoiceNumber: "HA-2026-014", amount: omarOwed, issuedOn: ago(2), submittedAt: ts(ago(2), 13, 45), status: "submitted", payoutId: null, rejectReason: null, notes: "Please pay in AED to the account on file." };
    invoices.push(inv);
    log(omar.fullName, "partner_invoices", inv.id, "insert", inv.submittedAt, null, { invoice_number: inv.invoiceNumber, amount: inv.amount });
  }

  audit.sort((a, b) => b.at.localeCompare(a.at));
  return { partners, applications, invoices, referrals, stageHistory, payments, lines, payouts, audit, today };
}

