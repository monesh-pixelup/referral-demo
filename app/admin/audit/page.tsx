import { Suspense } from "react";
import { getStaffDataset } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { Card, PageHeader, ResultSummary, Stat, Table, Td, Th, Tag } from "@/components/ui";
import { FilterBar } from "@/components/filter-bar";

export const metadata = { title: "Audit log" };

const fmt = (v: unknown) => (v === null || v === undefined ? "—" : Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k}: ${String(x)}`).join(", "));

export default function Page(props: PageProps<"/admin/audit">) {
  return <Suspense fallback={<PageHeader title="Audit log" />}><Audit {...props} /></Suspense>;
}

async function Audit({ searchParams }: PageProps<"/admin/audit">) {
  const sp = await searchParams;
  const data = await getStaffDataset();
  const table = typeof sp.table === "string" ? sp.table : undefined;
  const rows = data.audit.filter((a) => !table || a.table === table);
  const shown = rows.slice(0, 200);
  return (
    <>
      <PageHeader title="Audit log" description="Every create, update and delete on referrals, client payments, commission lines and payouts." />
      <div className="mb-4">
        <FilterBar filters={[{ name: "table", label: "Table", options: ["referrals", "client_payments", "commission_lines", "payouts", "partners", "partner_applications", "partner_invoices", "settings"].map((t) => ({ value: t, label: t })) }]} />
      </div>
      <Card flush>
        <ResultSummary><Stat label="Entries" value={rows.length} />{rows.length > shown.length && <span className="text-muted">Showing latest {shown.length}</span>}</ResultSummary>
        <Table>
          <thead><tr><Th>When</Th><Th>Actor</Th><Th>Table</Th><Th>Action</Th><Th>Before</Th><Th>After</Th></tr></thead>
          <tbody>
            {shown.map((a) => (
              <tr key={a.id}>
                <Td mono className="text-xs whitespace-nowrap">{formatDateTime(a.at)}</Td>
                <Td className="whitespace-nowrap">{a.actor}</Td>
                <Td mono className="text-xs">{a.table}</Td>
                <Td><Tag tone={a.action === "insert" ? "good" : a.action === "delete" ? "bad" : "neutral"}>{a.action}</Tag></Td>
                <Td className="text-xs text-muted">{fmt(a.before)}</Td>
                <Td className="text-xs">{fmt(a.after)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
