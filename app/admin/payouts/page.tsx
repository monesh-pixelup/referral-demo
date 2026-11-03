import Link from "next/link";
import { Suspense } from "react";
import clsx from "clsx";
import { getStaffDataset } from "@/lib/auth";
import { partnerBalance, suggestTds } from "@/lib/commission";
import { filterLines, filterPayouts, lineFilterFrom, payoutFilterFrom } from "@/lib/queries";
import { formatINR, formatRate } from "@/lib/money";
import { formatDate, fyRange } from "@/lib/dates";
import { Card, Empty, ExportLink, PageHeader, ResultSummary, Stat, Table, Td, Th, Tag } from "@/components/ui";
import { FilterBar } from "@/components/filter-bar";
import { programConfig } from "@/lib/program-config";
import { PayoutFixForms } from "./fix";
import { requireStaff, can } from "@/lib/auth";

export const metadata = { title: "Payouts" };

export default function Page(props: PageProps<"/admin/payouts">) {
  return <Suspense fallback={<PageHeader title="Payouts" />}><Payouts {...props} /></Suspense>;
}

async function Payouts({ searchParams }: PageProps<"/admin/payouts">) {
  const sp = await searchParams;
  const [data, user] = await Promise.all([getStaffDataset(), requireStaff()]);
  const canPay = can(user.role, "payout.write");
  const canFix = can(user.role, "correction");
  const latestPayout = new Map<string, string>();
  for (const x of [...data.payouts].sort((a, b) => a.paidOn.localeCompare(b.paidOn))) latestPayout.set(x.partnerId, x.id);
  const openInvoice = new Map(data.invoices.filter((i) => i.status === "submitted").map((i) => [i.partnerId, i]));
  const view = sp.view === "owed" ? "owed" : sp.view === "lines" ? "lines" : "history";
  const partnerById = new Map(data.partners.map((p) => [p.id, p]));
  const refById = new Map(data.referrals.map((r) => [r.id, r]));
  const fy = fyRange(data.today);
  const partnerParam = typeof sp.partner === "string" ? sp.partner : undefined;

  const tab = (v: string, label: string) => {
    const q = new URLSearchParams(); if (v !== "history") q.set("view", v); if (partnerParam) q.set("partner", partnerParam);
    return <Link key={v} href={`/admin/payouts${q.size ? `?${q}` : ""}`} role="tab" aria-selected={view === v}
      className={clsx("rounded-md px-3 py-1", view === v ? "bg-ink text-surface" : "text-ink-2 hover:text-ink")}>{label}</Link>;
  };

  return (
    <>
      <PageHeader title="Payouts" description={`Commission is due within ${programConfig.payoutDueDays} days of each client payment. TDS is suggested by the rules; the admin confirms it.`}
        actions={<div className="inline-flex rounded-lg border border-line-strong bg-surface p-0.5 text-sm" role="tablist">{tab("owed", "Balance due")}{tab("lines", "Commission lines")}{tab("history", "Payout history")}</div>} />
      <div className="mb-4">
        <FilterBar keep={["view"]} filters={[
          { name: "partner", label: "Partner", options: data.partners.map((p) => ({ value: p.id, label: p.fullName })) },
          ...(view === "history" ? [{ name: "fy", label: "Period", options: [{ value: "current", label: fy.label }] }] : []),
          ...(view === "lines" ? [
            { name: "status", label: "Status", options: [{ value: "owed", label: "Owed (pending)" }, { value: "pending", label: "Pending" }, { value: "paid", label: "Paid" }, { value: "void", label: "Void" }] },
            { name: "reason", label: "Reason", options: [{ value: "eligible", label: "Eligible" }, { value: "clawback", label: "Clawback" }, { value: "outside_12_months", label: "Outside 12 months" }, { value: "forfeited", label: "Forfeited" }] },
          ] : []),
        ]} />
      </div>

      {view === "owed" && Owed()}
      {view === "lines" && Lines()}
      {view === "history" && History()}
    </>
  );

  function Owed() {
    const lines = filterLines(data, { status: "owed", partner: partnerParam });
    const partners = [...new Set(lines.map((l) => l.partnerId))].map((pid) => {
      const pl = lines.filter((l) => l.partnerId === pid);
      const partner = partnerById.get(pid)!;
      const gross = partnerBalance(pl);
      const tds = gross > 0 ? suggestTds(partner, data.today, gross, data.payouts.filter((x) => x.partnerId === pid)) : null;
      const earliestDue = pl.filter((l) => l.amount > 0).map((l) => l.dueBy).sort()[0];
      return { partner, lines: pl, gross, tds, earliestDue };
    }).sort((a, b) => (a.earliestDue ?? "9").localeCompare(b.earliestDue ?? "9"));
    const total = partnerBalance(lines);
    return (
      <Card flush>
        <ResultSummary>
          <Stat label="Partners with a balance" value={partners.length} />
          <Stat label="Pending lines" value={lines.length} />
          <Stat label="Commission owed" value={formatINR(total)} />
          <span className="ml-auto"><ExportLink table="bank-transfer" params={{ partner: partnerParam }} /></span>
        </ResultSummary>
        {partners.length === 0 ? <Empty>Nothing owed.</Empty> : (
          <Table>
            <thead><tr><Th>Partner</Th><Th align="right">Lines</Th><Th>Earliest due</Th><Th align="right">Gross owed</Th><Th align="right">Suggested TDS</Th><Th align="right">Net to pay</Th><Th>Partner invoice</Th><Th>Note</Th>{canPay && <Th />}</tr></thead>
            <tbody>
              {partners.map((x) => {
                const overdue = x.earliestDue && data.today > x.earliestDue;
                return (
                  <tr key={x.partner.id} className="hover:bg-surface-2">
                    <Td><Link className="font-medium hover:underline" href={`/admin/partners/${x.partner.id}`}>{x.partner.fullName}</Link><div className="text-xs text-muted">{x.partner.isResidentIndia ? "India" : x.partner.country}</div></Td>
                    <Td align="right" mono><Link className="hover:underline" href={`/admin/payouts?view=lines&status=owed&partner=${x.partner.id}`}>{x.lines.length}</Link></Td>
                    <Td mono className={overdue ? "font-medium text-bad" : ""}>{x.earliestDue ? formatDate(x.earliestDue) : "—"}{overdue && " · overdue"}</Td>
                    <Td align="right" mono className={x.gross < 0 ? "text-bad" : "font-medium"}>{formatINR(x.gross)}</Td>
                    <Td align="right" mono>{x.tds ? formatINR(x.tds.amount) : "—"}</Td>
                    <Td align="right" mono>{x.tds ? formatINR(x.gross - x.tds.amount) : "—"}</Td>
                    <Td className="text-xs">{(() => { const inv = openInvoice.get(x.partner.id); return inv
                      ? <span className={inv.amount === x.gross ? "text-good" : "text-warn"}>{inv.invoiceNumber} · {formatINR(inv.amount)}{inv.amount !== x.gross && " (differs)"}</span>
                      : <span className="text-muted">Not received</span>; })()}</Td>
                    <Td className="text-xs text-ink-2">{x.gross <= 0 ? "Negative balance carries forward to the next payout" : x.tds?.note}</Td>
                    {canPay && <Td align="right">{x.gross > 0 && <Link href={`/admin/payouts/new?partner=${x.partner.id}`} className="inline-flex h-7 items-center rounded-lg bg-ink px-2.5 text-xs font-medium text-surface hover:opacity-90">Pay</Link>}</Td>}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <p className="border-t border-line px-5 py-3 text-xs text-muted">{canPay ? "Pay settles every pending line for the partner; TDS is suggested and can be changed. " : "Only an admin can create payouts. "}TDS certificate upload arrives with Supabase Storage.</p>
      </Card>
    );
  }

  function Lines() {
    const lf = lineFilterFrom(sp);
    const lines = filterLines(data, lf);
    return (
      <Card flush>
        <ResultSummary>
          <Stat label="Lines" value={lines.length} />
          <Stat label="Total (excl. void)" value={formatINR(lines.filter((l) => l.status !== "void").reduce((s, l) => s + l.amount, 0))} />
          <span className="ml-auto"><ExportLink table="lines" params={{ ...lf }} /></span>
        </ResultSummary>
        {lines.length === 0 ? <Empty>No commission lines match.</Empty> : (
          <Table>
            <thead><tr><Th>Created</Th><Th>Partner</Th><Th>Client</Th><Th align="right">Rate</Th><Th align="right">Amount</Th><Th>Due by</Th><Th>Status</Th><Th>Reason</Th></tr></thead>
            <tbody>
              {lines.map((l) => {
                const r = refById.get(l.referralId)!;
                return (
                  <tr key={l.id} className="hover:bg-surface-2">
                    <Td mono className="whitespace-nowrap">{formatDate(l.createdOn)}</Td>
                    <Td><Link className="hover:underline" href={`/admin/partners/${l.partnerId}`}>{partnerById.get(l.partnerId)?.fullName}</Link></Td>
                    <Td><Link className="hover:underline" href={`/admin/referrals/${r.id}`}>{r.companyName}</Link></Td>
                    <Td align="right" mono>{formatRate(l.rateBp)}</Td>
                    <Td align="right" mono className={l.amount < 0 ? "text-bad" : l.status === "void" ? "text-muted line-through" : ""}>{formatINR(l.amount)}</Td>
                    <Td mono className={l.status === "pending" && data.today > l.dueBy && l.amount > 0 ? "font-medium text-bad" : ""}>{formatDate(l.dueBy)}</Td>
                    <Td>{l.settledAsDiscount ? <Tag tone="info">Client discount</Tag> : <Tag tone={l.status === "paid" ? "good" : l.status === "pending" ? "warn" : "neutral"}>{l.status[0].toUpperCase() + l.status.slice(1)}</Tag>}</Td>
                    <Td className="text-xs capitalize">{l.reason.replaceAll("_", " ")}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    );
  }

  function History() {
    const pf = payoutFilterFrom(sp);
    const payouts = filterPayouts(data, pf);
    return (
      <Card flush>
        <ResultSummary>
          <Stat label="Payouts" value={payouts.length} />
          <Stat label="Gross paid" value={formatINR(payouts.reduce((s, p) => s + p.grossAmount, 0))} />
          <Stat label="TDS deducted" value={formatINR(payouts.reduce((s, p) => s + p.tdsAmount, 0))} />
          <Stat label="Net transferred" value={formatINR(payouts.reduce((s, p) => s + p.netAmount, 0))} />
          <span className="ml-auto"><ExportLink table="payouts" params={{ ...pf }} /></span>
        </ResultSummary>
        {payouts.length === 0 ? <Empty>No payouts match.</Empty> : (
          <Table>
            <thead><tr><Th>Paid on</Th><Th>Partner</Th><Th>Partner invoice</Th><Th align="right">Gross</Th><Th align="right">TDS</Th><Th align="right">Net</Th><Th>Currency</Th><Th>Bank ref</Th><Th>TDS cert.</Th>{canFix && <Th />}</tr></thead>
            <tbody>
              {payouts.map((x) => (
                <tr key={x.id} className="hover:bg-surface-2">
                  <Td mono className="whitespace-nowrap">{formatDate(x.paidOn)}</Td>
                  <Td><Link className="hover:underline" href={`/admin/partners/${x.partnerId}`}>{partnerById.get(x.partnerId)?.fullName}</Link></Td>
                  <Td mono className="text-xs">{x.partnerInvoiceNumber}</Td>
                  <Td align="right" mono>{formatINR(x.grossAmount)}</Td>
                  <Td align="right" mono>{formatINR(x.tdsAmount)}</Td>
                  <Td align="right" mono className="font-medium">{formatINR(x.netAmount)}</Td>
                  <Td>{x.currency}{x.fxRate ? <span className="text-xs text-muted"> @ {x.fxRate}</span> : null}</Td>
                  <Td mono className="text-xs">{x.bankReference}</Td>
                  <Td className="text-xs">{x.tdsCertificateUrl ? <Tag tone="good">Uploaded</Tag> : x.tdsAmount > 0 ? <Tag tone="warn">Pending</Tag> : <span className="text-muted">n/a</span>}</Td>
                  {canFix && <Td className="align-top"><PayoutFixForms x={x} latest={latestPayout.get(x.partnerId) === x.id} /></Td>}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    );
  }
}
