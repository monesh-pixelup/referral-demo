import { fyRange, inRange, type ISODate } from "../dates";
import { applyRate, formatINR } from "../money";
import { programConfig, type ProgramConfig } from "../program-config";
import type { Partner, Payout } from "../types";

export interface TdsSuggestion {
  amount: number;
  note: string;
  manual: boolean;
}

/**
 * SPEC suggestTds. Earlier payouts are filtered to the payout date's FY here,
 * so callers may pass a partner's full payout history.
 */
export function suggestTds(
  partner: Pick<Partner, "isResidentIndia" | "panOnFile">,
  payoutDate: ISODate, gross: number,
  earlierPayouts: Pick<Payout, "paidOn" | "grossAmount" | "tdsAmount">[],
  config: ProgramConfig = programConfig,
): TdsSuggestion {
  if (!partner.isResidentIndia) {
    return { amount: 0, note: "Outside India: confirm withholding with CA", manual: true };
  }
  if (!partner.panOnFile) {
    return { amount: applyRate(gross, config.tds.noPanRateBp), note: `No PAN on file: ${config.tds.noPanRateBp / 100}% under ${config.tds.sectionLabel}`, manual: false };
  }
  const fy = fyRange(payoutDate);
  const earlier = earlierPayouts.filter((p) => inRange(p.paidOn, fy.start, fy.end) && p.paidOn <= payoutDate);
  const fyTotal = earlier.reduce((s, p) => s + p.grossAmount, 0) + gross;
  if (fyTotal <= config.tds.thresholdPaise) {
    return { amount: 0, note: `${fy.label} total ${formatINR(fyTotal)} is within the ${formatINR(config.tds.thresholdPaise)} threshold`, manual: false };
  }
  const untaxed = earlier.filter((p) => p.tdsAmount === 0).reduce((s, p) => s + p.grossAmount, 0);
  const amount = applyRate(gross, config.tds.rateBp) + applyRate(untaxed, config.tds.rateBp);
  const catchUp = untaxed > 0 ? ` + catch-up on ${formatINR(untaxed)} paid earlier without TDS` : "";
  return { amount, note: `${config.tds.rateBp / 100}% of this payout${catchUp}`, manual: false };
}
