import Link from "next/link";
import { Suspense } from "react";
import clsx from "clsx";
import { Copy, Ban, Gift } from "lucide-react";
import { getStaffDataset } from "@/lib/auth";
import { filterReferrals, referralFilterFrom } from "@/lib/queries";
import { formatINR, formatRate } from "@/lib/money";
import { formatDate, istDate } from "@/lib/dates";
import { ALL_STAGES, PARTNER_TYPE_LABEL, STAGE_LABEL, type Referral } from "@/lib/types";
import { Card, Empty, ExportLink, PageHeader, ResultSummary, StageBadge, Stat, Table, Td, Th } from "@/components/ui";
import { FilterBar } from "@/components/filter-bar";

export const metadata = { title: "Referrals" };

export default function Page(props: PageProps<"/admin/referrals">) {
  return <Suspense fallback={<PageHeader title="Referrals" />}><Referrals {...props} /></Suspense>;
}

async function Referrals({ searchParams }: PageProps<"/admin/referrals">) {
  const sp = await searchParams;
  const data = await getStaffDataset();
  const f = referralFilterFrom(sp);
  const view = sp.view === "kanban" ? "kanban" : "table";
  const rows = filterReferrals(data, f);
  const partnerById = new Map(data.partners.map((p) => [p.id, p]));
  const contract = rows.reduce((s, r) => s + (r.firstContractValue ?? 0), 0);
  const exportParams = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v]));
  const viewHref = (v: string) => {
    const q = new URLSearchParams(Object.entries(sp).filter(([k, val]) => k !== "view" && typeof val === "string") as [string, string][]);
    if (v === "kanban") q.set("view", "kanban");
    return `/admin/referrals${q.size ? `?${q}` : ""}`;
  };

  return (
    <>
      <PageHeader title="Referrals" description="Every registered lead and where it is. Stage changes are logged to the timeline and audit log."
        actions={
          <div className="inline-flex rounded-lg border border-line-strong bg-surface p-0.5 text-sm" role="tablist" aria-label="View">
            {(["table", "kanban"] as const).map((v) => (
              <Link key={v} href={viewHref(v)} role="tab" aria-selected={view === v}
                className={clsx("rounded-md px-3 py-1 capitalize", view === v ? "bg-ink text-surface" : "text-ink-2 hover:text-ink")}>{v}</Link>
            ))}
          </div>
        } />

      <div className="mb-4">
        <FilterBar keep={["view"]} filters={[
          { name: "q", label: "Search company", type: "search" },
          { name: "stage", label: "Stage", options: [{ value: "open", label: "Open pipeline" }, { value: "closed", label: "Won or lost" }, ...ALL_STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s] }))] },
          { name: "reached", label: "Reached", options: ALL_STAGES.filter((s) => s !== "declined" && s !== "lost").map((s) => ({ value: s, label: STAGE_LABEL[s] })) },
          { name: "partner", label: "Partner", options: data.partners.map((p) => ({ value: p.id, label: p.fullName })) },
          { name: "type", label: "Partner type", options: Object.entries(PARTNER_TYPE_LABEL).map(([value, label]) => ({ value, label })) },
          { name: "from", label: "Registered from", type: "date" },
          { name: "to", label: "to", type: "date" },
        ]} />
      </div>

      {view === "kanban" ? <Kanban rows={rows} partnerName={(id) => partnerById.get(id)?.fullName ?? ""} /> : (
        <Card flush>
          <ResultSummary>
            <Stat label="Referrals" value={rows.length} />
            <Stat label="Won" value={rows.filter((r) => r.stage === "won").length} />
            <Stat label="First-contract value" value={formatINR(contract)} />
            <span className="ml-auto"><ExportLink table="referrals" params={exportParams} /></span>
          </ResultSummary>
          {rows.length === 0 ? <Empty>No referrals match these filters.</Empty> : (
            <Table>
              <thead>
                <tr><Th>Company</Th><Th>Partner</Th><Th>Stage</Th><Th>Registered</Th><Th>Decision</Th><Th>Attribution ends</Th><Th align="right">First contract</Th><Th align="right">Rate</Th><Th>Flags</Th></tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const p = partnerById.get(r.partnerId);
                  return (
                    <tr key={r.id} className="hover:bg-surface-2">
                      <Td>
                        <Link href={`/admin/referrals/${r.id}`} className="font-medium hover:underline">{r.companyName}</Link>
                        <div className="text-xs text-muted">{r.companyDomain}</div>
                      </Td>
                      <Td>
                        <Link href={`/admin/partners/${r.partnerId}`} className="hover:underline">{p?.fullName}</Link>
                        <div className="text-xs text-muted">{p && PARTNER_TYPE_LABEL[p.partnerType]}</div>
                      </Td>
                      <Td><StageBadge stage={r.stage} /></Td>
                      <Td mono className="whitespace-nowrap">{formatDate(istDate(r.registeredAt))}</Td>
                      <Td mono className="whitespace-nowrap">
                        {r.decidedAt ? formatDate(istDate(r.decidedAt))
                          : <span className={data.today > r.decisionDueAt ? "font-medium text-bad" : "text-ink-2"}>Due {formatDate(r.decisionDueAt)}</span>}
                      </Td>
                      <Td mono className="whitespace-nowrap">{attribution(r, data.today)}</Td>
                      <Td align="right" mono>{r.firstContractValue ? formatINR(r.firstContractValue) : "—"}</Td>
                      <Td align="right" mono>{r.lockedRateBp ? formatRate(r.lockedRateBp) : "—"}</Td>
                      <Td><Flags r={r} /></Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      )}
    </>
  );
}

function attribution(r: Referral, today: string) {
  if (!r.attributionExpiresAt) return <span className="text-muted">—</span>;
  if (r.stage === "won" || r.stage === "lost") return <span className="text-muted">{formatDate(r.attributionExpiresAt)}</span>;
  return <span className={today > r.attributionExpiresAt ? "font-medium text-bad" : ""}>{formatDate(r.attributionExpiresAt)}</span>;
}

function Flags({ r }: { r: Referral }) {
  return (
    <span className="flex gap-1.5 text-muted">
      {r.duplicateOf && <span title="Duplicate of an earlier registration" className="inline-flex items-center gap-1 text-xs text-bad"><Copy className="size-3.5" aria-hidden />Dup</span>}
      {r.forfeited && <span title="Commission forfeited" className="inline-flex items-center gap-1 text-xs text-bad"><Ban className="size-3.5" aria-hidden />Forfeit</span>}
      {r.vcDiscount && <span title="Commission given to client as a discount" className="inline-flex items-center gap-1 text-xs"><Gift className="size-3.5" aria-hidden />Discount</span>}
    </span>
  );
}

function Kanban({ rows, partnerName }: { rows: Referral[]; partnerName: (id: string) => string }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-8 sm:px-8">
      <div className="flex gap-3">
        {ALL_STAGES.map((stage) => {
          const col = rows.filter((r) => r.stage === stage);
          return (
            <section key={stage} className="w-64 shrink-0 rounded-xl border border-line bg-surface-2/60">
              <header className="flex items-center justify-between px-3 py-2.5">
                <StageBadge stage={stage} /><span className="tabular text-xs text-muted">{col.length}</span>
              </header>
              <ul className="space-y-2 px-2 pb-2">
                {col.map((r) => (
                  <li key={r.id}>
                    <Link href={`/admin/referrals/${r.id}`} className="block rounded-lg border border-line bg-surface p-3 text-sm hover:border-line-strong">
                      <div className="font-medium">{r.companyName}</div>
                      <div className="mt-0.5 text-xs text-muted">{partnerName(r.partnerId)}</div>
                      <div className="mt-2 flex items-center justify-between text-xs">
                        <span className="tabular text-ink-2">{r.firstContractValue ? formatINR(r.firstContractValue) : formatDate(istDate(r.registeredAt))}</span>
                        <Flags r={r} />
                      </div>
                    </Link>
                  </li>
                ))}
                {col.length === 0 && <li className="px-2 py-4 text-center text-xs text-muted">Empty</li>}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
