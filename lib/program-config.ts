/**
 * Every program constant lives here (SPEC: "Program rules the app must enforce").
 * Source: PIXELUP LABS Partner Referral Program document, 27 Oct 2026.
 *
 * `programConfig` is the live object every rule reads. Admins edit it at
 * /admin/settings (lib/mutations/settings.ts), which replaces its values in
 * place. DEFAULT_PROGRAM_CONFIG holds the values from the program document.
 * With Supabase, the `settings` table stores the edited copy and it is loaded
 * into programConfig at startup.
 * Money is integer paise. Rates are basis points of 1/10,000 (1250 = 12.5%),
 * which maps 1:1 to the numeric(5,4) `locked_rate` column.
 */

export type TierName = "referrer" | "growth" | "strategic";

export interface TierRule {
  name: TierName;
  label: string;
  /** Rate in 1/10,000 units. 1000 = 10%. */
  rateBp: number;
  /** Converted referrals in the rolling window needed to reach this tier. */
  minWins: number;
}

export interface ProgramConfig {
  tiers: TierRule[];
  tierWindowMonths: number;
  decisionWorkingDays: number;
  attributionWindowMonths: number;
  attributionClosingWarnDays: number;
  retainerCommissionMonths: number;
  repeatWorkMonths: number;
  payoutDueDays: number;
  payoutDueWarnDays: number;
  clawbackWindowDays: number;
  /** Minimum first-contract size in paise. null = not yet set by the program. */
  minFirstContractPaise: number | null;
  noticePeriodDays: number;
  tds: {
    /** Annual FY threshold in paise; TDS applies once the FY total exceeds it. */
    thresholdPaise: number;
    rateBp: number;
    noPanRateBp: number;
    sectionLabel: string;
  };
  maxRegistrationsPerDay: number;
  timezone: string;
}

const DEFAULTS: ProgramConfig = {
  tiers: [
    { name: "referrer", label: "Referrer", rateBp: 1000, minWins: 0 },
    { name: "growth", label: "Growth Partner", rateBp: 1250, minWins: 3 },
    { name: "strategic", label: "Strategic Partner", rateBp: 1500, minWins: 6 },
  ],
  tierWindowMonths: 12,
  decisionWorkingDays: 5,
  attributionWindowMonths: 6,
  attributionClosingWarnDays: 30,
  retainerCommissionMonths: 12,
  repeatWorkMonths: 12,
  payoutDueDays: 15,
  payoutDueWarnDays: 3,
  clawbackWindowDays: 60,
  minFirstContractPaise: null,
  noticePeriodDays: 30,
  tds: {
    thresholdPaise: 20_000_00,
    rateBp: 200,
    noPanRateBp: 2000,
    sectionLabel: "Section 393(1), Income-tax Act (formerly 194H)",
  },
  maxRegistrationsPerDay: 20,
  timezone: "Asia/Kolkata",
};

export const DEFAULT_PROGRAM_CONFIG: Readonly<ProgramConfig> = Object.freeze(DEFAULTS);

/** The live rules. Never reassign; use applyProgramConfig so every importer sees the change. */
export const programConfig: ProgramConfig = structuredClone(DEFAULT_PROGRAM_CONFIG) as ProgramConfig;

export function applyProgramConfig(next: ProgramConfig) {
  Object.assign(programConfig, structuredClone(next));
}

export function tierRule(name: TierName, config: ProgramConfig = programConfig): TierRule {
  const rule = config.tiers.find((t) => t.name === name);
  if (!rule) throw new Error(`Unknown tier ${name}`);
  return rule;
}
