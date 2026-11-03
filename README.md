# PIXELUP LABS Referral Tracker

Runs the PIXELUP LABS Partner Referral Program: partners, referrals, client payments, commission, TDS and payouts, with a team dashboard.

**Status:** the whole app works end to end on **in-memory demo data**: the public page and applications, sign-in with roles, the admin dashboard with every write action (approve/decline, pipeline, payments, refunds, payouts, partner status), and the partner portal. Emails are switched off for now. Connecting Supabase is the remaining step (see "Connecting Supabase" below and `DECISIONS.md` D-01).

## Run it locally

```bash
npm install
npm run dev          # http://localhost:3000 → public page; /login to sign in
npm test             # 109 unit tests: commission rules, write actions, sessions/permissions, dashboard/list consistency
npm run typecheck
```

No environment variables are needed in development. Go to `/login` and pick an account: **Monesh Goyal (admin)**, **Aditi Sharma (team)** or any partner, to see the portal. Demo dates are relative to today (IST). Changes you make live in server memory until the server restarts; an admin can reset them at `/admin/settings`.

## How it works

The program, end to end:

**apply → register a referral → approve → introduce → client signs → client pays → commission → payout**

No emails are sent (`DECISIONS.md` D-28). Partners check their portal for updates, and the PIXELUP team works from the dashboard.

| Who | Where they work |
|---|---|
| **Partners** (people who refer clients) | Public page `/`, then the partner portal `/portal` |
| **Admin** | Admin dashboard `/admin`, with full control |
| **Team** | Admin dashboard `/admin`, limited to moving deals forward and logging payments |

### Partner flow

1. **Apply.** On the public page, read the tiers and rules and fill in the apply form. The partner sees "Application received"; PIXELUP contacts them directly.
2. **Sign in.** Once approved, they sign in at `/login` and land on `/portal`. For now they pick their name from a list; with Supabase this becomes an email login link.
3. **Register a referral, before making the introduction.** **Register a referral** → company, website, contact person, what the company needs, and how they know them. It shows as **In review** with a decision date 5 working days away. Up to 20 registrations a day.
4. **Watch progress in the portal.**

   | Status | Meaning |
   |---|---|
   | In review | Waiting for PIXELUP's decision |
   | Approved | Go ahead and make the introduction |
   | Declined | Not accepted; the reason is shown |
   | Introduced → Discovery → Proposal | The PIXELUP team is working the deal |
   | Won | The client signed; the partner's rate for that client is locked |
   | Lost | The deal didn't happen |

5. **See money.**
   - **Your tier:** current rate, plus "X more wins to the next tier" with a progress bar.
   - **Owed to you:** commission waiting to be paid.
   - **Commission:** one line per client payment, marked Due, Paid or Clawback.
   - **Payouts:** each bank transfer with gross, TDS, net and the TDS certificate status.
6. **Get paid: send an invoice.** The **Get paid** card shows what they're owed and lets them send an invoice (number, amount, date) for it. It shows "Waiting for payment" until PIXELUP pays it in the next payout run. They can withdraw it, and if PIXELUP returns it, they see the reason and can send a new one. One open invoice at a time, never more than they're owed.
7. **Keep their details up to date.** Under **My details**:
   - **Contact** (phone, company, country) saves straight away.
   - **Tax details** (last 4 of PAN, GSTIN, residency) go to PIXELUP to verify first, because they change the TDS on payouts. A partner with no PAN on file sees a reminder.
   - **Bank details** are never typed into the app; the page tells them to send them to their PIXELUP contact.

Partners never see other partners, client invoices or internal notes.

### Admin flow

The **dashboard** (`/admin`) is the home screen. It shows six numbers at the top, then a **Needs attention** list sorted with overdue items first. That list is the to-do list. Every number links to the list behind it.

1. **Review applications** (badge on **Applications** in the sidebar).
   - Read the application and click **Approve and create partner**, or **Reject** with a reason.
   - Then send the agreement yourself. Once it's signed, open the partner's page → **Edit profile** → enter the agreement date, the last 4 characters of their PAN, GST and bank details.
2. **Decide on new referrals** ("Decision due" alert).
   - Open the referral. The checklist auto-checks that it's the first registration of this company and that it isn't a self-referral (the partner referring their own company).
   - You tick three yourself: not a recent client, not already in talks with us, and a warm intro.
   - **Approve**, or **Decline** with a reason the partner will see. Duplicates and self-referrals can only be declined.
