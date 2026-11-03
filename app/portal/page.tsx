import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { getDataset } from "@/lib/data";
import { requirePartner } from "@/lib/auth";
import { nextTierProgress, partnerBalance } from "@/lib/commission";
import { formatINR, formatRate } from "@/lib/money";
import { formatDate, fyRange, istDate } from "@/lib/dates";
import { STAGE_LABEL, type Referral } from "@/lib/types";
import { Card, Empty, PageHeader, Table, Tag, Td, Th, TierBadge } from "@/components/ui";
import { InvoiceCard } from "./invoice";

export const metadata = { title: "Partner portal" };

export default function Page(props: PageProps<"/portal">) {
  return <Suspense fallback={<PageHeader title="Your referrals" />}><Portal {...props} /></Suspense>;
}

/** What the partner sees. Duplicates read as "In review" until the admin declines them. */
function partnerStage(r: Referral): { label: string; tone: "neutral" | "good" | "warn" | "bad" | "info" } {
  if (r.stage === "registered") return { label: "In review", tone: "warn" };
  if (r.stage === "won") return { label: "Won", tone: "good" };
  if (r.stage === "declined" || r.stage === "lost") return { label: STAGE_LABEL[r.stage], tone: "neutral" };
  return { label: STAGE_LABEL[r.stage], tone: "info" };
}

