CREATE TYPE "public"."invoice_status" AS ENUM('submitted', 'paid', 'rejected');--> statement-breakpoint
CREATE TABLE "partner_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"partner_id" uuid NOT NULL,
	"invoice_number" text NOT NULL,
	"amount" bigint NOT NULL,
	"issued_on" date NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "invoice_status" DEFAULT 'submitted' NOT NULL,
	"payout_id" uuid,
	"reject_reason" text,
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "pending_details" jsonb;--> statement-breakpoint
ALTER TABLE "partner_invoices" ADD CONSTRAINT "partner_invoices_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_invoices" ADD CONSTRAINT "partner_invoices_payout_id_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payouts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- RLS for partner invoices (see 0001_rls.sql): partners raise and withdraw their own; staff read; admin settles.
ALTER TABLE partner_invoices ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY partner_invoices_staff_read ON partner_invoices FOR SELECT USING (public.is_staff());--> statement-breakpoint
CREATE POLICY partner_invoices_admin_write ON partner_invoices FOR ALL USING (public.app_role() = 'admin') WITH CHECK (public.app_role() = 'admin');--> statement-breakpoint
CREATE POLICY partner_invoices_own_read ON partner_invoices FOR SELECT USING (partner_id = public.app_partner_id());--> statement-breakpoint
CREATE POLICY partner_invoices_own_insert ON partner_invoices FOR INSERT
  WITH CHECK (partner_id = public.app_partner_id() AND status = 'submitted' AND payout_id IS NULL);--> statement-breakpoint
CREATE POLICY partner_invoices_own_withdraw ON partner_invoices FOR DELETE
  USING (partner_id = public.app_partner_id() AND status = 'submitted');