3. **Move the deal forward** (admin or team).
   - The **Next step** box on the referral moves it **Introduced → Discovery → Proposal**.
   - "Introduced" asks for the intro date. That starts the **6-month attribution window**: the client must sign within it for the partner to get credit. The dashboard warns you as a window closes.
   - **Mark won**: enter the signing date and the contract value, and the rate locks at the partner's current tier:
     - Referrer: 10%
     - Growth Partner: 12.5% (after 3 wins in 12 months)
     - Strategic Partner: 15% (after 6 wins, or a VC portfolio agreement)
   - **Mark lost**: enter a reason.
4. **Log client payments** (admin or team).
   - On a won referral, use **Log a client payment**: the date, the amount excluding GST, the type (milestone, retainer or repeat work) and your invoice number.
   - The commission line is created automatically and is due to the partner within 15 days.
   - If the client is refunded, use **Record refund**. Within 60 days of the payment, the commission is cancelled, reduced, or deducted from the partner's next payout. After 60 days, the commission stands.
5. **Pay partners** (admin only; "Payout due" alert).
   - **Payouts → Balance due** lists who is owed, the earliest due date, the suggested TDS and the net amount:
     - 2% TDS once a partner passes ₹20,000 in the financial year;
     - 20% if there's no PAN on file;
     - partners outside India are flagged for the CA to check.
   - The **Partner invoice** column shows whether the partner has sent an invoice in the portal, and flags it if the amount differs from what's owed.
   - Make the bank transfer yourself, then click **Pay**. The partner's invoice number is filled in if they sent one; you can also **Reject invoice** with a reason. Enter the UTR and adjust the TDS if needed.
   - All of that partner's pending lines are marked paid, and the payout shows in their portal.
   - The **CSV** button exports the list for the bank's batch upload.
6. **Manage partners** (admin only). On a partner's page, **Program status** sets:
   - **Notice period:** 30 days; signed deals keep earning, no new registrations.
   - **Left:** they've left the program.
   - **Removed:** for misconduct, with the option to forfeit unpaid commission. They also lose portal access.
   - When a partner submits tax details in the portal, a **Tax details to verify** card (and a dashboard alert) shows what's on file next to what they sent. Check it against their PAN card or GST certificate, then **Verify and apply** or **Discard**.
7. **Fix mistakes** (admin only). Every correction is recorded in the audit log.
   - **Referral → Corrections:** **Undo** the last stage change (e.g. an approval or a win set by mistake), or **Edit company and contact**. Undoing a win clears the locked rate, and is refused once a payment is logged. The company can only be changed while a referral is awaiting a decision, and changing it re-runs the duplicate check.
   - **Referral → payments → Fix:** edit a payment's date, amount, kind or invoice (commission is recalculated), delete it, or **Undo refund**. Refused once its commission has been paid out; record a refund instead.
   - **Payouts → Payout history → Fix:** correct the TDS, UTR, invoice number or notes, or **Reverse payout** (lines go back to pending). Only a partner's latest payout can be reversed.
8. **Change the program rules** (admin only). **Settings** has every rule: tier rates and conversions needed, the attribution window, decision time, payout due days, the refund window, minimum first contract, notice period, TDS rates and threshold, and the daily registration limit. Changes apply from now on: rates already locked on won referrals and due dates already set don't change. The public page shows the new values straight away.
9. **Check and export.**
   - **Audit log:** every change, with who made it, when, and the before and after values.
   - **Client payments:** all payments and refunds.
   - **CSV export** on every list.
   - **Reset demo data** is at the bottom of Settings.

### What the team can and can't do

| | Admin | Team |
|---|---|---|
| Review applications, approve or decline referrals | ✅ | ❌ |
| Move deals forward, mark won or lost, notes | ✅ | ✅ |
| Log payments and refunds | ✅ | ✅ |
| Create payouts, edit partners, change status | ✅ | ❌ |
| Verify tax details, reject partner invoices | ✅ | ❌ |
| Corrections (undo stage, edit/delete payments, undo refunds, fix/reverse payouts) | ✅ | ❌ |
| Change settings | ✅ | ❌ (read-only) |

### A typical week

