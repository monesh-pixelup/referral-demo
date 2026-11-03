import Link from "next/link";
import { Suspense } from "react";
import { getStaffDataset } from "@/lib/auth";
import { collected, filterPayments, paymentFilterFrom } from "@/lib/queries";
import { formatINR } from "@/lib/money";
import { formatDate, formatMonth, fyRange, monthKey } from "@/lib/dates";
import { PARTNER_TYPE_LABEL } from "@/lib/types";
import { Card, Empty, ExportLink, PageHeader, ResultSummary, Stat, Table, Td, Th } from "@/components/ui";
import { FilterBar } from "@/components/filter-bar";

export const metadata = { title: "Client payments" };

export default function Page(props: PageProps<"/admin/payments">) {
  return <Suspense fallback={<PageHeader title="Client payments" />}><Payments {...props} /></Suspense>;
}

async function Payments({ searchParams }: PageProps<"/admin/payments">) {
  const sp = await searchParams;
  const data = await getStaffDataset();
  const f = paymentFilterFrom(sp);
  const rows = filterPayments(data, f);
  const refById = new Map(data.referrals.map((r) => [r.id, r]));
  const partnerById = new Map(data.partners.map((p) => [p.id, p]));
  const lineByPayment = new Map<string, number>();
  for (const l of data.lines) if (l.status !== "void") lineByPayment.set(l.clientPaymentId, (lineByPayment.get(l.clientPaymentId) ?? 0) + l.amount);
  const months = [...new Set(data.payments.map((p) => monthKey(p.receivedOn)))].sort().reverse();
  const fy = fyRange(data.today);

  return (
    <>
      <PageHeader title="Client payments" description="Net fees received against won referrals. Each payment generates its commission line automatically." />
      <div className="mb-4">
        <FilterBar filters={[
          { name: "fy", label: "Period", options: [{ value: "current", label: fy.label }] },
          { name: "month", label: "Month", options: months.map((m) => ({ value: m, label: formatMonth(m) })) },
          { name: "partner", label: "Partner", options: data.partners.map((p) => ({ value: p.id, label: p.fullName })) },
          { name: "type", label: "Partner type", options: Object.entries(PARTNER_TYPE_LABEL).map(([value, label]) => ({ value, label })) },
          { name: "kind", label: "Kind", options: [{ value: "milestone", label: "Milestone" }, { value: "retainer", label: "Retainer" }, { value: "repeat_work", label: "Repeat work" }] },
        ]} />
      </div>
      <Card flush>
        <ResultSummary>
          <Stat label="Payments" value={rows.length} />
          <Stat label="Net received" value={formatINR(rows.reduce((s, p) => s + p.netAmount, 0))} />
          <Stat label="Refunded" value={formatINR(rows.reduce((s, p) => s + p.refundAmount, 0))} />
          <Stat label="Net fees collected" value={formatINR(rows.reduce((s, p) => s + collected(p), 0))} />
          <span className="ml-auto"><ExportLink table="payments" params={{ ...f }} /></span>
        </ResultSummary>
        {rows.length === 0 ? <Empty>No payments match these filters.</Empty> : (
          <Table>
            <thead><tr><Th>Received</Th><Th>Client</Th><Th>Partner</Th><Th>Invoice</Th><Th>Kind</Th><Th align="right">Net</Th><Th align="right">Refund</Th><Th align="right">Collected</Th><Th align="right">Commission</Th></tr></thead>
            <tbody>
              {rows.map((p) => {
                const r = refById.get(p.referralId)!;
                const partner = partnerById.get(r.partnerId)!;
                return (
                  <tr key={p.id} className="hover:bg-surface-2">
                    <Td mono className="whitespace-nowrap">{formatDate(p.receivedOn)}</Td>
                    <Td><Link className="font-medium hover:underline" href={`/admin/referrals/${r.id}`}>{r.companyName}</Link></Td>
                    <Td><Link className="hover:underline" href={`/admin/partners/${partner.id}`}>{partner.fullName}</Link></Td>
                    <Td mono className="text-xs">{p.invoiceNumber}</Td>
                    <Td className="capitalize whitespace-nowrap">{p.kind.replace("_", " ")}</Td>
                    <Td align="right" mono>{formatINR(p.netAmount)}</Td>
                    <Td align="right" mono className={p.refunded ? "text-bad" : "text-muted"}>{p.refunded ? formatINR(p.refundAmount) : "—"}</Td>
                    <Td align="right" mono className="font-medium">{formatINR(collected(p))}</Td>
                    <Td align="right" mono>{formatINR(lineByPayment.get(p.id) ?? 0)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