async function Portal({ searchParams }: PageProps<"/portal">) {
  const sp = await searchParams;
  const [data, user] = await Promise.all([getDataset(), requirePartner()]);
  const partner = data.partners.find((p) => p.id === user.partnerId)!;
  const refs = data.referrals.filter((r) => r.partnerId === partner.id).sort((a, b) => b.registeredAt.localeCompare(a.registeredAt));
  const lines = data.lines.filter((l) => l.partnerId === partner.id).sort((a, b) => b.createdOn.localeCompare(a.createdOn));
  const payouts = data.payouts.filter((p) => p.partnerId === partner.id).sort((a, b) => b.paidOn.localeCompare(a.paidOn));
  const progress = nextTierProgress(partner, data.referrals, data.today);
  const owed = partnerBalance(lines);
  const fy = fyRange(data.today);
  const paidFy = payouts.filter((p) => p.paidOn >= fy.start && p.paidOn <= fy.end).reduce((s, p) => s + p.netAmount, 0);
  const refName = new Map(refs.map((r) => [r.id, r.companyName]));
  const justRegistered = typeof sp.registered === "string" ? refs.find((r) => r.id === sp.registered) : null;
  const canRegister = partner.status === "active";
  const myInvoices = data.invoices.filter((i) => i.partnerId === partner.id).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const openInv = myInvoices.find((i) => i.status === "submitted") ?? null;
  const lastRejected = myInvoices[0]?.status === "rejected" ? myInvoices[0] : null;
  const initials = partner.fullName.split(" ").map((w) => w[0]).join("");
  const suggestedNumber = `${initials}-INV-${String(myInvoices.filter((i) => i.status !== "rejected").length + payouts.length + 1).padStart(3, "0")}`;

  return (
    <>
      <PageHeader title={`Hi ${partner.fullName.split(" ")[0]}`}
        description={<span className="flex flex-wrap items-center gap-2"><TierBadge tier={progress.current.name} label={progress.current.label} /> {formatRate(progress.current.rateBp)} on new conversions</span>}
        actions={canRegister && <Link href="/portal/register" className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-ink px-3 text-sm font-medium text-surface hover:opacity-90"><Plus className="size-4" aria-hidden /> Register a referral</Link>} />

      {justRegistered && (
        <p role="status" className="mb-4 rounded-lg bg-good-wash px-4 py-3 text-sm text-good">
          {justRegistered.companyName} is registered. We&apos;ll decide by {formatDate(justRegistered.decisionDueAt)}; check back here for the result.
        </p>
      )}
      {!partner.agreementSignedAt && <p className="mb-4 rounded-lg bg-warn-wash px-4 py-3 text-sm text-warn">Your partner agreement isn&apos;t signed yet. We&apos;ll email it to you; commission is paid once it&apos;s on file.</p>}
      {partner.status === "notice_period" && <p className="mb-4 rounded-lg bg-warn-wash px-4 py-3 text-sm text-warn">You&apos;re in your notice period until {formatDate(partner.leftAt)}. Signed referrals keep earning; new registrations are closed.</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Referrals", String(refs.length)],
          ["Won", String(refs.filter((r) => r.stage === "won").length)],
          ["Owed to you", formatINR(Math.max(owed, 0))],
          [`Paid ${fy.label}`, formatINR(paidFy)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-line bg-surface p-4">
            <div className="text-[13px] text-ink-2">{label}</div>
            <div className="mt-2 text-[22px] font-medium tracking-tight">{value}</div>
          </div>
        ))}
      </div>

      {!partner.panOnFile && partner.isResidentIndia && !partner.pendingDetails && (
        <p className="mt-4 rounded-lg bg-warn-wash px-4 py-3 text-sm text-warn">No PAN on file, so TDS on your payouts is higher. <a href="/portal/details" className="underline underline-offset-2">Add your PAN</a>.</p>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <InvoiceCard owed={Math.max(owed, 0)} open={openInv} lastRejected={lastRejected} today={data.today} suggestedNumber={suggestedNumber} />
      <Card title="Your tier">
        <p className="text-sm">
          {partner.portfolioAgreement ? "Strategic Partner through your portfolio agreement." : progress.next
            ? <>{progress.wins} conversion{progress.wins === 1 ? "" : "s"} in the last 12 months. <span className="font-medium">{progress.needed} more to {progress.next.label}</span> ({formatRate(progress.next.rateBp)}).</>
            : <>{progress.wins} conversions in the last 12 months. You&apos;re at the top tier.</>}
        </p>
        {progress.next && !partner.portfolioAgreement && (
          <div className="mt-3 h-2 rounded-full bg-surface-2"><div className="h-2 rounded-full bg-accent" style={{ width: `${Math.min(100, (progress.wins / progress.next.minWins) * 100)}%` }} /></div>
        )}
        <p className="mt-2 text-xs text-muted">Each client&apos;s rate is locked when they sign; a tier upgrade applies to later conversions.</p>
      </Card>
      </div>

      <Card className="mt-4" flush title="Referrals">
        {refs.length === 0 ? <Empty>No referrals yet. Register a company before you make the introduction.</Empty> : (
          <Table>
            <thead><tr><Th>Company</Th><Th>Status</Th><Th>Registered</Th><Th>Attribution ends</Th><Th>Signed</Th><Th align="right">Your rate</Th></tr></thead>
            <tbody>
              {refs.map((r) => {
                const s = partnerStage(r);
                return (
                  <tr key={r.id}>
                    <Td><span className="font-medium">{r.companyName}</span><div className="text-xs text-muted">{r.companyDomain}</div></Td>
                    <Td><Tag tone={s.tone}>{s.label}</Tag>{r.declineReason && <div className="mt-1 text-xs text-muted">{r.declineReason}</div>}{r.stage === "registered" && <div className="mt-1 text-xs text-muted">Decision by {formatDate(r.decisionDueAt)}</div>}</Td>
                    <Td mono>{formatDate(istDate(r.registeredAt))}</Td>
                    <Td mono>{formatDate(r.attributionExpiresAt)}</Td>
                    <Td mono>{formatDate(r.signedAt)}</Td>
                    <Td align="right" mono>{r.lockedRateBp ? formatRate(r.lockedRateBp) : "—"}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card flush title="Commission" subtitle="One line per client payment">
          {lines.length === 0 ? <Empty>No commission yet.</Empty> : (
            <Table>
              <thead><tr><Th>Date</Th><Th>Client</Th><Th align="right">Amount</Th><Th>Status</Th></tr></thead>
              <tbody>
                {lines.slice(0, 30).map((l) => (
                  <tr key={l.id}>
                    <Td mono>{formatDate(l.createdOn)}</Td>
                    <Td>{refName.get(l.referralId)}</Td>
                    <Td align="right" mono className={l.amount < 0 ? "text-bad" : l.status === "void" ? "text-muted line-through" : ""}>{formatINR(l.amount)}</Td>
                    <Td>{l.settledAsDiscount ? <Tag tone="info">Client discount</Tag> : l.status === "pending" ? <Tag tone="warn">Due {formatDate(l.dueBy)}</Tag> : l.status === "paid" ? <Tag tone="good">Paid</Tag> : <Tag>{l.reason === "clawback" ? "Clawback" : "Not payable"}</Tag>}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card flush title="Payouts">
          {payouts.length === 0 ? <Empty>No payouts yet.</Empty> : (
            <Table>
              <thead><tr><Th>Paid on</Th><Th align="right">Gross</Th><Th align="right">TDS</Th><Th align="right">Net</Th><Th>TDS cert.</Th></tr></thead>
              <tbody>
                {payouts.map((p) => (
                  <tr key={p.id}>
                    <Td mono>{formatDate(p.paidOn)}</Td>
                    <Td align="right" mono>{formatINR(p.grossAmount)}</Td>
                    <Td align="right" mono>{formatINR(p.tdsAmount)}</Td>
                    <Td align="right" mono className="font-medium">{formatINR(p.netAmount)}</Td>
                    <Td className="text-xs">{p.tdsAmount === 0 ? <span className="text-muted">n/a</span> : p.tdsCertificateUrl ? <Tag tone="good">Issued</Tag> : <Tag tone="warn">Pending</Tag>}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
