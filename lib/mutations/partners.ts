import { addDays, type ISODate } from "../dates";
import { programConfig, type ProgramConfig } from "../program-config";
import type { Partner, PartnerApplication, PartnerStatus, PartnerType } from "../types";
import { audit, diff, fail, find, newId, type Ctx } from "./context";

/* ---------- applications (public page) ---------- */

export interface ApplicationInput {
  fullName: string;
  email: string;
  phone: string;
  company: string;
  partnerType: PartnerType;
  linkedinUrl: string;
  howTheyKnowClients: string;
  country: string;
}

export function submitApplication(ctx: Ctx, input: ApplicationInput): PartnerApplication {
  const email = input.email.trim().toLowerCase();
  if (!input.fullName.trim()) fail("Your name is required.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail("Enter a valid email address.");
  if (ctx.data.partners.some((p) => p.email.toLowerCase() === email)) fail("This email already belongs to a partner. Sign in instead.");
  if (ctx.data.applications.some((a) => a.email === email && a.status === "new")) fail("We already have an application from this email and will reply soon.");
  const app: PartnerApplication = {
    id: newId("app"), createdAt: ctx.now, fullName: input.fullName.trim(), email, phone: input.phone.trim(),
    company: input.company.trim(), partnerType: input.partnerType, linkedinUrl: input.linkedinUrl.trim(),
    howTheyKnowClients: input.howTheyKnowClients.trim(), country: input.country.trim() || "India",
    status: "new", reviewedBy: null, reviewedAt: null, rejectReason: null, partnerId: null,
  };
  ctx.data.applications.push(app);
  audit(ctx, "partner_applications", app.id, "insert", null, { email: app.email, partner_type: app.partnerType });
  return app;
}

/** Approving creates the partner. The agreement is signed separately, then recorded on the partner. */
export function approveApplication(ctx: Ctx, id: string): Partner {
  const app = find(ctx.data.applications, id, "Application");
  if (app.status !== "new") fail("This application has already been reviewed.");
  if (ctx.data.partners.some((p) => p.email.toLowerCase() === app.email)) fail("A partner with this email already exists.");
  const partner: Partner = {
    id: newId("prt"), createdAt: ctx.now, fullName: app.fullName, email: app.email, phone: app.phone, company: app.company,
    partnerType: app.partnerType, country: app.country, isResidentIndia: app.country.toLowerCase() === "india",
    panOnFile: false, panLast4: null, gstRegistered: false, gstin: null, bankDetailsOnFile: false, agreementSignedAt: null,
    portfolioAgreement: false, status: "active", leftAt: null, removalReason: null, notes: null, pendingDetails: null,
  };
  ctx.data.partners.push(partner);
  app.status = "approved";
  app.reviewedBy = ctx.actor;
  app.reviewedAt = ctx.now;
  app.partnerId = partner.id;
  audit(ctx, "partner_applications", app.id, "update", { status: "new" }, { status: "approved" });
  audit(ctx, "partners", partner.id, "insert", null, { full_name: partner.fullName, email: partner.email });
  return partner;
}

export function rejectApplication(ctx: Ctx, id: string, reason: string) {
  const app = find(ctx.data.applications, id, "Application");
  if (app.status !== "new") fail("This application has already been reviewed.");
  if (!reason.trim()) fail("A reason is required.");
  app.status = "rejected";
  app.reviewedBy = ctx.actor;
  app.reviewedAt = ctx.now;
  app.rejectReason = reason.trim();
  audit(ctx, "partner_applications", app.id, "update", { status: "new" }, { status: "rejected", reject_reason: app.rejectReason });
  return app;
}

/* ---------- partner record (admin) ---------- */

export interface PartnerPatch {
  phone: string;
  company: string;
  country: string;
  isResidentIndia: boolean;
  /** Only the last four characters are stored, never the full PAN. */
  panLast4: string;
  gstin: string;
  bankDetailsOnFile: boolean;
  agreementSignedAt: ISODate | null;
  portfolioAgreement: boolean;
  notes: string;
}

export function updatePartner(ctx: Ctx, id: string, patch: PartnerPatch) {
  const p = find(ctx.data.partners, id, "Partner");
  const pan = patch.panLast4.trim().toUpperCase();
  if (pan && !/^[A-Z0-9]{4}$/.test(pan)) fail("Enter only the last 4 characters of the PAN.");
  const gstin = patch.gstin.trim().toUpperCase();
  if (gstin && !/^[0-9A-Z]{15}$/.test(gstin)) fail("A GSTIN is 15 letters and digits.");
  if (patch.agreementSignedAt && patch.agreementSignedAt > ctx.data.today) fail("The agreement date can't be in the future.");
  if (patch.portfolioAgreement && p.partnerType !== "vc_accelerator") fail("Portfolio agreements are for VC / accelerator partners.");

  const next: Partial<Partner> = {
    phone: patch.phone.trim(), company: patch.company.trim(), country: patch.country.trim() || p.country,
    isResidentIndia: patch.isResidentIndia, panOnFile: pan !== "", panLast4: pan || null,
    gstRegistered: gstin !== "", gstin: gstin || null, bankDetailsOnFile: patch.bankDetailsOnFile,
    agreementSignedAt: patch.agreementSignedAt, portfolioAgreement: patch.portfolioAgreement, notes: patch.notes.trim() || null,
  };
  const d = diff(p, next);
  if (Object.keys(d.after).length === 0) return p;
  Object.assign(p, next);
  audit(ctx, "partners", p.id, "update", d.before, d.after);
  return p;
}

export interface StatusInput {
  status: PartnerStatus;
  /** notice_period: the date notice was given; left/removed: the leaving date. */
  effectiveOn: ISODate;
  reason: string;
  /** removed only: void unpaid commission on all of this partner's referrals. */
  forfeit: boolean;
}

/**
 * SPEC "Leaving the program". Notice → still earns on signed referrals.
 * Removal for conduct can forfeit unpaid commission; future payments then create void lines.
 */
export function changePartnerStatus(ctx: Ctx, id: string, input: StatusInput, config: ProgramConfig = programConfig) {
  const p = find(ctx.data.partners, id, "Partner");
  if (input.status === p.status) fail("The partner already has this status.");
  if (p.status === "removed") fail("Removed partners can't be reinstated here.");
  if (input.effectiveOn > ctx.data.today && input.status !== "notice_period") fail("The date can't be in the future.");
  if (input.status === "removed" && !input.reason.trim()) fail("A removal reason is required.");

  const before = { status: p.status, left_at: p.leftAt, removal_reason: p.removalReason };
  p.status = input.status;
  p.leftAt = input.status === "active" ? null
    : input.status === "notice_period" ? addDays(input.effectiveOn, config.noticePeriodDays)
    : input.effectiveOn;
  p.removalReason = input.status === "removed" ? input.reason.trim() : null;
  audit(ctx, "partners", p.id, "update", before, { status: p.status, left_at: p.leftAt, removal_reason: p.removalReason });

  let voided = 0;
  if (input.status === "removed" && input.forfeit) {
    for (const r of ctx.data.referrals.filter((x) => x.partnerId === p.id && !x.forfeited)) {
      r.forfeited = true;
      audit(ctx, "referrals", r.id, "update", { forfeited: false }, { forfeited: true });
      for (const l of ctx.data.lines.filter((x) => x.referralId === r.id && x.status === "pending")) {
        audit({ ...ctx, actor: "system" }, "commission_lines", l.id, "update", { status: "pending", reason: l.reason }, { status: "void", reason: "forfeited" });
        l.status = "void";
        l.reason = "forfeited";
        voided++;
      }
    }
  }
  return { partner: p, voided };
}
