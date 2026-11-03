/**
 * Drizzle schema for all eleven tables in SPEC "Data model".
 * Not connected yet: the app runs on demo data (lib/data). When Supabase is
 * ready, set DATABASE_URL and run `npm run db:generate` then `npm run db:migrate`.
 * Money is bigint paise; rates are numeric(5,4).
 */
import { bigint, boolean, date, jsonb, numeric, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};
const paise = (name: string) => bigint(name, { mode: "number" });

export const roleEnum = pgEnum("role", ["admin", "team", "partner"]);
export const partnerTypeEnum = pgEnum("partner_type", ["growth_marketer", "designer_freelancer", "vc_accelerator", "other"]);
export const partnerStatusEnum = pgEnum("partner_status", ["active", "notice_period", "left", "removed"]);
export const applicationStatusEnum = pgEnum("application_status", ["new", "approved", "rejected"]);
export const stageEnum = pgEnum("stage", ["registered", "approved", "declined", "introduced", "discovery", "proposal", "won", "lost"]);
export const tierEnum = pgEnum("tier", ["referrer", "growth", "strategic"]);
export const paymentKindEnum = pgEnum("payment_kind", ["milestone", "retainer", "repeat_work"]);
export const lineStatusEnum = pgEnum("line_status", ["pending", "paid", "void"]);
export const lineReasonEnum = pgEnum("line_reason", ["eligible", "clawback", "outside_12_months", "forfeited"]);
export const auditActionEnum = pgEnum("audit_action", ["insert", "update", "delete"]);
export const invoiceStatusEnum = pgEnum("invoice_status", ["submitted", "paid", "rejected"]);

export const partners = pgTable("partners", {
  id: id(), ...timestamps,
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  company: text("company"),
  partnerType: partnerTypeEnum("partner_type").notNull(),
  country: text("country").notNull(),
  isResidentIndia: boolean("is_resident_india").notNull().default(true),
  panOnFile: boolean("pan_on_file").notNull().default(false),
  panLast4: text("pan_last4"), // never the full PAN
  gstRegistered: boolean("gst_registered").notNull().default(false),
  gstin: text("gstin"),
  bankDetailsOnFile: boolean("bank_details_on_file").notNull().default(false),
  agreementSignedAt: date("agreement_signed_at"),
  portfolioAgreement: boolean("portfolio_agreement").notNull().default(false),
  status: partnerStatusEnum("status").notNull().default("active"),
  leftAt: date("left_at"),
  removalReason: text("removal_reason"),
  notes: text("notes"),
  // Tax details the partner submitted in the portal, waiting for admin verification:
  // { panLast4, gstin, isResidentIndia, submittedAt }. Never the full PAN.
  pendingDetails: jsonb("pending_details"),
});

export const profiles = pgTable("profiles", {
  id: id(), ...timestamps,
  userId: uuid("user_id").notNull().unique(), // auth.users.id
  role: roleEnum("role").notNull(),
  fullName: text("full_name"),
  partnerId: uuid("partner_id").references(() => partners.id),
});

