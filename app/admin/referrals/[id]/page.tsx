import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Check, X, CircleHelp, Minus, ArrowLeft } from "lucide-react";
import { getStaffDataset } from "@/lib/auth";
import { qualificationChecklist, withinAttribution, type CheckState } from "@/lib/commission";
import { collected } from "@/lib/queries";
import { formatINR, formatRate } from "@/lib/money";
import { formatDate, formatDateTime, istDate } from "@/lib/dates";
import { tierRule } from "@/lib/program-config";
import { PARTNER_TYPE_LABEL, STAGE_LABEL } from "@/lib/types";
import { Card, Label, PageHeader, StageBadge, Table, Td, Th, Tag } from "@/components/ui";
import { requireStaff, can } from "@/lib/auth";
import { CorrectionsForms, DecisionForms, LogPaymentForm, NotesForm, PaymentFixForms, PipelineForms, RefundForm } from "./actions";

export default function Page(props: PageProps<"/admin/referrals/[id]">) {
  return <Suspense fallback={<PageHeader title="Referral" />}><Detail {...props} /></Suspense>;
}

const CHECK_ICON: Record<CheckState, React.ReactNode> = {
  pass: <Check className="size-4 text-good" aria-label="Pass" />,
  fail: <X className="size-4 text-bad" aria-label="Fail" />,
  confirm: <CircleHelp className="size-4 text-warn-dot" aria-label="Admin to confirm" />,
  unset: <Minus className="size-4 text-muted" aria-label="Not set" />,
};

