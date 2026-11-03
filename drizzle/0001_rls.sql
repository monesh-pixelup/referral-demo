-- Row-level security (SPEC "Access"). Defence in depth: the app's server code
-- connects with DATABASE_URL and also checks roles in every Server Action, but
-- any request made with the Supabase anon key or a user JWT is limited here.
--   admin   → everything
--   team    → read everything except the audit log; write the pipeline and payments
--   partner → read only their own partner row, referrals, commission and payouts;
--             register referrals for themselves
-- Requires Supabase (auth.uid()). profiles.user_id = auth.users.id.

CREATE OR REPLACE FUNCTION public.app_role() RETURNS public.role
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT role FROM profiles WHERE user_id = auth.uid() $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.app_partner_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT partner_id FROM profiles WHERE user_id = auth.uid() $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.is_staff() RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT public.app_role() IN ('admin', 'team') $$;
--> statement-breakpoint

ALTER TABLE partners ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE partner_applications ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE stage_history ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE client_payments ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE commission_lines ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- profiles: users see their own; admins manage all.
CREATE POLICY profiles_self ON profiles FOR SELECT USING (user_id = auth.uid());--> statement-breakpoint
CREATE POLICY profiles_admin ON profiles FOR ALL USING (public.app_role() = 'admin') WITH CHECK (public.app_role() = 'admin');--> statement-breakpoint

-- partners
CREATE POLICY partners_staff_read ON partners FOR SELECT USING (public.is_staff());--> statement-breakpoint
CREATE POLICY partners_own_read ON partners FOR SELECT USING (id = public.app_partner_id());--> statement-breakpoint
CREATE POLICY partners_admin_write ON partners FOR ALL USING (public.app_role() = 'admin') WITH CHECK (public.app_role() = 'admin');--> statement-breakpoint

-- applications: submitted through the server; staff read, admin reviews.
CREATE POLICY applications_staff_read ON partner_applications FOR SELECT USING (public.is_staff());--> statement-breakpoint
CREATE POLICY applications_admin_write ON partner_applications FOR ALL USING (public.app_role() = 'admin') WITH CHECK (public.app_role() = 'admin');--> statement-breakpoint

-- referrals
CREATE POLICY referrals_staff_read ON referrals FOR SELECT USING (public.is_staff());--> statement-breakpoint
CREATE POLICY referrals_staff_write ON referrals FOR UPDATE USING (public.is_staff()) WITH CHECK (public.is_staff());--> statement-breakpoint
CREATE POLICY referrals_admin_insert ON referrals FOR INSERT WITH CHECK (public.app_role() = 'admin');--> statement-breakpoint
CREATE POLICY referrals_own_read ON referrals FOR SELECT USING (partner_id = public.app_partner_id());--> statement-breakpoint
CREATE POLICY referrals_own_register ON referrals FOR INSERT
  WITH CHECK (partner_id = public.app_partner_id() AND stage = 'registered' AND locked_rate IS NULL AND NOT forfeited);--> statement-breakpoint

-- stage history
CREATE POLICY stage_history_staff ON stage_history FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());--> statement-breakpoint
CREATE POLICY stage_history_own_read ON stage_history FOR SELECT
  USING (EXISTS (SELECT 1 FROM referrals r WHERE r.id = referral_id AND r.partner_id = public.app_partner_id()));--> statement-breakpoint

-- client payments: staff only (partners see commission lines, not client invoices).
CREATE POLICY client_payments_staff ON client_payments FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());--> statement-breakpoint

-- commission lines: staff write (created by payments); partners read their own.
CREATE POLICY commission_lines_staff ON commission_lines FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());--> statement-breakpoint
CREATE POLICY commission_lines_own_read ON commission_lines FOR SELECT USING (partner_id = public.app_partner_id());--> statement-breakpoint

-- payouts: staff read, admin write, partners read their own.
CREATE POLICY payouts_staff_read ON payouts FOR SELECT USING (public.is_staff());--> statement-breakpoint
CREATE POLICY payouts_admin_write ON payouts FOR ALL USING (public.app_role() = 'admin') WITH CHECK (public.app_role() = 'admin');--> statement-breakpoint
CREATE POLICY payouts_own_read ON payouts FOR SELECT USING (partner_id = public.app_partner_id());--> statement-breakpoint

-- audit log: admin read only; rows are written by the server.
CREATE POLICY audit_admin_read ON audit_log FOR SELECT USING (public.app_role() = 'admin');--> statement-breakpoint

-- settings
CREATE POLICY settings_staff_read ON settings FOR SELECT USING (public.is_staff());--> statement-breakpoint
CREATE POLICY settings_admin_write ON settings FOR ALL USING (public.app_role() = 'admin') WITH CHECK (public.app_role() = 'admin');
