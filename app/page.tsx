import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { Check } from "lucide-react";
import { programConfig } from "@/lib/program-config";
import { formatRate } from "@/lib/money";
import { applyAction } from "@/lib/actions/public";
import { ActionForm, Checkbox, Field, Input, Select, Textarea } from "@/components/forms";
import { SiteHeader } from "@/components/site-header";
import { PARTNER_TYPE_LABEL } from "@/lib/types";

export const metadata = {
  title: "Partner Program",
  description: "Refer clients to PIXELUP LABS and earn commission on every payment they make.",
};

/** Public program page. Rules are read at request time so Settings changes show here. */
export default function Home() {
  return (
    <div className="min-h-screen">
      <SiteHeader right={<Link href="/login" className="inline-flex h-8 items-center rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium hover:bg-surface-2">Partner sign in</Link>} />
      <Suspense fallback={<div className="mx-auto h-96 max-w-[1080px]" />}><Program /></Suspense>
    </div>
  );
}

async function Program() {
  await connection();
  const c = programConfig;
  const steps = [
    ["Apply", "Tell us who you are and how you know founders and teams who need brand, product or web work."],
    ["Register a referral", `Register the company in the portal before the intro. We decide within ${c.decisionWorkingDays} working days; first registration wins.`],
    ["Introduce", `Make a warm introduction to a decision-maker. You're credited if they sign within ${c.attributionWindowMonths} months.`],
    ["Get paid", `Earn commission on every client payment, paid within ${c.payoutDueDays} days of us receiving it.`],
  ];
  return (
      <main className="mx-auto max-w-[1080px] px-4 sm:px-8">
        <section className="py-14 sm:py-20">
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">PIXELUP LABS Partner Program</p>
          <h1 className="mt-3 max-w-2xl text-[34px] leading-[1.1] font-medium tracking-tight sm:text-[48px]">Introduce clients who need great design. Earn on every payment.</h1>
          <p className="mt-4 max-w-xl text-ink-2">For growth marketers, designers, VCs and accelerators who know teams that need brand, product or web work.</p>
          <a href="#apply" className="mt-6 inline-flex h-10 items-center rounded-lg bg-ink px-4 text-sm font-medium text-surface hover:opacity-90">Apply to partner</a>
        </section>

        <section className="grid gap-3 sm:grid-cols-3" aria-label="Tiers">
          {c.tiers.map((t) => (
            <div key={t.name} className="rounded-xl border border-line bg-surface p-5">
              <div className="text-sm text-ink-2">{t.label}</div>
              <div className="mt-2 text-[34px] leading-none font-medium tracking-tight">{formatRate(t.rateBp)}</div>
              <div className="mt-2 text-xs text-muted">{t.minWins === 0 ? "From your first referral" : `${t.minWins}+ conversions in ${c.tierWindowMonths} months`}</div>
            </div>
          ))}
        </section>
        <p className="mt-3 text-xs text-muted">Your rate is locked per client when they sign. Retainers earn for the first {c.retainerCommissionMonths} months; repeat projects within {c.repeatWorkMonths} months also count.</p>

        <section className="mt-14">
          <h2 className="text-[22px] font-medium tracking-tight">How it works</h2>
          <ol className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map(([title, body], i) => (
              <li key={title} className="rounded-xl border border-line bg-surface p-5">
                <span className="font-mono text-xs text-muted">0{i + 1}</span>
                <div className="mt-2 font-medium">{title}</div>
                <p className="mt-1 text-sm text-ink-2">{body}</p>
              </li>
            ))}
          </ol>
          <ul className="mt-6 grid gap-2 text-sm text-ink-2 sm:grid-cols-2">
            {[
              "Warm introductions only; no cold lists or scraped contacts.",
              "Current clients and anyone we're already talking to don't qualify.",
              `Refunds within ${c.clawbackWindowDays} days reverse the commission on that payment.`,
              `TDS applies for Indian residents once the year's total passes ₹${(c.tds.thresholdPaise / 100).toLocaleString("en-IN")}.`,
            ].map((x) => <li key={x} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-good" aria-hidden />{x}</li>)}
          </ul>
        </section>

        <section id="apply" className="my-14 grid gap-8 rounded-xl border border-line bg-surface p-5 sm:p-8 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <h2 className="text-[22px] font-medium tracking-tight">Apply</h2>
            <p className="mt-2 text-sm text-ink-2">We review every application personally and reply within a few working days. If approved, we&apos;ll send the partner agreement to sign.</p>
          </div>
          <ActionForm action={applyAction} submit="Submit application" className="lg:col-span-3" inlineSuccess>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Full name"><Input name="fullName" autoComplete="name" required /></Field>
              <Field label="Email"><Input type="email" name="email" autoComplete="email" required /></Field>
              <Field label="Phone"><Input type="tel" name="phone" autoComplete="tel" /></Field>
              <Field label="Company"><Input name="company" autoComplete="organization" /></Field>
              <Field label="You are a">
                <Select name="partnerType" options={Object.entries(PARTNER_TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
              </Field>
              <Field label="Country"><Input name="country" defaultValue="India" autoComplete="country-name" /></Field>
            </div>
            <Field label="LinkedIn profile"><Input type="url" name="linkedinUrl" placeholder="https://www.linkedin.com/in/…" /></Field>
            <Field label="How do you know potential clients?"><Textarea name="howTheyKnowClients" required /></Field>
            <div className="hidden" aria-hidden><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
            <Checkbox name="consent" required label="I agree to the program terms and to PIXELUP LABS storing these details to review my application." />
          </ActionForm>
        </section>
      </main>
  );
}
