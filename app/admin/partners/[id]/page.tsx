import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getStaffDataset } from "@/lib/auth";
import { computeAlerts, nextTierProgress } from "@/lib/commission";
import { partnerRows } from "@/lib/queries";
import { formatINR, formatRate } from "@/lib/money";
import { formatDate, istDate, nextQuarterReview } from "@/lib/dates";
import { PARTNER_TYPE_LABEL } from "@/lib/types";
import { Card, Label, PageHeader, SeverityIcon, StageBadge, StatusBadge, Table, Tag, Td, Th, TierBadge, ButtonLink } from "@/components/ui";
import { can, requireStaff } from "@/lib/auth";
import { EditPartnerForm, ReviewDetailsForms, StatusForm } from "./forms";
import { programConfig } from "@/lib/program-config";

export default function Page(props: PageProps<"/admin/partners/[id]">) {
  return <Suspense fallback={<PageHeader title="Partner" />}><Detail {...props} /></Suspense>;
}

async function Detail({ params }: PageProps<"/admin/partners/[id]">) {
  const { id } = await params;
  const [data, user] = await Promise.all([getStaffDataset(), requireStaff()]);
  const canEdit = can(user.role, "partner.write");
  const row = partnerRows(data).find((r) => r.partner.id === id);
  if (!row) notFound();
  const p = row.partner;
  const progress = nextTierProgress(p, data.referrals, data.today);
  const refs = data.referrals.filter((r) => r.partnerId === p.id).sort((a, b) => b.registeredAt.localeCompare(a.registeredAt));
  const payouts = data.payouts.filter((x) => x.partnerId === p.id).sort((a, b) => b.paidOn.localeCompare(a.paidOn));
  const invoices = data.invoices.filter((i) => i.partnerId === p.id).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const alerts = computeAlerts(data).filter((a) => a.href.includes(p.id) || refs.some((r) => a.href.endsWith(r.id)));

  const facts: [string, React.ReactNode][] = [
    ["Email", p.email], ["Phone", p.phone], ["Company", p.company], ["Country", `${p.country}${p.isResidentIndia ? "" : " · non-resident (manual tax)"}`],
    ["PAN", p.panOnFile ? `On file · ••••${p.panLast4}` : <span key="pan" className="text-warn">Not on file ({formatRate(programConfig.tds.noPanRateBp)} TDS)</span>],
    ["GST", p.gstRegistered ? p.gstin : "Not registered"],
    ["Bank details", p.bankDetailsOnFile ? "On file (held outside the app)" : <span key="bank" className="text-warn">Not received</span>],
    ["Agreement", p.agreementSignedAt ? `Signed ${formatDate(p.agreementSignedAt)}` : <span key="ag" className="text-warn">Not signed</span>],
    ["Portfolio agreement", p.portfolioAgreement ? "Yes (Strategic tier)" : "No"],
    ["Joined", formatDate(istDate(p.createdAt))],
  ];
  if (p.leftAt) facts.push([p.status === "notice_period" ? "Notice ends" : "Left", formatDate(p.leftAt)]);
  if (p.removalReason) facts.push(["Removal reason", p.removalReason]);

  return (
    <>
      <Link href="/admin/partners" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="size-3.5" /> Partners</Link>
      <PageHeader title={p.fullName}
        description={<span className="flex flex-wrap items-center gap-2"><TierBadge tier={row.tier.name} label={row.tier.label} /><StatusBadge status={p.status} /> {PARTNER_TYPE_LABEL[p.partnerType]}</span>}
        actions={<ButtonLink href={`/admin/payouts?partner=${p.id}`}>Payouts</ButtonLink>} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Referrals", String(row.referrals), `/admin/referrals?partner=${p.id}`],
          ["Won", String(row.won), `/admin/referrals?partner=${p.id}&stage=won`],
          ["Collected", formatINR(row.collected), `/admin/payments?partner=${p.id}`],
          ["Owed now", formatINR(row.owed), `/admin/payouts?view=owed&partner=${p.id}`],
        ].map(([label, value, href]) => (
          <Link key={label} href={href} className="rounded-xl border border-line bg-surface p-4 hover:border-line-strong">
            <div className="text-[13px] text-ink-2">{label}</div>
            <div className="mt-2 text-[22px] font-medium tracking-tight">{value}</div>
          </Link>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Profile">
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {facts.map(([k, v]) => <div key={k}><dt><Label>{k}</Label></dt><dd className="mt-0.5 text-sm">{v}</dd></div>)}
          </dl>
          {p.notes && <div className="mt-5 border-t border-line pt-4"><Label>Internal notes</Label><p className="mt-1 text-sm text-ink-2">{p.notes}</p></div>}
          {canEdit && (
            <details className="mt-5 border-t border-line pt-4">
              <summary className="cursor-pointer text-sm font-medium text-ink-2 hover:text-ink">Edit profile, tax and agreement…</summary>
              <div className="mt-3"><EditPartnerForm p={p} today={data.today} /></div>
            </details>
          )}
        </Card>
        <div className="space-y-4">
          <Card title="Tier" subtitle={`Next quarterly review ${formatDate(nextQuarterReview(data.today))}`}>
            <div className="text-sm">
              <span className="font-medium">{progress.current.label}</span> · {formatRate(progress.current.rateBp)} on new conversions
            </div>
            <div className="mt-1 text-sm text-muted">
              {p.portfolioAgreement ? "Fixed by portfolio agreement." : progress.next
                ? `${progress.wins} won in the last 12 months. ${progress.needed} more conversion${progress.needed === 1 ? "" : "s"} to ${progress.next.label}.`
                : `${progress.wins} won in the last 12 months. Top tier.`}
            </div>
          </Card>
          {canEdit && p.pendingDetails && (
            <Card title="Tax details to verify" subtitle={`Submitted in the portal ${formatDate(istDate(p.pendingDetails.submittedAt))}`}>
              <ReviewDetailsForms p={p} />
            </Card>
          )}
          {canEdit && (
            <Card title="Program status" subtitle="Notice, leaving or removal">
              <StatusForm p={p} today={data.today} />
            </Card>
          )}
          {alerts.length > 0 && (
            <Card title="Needs attention">
              <ul className="space-y-2.5">
                {alerts.map((a, i) => (
                  <li key={i}><Link href={a.href} className="flex gap-2 text-sm hover:underline"><SeverityIcon severity={a.severity} className="mt-0.5" /><span>{a.title}<span className="block text-xs text-muted">{a.detail}</span></span></Link></li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <Card className="mt-4" flush title="Referrals">
        <Table>
          <thead><tr><Th>Company</Th><Th>Stage</Th><Th>Registered</Th><Th>Signed</Th><Th align="right">First contract</Th><Th align="right">Locked rate</Th></tr></thead>
          <tbody>
            {refs.map((r) => (
              <tr key={r.id} className="hover:bg-surface-2">
                <Td><Link className="font-medium hover:underline" href={`/admin/referrals/${r.id}`}>{r.companyName}</Link></Td>
                <Td><StageBadge stage={r.stage} /></Td>
                <Td mono>{formatDate(istDate(r.registeredAt))}</Td>
                <Td mono>{formatDate(r.signedAt)}</Td>
                <Td align="right" mono>{r.firstContractValue ? formatINR(r.firstContractValue) : "—"}</Td>
                <Td align="right" mono>{r.lockedRateBp ? formatRate(r.lockedRateBp) : "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {invoices.length > 0 && (
        <Card className="mt-4" flush title="Invoices from the partner">
          <Table>
            <thead><tr><Th>Issued</Th><Th>Number</Th><Th align="right">Amount</Th><Th>Status</Th><Th>Note</Th></tr></thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id}>
                  <Td mono>{formatDate(i.issuedOn)}</Td><Td mono className="text-xs">{i.invoiceNumber}</Td>
                  <Td align="right" mono>{formatINR(i.amount)}</Td>
                  <Td>{i.status === "submitted" ? <Link className="hover:underline" href={`/admin/payouts/new?partner=${p.id}`}><Tag tone="warn">To pay</Tag></Link> : i.status === "paid" ? <Tag tone="good">Paid</Tag> : <Tag>Rejected</Tag>}</Td>
                  <Td className="text-xs text-ink-2">{i.rejectReason ?? i.notes ?? ""}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      <Card className="mt-4" flush title="Payouts">
        {payouts.length === 0 ? <p className="px-5 pb-5 text-sm text-muted">No payouts yet.</p> : (
          <Table>
            <thead><tr><Th>Paid on</Th><Th>Invoice</Th><Th align="right">Gross</Th><Th align="right">TDS</Th><Th align="right">Net</Th><Th>Currency</Th><Th>Bank ref</Th></tr></thead>
            <tbody>
              {payouts.map((x) => (
                <tr key={x.id}>
                  <Td mono>{formatDate(x.paidOn)}</Td><Td mono className="text-xs">{x.partnerInvoiceNumber}</Td>
                  <Td align="right" mono>{formatINR(x.grossAmount)}</Td><Td align="right" mono>{formatINR(x.tdsAmount)}</Td>
                  <Td align="right" mono>{formatINR(x.netAmount)}</Td><Td>{x.currency}</Td><Td mono className="text-xs">{x.bankReference}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
