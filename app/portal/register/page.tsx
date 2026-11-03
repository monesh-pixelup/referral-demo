import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { getDataset } from "@/lib/data";
import { requirePartner } from "@/lib/auth";
import { registerReferralAction } from "@/lib/actions/portal";
import { programConfig } from "@/lib/program-config";
import { istDate } from "@/lib/dates";
import { NEED_LABEL } from "@/lib/types";
import { ActionForm, Field, Input, Select, Textarea } from "@/components/forms";
import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Register a referral" };

export default function Page() {
  return <Suspense fallback={<PageHeader title="Register a referral" />}><Register /></Suspense>;
}

async function Register() {
  const [data, user] = await Promise.all([getDataset(), requirePartner()]);
  const partner = data.partners.find((p) => p.id === user.partnerId)!;
  const today = data.referrals.filter((r) => r.partnerId === partner.id && istDate(r.registeredAt) === data.today).length;
  const c = programConfig;
  return (
    <>
      <Link href="/portal" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="size-3.5" /> Portal</Link>
      <PageHeader title="Register a referral" description={`Register before you introduce. We decide within ${c.decisionWorkingDays} working days; the first partner to register a company is credited.`} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          {partner.status !== "active" ? <p className="pt-5 text-sm text-muted">New registrations are closed for your account.</p> : (
            <ActionForm action={registerReferralAction} submit="Register referral" className="pt-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Company name"><Input name="companyName" required /></Field>
                <Field label="Company website" hint="Used to check for duplicates"><Input name="companyDomain" placeholder="acme.com" required /></Field>
                <Field label="Contact name"><Input name="contactName" required /></Field>
                <Field label="Contact email"><Input type="email" name="contactEmail" required /></Field>
                <Field label="Contact role"><Input name="contactRole" placeholder="Founder & CEO" /></Field>
                <Field label="What they need"><Select name="need" options={Object.entries(NEED_LABEL).map(([value, label]) => ({ value, label }))} /></Field>
              </div>
              <Field label="How you know them, and what they're looking for"><Textarea name="partnerNote" required /></Field>
            </ActionForm>
          )}
        </Card>
        <Card title="What qualifies">
          <ul className="list-disc space-y-1.5 pl-4 text-sm text-ink-2">
            <li>A warm introduction to a decision-maker you know.</li>
            <li>Not a current PIXELUP client or one from the last 12 months.</li>
            <li>Not a company we&apos;re already talking to.</li>
            <li>Not your own company.</li>
            <li>Credit lasts {c.attributionWindowMonths} months from the introduction.</li>
          </ul>
          <p className="mt-4 text-xs text-muted">{today} of {c.maxRegistrationsPerDay} registrations used today.</p>
        </Card>
      </div>
    </>
  );
}
