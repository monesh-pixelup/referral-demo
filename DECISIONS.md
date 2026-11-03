# Decisions and assumptions

Where SPEC.md is silent, the simplest option was chosen and recorded here. Nothing here changes a program rule; items marked **(confirm)** need your answer.

## Open questions from the spec (answered 3 Nov 2026)

| Question | Answer |
|---|---|
| Minimum first-contract size | **Not set yet.** `minFirstContractPaise = null`; the approval checklist shows "Minimum not set". |
| Governing jurisdiction | Not decided. Defaulting to India for now **(confirm)**. |
| Domain | Placeholder (`APP_URL`). |
| Notification sender | Not needed: emails are switched off for now (D-28). |
| Existing website stack | Separate app. The website at `~/pixelup-labs-website-2026` is Next.js 16 and can link to this app on a subdomain. |
| Supabase | Deferred at your request. This build runs on generated demo data. |

## Build decisions

- **D-01 Scope of this build.** Build 1 covered the Milestone 3 dashboard, read-only admin views and the rules engine. Build 2 (3 Nov 2026) added everything that doesn't need Supabase credentials: write actions, sign-in and roles, the public page with applications, the partner portal, SQL migrations and RLS policies. Build 3 (3 Nov 2026) added corrections, partner self-service details, partner invoices and editable settings. Left for when Supabase keys are available: Drizzle queries behind `getDataset()`, Supabase magic-link auth, TDS certificate upload (Storage), and saving settings to the `settings` table.
- **D-02 Data layer.** `lib/data/getDataset()` returns a `Dataset`. Today it is in-memory demo data rebuilt once per IST day; with Supabase it becomes Drizzle queries returning the same shape, so the pages don't change.
- **D-03 Demo data is simulated, not hand-typed.** `lib/data/seed.ts` replays payments, refunds, removals and twice-monthly payout runs (1st and 16th) through `lib/commission`, so demo commission lines and payouts follow the real rules.
- **D-04 Rates stored as basis points of 1/10,000** (1250 = 12.5%). This maps 1:1 to `numeric(5,4)` and avoids floating-point errors.
- **D-05 Rounding.** Half away from zero to the nearest paisa.
- **D-06 Working days** are Monday to Friday. Indian public holidays are not excluded **(confirm whether to add a holiday list)**. The count starts from the IST calendar date of `registered_at`.
- **D-07 Partial refund on a pending line.** The spec says to void a pending line when its payment is refunded. For a *partial* refund, the original line is voided and replaced by a pending line on the amount the client kept, so commission is not lost on money actually received **(confirm)**.
- **D-08 Refund windows.** "Within 60 days" means ≤ 60 days after `received_on`. "Exceeds ₹20,000" means a total of exactly ₹20,000 attracts no TDS.
- **D-09 Retainer and repeat-work 12-month limit.** Measured from the referral's `signed_at` (first contract), per the spec's line rule.
- **D-10 VC discount lines** are stored with `status = paid` and `settled_as_discount = true`. They never count toward the balance owed. This adds a `settled_as_discount` column to `commission_lines`.
- **D-11 "Net fees collected"** on the dashboard = `net_amount − refund_amount`, since net fees exclude refunds.
- **D-12 Funnel** counts referrals that *ever reached* each stage (from `stage_history`), so conversion between stages is meaningful.
- **D-13 Quarterly tier review dates** follow Indian FY quarters: 1 Apr, 1 Jul, 1 Oct and 1 Jan.
- **D-14 Payout alerts** are suppressed when a partner's pending lines net to ≤ 0 (a clawback has cancelled them), since nothing is due.
- **D-15 `payouts.tds_suggested`** is added next to `tds_amount` so both the suggestion and the admin's final figure are stored, as the spec requires.
- **D-16 UI kit.** Small Tailwind components in `components/ui.tsx` in the shadcn style, rather than the shadcn CLI. Brand fonts (Switzer, Geist Mono), colours and the hex mark come from the PIXELUP website.
- **D-17 Next.js 16 with Cache Components (the scaffold default).** Data reads sit inside `<Suspense>` and call `connection()` so pages render at request time.
- **D-18 Writes are plain functions over the Dataset** (`lib/mutations/`). Each validates everything first, then changes rows and appends audit entries, so a rejected write changes nothing. Server Actions (`lib/actions/`) authorise, parse the form and call them. With Supabase, each mutation runs inside one transaction and the changed rows are written back; the rules don't move.
- **D-19 Demo sign-in until Supabase auth.** A signed (HMAC-SHA256) httpOnly cookie holds role, name and partner id for 7 days. `/login` lets you pick any staff or partner account with no password. It's always on in dev and off in production unless `DEMO_LOGIN=on`. `SESSION_SECRET` is required in production.
- **D-20 Roles.** Admin can do everything. Team can move referrals through the pipeline (introduced → won/lost), edit notes, and log payments and refunds. Only an admin can approve/decline registrations, create payouts, edit partners and review applications **(confirm)**. Partners see only their own referrals, commission lines and payouts, never client payments or other partners.
- **D-21 Access is checked three times.** `proxy.ts` sends a missing or wrong-role session away before anything renders. This matters because Next renders pages in parallel with layouts, so a layout-only check would still stream page data. Admin pages read data only through `getStaffDataset()`, and every Server Action and the CSV export call `authorize()` again.
- **D-22 Approval is blocked when an automatic check fails** (duplicate or self-referral); those are declined with a reason. The three judgement checks (not a recent client, not already in conversation, warm intro) must be ticked by the admin to approve.
- **D-23 Marking won outside the attribution window is refused**, rather than recorded with no commission. A won referral on a duplicate registration is also refused.
- **D-24 A payout settles every pending cash line for the partner created on or before the payment date,** including negative clawbacks. It is refused if the net is ≤ 0, if bank details are missing, or without a partner invoice number and UTR. The suggested TDS is stored beside the admin's figure (D-15).
- **D-25 Removal for conduct can forfeit.** Removing a partner with "forfeit" ticked voids every pending line on their referrals and marks the referrals forfeited, so future client payments create void lines. Without the tick, signed referrals keep earning. Notice period ends 30 days after the date notice was given. Removed partners can't sign in or register.
- **D-26 Partners see "In review"** for a registered referral, including a duplicate, until it's decided. They never see who registered first.
- **D-27 Public application form** has a honeypot field and a per-IP limit of 5 per hour (in memory; move to a shared store such as Upstash or a DB table before launch). An email that already belongs to a partner, or has an open application, is refused.
- **D-28 No emails for now** (your call, 3 Nov 2026). Nothing is sent. Partners see decisions, decline reasons, conversions and payouts in their portal, and you see new applications and registrations on the dashboard (Applications badge, "Needs attention" alerts). Applicants hear back from you directly. Email (e.g. through Resend) can be added later without changing the rules.
- **D-29 Demo store is in server memory.** Writes survive dev hot reloads but reset on restart, and on serverless hosts each instance has its own copy. An admin can reset it at `/admin/settings`. This goes away with Supabase.
- **D-30 RLS policies** (`drizzle/0001_rls.sql`) are defence in depth. The server connects with `DATABASE_URL`, which bypasses RLS, and enforces roles itself. The policies limit any access made with the anon key or a user JWT. Both migrations were checked to apply cleanly on an embedded Postgres with a stubbed `auth.uid()`; they have not yet run on Supabase.
- **D-31 Corrections are admin-only and refused once money has moved.**
  - Editing or deleting a payment is blocked once its commission has been paid out (record a refund instead) or while it has a refund (undo that first). Editing recalculates the line.
  - Undoing a refund removes the adjustment lines it created and restores the original pending line. It is blocked if an adjustment has been settled in a payout.
  - Only a partner's latest payout can be reversed, so TDS on later payouts stays consistent. A reversed payout's lines go back to pending and its partner invoice reopens.
  - Undoing a stage removes that stage-history entry, so the funnel's "ever reached" counts stay right; the audit log keeps it. Undoing a win is blocked once a payment is logged, and clears the locked rate.
  - A referral's company and domain can be changed only while it's still awaiting a decision; changing them re-runs the duplicate check.
- **D-32 Partner tax details need admin verification.** Contact details (phone, company, country) save straight away. PAN (last 4), GSTIN and residency change the TDS, so the partner's submission waits in `partners.pending_details` until an admin verifies it against the documents. Bank details are never entered in the app.
- **D-33 Partner invoices** (`partner_invoices`). A partner can have one open invoice, for no more than they're owed, and can withdraw it. An admin can reject it with a reason. Recording a payout with the same invoice number marks it paid; reversing that payout reopens it. The payout still settles the full balance owed, and a mismatch between the invoice amount and the balance is flagged, not blocked. There are no PDF attachments yet (needs Storage).
- **D-34 Settings are editable and apply going forward.** The rules are validated: tier conversions must increase, tier rates can't decrease, and every value has a sensible range. Already-locked rates, line due dates and referral decision/attribution dates are stored values, so they don't change. Rules applied at the moment of an action do use the new values from then on: refund window at refund time, TDS at payout time, the live tier, and the alert warnings. In the demo the settings live in server memory, and "Reset demo data" restores the defaults.

