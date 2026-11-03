import Link from "next/link";
import { Suspense } from "react";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import { getStaffDataset } from "@/lib/auth";
import { computeAlerts } from "@/lib/commission";
import { byPartnerType, funnel, kpis, monthlyCollected, partnerRows } from "@/lib/queries";
import { formatINR, formatINRCompact } from "@/lib/money";
import { formatDate, formatMonth, nextQuarterReview } from "@/lib/dates";
import { PARTNER_TYPE_LABEL, STAGE_LABEL } from "@/lib/types";
import { Card, ExportLink, PageHeader, SeverityIcon, Table, Td, Th, TierBadge, Label } from "@/components/ui";
import { MonthlyChart } from "@/components/monthly-chart";

export const metadata = { title: "Dashboard" };

export default function Page() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}

function DashboardSkeleton() {
  return (
    <div aria-busy="true" className="animate-pulse">
      <div className="mb-6 h-8 w-48 rounded bg-surface-2" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-28 rounded-xl bg-surface-2" />)}</div>
    </div>
  );
}

async function Dashboard() {
  const data = await getStaffDataset();
  const k = kpis(data);
  const alerts = computeAlerts(data);
  const stages = funnel(data);
  const monthly = monthlyCollected(data);
  const leaders = partnerRows(data).sort((a, b) => b.collected - a.collected);
  const types = byPartnerType(data);
  const maxReached = Math.max(...stages.map((s) => s.reached), 1);
  const maxTypeRevenue = Math.max(...types.map((t) => t.revenue), 1);
  const last12 = monthly.reduce((s, m) => s + m.amount, 0);

  const tiles = [
    { label: "Active partners", value: String(k.activePartners), href: "/admin/partners?status=active", sub: `${data.partners.length} total` },
    { label: "Referrals in pipeline", value: String(k.pipeline), href: "/admin/referrals?stage=open", sub: "Registered → proposal" },
    { label: "Win rate", value: k.winRate === null ? "—" : `${Math.round(k.winRate * 100)}%`, href: "/admin/referrals?stage=closed", sub: `${k.won} won of ${k.closed} closed` },
    { label: `Net fees collected`, value: formatINR(k.netFeesFy), href: "/admin/payments?fy=current", sub: `${k.fy.label}, net of refunds` },
    { label: "Commission owed", value: formatINR(k.owed), href: "/admin/payouts?view=owed", sub: "Now, pending lines" },
    { label: "Commission paid", value: formatINR(k.paidFy), href: "/admin/payouts?fy=current", sub: `${k.fy.label}, gross of TDS` },
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={<>As of {formatDate(data.today)} IST · {k.fy.label} · Next tier review {formatDate(nextQuarterReview(data.today))}</>}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className="group min-w-0 rounded-xl border border-line bg-surface p-4 transition-colors hover:border-line-strong">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[13px] text-ink-2">{t.label}</span>
              <ArrowUpRight className="size-3.5 text-muted opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
            </div>
            <div className="mt-3 text-[21px] leading-none font-medium tracking-tight sm:text-[26px]">{t.value}</div>
            <div className="mt-2 text-xs text-muted">{t.sub}</div>
          </Link>
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3" flush
          title={<>Needs attention <span className="ml-1 tabular text-muted">{alerts.length}</span></>}
          subtitle="Overdue first. Computed on page load from the program rules."
          actions={<ExportLink table="alerts" />}>
          {alerts.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted">Nothing needs attention.</p>
          ) : (
            <ul className="max-h-[380px] divide-y divide-line overflow-y-auto border-t border-line">
              {alerts.map((a, i) => (
                <li key={i}>
                  <Link href={a.href} className="flex items-start gap-3 px-5 py-3 hover:bg-surface-2">
                    <SeverityIcon severity={a.severity} className="mt-0.5" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{a.title}</span>
                      <span className="block truncate text-xs text-muted">{a.detail}</span>
                    </span>
                    <ChevronRight className="mt-0.5 size-4 text-muted" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="xl:col-span-2" title="Funnel" subtitle="Referrals that ever reached each stage, with conversion from the stage before">
          <ol className="space-y-2.5">
            {stages.map((s) => (
              <li key={s.stage}>
                <Link href={`/admin/referrals?reached=${s.stage}`} className="group block">
                  <div className="mb-1 flex items-baseline justify-between text-sm">
                    <span className="text-ink-2 group-hover:text-ink">{STAGE_LABEL[s.stage]}</span>
                    <span className="tabular">
                      <span className="font-medium">{s.reached}</span>
                      {s.conversion !== null && <span className="ml-2 text-xs text-muted">{Math.round(s.conversion * 100)}%</span>}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-2">
                    <div className="h-2 rounded-full bg-accent transition-opacity group-hover:opacity-80" style={{ width: `${(s.reached / maxReached) * 100}%` }} />
                  </div>
                </Link>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs text-muted">
            Also closed without winning: <Link className="underline underline-offset-2 hover:text-ink" href="/admin/referrals?stage=declined">{data.referrals.filter((r) => r.stage === "declined").length} declined</Link>,{" "}
            <Link className="underline underline-offset-2 hover:text-ink" href="/admin/referrals?stage=lost">{data.referrals.filter((r) => r.stage === "lost").length} lost</Link>.
          </p>
        </Card>
      </div>

      <Card className="mt-4" title="Net fees collected by month" subtitle={<>Last 12 months · {formatINR(last12)} total · click a bar for its payments</>}>
        <MonthlyChart data={monthly} />
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-xs text-muted hover:text-ink">View as table</summary>
          <div className="mt-2 grid grid-cols-3 gap-x-6 gap-y-1 sm:grid-cols-4 lg:grid-cols-6">
            {monthly.map((m) => (
              <Link key={m.month} href={`/admin/payments?month=${m.month}`} className="flex justify-between gap-2 hover:underline">
                <span className="text-muted">{formatMonth(m.month)}</span><span className="tabular">{formatINRCompact(m.amount)}</span>
              </Link>
            ))}
          </div>
        </details>
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3" flush title="Partner leaderboard" subtitle="Ranked by net fees collected, all time" actions={<ExportLink table="leaderboard" />}>
          <Table>
            <thead>
              <tr><Th>Partner</Th><Th>Tier</Th><Th align="right">Referrals</Th><Th align="right">Won</Th><Th align="right">Collected</Th><Th align="right">Owed</Th></tr>
            </thead>
            <tbody>
              {leaders.map((r) => (
                <tr key={r.partner.id} className="hover:bg-surface-2">
                  <Td>
                    <Link href={`/admin/partners/${r.partner.id}`} className="font-medium hover:underline">{r.partner.fullName}</Link>
                    <div className="text-xs text-muted">{PARTNER_TYPE_LABEL[r.partner.partnerType]}</div>
                  </Td>
                  <Td><TierBadge tier={r.tier.name} label={r.tier.label} /></Td>
                  <Td align="right" mono><Link className="hover:underline" href={`/admin/referrals?partner=${r.partner.id}`}>{r.referrals}</Link></Td>
                  <Td align="right" mono><Link className="hover:underline" href={`/admin/referrals?partner=${r.partner.id}&stage=won`}>{r.won}</Link></Td>
                  <Td align="right" mono><Link className="hover:underline" href={`/admin/payments?partner=${r.partner.id}`}>{formatINR(r.collected)}</Link></Td>
                  <Td align="right" mono className={r.owed < 0 ? "text-bad" : r.owed === 0 ? "text-muted" : ""}>
                    <Link className="hover:underline" href={`/admin/payouts?view=owed&partner=${r.partner.id}`}>{formatINR(r.owed)}</Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card className="xl:col-span-2" title="By partner type" subtitle="Referrals and net fees collected, all time" actions={<ExportLink table="types" />}>
          <ul className="space-y-4">
            {types.map((t) => (
              <li key={t.type}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <Link href={`/admin/referrals?type=${t.type}`} className="font-medium hover:underline">{PARTNER_TYPE_LABEL[t.type]}</Link>
                  <Link href={`/admin/payments?type=${t.type}`} className="tabular font-medium hover:underline">{formatINR(t.revenue)}</Link>
                </div>
                <div className="mt-1.5 h-2 rounded-full bg-surface-2">
                  <div className="h-2 rounded-full bg-accent" style={{ width: `${(t.revenue / maxTypeRevenue) * 100}%` }} />
                </div>
                <div className="mt-1 flex justify-between text-xs text-muted">
                  <Link href={`/admin/referrals?type=${t.type}`} className="hover:text-ink">{t.referrals} referrals · {t.won} won</Link>
                  <span>{t.referrals ? `${Math.round((t.won / t.referrals) * 100)}% won` : "—"}</span>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-5 border-t border-line pt-3"><Label>Revenue = net fees collected, less refunds</Label></div>
        </Card>
      </div>
    </>
  );
}
