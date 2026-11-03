import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { getDataset } from "@/lib/data";
import { requirePartner } from "@/lib/auth";
import { submitTaxDetailsAction, updateMyContactAction } from "@/lib/actions/portal";
import { programConfig } from "@/lib/program-config";
import { formatRate } from "@/lib/money";
import { formatDate, istDate } from "@/lib/dates";
import { PARTNER_TYPE_LABEL } from "@/lib/types";
import { ActionForm, Checkbox, Field, Input } from "@/components/forms";
import { Card, Label, PageHeader, Tag } from "@/components/ui";

export const metadata = { title: "My details" };

export default function Page() {
  return <Suspense fallback={<PageHeader title="My details" />}><Details /></Suspense>;
}

async function Details() {
  const [data, user] = await Promise.all([getDataset(), requirePartner()]);
  const p = data.partners.find((x) => x.id === user.partnerId)!;
  const d = p.pendingDetails;
  const t = programConfig.tds;
  return (
    <>
      <Link href="/portal" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="size-3.5" /> Portal</Link>
      <PageHeader title="My details" description={`${p.fullName} · ${p.email} · ${PARTNER_TYPE_LABEL[p.partnerType]}`} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Contact" subtitle="Saved straight away. To change your email, ask your PIXELUP contact.">
          <ActionForm action={updateMyContactAction} submit="Save contact details" variant="secondary">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Phone"><Input name="phone" type="tel" defaultValue={p.phone} /></Field>
              <Field label="Company"><Input name="company" defaultValue={p.company} /></Field>
              <Field label="Country"><Input name="country" defaultValue={p.country} /></Field>
            </div>
          </ActionForm>
        </Card>

        <Card title="Tax details" subtitle="These set the TDS on your payouts, so we verify them before they apply.">
          <dl className="mb-4 grid grid-cols-3 gap-3 text-sm">
            <div><dt><Label>PAN</Label></dt><dd className="mt-0.5">{p.panOnFile ? `••••${p.panLast4}` : <span className="text-warn">Not on file</span>}</dd></div>
            <div><dt><Label>GSTIN</Label></dt><dd className="mt-0.5">{p.gstin ?? "—"}</dd></div>
            <div><dt><Label>Resident in India</Label></dt><dd className="mt-0.5">{p.isResidentIndia ? "Yes" : "No"}</dd></div>
          </dl>
          {d && (
            <p className="mb-4 rounded-lg bg-warn-wash px-3 py-2 text-sm text-warn">
              <Tag tone="warn">Waiting for verification</Tag> You sent {d.panLast4 ? `PAN ••••${d.panLast4}` : "no PAN"}{d.gstin ? `, GSTIN ${d.gstin}` : ""} on {formatDate(istDate(d.submittedAt))}.
            </p>
          )}
          <ActionForm action={submitTaxDetailsAction} submit={d ? "Replace submitted details" : "Send for verification"} variant="secondary">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="PAN, last 4 characters" hint="We never store your full PAN."><Input name="panLast4" maxLength={4} defaultValue={d?.panLast4 ?? p.panLast4 ?? ""} className="uppercase" placeholder="1234" /></Field>
              <Field label="GSTIN (if registered)"><Input name="gstin" maxLength={15} defaultValue={d?.gstin ?? p.gstin ?? ""} className="uppercase" /></Field>
            </div>
            <Checkbox name="isResidentIndia" defaultChecked={d?.isResidentIndia ?? p.isResidentIndia} label="I'm resident in India for tax" />
            <p className="text-xs text-muted">
              Without a PAN, TDS is {formatRate(t.noPanRateBp)}; with one it&apos;s {formatRate(t.rateBp)} once your yearly total passes ₹{(t.thresholdPaise / 100).toLocaleString("en-IN")}.
              Send a copy of your PAN card to your PIXELUP contact so we can verify it.
            </p>
          </ActionForm>
        </Card>

        <Card title="Bank details" className="lg:col-span-2">
          <p className="text-sm">
            {p.bankDetailsOnFile ? <><Tag tone="good">On file</Tag> We have your bank details.</> : <><Tag tone="warn">Not received</Tag> We need your bank details before we can pay you.</>}
          </p>
          <p className="mt-2 text-sm text-ink-2">For your security, bank account numbers aren&apos;t entered or stored here. Send them to your PIXELUP contact directly, and tell them if they change.</p>
        </Card>
      </div>
    </>
  );
}
