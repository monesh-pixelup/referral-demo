"use client";

import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import { formatINR, formatINRCompact } from "@/lib/money";
import { formatMonth } from "@/lib/dates";

interface Point { month: string; amount: number }

function TooltipBox({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as Point;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-sm shadow-lg">
      <div className="text-xs text-muted">{formatMonth(p.month)}</div>
      <div className="tabular font-medium">{formatINR(p.amount)}</div>
      <div className="mt-0.5 text-[11px] text-muted">Click to see payments</div>
    </div>
  );
}

/** Net fees collected by month. Single series: no legend; the card title names it. */
export function MonthlyChart({ data }: { data: Point[] }) {
  const router = useRouter();
  const open = (month: string) => router.push(`/admin/payments?month=${month}`);
  return (
    <div className="h-64 w-full">
        <BarChart responsive style={{ width: "100%", height: "100%" }} data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="month" tickFormatter={formatMonth} tickLine={false} axisLine={{ stroke: "var(--line-strong)" }}
            tick={{ fill: "var(--muted)", fontSize: 11 }} interval="preserveStartEnd" minTickGap={12} />
          <YAxis tickFormatter={(v: number) => formatINRCompact(v)} tickLine={false} axisLine={false} width={52}
            tick={{ fill: "var(--muted)", fontSize: 11 }} />
          <Tooltip content={TooltipBox} cursor={{ fill: "var(--surface-2)" }} />
          <Bar dataKey="amount" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={24} cursor="pointer" isAnimationActive={false}
            onClick={(d) => { const m = (d as unknown as { payload?: Point }).payload?.month; if (m) open(m); }} />
        </BarChart>
    </div>
  );
}
