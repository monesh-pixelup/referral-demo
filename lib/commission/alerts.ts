import { addDays, addWorkingDays, formatDate, istDate, lastQuarterReview, type ISODate } from "../dates";
import { formatINR } from "../money";
import { programConfig, type ProgramConfig } from "../program-config";
import { OPEN_STAGES, type Dataset } from "../types";
import { partnerBalance } from "./lines";
import { tierAt } from "./tier";

export type Severity = "bad" | "warn" | "info";
export type AlertKind = "decision_due" | "attribution_closing" | "attribution_expired" | "payout_due" | "agreement_missing" | "tier_change" | "no_pan" | "application_new" | "details_to_verify" | "invoice_submitted";

export interface Alert {
  kind: AlertKind;
  severity: Severity;
  title: string;
  detail: string;
  href: string;
  /** Date that drives sort order: earlier first within a severity. */
  date: ISODate;
  overdue: boolean;
}

const SEVERITY_ORDER: Record<Severity, number> = { bad: 0, warn: 1, info: 2 };

/** SPEC "Alerts". Pure: same dataset + today → same list. Sorted overdue/bad first. */
export function computeAlerts(data: Dataset, config: ProgramConfig = programConfig): Alert[] {
  const { today } = data;
  const out: Alert[] = [];
  const partnerById = new Map(data.partners.map((p) => [p.id, p]));

  for (const r of data.referrals) {
    const p = partnerById.get(r.partnerId);
    const who = p ? ` · ${p.fullName}` : "";
    if (r.stage === "registered" && today >= addDays(r.decisionDueAt, -1)) {
      const overdue = today > r.decisionDueAt;
      out.push({ kind: "decision_due", severity: overdue ? "bad" : "warn", overdue, date: r.decisionDueAt,
        title: `${overdue ? "Decision overdue" : "Decision due"}: ${r.companyName}`,
        detail: `Approve or decline by ${formatDate(r.decisionDueAt)}${who}`, href: `/admin/referrals/${r.id}` });
    }
    if (OPEN_STAGES.includes(r.stage) && r.attributionExpiresAt) {
      if (today > r.attributionExpiresAt) {
        out.push({ kind: "attribution_expired", severity: "bad", overdue: true, date: r.attributionExpiresAt,
          title: `Attribution expired: ${r.companyName}`, detail: `Window closed ${formatDate(r.attributionExpiresAt)}${who}`, href: `/admin/referrals/${r.id}` });
      } else if (r.attributionExpiresAt <= addDays(today, config.attributionClosingWarnDays)) {
        out.push({ kind: "attribution_closing", severity: "warn", overdue: false, date: r.attributionExpiresAt,
          title: `Attribution closing: ${r.companyName}`, detail: `Must sign by ${formatDate(r.attributionExpiresAt)}${who}`, href: `/admin/referrals/${r.id}` });
      }
    }
  }

  // A partner whose pending lines net to zero or less has nothing due (negative balances carry forward).
  const balance = new Map(data.partners.map((p) => [p.id, partnerBalance(data.lines.filter((l) => l.partnerId === p.id))]));
  for (const l of data.lines) {
    if (l.status !== "pending" || l.settledAsDiscount || l.amount <= 0) continue;
    if ((balance.get(l.partnerId) ?? 0) <= 0) continue;
    if (l.dueBy <= addDays(today, config.payoutDueWarnDays)) {
      const p = partnerById.get(l.partnerId);
      const overdue = today > l.dueBy;
      out.push({ kind: "payout_due", severity: overdue ? "bad" : "warn", overdue, date: l.dueBy,
        title: `${overdue ? "Payout overdue" : "Payout due"}: ${formatINR(l.amount)} to ${p?.fullName ?? "partner"}`,
        detail: `Due by ${formatDate(l.dueBy)}`, href: `/admin/payouts?partner=${l.partnerId}` });
    }
  }

  for (const a of data.applications.filter((x) => x.status === "new")) {
    const date = istDate(a.createdAt);
    const due = addWorkingDays(date, config.decisionWorkingDays);
    out.push({ kind: "application_new", severity: today > due ? "bad" : "info", overdue: today > due, date,
      title: `New application: ${a.fullName}`, detail: `${a.company || a.email} · reply by ${formatDate(due)}`, href: "/admin/applications" });
  }

  for (const p of data.partners.filter((x) => x.pendingDetails)) {
    out.push({ kind: "details_to_verify", severity: "info", overdue: false, date: istDate(p.pendingDetails!.submittedAt),
      title: `Tax details to verify: ${p.fullName}`, detail: `Submitted ${formatDate(istDate(p.pendingDetails!.submittedAt))} in the portal`, href: `/admin/partners/${p.id}` });
  }
  for (const inv of data.invoices.filter((x) => x.status === "submitted")) {
    const p = partnerById.get(inv.partnerId);
    out.push({ kind: "invoice_submitted", severity: "info", overdue: false, date: inv.issuedOn,
      title: `Invoice to pay: ${formatINR(inv.amount)} from ${p?.fullName ?? "partner"}`, detail: `${inv.invoiceNumber} · issued ${formatDate(inv.issuedOn)}`, href: `/admin/payouts/new?partner=${inv.partnerId}` });
  }

  const review = lastQuarterReview(today);
  for (const p of data.partners) {
    if (p.status === "active" && !p.agreementSignedAt) {
      out.push({ kind: "agreement_missing", severity: "warn", overdue: false, date: p.createdAt.slice(0, 10),
        title: `Agreement missing: ${p.fullName}`, detail: "Active partner with no signed agreement", href: `/admin/partners/${p.id}` });
    }
    if (p.status === "active" || p.status === "notice_period") {
      const live = tierAt(p, data.referrals, today, undefined, config);
      const atReview = tierAt(p, data.referrals, review, undefined, config);
      if (live.name !== atReview.name) {
        out.push({ kind: "tier_change", severity: "info", overdue: false, date: review,
          title: `Tier change: ${p.fullName}`, detail: `${atReview.label} at ${formatDate(review)} review → ${live.label} now`, href: `/admin/partners/${p.id}` });
      }
    }
    if (p.isResidentIndia && !p.panOnFile) {
      const owed = partnerBalance(data.lines.filter((l) => l.partnerId === p.id));
      if (owed > 0) {
        out.push({ kind: "no_pan", severity: "warn", overdue: false, date: today,
          title: `No PAN: ${p.fullName}`, detail: `${formatINR(owed)} owed; ${config.tds.noPanRateBp / 100}% TDS applies until PAN is on file`, href: `/admin/partners/${p.id}` });
      }
    }
  }

  return out.sort((a, b) =>
    Number(b.overdue) - Number(a.overdue)
    || SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    || a.date.localeCompare(b.date));
}
