import { Suspense } from "react";
import { connection } from "next/server";
import { programConfig } from "@/lib/program-config";
import { formatINR, formatRate } from "@/lib/money";
import { Card, PageHeader, Table, Td, Th } from "@/components/ui";
import { ActionForm, Field, Input, MoneyInput } from "@/components/forms";
import { can, requireStaff } from "@/lib/auth";
import { DATA_SOURCE } from "@/lib/data";
import { resetDemoAction, updateSettingsAction } from "@/lib/actions/admin";

export const metadata = { title: "Settings" };

export default function Page() {
  return <Suspense fallback={<PageHeader title="Settings" />}><Settings /></Suspense>;
}

const pct = (bp: number) => String(bp / 100);
const rupees = (p: number) => String(p / 100);

/** Rules are read at request time, so edits show immediately. */
async function Settings() {
  await connection();
  const user = await requireStaff();
  const c = programConfig;
  const canEdit = can(user.role, "settings.write");

  return (
    <>
      <PageHeader title="Settings" description={canEdit
        ? "Program rules. Changes apply from now on: rates already locked on won referrals, and due dates already set, don't change. Every change is in the audit log."
        : "Program rules. Only an admin can change them."} />
      {canEdit ? <SettingsForm /> : <ReadOnly />}
      {DATA_SOURCE === "demo" && can(user.role, "demo.reset") && (
        <Card className="mt-4" title="Reset demo data" subtitle="Throws away every change made in this demo, including settings, and rebuilds the seed data.">
          <ActionForm action={resetDemoAction} submit="Reset demo data" variant="danger" confirm="Discard all demo changes?" />
        </Card>
      )}
    </>
  );

  function SettingsForm() {
    const num = (name: keyof typeof c, label: string, unit: string, hint?: string) => (
      <Field label={label} hint={hint}>
        <div className="flex items-center gap-2">
          <Input name={name} type="number" min={0} step={1} defaultValue={String(c[name])} required className="max-w-28 tabular" />
          <span className="text-sm text-muted">{unit}</span>
        </div>
      </Field>
    );
    return (
      <ActionForm action={updateSettingsAction} submit="Save settings" confirm="Save the new program rules? They apply to everything from now on.">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Tiers" subtitle="A tier upgrade applies to referrals that convert after it, never retroactively.">
            <div className="space-y-3">
              {c.tiers.map((t, i) => (
                <div key={t.name} className="grid grid-cols-[1fr_auto_auto] items-end gap-3">
                  <div className="pb-2 text-sm font-medium">{t.label}</div>
                  <Field label="Rate">
                    <div className="flex items-center gap-2"><Input name={`${t.name}Rate`} inputMode="decimal" defaultValue={pct(t.rateBp)} required className="w-20 tabular" /><span className="text-sm text-muted">%</span></div>
                  </Field>
                  <Field label="Conversions">
                    {i === 0 ? <><input type="hidden" name={`${t.name}MinWins`} value="0" /><div className="flex h-9 w-20 items-center text-sm text-muted">0</div></>
                      : <Input name={`${t.name}MinWins`} type="number" min={1} defaultValue={String(t.minWins)} required className="w-20 tabular" />}
                  </Field>
                </div>
              ))}
              {num("tierWindowMonths", "Conversions counted over", "months, rolling")}
              <p className="text-xs text-muted">A VC / accelerator portfolio agreement always gives the top tier.</p>
            </div>
          </Card>

          <Card title="Registration and attribution">
            <div className="grid gap-3 sm:grid-cols-2">
              {num("decisionWorkingDays", "Decide on a registration within", "working days")}
              {num("maxRegistrationsPerDay", "Registrations per partner", "per day")}
              {num("attributionWindowMonths", "Attribution window", "months from intro")}
              {num("attributionClosingWarnDays", "Warn before it closes", "days")}
              <Field label="Minimum first contract" hint="Blank = no minimum">
                <MoneyInput name="minFirstContract" defaultValue={c.minFirstContractPaise === null ? "" : rupees(c.minFirstContractPaise)} />
              </Field>
              {num("noticePeriodDays", "Notice period when leaving", "days")}
            </div>
          </Card>

          <Card title="Commission">
            <div className="grid gap-3 sm:grid-cols-2">
              {num("retainerCommissionMonths", "Retainer commission for", "months after signing")}
              {num("repeatWorkMonths", "Repeat work counts for", "months after signing")}
              {num("payoutDueDays", "Pay commission within", "days of client payment")}
              {num("payoutDueWarnDays", "Warn before payout is due", "days")}
              {num("clawbackWindowDays", "Refund clawback window", "days after receipt")}
            </div>
          </Card>

          <Card title="TDS" subtitle={c.tds.sectionLabel}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Rate"><div className="flex items-center gap-2"><Input name="tdsRate" inputMode="decimal" defaultValue={pct(c.tds.rateBp)} required className="w-20 tabular" /><span className="text-sm text-muted">%</span></div></Field>
              <Field label="Rate without PAN"><div className="flex items-center gap-2"><Input name="tdsNoPanRate" inputMode="decimal" defaultValue={pct(c.tds.noPanRateBp)} required className="w-20 tabular" /><span className="text-sm text-muted">%</span></div></Field>
              <Field label="Applies once the FY total exceeds"><MoneyInput name="tdsThreshold" defaultValue={rupees(c.tds.thresholdPaise)} required /></Field>
            </div>
          </Card>
        </div>
      </ActionForm>
    );
  }

  function ReadOnly() {
    const rules: [string, string][] = [
      ["Tier window", `${c.tierWindowMonths} months, rolling`],
      ["Registration decision", `${c.decisionWorkingDays} working days`],
      ["Attribution window", `${c.attributionWindowMonths} months from introduction`],
      ["Attribution closing warning", `${c.attributionClosingWarnDays} days before expiry`],
      ["Retainer commission", `First ${c.retainerCommissionMonths} months`],
      ["Repeat work", `Projects signed within ${c.repeatWorkMonths} months of the first contract`],
      ["Payout due", `${c.payoutDueDays} days after each client payment`],
      ["Clawback window", `${c.clawbackWindowDays} days after receipt`],
      ["Minimum first contract", c.minFirstContractPaise === null ? "Not set" : formatINR(c.minFirstContractPaise)],
      ["Termination notice", `${c.noticePeriodDays} days`],
      ["TDS", `${formatRate(c.tds.rateBp)} once FY total exceeds ${formatINR(c.tds.thresholdPaise)}; ${formatRate(c.tds.noPanRateBp)} without PAN · ${c.tds.sectionLabel}`],
      ["Partner registration limit", `${c.maxRegistrationsPerDay} per day`],
    ];
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Card flush title="Tiers">
          <Table>
            <thead><tr><Th>Tier</Th><Th align="right">Rate</Th><Th>How it is reached</Th></tr></thead>
            <tbody>
              {c.tiers.map((t) => (
                <tr key={t.name}>
                  <Td className="font-medium">{t.label}</Td>
                  <Td align="right" mono>{formatRate(t.rateBp)}</Td>
                  <Td className="text-ink-2">{t.minWins === 0 ? "Default for every new partner" : `${t.minWins}+ converted referrals in ${c.tierWindowMonths} months${t.name === "strategic" ? ", or a VC / accelerator portfolio agreement" : ""}`}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card flush title="Program rules">
          <Table><tbody>{rules.map(([k, v]) => <tr key={k}><Td className="w-1/3 text-ink-2">{k}</Td><Td>{v}</Td></tr>)}</tbody></Table>
        </Card>
      </div>
    );
  }
}
