CREATE TYPE "public"."application_status" AS ENUM('new', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('insert', 'update', 'delete');--> statement-breakpoint
CREATE TYPE "public"."line_reason" AS ENUM('eligible', 'clawback', 'outside_12_months', 'forfeited');--> statement-breakpoint
CREATE TYPE "public"."line_status" AS ENUM('pending', 'paid', 'void');--> statement-breakpoint
CREATE TYPE "public"."partner_status" AS ENUM('active', 'notice_period', 'left', 'removed');--> statement-breakpoint
CREATE TYPE "public"."partner_type" AS ENUM('growth_marketer', 'designer_freelancer', 'vc_accelerator', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_kind" AS ENUM('milestone', 'retainer', 'repeat_work');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'team', 'partner');--> statement-breakpoint
CREATE TYPE "public"."stage" AS ENUM('registered', 'approved', 'declined', 'introduced', 'discovery', 'proposal', 'won', 'lost');--> statement-breakpoint
CREATE TYPE "public"."tier" AS ENUM('referrer', 'growth', 'strategic');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"table" text NOT NULL,
	"row_id" uuid NOT NULL,
	"action" "audit_action" NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"referral_id" uuid NOT NULL,
	"received_on" date NOT NULL,
	"net_amount" bigint NOT NULL,
	"kind" "payment_kind" NOT NULL,
	"invoice_number" text,
	"refunded" boolean DEFAULT false NOT NULL,
	"refunded_on" date,
	"refund_amount" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"partner_id" uuid NOT NULL,
	"referral_id" uuid NOT NULL,
	"client_payment_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"rate" numeric(5, 4) NOT NULL,
	"due_by" date NOT NULL,
	"status" "line_status" DEFAULT 'pending' NOT NULL,
	"payout_id" uuid,
	"reason" "line_reason" NOT NULL,
	"settled_as_discount" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"company" text,
	"partner_type" "partner_type" NOT NULL,
	"linkedin_url" text,
	"how_they_know_clients" text,
	"country" text NOT NULL,
	"status" "application_status" DEFAULT 'new' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"reject_reason" text,
	"partner_id" uuid
);
--> statement-breakpoint
CREATE TABLE "partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"company" text,
	"partner_type" "partner_type" NOT NULL,
	"country" text NOT NULL,
	"is_resident_india" boolean DEFAULT true NOT NULL,
	"pan_on_file" boolean DEFAULT false NOT NULL,
	"pan_last4" text,
	"gst_registered" boolean DEFAULT false NOT NULL,
	"gstin" text,
	"bank_details_on_file" boolean DEFAULT false NOT NULL,
	"agreement_signed_at" date,
	"portfolio_agreement" boolean DEFAULT false NOT NULL,
	"status" "partner_status" DEFAULT 'active' NOT NULL,
	"left_at" date,
	"removal_reason" text,
	"notes" text,
	CONSTRAINT "partners_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"partner_id" uuid NOT NULL,
	"paid_on" date NOT NULL,
	"gross_amount" bigint NOT NULL,
	"tds_suggested" bigint NOT NULL,
	"tds_amount" bigint NOT NULL,
	"net_amount" bigint NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"fx_rate" numeric(12, 6),
	"partner_invoice_number" text,
	"bank_reference" text,
	"tds_certificate_url" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "role" NOT NULL,
	"full_name" text,
	"partner_id" uuid,
	CONSTRAINT "profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"partner_id" uuid NOT NULL,
	"company_name" text NOT NULL,
	"company_domain" text,
	"contact_name" text,
	"contact_email" text,
	"contact_role" text,
	"need" text,
	"partner_note" text,
	"stage" "stage" DEFAULT 'registered' NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decision_due_at" date NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" uuid,
	"decline_reason" text,
	"introduced_at" date,
	"attribution_expires_at" date,
	"signed_at" date,
	"first_contract_value" bigint,
	"locked_rate" numeric(5, 4),
	"locked_tier" "tier",
	"vc_discount" boolean DEFAULT false NOT NULL,
	"duplicate_of" uuid,
	"forfeited" boolean DEFAULT false NOT NULL,
	"lost_reason" text,
	"internal_notes" text
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"values" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stage_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"referral_id" uuid NOT NULL,
	"from_stage" "stage",
	"to_stage" "stage" NOT NULL,
	"changed_by" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text
);
--> statement-breakpoint
ALTER TABLE "client_payments" ADD CONSTRAINT "client_payments_referral_id_referrals_id_fk" FOREIGN KEY ("referral_id") REFERENCES "public"."referrals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_lines" ADD CONSTRAINT "commission_lines_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_lines" ADD CONSTRAINT "commission_lines_referral_id_referrals_id_fk" FOREIGN KEY ("referral_id") REFERENCES "public"."referrals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_lines" ADD CONSTRAINT "commission_lines_client_payment_id_client_payments_id_fk" FOREIGN KEY ("client_payment_id") REFERENCES "public"."client_payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_lines" ADD CONSTRAINT "commission_lines_payout_id_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payouts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_applications" ADD CONSTRAINT "partner_applications_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_history" ADD CONSTRAINT "stage_history_referral_id_referrals_id_fk" FOREIGN KEY ("referral_id") REFERENCES "public"."referrals"("id") ON DELETE no action ON UPDATE no action;