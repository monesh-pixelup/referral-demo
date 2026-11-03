import Link from "next/link";
import clsx from "clsx";
import type { ReactNode } from "react";
import { AlertTriangle, CircleAlert, Info, Download } from "lucide-react";
import type { Severity } from "@/lib/commission";
import { STAGE_LABEL, PARTNER_STATUS_LABEL, type Stage, type PartnerStatus } from "@/lib/types";
import type { TierName } from "@/lib/program-config";

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[26px] font-medium tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, subtitle, actions, children, className, flush }: {
  title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; flush?: boolean;
}) {
  return (
    <section className={clsx("min-w-0 rounded-xl border border-line bg-surface", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3">
          <div>
            {title && <h2 className="text-[15px] font-medium">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className={flush ? "" : "px-5 pb-5"}>{children}</div>
    </section>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">{children}</span>;
}

const pill = "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap";

const STAGE_STYLE: Record<Stage, string> = {
  registered: "bg-surface-2 text-ink-2",
  approved: "bg-surface-2 text-ink-2",
  introduced: "bg-accent-wash text-info",
  discovery: "bg-accent-wash text-info",
  proposal: "bg-accent-wash text-info",
  won: "bg-good-wash text-good",
  lost: "bg-surface-2 text-muted",
  declined: "bg-surface-2 text-muted",
};

export function StageBadge({ stage }: { stage: Stage }) {
  return <span className={clsx(pill, STAGE_STYLE[stage])}>{STAGE_LABEL[stage]}</span>;
}

const TIER_STYLE: Record<TierName, string> = {
  referrer: "border border-line-strong text-ink-2",
  growth: "bg-accent-wash text-info",
  strategic: "bg-ink text-surface",
};

export function TierBadge({ tier, label }: { tier: TierName; label: string }) {
  return <span className={clsx(pill, TIER_STYLE[tier])}>{label}</span>;
}

export function StatusBadge({ status }: { status: PartnerStatus }) {
  const style = status === "active" ? "bg-good-wash text-good" : status === "notice_period" ? "bg-warn-wash text-warn" : status === "removed" ? "bg-bad-wash text-bad" : "bg-surface-2 text-muted";
  return <span className={clsx(pill, style)}>{PARTNER_STATUS_LABEL[status]}</span>;
}

/** Status always ships with an icon + label, never colour alone. */
export function SeverityIcon({ severity, className }: { severity: Severity; className?: string }) {
  const cls = clsx("size-4 shrink-0", className);
  if (severity === "bad") return <CircleAlert aria-label="Overdue" className={clsx(cls, "text-bad")} />;
  if (severity === "warn") return <AlertTriangle aria-label="Warning" className={clsx(cls, "text-warn-dot")} />;
  return <Info aria-label="Info" className={clsx(cls, "text-info")} />;
}

export function Tag({ tone = "neutral", children }: { tone?: "neutral" | "good" | "warn" | "bad" | "info"; children: ReactNode }) {
  const style = { neutral: "bg-surface-2 text-ink-2", good: "bg-good-wash text-good", warn: "bg-warn-wash text-warn", bad: "bg-bad-wash text-bad", info: "bg-info-wash text-info" }[tone];
  return <span className={clsx(pill, style)}>{children}</span>;
}

export function ButtonLink({ href, children, variant = "secondary", prefetch }: { href: string; children: ReactNode; variant?: "primary" | "secondary" | "ghost"; prefetch?: boolean }) {
  const style = {
    primary: "bg-ink text-surface hover:opacity-90",
    secondary: "border border-line-strong bg-surface hover:bg-surface-2",
    ghost: "hover:bg-surface-2 text-ink-2",
  }[variant];
  return <Link href={href} prefetch={prefetch} className={clsx("inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors", style)}>{children}</Link>;
}

export function ExportLink({ table, params }: { table: string; params?: Record<string, string | undefined> }) {
  const qs = new URLSearchParams(Object.entries(params ?? {}).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <a href={`/admin/export/${table}${qs ? `?${qs}` : ""}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium hover:bg-surface-2">
      <Download className="size-3.5" aria-hidden /> CSV
    </a>
  );
}

/* ---------- table ---------- */

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, align = "left", className }: { children?: ReactNode; align?: "left" | "right" | "center"; className?: string }) {
  return (
    <th scope="col" className={clsx("border-b border-line bg-surface px-4 py-2.5 font-mono text-[11px] font-normal uppercase tracking-[0.06em] whitespace-nowrap text-muted", align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left", className)}>
      {children}
    </th>
  );
}

export function Td({ children, align = "left", className, mono }: { children?: ReactNode; align?: "left" | "right" | "center"; className?: string; mono?: boolean }) {
  return (
    <td className={clsx("border-b border-line px-4 py-2.5 align-middle", align === "right" && "text-right", align === "center" && "text-center", mono && "tabular", className)}>
      {children}
    </td>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-5 py-10 text-center text-sm text-muted">{children}</div>;
}

/** Summary line under every filtered list so it can be checked against the dashboard. */
export function ResultSummary({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-line px-5 py-3 text-sm text-ink-2">{children}</div>;
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return <span><span className="text-muted">{label}</span> <span className="tabular font-medium text-ink">{value}</span></span>;
}