async function Detail({ params }: PageProps<"/admin/referrals/[id]">) {
  const { id } = await params;
  const [data, user] = await Promise.all([getStaffDataset(), requireStaff()]);
  const canDecide = can(user.role, "referral.decide");
  const canPipeline = can(user.role, "referral.pipeline");
  const canPay = can(user.role, "payment.write");
  const canFix = can(user.role, "correction");
  const r = data.referrals.find((x) => x.id === id);
  if (!r) notFound();
  const partner = data.partners.find((p) => p.id === r.partnerId)!;
  const dup = r.duplicateOf ? data.referrals.find((x) => x.id === r.duplicateOf) : null;
  const dupPartner = dup ? data.partners.find((p) => p.id === dup.partnerId) : null;
  const history = data.stageHistory.filter((h) => h.referralId === r.id).sort((a, b) => a.changedAt.localeCompare(b.changedAt));
  const payments = data.payments.filter((p) => p.referralId === r.id).sort((a, b) => a.receivedOn.localeCompare(b.receivedOn));
  const lines = data.lines.filter((l) => l.referralId === r.id);
  const checklist = qualificationChecklist(r, partner);
  const totalCollected = payments.reduce((s, p) => s + collected(p), 0);
  const totalCommission = lines.filter((l) => l.status !== "void").reduce((s, l) => s + l.amount, 0);

  const facts: [string, React.ReactNode][] = [
    ["Partner", <Link key="p" className="hover:underline" href={`/admin/partners/${partner.id}`}>{partner.fullName} · {PARTNER_TYPE_LABEL[partner.partnerType]}</Link>],
    ["Contact", `${r.contactName}, ${r.contactRole}`],
    ["Contact email", r.contactEmail],
    ["Need", r.need[0].toUpperCase() + r.need.slice(1)],
    ["Registered", formatDateTime(r.registeredAt)],
    ["Decision due", formatDate(r.decisionDueAt)],
    ["Decided", r.decidedAt ? `${formatDateTime(r.decidedAt)} by ${r.decidedBy}` : "—"],
    ["Introduced", formatDate(r.introducedAt)],
    ["Attribution ends", formatDate(r.attributionExpiresAt)],
    ["Signed", formatDate(r.signedAt)],
    ["First contract (net)", r.firstContractValue ? formatINR(r.firstContractValue) : "—"],
    ["Locked rate", r.lockedRateBp ? `${formatRate(r.lockedRateBp)} · ${tierRule(r.lockedTier!).label}` : "Set when won"],
  ];

  return (
    <>
      <Link href="/admin/referrals" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="size-3.5" /> Referrals</Link>
      <PageHeader title={r.companyName} description={<span className="flex flex-wrap items-center gap-2"><StageBadge stage={r.stage} /> {r.companyDomain}</span>} />

      {(dup || r.forfeited || r.vcDiscount || r.declineReason || r.lostReason) && (
        <div className="mb-4 flex flex-wrap gap-2">
          {dup && <Tag tone="bad">Duplicate of <Link className="underline" href={`/admin/referrals/${dup.id}`}>{dup.companyName}</Link> registered by {dupPartner?.fullName} on {formatDate(istDate(dup.registeredAt))}. First registration wins.</Tag>}
          {r.forfeited && <Tag tone="bad">Commission forfeited (partner removed for conduct)</Tag>}
          {r.vcDiscount && <Tag tone="info">Commission given to the client as a discount</Tag>}
          {r.declineReason && <Tag>Declined: {r.declineReason}</Tag>}
          {r.lostReason && <Tag>Lost: {r.lostReason}</Tag>}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Details">
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {facts.map(([k, v]) => (
              <div key={k}><dt><Label>{k}</Label></dt><dd className="mt-0.5 text-sm">{v}</dd></div>
            ))}
          </dl>
          {r.signedAt && r.introducedAt && !withinAttribution(r.introducedAt, r.signedAt) && <p className="mt-4 text-sm text-bad">Signed outside the attribution window.</p>}
          <div className="mt-5 border-t border-line pt-4">
            <Label>Partner note</Label>
            <p className="mt-1 text-sm text-ink-2">{r.partnerNote}</p>
            <div className="mt-4"><Label>Internal notes</Label></div>
            {canPipeline ? <div className="mt-1"><NotesForm r={r} /></div> : <p className="mt-1 text-sm text-ink-2">{r.internalNotes ?? "—"}</p>}
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="Qualification checklist" subtitle={r.stage === "registered" ? "Review before approving" : "As assessed at registration"}>
            <ul className="space-y-2.5">
              {checklist.map((c) => (
                <li key={c.key} className="flex gap-2.5 text-sm">
                  <span className="mt-0.5">{CHECK_ICON[c.state]}</span>
                  <span>{c.label}{c.detail && <span className="block text-xs text-muted">{c.detail}</span>}</span>
                </li>
              ))}
            </ul>
            {r.stage === "registered" && (canDecide
              ? <DecisionForms r={r} checklist={checklist} />
              : <p className="mt-4 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">An admin approves or declines registrations.</p>)}
          </Card>

          {canPipeline && ["approved", "introduced", "discovery", "proposal"].includes(r.stage) && (
            <Card title="Next step" subtitle={r.attributionExpiresAt ? `Attribution window ends ${formatDate(r.attributionExpiresAt)}` : undefined}>
              <PipelineForms r={r} partner={partner} today={data.today} />
            </Card>
          )}

          {canFix && (
            <Card title="Corrections" subtitle="Admin only. Every change is in the audit log.">
              <CorrectionsForms r={r} canRevert={history.length > 1} />
            </Card>
          )}

          <Card title="Timeline">
            <ol className="relative space-y-4 border-l border-line pl-4">
              {history.map((h) => (
                <li key={h.id} className="relative">
                  <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-surface bg-accent" />
                  <div className="text-sm font-medium">{STAGE_LABEL[h.toStage]}</div>
                  <div className="text-xs text-muted">{formatDateTime(h.changedAt)} · {h.changedBy}</div>
                  {h.note && <div className="mt-0.5 text-xs text-ink-2">{h.note}</div>}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>

      {r.stage === "won" && (
        <Card className="mt-4" flush title="Client payments and commission" subtitle={<>Collected {formatINR(totalCollected)} · commission {formatINR(totalCommission)}</>}>
          <Table>
            <thead><tr><Th>Received</Th><Th>Invoice</Th><Th>Kind</Th><Th align="right">Net</Th><Th>Refund</Th><Th align="right">Commission</Th><Th>Line</Th>{canFix && <Th />}</tr></thead>
            <tbody>
              {payments.map((p) => {
                const pl = lines.filter((l) => l.clientPaymentId === p.id);
                return (
                  <tr key={p.id}>
                    <Td mono>{formatDate(p.receivedOn)}</Td>
                    <Td mono className="text-xs">{p.invoiceNumber}</Td>
                    <Td className="capitalize">{p.kind.replace("_", " ")}</Td>
                    <Td align="right" mono>{formatINR(p.netAmount)}</Td>
                    <Td className="text-xs">{p.refunded ? <span className="text-bad">{formatINR(p.refundAmount)} on {formatDate(p.refundedOn)}</span> : canPay ? <RefundForm p={p} today={data.today} /> : "—"}</Td>
                    <Td align="right" mono>{pl.map((l) => <div key={l.id} className={l.status === "void" ? "text-muted line-through" : l.amount < 0 ? "text-bad" : ""}>{formatINR(l.amount)}</div>)}</Td>
                    <Td className="text-xs">{pl.map((l) => <div key={l.id}>{l.reason.replaceAll("_", " ")} · {l.settledAsDiscount ? "client discount" : l.status}</div>)}</Td>
                    {canFix && <Td className="align-top"><PaymentFixForms p={p} today={data.today} signedAt={r.signedAt} /></Td>}
                  </tr>
                );
              })}
            </tbody>
          </Table>
          {canPay && (
            <div className="border-t border-line px-5 py-4">
              <div className="mb-3 text-sm font-medium">Log a client payment</div>
              <LogPaymentForm r={r} today={data.today} />
            </div>
          )}
        </Card>
      )}
    </>
  );
}