1. **Monday:** open the dashboard. Clear "Decision due" alerts (approve or decline), approve any new applications, and verify any "Tax details to verify".
2. **During the week:** the team moves deals forward and logs payments as invoices are paid.
3. **1st and 16th of the month:** go to Payouts → Balance due, check partner invoices ("Invoice to pay" alerts), make the transfers and record each one with **Pay**.
4. **Any time:** partners check their portal for status and money, so they don't need to ask about their commission.

All the rule values (rates, windows, TDS) live in `lib/program-config.ts` and are shown at `/admin/settings`.

## What's here

| Route | What it shows |
|---|---|
| `/` | Public program page: tiers, rules, apply form. |
| `/login` | Demo sign-in (Supabase magic links later). |
| `/portal`, `/portal/register`, `/portal/details` | Partner portal: tier progress, get paid (send an invoice), referrals, commission, payouts; register a referral; my details (contact, tax details for verification). |
| `/admin` | KPIs, needs-attention alerts, funnel, net fees by month, partner leaderboard, partner-type breakdown. Every number links to the filtered list behind it. |
| `/admin/referrals` | Table and Kanban views; filters for stage, reached stage, partner, partner type, dates and search. CSV export. |
| `/admin/referrals/[id]` | Details, duplicate warning, checklist with approve/decline, next-step actions (introduce → won/lost), notes, payments with log payment and refund. |
| `/admin/partners`, `/admin/partners/[id]` | Live tier, agreement, referrals, collected, owed, tier progress and payouts; edit profile/PAN/GST/agreement; notice, leaving and removal. |
| `/admin/applications` | Applications from the public page; approve (creates the partner) or reject. |
| `/admin/payments` | Client payments with refunds and the commission each one generated. |
| `/admin/payouts`, `/admin/payouts/new` | Balance due with suggested TDS, commission lines, payout history, bank-transfer CSV; record a payout with editable TDS and the partner's invoice; fix or reverse payouts. |
| `/admin/audit` | Audit log of writes to referrals, payments, lines and payouts. |
| `/admin/settings` | Edit the program rules (admin; read-only for team); reset demo data. |

## Code map

```
lib/program-config.ts   every program constant (rates, windows, TDS)
lib/commission/         pure, unit-tested rules: tiers, lines, clawback, TDS, duplicates, alerts
lib/mutations/          every write: validates, changes rows, appends audit (unit-tested);
                        includes corrections.ts, portal.ts (details/invoices), settings.ts
lib/actions/            Server Actions: authorise → parse form → mutation → refresh
lib/auth/               signed session cookie, roles/permissions, requireStaff/requirePartner/authorize
lib/queries.ts          filters + metrics shared by dashboard, lists and CSV (keeps numbers in sync)
lib/data/               getDataset()/withDataset() — in-memory demo store now, Supabase later
lib/db/schema.ts        Drizzle schema for all eleven tables
drizzle/                SQL migrations: 0000 tables, 0001 RLS policies, 0002 partner invoices + pending details
proxy.ts                blocks signed-out and wrong-role requests before rendering
lib/money.ts, dates.ts  paise → ₹ with Indian grouping; IST dates, FY, working days
app/admin/              admin pages and CSV export route
```

## Connecting Supabase (next milestone)

What's needed from you: a Supabase project, its URL, anon key, service-role key and database connection string (`DATABASE_URL`).

1. Copy `.env.example` to `.env.local` and fill in the Supabase values.
2. `npm run db:migrate` creates the tables and RLS policies from `drizzle/`, which are already generated.
3. Replace `getDataset()` / `withDataset()` in `lib/data/index.ts` with Drizzle reads and a transaction that writes the rows a mutation changed. Pages, actions and rules stay as they are.
4. Swap the demo cookie in `lib/auth` for Supabase magic-link sessions (`profiles` maps users to a role and partner), and set `DEMO_LOGIN=off`.
5. TDS certificate upload to a private Storage bucket (and, optionally, PDF attachments on partner invoices).
6. Save Settings to the `settings` table and load it into `programConfig` at startup (the edit screen already exists).
7. Enable point-in-time recovery or daily backups before go-live.

## Deploy

Vercel: import the repo, set the environment variables from `.env.example`, deploy. `SESSION_SECRET` is required. Set `APP_URL` to the real domain first. Until Supabase is connected, a deployed demo needs `DEMO_LOGIN=on`, and its data is per-instance and resets on cold start, so it's only for showing the app, not for real partners.
