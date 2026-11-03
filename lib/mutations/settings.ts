import { applyProgramConfig, programConfig, type ProgramConfig } from "../program-config";
import { audit, fail, type Ctx } from "./context";

/** Editable fields (labels, timezone and the TDS section label stay fixed). */
export type SettingsInput = Omit<ProgramConfig, "timezone" | "tds" | "tiers"> & {
  tiers: { name: ProgramConfig["tiers"][number]["name"]; rateBp: number; minWins: number }[];
  tds: Omit<ProgramConfig["tds"], "sectionLabel">;
};

const whole = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max;

/**
 * Validate and apply new program rules. Changes apply going forward:
 * rates already locked on won referrals, due dates already set on commission
 * lines and decision/attribution dates already set on referrals don't change.
 */
export function updateSettings(ctx: Ctx, input: SettingsInput) {
  const current = programConfig;
  const tiers = current.tiers.map((t) => {
    const n = input.tiers.find((x) => x.name === t.name);
    if (!n) fail(`Missing ${t.label} settings.`);
    return { ...t, rateBp: n.rateBp, minWins: n.minWins };
  });
  for (const t of tiers) if (!whole(t.rateBp, 0, 5000)) fail(`${t.label} rate must be between 0% and 50%.`);
  if (tiers[0].minWins !== 0) fail(`${tiers[0].label} must start at 0 conversions.`);
  for (let i = 1; i < tiers.length; i++) {
    if (!(tiers[i].minWins > tiers[i - 1].minWins)) fail(`${tiers[i].label} must need more conversions than ${tiers[i - 1].label}.`);
    if (!(tiers[i].rateBp >= tiers[i - 1].rateBp)) fail(`${tiers[i].label} rate can't be lower than ${tiers[i - 1].label}.`);
  }
  const ranges: [keyof SettingsInput, string, number, number][] = [
    ["tierWindowMonths", "Tier window", 1, 36],
    ["decisionWorkingDays", "Decision time", 1, 30],
    ["attributionWindowMonths", "Attribution window", 1, 36],
    ["attributionClosingWarnDays", "Attribution warning", 0, 180],
    ["retainerCommissionMonths", "Retainer commission period", 0, 60],
    ["repeatWorkMonths", "Repeat-work period", 0, 60],
    ["payoutDueDays", "Payout due", 1, 90],
    ["payoutDueWarnDays", "Payout warning", 0, 30],
    ["clawbackWindowDays", "Clawback window", 0, 365],
    ["noticePeriodDays", "Notice period", 0, 180],
    ["maxRegistrationsPerDay", "Daily registration limit", 1, 500],
  ];
  for (const [k, label, min, max] of ranges) {
    if (!whole(input[k] as number, min, max)) fail(`${label} must be a whole number from ${min} to ${max}.`);
  }
  if (input.minFirstContractPaise !== null && !(input.minFirstContractPaise > 0)) fail("Minimum first contract must be more than zero, or left blank.");
  if (!(input.tds.thresholdPaise >= 0)) fail("TDS threshold can't be negative.");
  if (!whole(input.tds.rateBp, 0, 5000) || !whole(input.tds.noPanRateBp, 0, 5000)) fail("TDS rates must be between 0% and 50%.");

  const next: ProgramConfig = {
    ...current, ...input, tiers,
    tds: { ...current.tds, ...input.tds },
    timezone: current.timezone,
  };
  const before = structuredClone(current);
  applyProgramConfig(next);
  audit(ctx, "settings", "program", "update", before, next);
  return programConfig;
}