export const partnerApplications = pgTable("partner_applications", {
  id: id(), ...timestamps,
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  company: text("company"),
  partnerType: partnerTypeEnum("partner_type").notNull(),
  linkedinUrl: text("linkedin_url"),
  howTheyKnowClients: text("how_they_know_clients"),
  country: text("country").notNull(),
  status: applicationStatusEnum("status").notNull().default("new"),
  reviewedBy: uuid("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  rejectReason: text("reject_reason"),
  partnerId: uuid("partner_id").references(() => partners.id), // set when approved
});

export const referrals = pgTable("referrals", {
  id: id(), ...timestamps,
  partnerId: uuid("partner_id").notNull().references(() => partners.id),
  companyName: text("company_name").notNull(),
  companyDomain: text("company_domain"), // normalised: lowercase, no www
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactRole: text("contact_role"),
  need: text("need"),
  partnerNote: text("partner_note"),
  stage: stageEnum("stage").notNull().default("registered"),
  registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow(),
  decisionDueAt: date("decision_due_at").notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decidedBy: uuid("decided_by"),
  declineReason: text("decline_reason"),
  introducedAt: date("introduced_at"),
  attributionExpiresAt: date("attribution_expires_at"),
  signedAt: date("signed_at"),
  firstContractValue: paise("first_contract_value"),
  lockedRate: numeric("locked_rate", { precision: 5, scale: 4 }),
  lockedTier: tierEnum("locked_tier"),
  vcDiscount: boolean("vc_discount").notNull().default(false),
  duplicateOf: uuid("duplicate_of"),
  forfeited: boolean("forfeited").notNull().default(false),
  lostReason: text("lost_reason"),
  internalNotes: text("internal_notes"),
});

export const stageHistory = pgTable("stage_history", {
  id: id(), ...timestamps,
  referralId: uuid("referral_id").notNull().references(() => referrals.id),
  fromStage: stageEnum("from_stage"),
  toStage: stageEnum("to_stage").notNull(),
  changedBy: uuid("changed_by"),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  note: text("note"),
});

export const clientPayments = pgTable("client_payments", {
  id: id(), ...timestamps,
  referralId: uuid("referral_id").notNull().references(() => referrals.id),
  receivedOn: date("received_on").notNull(),
  netAmount: paise("net_amount").notNull(),
  kind: paymentKindEnum("kind").notNull(),
  invoiceNumber: text("invoice_number"),
  refunded: boolean("refunded").notNull().default(false),
  refundedOn: date("refunded_on"),
  refundAmount: paise("refund_amount").notNull().default(0),
});

export const payouts = pgTable("payouts", {
  id: id(), ...timestamps,
  partnerId: uuid("partner_id").notNull().references(() => partners.id),
  paidOn: date("paid_on").notNull(),
  grossAmount: paise("gross_amount").notNull(),
  tdsSuggested: paise("tds_suggested").notNull(),
  tdsAmount: paise("tds_amount").notNull(),
  netAmount: paise("net_amount").notNull(),
  currency: text("currency").notNull().default("INR"),
  fxRate: numeric("fx_rate", { precision: 12, scale: 6 }),
  partnerInvoiceNumber: text("partner_invoice_number"),
  bankReference: text("bank_reference"),
  tdsCertificateUrl: text("tds_certificate_url"), // private Storage bucket path
  notes: text("notes"),
});

export const commissionLines = pgTable("commission_lines", {
  id: id(), ...timestamps,
  partnerId: uuid("partner_id").notNull().references(() => partners.id),
  referralId: uuid("referral_id").notNull().references(() => referrals.id),
  clientPaymentId: uuid("client_payment_id").notNull().references(() => clientPayments.id),
  amount: paise("amount").notNull(), // negative for clawback
  rate: numeric("rate", { precision: 5, scale: 4 }).notNull(),
  dueBy: date("due_by").notNull(),
  status: lineStatusEnum("status").notNull().default("pending"),
  payoutId: uuid("payout_id").references(() => payouts.id),
  reason: lineReasonEnum("reason").notNull(),
  settledAsDiscount: boolean("settled_as_discount").notNull().default(false),
});

export const partnerInvoices = pgTable("partner_invoices", {
  id: id(), ...timestamps,
  partnerId: uuid("partner_id").notNull().references(() => partners.id),
  invoiceNumber: text("invoice_number").notNull(),
  amount: paise("amount").notNull(),
  issuedOn: date("issued_on").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  status: invoiceStatusEnum("status").notNull().default("submitted"),
  payoutId: uuid("payout_id").references(() => payouts.id),
  rejectReason: text("reject_reason"),
  notes: text("notes"),
});

export const auditLog = pgTable("audit_log", {
  id: id(), ...timestamps,
  actor: text("actor").notNull(),
  table: text("table").notNull(),
  rowId: uuid("row_id").notNull(),
  action: auditActionEnum("action").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

export const settings = pgTable("settings", {
  id: id(), ...timestamps,
  values: jsonb("values").notNull(), // the ProgramConfig object from lib/program-config.ts
});
