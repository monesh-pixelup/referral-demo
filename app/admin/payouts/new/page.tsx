import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getStaffDataset } from "@/lib/auth";
import { can, requireStaff } from "@/lib/auth";
import { payoutPreview } from "@/lib/mutations";
import { createPayoutAction } from "@/lib/actions/admin";
import { formatINR, formatRate } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { ActionForm, Field, Input, MoneyInput, Select, Textarea } from "@/components/forms";
import { Card, PageHeader, Stat, Table, Td, Th, Tag } from "@/components/ui";
import { programConfig } from "@/lib/program-config";
import { openInvoice } from "@/lib/mutations";
import { RejectInvoiceForm } from "../fix";

export const metadata = { title: "Create payout" };

export default function Page(props: PageProps<"/admin/payouts/new">) {
  return <Suspense fallback={<PageHeader title="Create payout" />}><NewPayout {...props} /></Suspense>;
}

async function NewPayout({ searchParams }: PageProps<"/admin/payouts/new">) {
  const sp = await searchParams;
  const [data, user] = await Promise.all([getStaffDataset(), requireStaff()]);
  if (!can(user.role, "payout.write")) redirect("/admin/payouts?view=owed");
  const partnerId = typeof sp.partner === "string" ? sp.partner : "";
  if (!data.partners.some((p) => p.id === partnerId)) notFound();
  const { partner, lines, gross, tds } = payoutPreview({ data }, partnerId, data.today);
  const refById = new Map(data.referrals.map((r) => [r.id, r]));
  const payoutsSoFar = data.payouts.filter((p) => p.partnerId === partnerId).length;
  const initials = partner.fullName.split(" ").map((w) => w[0]).join("");
  const invoice = openInvoice({ data }, partnerId);
  const problems = [
    !partner.bankDetailsOnFile && "Bank details are not on file.",
    !partner.panOnFile && partner.isResidentIndia && `No PAN on file: TDS is ${formatRate(programConfig.tds.noPanRateBp)}.`,
    !partner.isResidentIndia && "Non-resident: confirm withholding with the CA before paying.",
    !partner.agreementSignedAt && "No signed agreement on file.",
  ].filter(Boolean) as string[];

  return (
    <>
      <Link href="/admin/payouts?view=owed" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="size-3.5" /> Balance due</Link>
      <PageHeader title={`Pay ${partner.fullName}`} description="Records a bank transfer you have made. Every pending line below is marked paid." />

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3" flush title="Lines in this payout" subtitle={<>{lines.length} pending · gross {formatINR(gross)}</>}>
          <Table>
            <thead><tr><Th>Created</Th><Th>Client</Th><Th align="right">Rate</Th><Th align="right">Amount</Th><Th>Due by</Th><Th>Reason</Th></tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <Td mono>{formatDate(l.createdOn)}</Td>
                  <Td><Link className="hover:underline" href={`/admin/referrals/${l.referralId}`}>{refById.get(l.referralId)?.companyName}</Link></Td>
                  <Td align="right" mono>{formatRate(l.rateBp)}</Td>
                  <Td align="right" mono className={l.amount < 0 ? "text-bad" : ""}>{formatINR(l.amount)}</Td>
                  <Td mono className={data.today > l.dueBy && l.amount > 0 ? "text-bad" : ""}>{formatDate(l.dueBy)}</Td>
                  <Td className="text-xs capitalize">{l.reason.replaceAll("_", " ")}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-line px-5 py-3 text-sm">
            <Stat label="Gross" value={formatINR(gross)} />
            <Stat label="Suggested TDS" value={formatINR(tds.amount)} />
            <Stat label="Net" value={formatINR(gross - tds.amount)} />
          </div>
          <p className="px-5 pb-4 text-xs text-muted">{tds.note}</p>
        </Card>

        <Card className="lg:col-span-2" title="Payment details">
          {problems.length > 0 && <div className="mb-4 flex flex-wrap gap-2">{problems.map((p) => <Tag key={p} tone="warn">{p}</Tag>)}</div>}
          <div className="mb-4 rounded-lg bg-surface-2 px-3 py-2.5 text-sm">
            {invoice ? (
              <>
                <div><span className="font-medium">Partner invoice {invoice.invoiceNumber}</span> · {formatINR(invoice.amount)} · issued {formatDate(invoice.issuedOn)}</div>
                {invoice.amount !== gross && <div className="mt-0.5 text-xs text-warn">The invoice is for {formatINR(invoice.amount)} but {formatINR(gross)} is owed. Ask the partner to re-issue, or reject it.</div>}
                {invoice.notes && <div className="mt-0.5 text-xs text-muted">{invoice.notes}</div>}
                <div className="mt-2"><RejectInvoiceForm inv={invoice} /></div>
              </>
            ) : <span className="text-muted">No invoice from the partner in the portal yet. You can still pay with an invoice number they sent you.</span>}
          </div>
          {gross <= 0 ? <p className="text-sm text-muted">Nothing to pay. A negative balance carries forward.</p> : (
            <ActionForm action={createPayoutAction} submit={`Record payout of ${formatINR(gross)}`} confirm={`Record a payout of ${formatINR(gross)} gross to ${partner.fullName}?`}>
              <input type="hidden" name="partnerId" value={partner.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Paid on"><Input type="date" name="paidOn" defaultValue={data.today} max={data.today} required /></Field>
                <Field label="TDS deducted" hint={`Suggested ${formatINR(tds.amount)}`}><MoneyInput name="tdsAmount" defaultValue={(tds.amount / 100).toFixed(2).replace(/\.00$/, "")} required /></Field>
                <Field label="Partner invoice no."><Input name="partnerInvoiceNumber" defaultValue={invoice?.invoiceNumber ?? `${initials}-INV-${String(payoutsSoFar + 1).padStart(3, "0")}`} required /></Field>
                <Field label="Bank reference (UTR)"><Input name="bankReference" required /></Field>
                <Field label="Currency">
                  <Select name="currency" defaultValue={partner.isResidentIndia ? "INR" : "AED"} options={["INR", "AED", "USD", "EUR", "GBP", "SGD"].map((c) => ({ value: c, label: c }))} />
                </Field>
                <Field label="FX rate (per ₹1)" hint="Only for non-INR"><Input name="fxRate" inputMode="decimal" placeholder="0.0441" /></Field>
              </div>
              <Field label="Notes"><Textarea name="notes" rows={2} defaultValue={tds.manual ? tds.note : ""} /></Field>
            </ActionForm>
          )}
        </Card>
      </div>
    </>
  );
}
