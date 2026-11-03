/**
 * Domain types. These mirror the Drizzle schema in lib/db/schema.ts
 * (snake_case columns → camelCase fields). Money fields are integer paise.
 */
import type { ISODate } from "./dates";
import type { TierName } from "./program-config";

export type Role = "admin" | "team" | "partner";

export type PartnerType = "growth_marketer" | "designer_freelancer" | "vc_accelerator" | "other";
export type PartnerStatus = "active" | "notice_period" | "left" | "removed";

export type Stage =
  | "registered" | "approved" | "declined" | "introduced"
  | "discovery" | "proposal" | "won" | "lost";

export const OPEN_STAGES: Stage[] = ["registered", "approved", "introduced", "discovery", "proposal"];
export const FUNNEL_STAGES: Stage[] = ["registered", "approved", "introduced", "discovery", "proposal", "won"];
export const ALL_STAGES: Stage[] = ["registered", "approved", "introduced", "discovery", "proposal", "won", "lost", "declined"];

export type Need = "brand" | "product" | "web" | "other";
export type PaymentKind = "milestone" | "retainer" | "repeat_work";
export type LineStatus = "pending" | "paid" | "void";
export type LineReason = "eligible" | "clawback" | "outside_12_months" | "forfeited";

export interface Partner {
  id: string;
  createdAt: string;
  fullName: string;
  email: string;
  phone: string;
  company: string;
  partnerType: PartnerType;
  country: string;
  isResidentIndia: boolean;
  panOnFile: boolean;
  panLast4: string | null;
  gstRegistered: boolean;
  gstin: string | null;
  bankDetailsOnFile: boolean;
  agreementSignedAt: ISODate | null;
  portfolioAgreement: boolean;
  status: PartnerStatus;
  leftAt: ISODate | null;
  removalReason: string | null;
  notes: string | null;
  /** Tax details the partner submitted in the portal, waiting for an admin to verify. */
  pendingDetails: PendingDetails | null;
}

export interface PendingDetails {
  panLast4: string | null;
  gstin: string | null;
  isResidentIndia: boolean;
  submittedAt: string;
}

export type InvoiceStatus = "submitted" | "paid" | "rejected";

/** An invoice the partner raises in the portal for commission owed; settled by a payout. */
export interface PartnerInvoice {
  id: string;
  partnerId: string;
  invoiceNumber: string;
  amount: number;
  issuedOn: ISODate;
  submittedAt: string;
  status: InvoiceStatus;
  payoutId: string | null;
  rejectReason: string | null;
  notes: string | null;
}

export interface Referral {
  id: string;
  partnerId: string;
  companyName: string;
  companyDomain: string;
  contactName: string;
  contactEmail: string;
  contactRole: string;
  need: Need;
  partnerNote: string;
  stage: Stage;
  registeredAt: string;
  decisionDueAt: ISODate;
  decidedAt: string | null;
  decidedBy: string | null;
  declineReason: string | null;
  introducedAt: ISODate | null;
  attributionExpiresAt: ISODate | null;
  signedAt: ISODate | null;
  firstContractValue: number | null;
  lockedRateBp: number | null;
  lockedTier: TierName | null;
  vcDiscount: boolean;
  duplicateOf: string | null;
  forfeited: boolean;
  lostReason: string | null;
  internalNotes: string | null;
}

export interface StageChange {
  id: string;
  referralId: string;
  fromStage: Stage | null;
  toStage: Stage;
  changedBy: string;
  changedAt: string;
  note: string | null;
}

export interface ClientPayment {
  id: string;
  referralId: string;
  receivedOn: ISODate;
  netAmount: number;
  kind: PaymentKind;
  invoiceNumber: string;
  refunded: boolean;
  refundedOn: ISODate | null;
  refundAmount: number;
}

export interface CommissionLine {
  id: string;
  partnerId: string;
  referralId: string;
  clientPaymentId: string;
  amount: number;
  rateBp: number;
  dueBy: ISODate;
  status: LineStatus;
  payoutId: string | null;
  reason: LineReason;
  /** VC option: commission passed to the client as a discount, never paid in cash. */
  settledAsDiscount: boolean;
  createdOn: ISODate;
}

export interface Payout {
  id: string;
  partnerId: string;
  paidOn: ISODate;
  grossAmount: number;
  tdsSuggested: number;
  tdsAmount: number;
  netAmount: number;
  currency: string;
  fxRate: number | null;
  partnerInvoiceNumber: string;
  bankReference: string;
  tdsCertificateUrl: string | null;
  notes: string | null;
}

export interface AuditEntry {
  id: string;
  actor: string;
  table: string;
  rowId: string;
  action: "insert" | "update" | "delete";
  before: unknown;
  after: unknown;
  at: string;
}

export type ApplicationStatus = "new" | "approved" | "rejected";

export interface PartnerApplication {
  id: string;
  createdAt: string;
  fullName: string;
  email: string;
  phone: string;
  company: string;
  partnerType: PartnerType;
  linkedinUrl: string;
  howTheyKnowClients: string;
  country: string;
  status: ApplicationStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectReason: string | null;
  /** Set when approved: the partner row created from this application. */
  partnerId: string | null;
}

export interface Dataset {
  partners: Partner[];
  applications: PartnerApplication[];
  referrals: Referral[];
  stageHistory: StageChange[];
  payments: ClientPayment[];
  lines: CommissionLine[];
  payouts: Payout[];
  invoices: PartnerInvoice[];
  audit: AuditEntry[];
  today: ISODate;
}

export const PARTNER_TYPE_LABEL: Record<PartnerType, string> = {
  growth_marketer: "Growth marketer",
  designer_freelancer: "Designer / freelancer",
  vc_accelerator: "VC / accelerator",
  other: "Other",
};

export const STAGE_LABEL: Record<Stage, string> = {
  registered: "Registered",
  approved: "Approved",
  declined: "Declined",
  introduced: "Introduced",
  discovery: "Discovery",
  proposal: "Proposal",
  won: "Won",
  lost: "Lost",
};

export const NEED_LABEL: Record<Need, string> = { brand: "Brand", product: "Product", web: "Web", other: "Other" };

export const PARTNER_STATUS_LABEL: Record<PartnerStatus, string> = {
  active: "Active",
  notice_period: "Notice period",
  left: "Left",
  removed: "Removed",
};
