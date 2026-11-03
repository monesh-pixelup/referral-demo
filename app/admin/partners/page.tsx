import Link from "next/link";
import { Suspense } from "react";
import { getStaffDataset } from "@/lib/auth";
import { filterPartnerRows, partnerFilterFrom, partnerRows } from "@/lib/queries";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { programConfig } from "@/lib/program-config";
import { PARTNER_STATUS_LABEL, PARTNER_TYPE_LABEL } from "@/lib/types";
import { Card, Empty, ExportLink, PageHeader, ResultSummary, Stat, StatusBadge, Table, Td, Th, TierBadge } from "@/components/ui";
import { FilterBar } from "@/components/filter-bar";

export const metadata = { title: "Partners" };

export default function Page(props: PageProps<"/admin/partners">) {
  return <Suspense fallback={<PageHeader title="Partners" />}><Partners {...props} /></Suspense>;
}

async function Partners({ searchParams }: PageProps<"/admin/partners">) {
  const sp = await searchParams;
  const data = await getStaffDataset();
  const f = partnerFilterFrom(sp);
  const rows = filterPartnerRows(partnerRows(data), f);

  return (
    <>
      <PageHeader title="Partners" description="Tier is computed live from won referrals in the rolling 12 months." />
      <div className="mb-4">
        <FilterBar filters={[
          { name: "q", label: "Search name or company", type: "search" },
          { name: "status", label: "Status", options: Object.entries(PARTNER_STATUS_LABEL).map(([value, label]) => ({ value, label })) },
          { name: "type", label: "Type", options: Object.entries(PARTNER_TYPE_LABEL).map(([value, label]) => ({ value, label })) },
          { name: "tier", label: "Tier", options: programConfig.tiers.map((t) => ({ value: t.name, label: t.label })) },
        ]} />
      </div>
      <Card flush>
        <ResultSummary>
          <Stat label="Partners" value={rows.length} />
          <Stat label="Referrals" value={rows.reduce((s, r) => s + r.referrals, 0)} />
          <Stat label="Collected" value={formatINR(rows.reduce((s, r) => s + r.collected, 0))} />
          <Stat label="Owed" value={formatINR(rows.reduce((s, r) => s + r.owed, 0))} />
          <span className="ml-auto"><ExportLink table="partners" params={{ ...f }} /></span>
        </ResultSummary>
        {rows.length === 0 ? <Empty>No partners match these filters.</Empty> : (
          <Table>
            <thead><tr><Th>Partner</Th><Th>Type</Th><Th>Tier</Th><Th>Status</Th><Th>Agreement</Th><Th align="right">Referrals</Th><Th align="right">Open</Th><Th align="right">Won</Th><Th align="right">Collected</Th><Th align="right">Owed</Th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.partner.id} className="hover:bg-surface-2">
                  <Td>
                    <Link href={`/admin/partners/${r.partner.id}`} className="font-medium hover:underline">{r.partner.fullName}</Link>
                    <div className="text-xs text-muted">{r.partner.company} · {r.partner.country}</div>
                  </Td>
                  <Td className="whitespace-nowrap">{PARTNER_TYPE_LABEL[r.partner.partnerType]}</Td>
                  <Td><TierBadge tier={r.tier.name} label={r.tier.label} /></Td>
                  <Td><StatusBadge status={r.partner.status} /></Td>
                  <Td mono className="whitespace-nowrap">{r.partner.agreementSignedAt ? formatDate(r.partner.agreementSignedAt) : <span className="text-warn">Not signed</span>}</Td>
                  <Td align="right" mono><Link className="hover:underline" href={`/admin/referrals?partner=${r.partner.id}`}>{r.referrals}</Link></Td>
                  <Td align="right" mono><Link className="hover:underline" href={`/admin/referrals?partner=${r.partner.id}&stage=open`}>{r.open}</Link></Td>
                  <Td align="right" mono><Link className="hover:underline" href={`/admin/referrals?partner=${r.partner.id}&stage=won`}>{r.won}</Link></Td>
                  <Td align="right" mono><Link className="hover:underline" href={`/admin/payments?partner=${r.partner.id}`}>{formatINR(r.collected)}</Link></Td>
                  <Td align="right" mono className={r.owed === 0 ? "text-muted" : r.owed < 0 ? "text-bad" : ""}>{formatINR(r.owed)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
