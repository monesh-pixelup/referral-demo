import type { NextRequest } from "next/server";
import { getDataset } from "@/lib/data";
import { computeAlerts, partnerBalance, suggestTds } from "@/lib/commission";
import {
  byPartnerType, collected, filterLines, filterPartnerRows, filterPayments, filterPayouts, filterReferrals,
  lineFilterFrom, partnerFilterFrom, partnerRows, paymentFilterFrom, payoutFilterFrom, referralFilterFrom, type Params,
} from "@/lib/queries";
import { csvRupees, toCSV } from "@/lib/csv";
import { istDate } from "@/lib/dates";
import { PARTNER_TYPE_LABEL, STAGE_LABEL } from "@/lib/types";
import { authorize, AuthError, isStaff } from "@/lib/auth";

/** CSV export for every table. Uses the same filter functions as the pages. */
export async function GET(request: NextRequest, ctx: RouteContext<"/admin/export/[table]">) {
  try {
    const user = await authorize();
    if (!isStaff(user.role)) throw new AuthError();
  } catch (e) {
    if (e instanceof AuthError) return new Response(e.message, { status: 403 });
    throw e;
  }
  const { table } = await ctx.params;
  const data = await getDataset();
  const sp: Params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const partner = new Map(data.partners.map((p) => [p.id, p]));
  const ref = new Map(data.referrals.map((r) => [r.id, r]));
  let csv: string;

  switch (table) {
    case "referrals":
      csv = toCSV(filterReferrals(data, referralFilterFrom(sp)), [
        { header: "Company", value: (r) => r.companyName }, { header: "Domain", value: (r) => r.companyDomain },
        { header: "Partner", value: (r) => partner.get(r.partnerId)?.fullName }, { header: "Stage", value: (r) => STAGE_LABEL[r.stage] },
        { header: "Registered (IST)", value: (r) => istDate(r.registeredAt) }, { header: "Decision due", value: (r) => r.decisionDueAt },
        { header: "Introduced", value: (r) => r.introducedAt }, { header: "Attribution expires", value: (r) => r.attributionExpiresAt },
        { header: "Signed", value: (r) => r.signedAt }, { header: "First contract (INR)", value: (r) => (r.firstContractValue ? csvRupees(r.firstContractValue) : "") },
        { header: "Locked rate %", value: (r) => (r.lockedRateBp ? r.lockedRateBp / 100 : "") }, { header: "Duplicate of", value: (r) => (r.duplicateOf ? ref.get(r.duplicateOf)?.companyName : "") },
        { header: "Forfeited", value: (r) => r.forfeited }, { header: "VC discount", value: (r) => r.vcDiscount },
        { header: "Decline reason", value: (r) => r.declineReason }, { header: "Lost reason", value: (r) => r.lostReason },
      ]);
      break;
    case "partners":
    case "leaderboard":
      csv = toCSV(filterPartnerRows(partnerRows(data), partnerFilterFrom(sp)), [
        { header: "Partner", value: (r) => r.partner.fullName }, { header: "Email", value: (r) => r.partner.email },
        { header: "Company", value: (r) => r.partner.company }, { header: "Type", value: (r) => PARTNER_TYPE_LABEL[r.partner.partnerType] },
        { header: "Tier", value: (r) => r.tier.label }, { header: "Status", value: (r) => r.partner.status },
        { header: "Agreement signed", value: (r) => r.partner.agreementSignedAt }, { header: "Referrals", value: (r) => r.referrals },
        { header: "Won", value: (r) => r.won }, { header: "Collected (INR)", value: (r) => csvRupees(r.collected) },
        { header: "Owed (INR)", value: (r) => csvRupees(r.owed) }, { header: "Paid this FY (INR)", value: (r) => csvRupees(r.paidFy) },
      ]);
      break;
    case "payments":
      csv = toCSV(filterPayments(data, paymentFilterFrom(sp)), [
        { header: "Received", value: (p) => p.receivedOn }, { header: "Client", value: (p) => ref.get(p.referralId)?.companyName },
        { header: "Partner", value: (p) => partner.get(ref.get(p.referralId)!.partnerId)?.fullName }, { header: "Invoice", value: (p) => p.invoiceNumber },
        { header: "Kind", value: (p) => p.kind }, { header: "Net (INR)", value: (p) => csvRupees(p.netAmount) },
        { header: "Refunded on", value: (p) => p.refundedOn }, { header: "Refund (INR)", value: (p) => csvRupees(p.refundAmount) },
        { header: "Collected (INR)", value: (p) => csvRupees(collected(p)) },
      ]);
      break;
    case "lines":
      csv = toCSV(filterLines(data, lineFilterFrom(sp)), [
        { header: "Created", value: (l) => l.createdOn }, { header: "Partner", value: (l) => partner.get(l.partnerId)?.fullName },
        { header: "Client", value: (l) => ref.get(l.referralId)?.companyName }, { header: "Rate %", value: (l) => l.rateBp / 100 },
        { header: "Amount (INR)", value: (l) => csvRupees(l.amount) }, { header: "Due by", value: (l) => l.dueBy },
        { header: "Status", value: (l) => l.status }, { header: "Reason", value: (l) => l.reason },
        { header: "Client discount", value: (l) => l.settledAsDiscount }, { header: "Payout", value: (l) => l.payoutId },
      ]);
      break;
    case "payouts":
      csv = toCSV(filterPayouts(data, payoutFilterFrom(sp)), [
        { header: "Paid on", value: (p) => p.paidOn }, { header: "Partner", value: (p) => partner.get(p.partnerId)?.fullName },
        { header: "Partner invoice", value: (p) => p.partnerInvoiceNumber }, { header: "Gross (INR)", value: (p) => csvRupees(p.grossAmount) },
        { header: "TDS suggested (INR)", value: (p) => csvRupees(p.tdsSuggested) }, { header: "TDS (INR)", value: (p) => csvRupees(p.tdsAmount) },
        { header: "Net (INR)", value: (p) => csvRupees(p.netAmount) }, { header: "Currency", value: (p) => p.currency },
        { header: "FX rate", value: (p) => p.fxRate }, { header: "Bank reference", value: (p) => p.bankReference },
      ]);
      break;
    case "bank-transfer": {
      const lines = filterLines(data, { status: "owed", partner: typeof sp.partner === "string" ? sp.partner : undefined });
      const rows = [...new Set(lines.map((l) => l.partnerId))].map((pid) => {
        const p = partner.get(pid)!;
        const gross = partnerBalance(lines.filter((l) => l.partnerId === pid));
        const tds = suggestTds(p, data.today, gross, data.payouts.filter((x) => x.partnerId === pid));
        return { p, gross, tds };
      }).filter((r) => r.gross > 0);
      csv = toCSV(rows, [
        { header: "Partner", value: (r) => r.p.fullName }, { header: "Email", value: (r) => r.p.email },
        { header: "Gross (INR)", value: (r) => csvRupees(r.gross) }, { header: "Suggested TDS (INR)", value: (r) => csvRupees(r.tds.amount) },
        { header: "Net to transfer (INR)", value: (r) => csvRupees(r.gross - r.tds.amount) }, { header: "Note", value: (r) => r.tds.note },
      ]);
      break;
    }
    case "alerts":
      csv = toCSV(computeAlerts(data), [
        { header: "Severity", value: (a) => a.severity }, { header: "Alert", value: (a) => a.title },
        { header: "Detail", value: (a) => a.detail }, { header: "Date", value: (a) => a.date },
      ]);
      break;
    case "types":
      csv = toCSV(byPartnerType(data), [
        { header: "Partner type", value: (t) => PARTNER_TYPE_LABEL[t.type] }, { header: "Referrals", value: (t) => t.referrals },
        { header: "Won", value: (t) => t.won }, { header: "Revenue (INR)", value: (t) => csvRupees(t.revenue) },
      ]);
      break;
    default:
      return new Response("Unknown table", { status: 404 });
  }

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pixelup-${table}-${data.today}.csv"`,
    },
  });
}
