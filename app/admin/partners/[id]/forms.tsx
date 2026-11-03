import { ActionForm, Checkbox, Field, Input, Select, Textarea } from "@/components/forms";
import { changePartnerStatusAction, reviewTaxDetailsAction, updatePartnerAction } from "@/lib/actions/admin";
import { PARTNER_STATUS_LABEL, type Partner, type PartnerStatus } from "@/lib/types";
import { programConfig } from "@/lib/program-config";

export function EditPartnerForm({ p, today }: { p: Partner; today: string }) {
  return (
    <ActionForm action={updatePartnerAction} submit="Save partner" variant="secondary">
      <input type="hidden" name="id" value={p.id} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Phone"><Input name="phone" defaultValue={p.phone} /></Field>
        <Field label="Company"><Input name="company" defaultValue={p.company} /></Field>
        <Field label="Country"><Input name="country" defaultValue={p.country} /></Field>
        <Field label="PAN, last 4 only" hint="Never enter the full PAN."><Input name="panLast4" defaultValue={p.panLast4 ?? ""} maxLength={4} placeholder="1234" className="uppercase" /></Field>
        <Field label="GSTIN"><Input name="gstin" defaultValue={p.gstin ?? ""} maxLength={15} className="uppercase" /></Field>
        <Field label="Agreement signed on"><Input type="date" name="agreementSignedAt" defaultValue={p.agreementSignedAt ?? ""} max={today} /></Field>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <Checkbox name="isResidentIndia" defaultChecked={p.isResidentIndia} label="Resident in India" />
        <Checkbox name="bankDetailsOnFile" defaultChecked={p.bankDetailsOnFile} label="Bank details received" hint="Held outside the app" />
        {p.partnerType === "vc_accelerator" && <Checkbox name="portfolioAgreement" defaultChecked={p.portfolioAgreement} label="Portfolio agreement (Strategic tier)" />}
      </div>
      <Field label="Internal notes"><Textarea name="notes" defaultValue={p.notes ?? ""} rows={2} /></Field>
    </ActionForm>
  );
}

export function StatusForm({ p, today }: { p: Partner; today: string }) {
  if (p.status === "removed") return <p className="text-sm text-muted">Removed partners can&apos;t be reinstated.</p>;
  const options = (Object.keys(PARTNER_STATUS_LABEL) as PartnerStatus[]).filter((s) => s !== p.status).map((s) => ({ value: s, label: PARTNER_STATUS_LABEL[s] }));
  return (
    <ActionForm action={changePartnerStatusAction} submit="Change status" variant="danger"
      confirm="Change this partner's status? Removal with forfeit voids unpaid commission and can't be undone here.">
      <input type="hidden" name="id" value={p.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="New status"><Select name="status" options={options} /></Field>
        <Field label="Effective date" hint={`Notice: date given (ends +${programConfig.noticePeriodDays} days)`}><Input type="date" name="effectiveOn" defaultValue={today} required /></Field>
      </div>
      <Field label="Reason" hint="Required for removal"><Input name="reason" /></Field>
      <Checkbox name="forfeit" label="On removal: forfeit unpaid commission" hint="Conduct breach only. Future client payments also earn nothing." />
    </ActionForm>
  );
}

export function ReviewDetailsForms({ p }: { p: Partner }) {
  const d = p.pendingDetails!;
  const row = (label: string, now: string, next: string) => (
    <tr><td className="py-1 pr-3 text-muted">{label}</td><td className="py-1 pr-3">{now}</td><td className="py-1 font-medium">{next}</td></tr>
  );
  return (
    <>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs text-muted"><th className="pb-1 font-normal" /><th className="pb-1 font-normal">On file</th><th className="pb-1 font-normal">Submitted</th></tr></thead>
        <tbody>
          {row("PAN", p.panLast4 ? `••••${p.panLast4}` : "—", d.panLast4 ? `••••${d.panLast4}` : "—")}
          {row("GSTIN", p.gstin ?? "—", d.gstin ?? "—")}
          {row("Resident in India", p.isResidentIndia ? "Yes" : "No", d.isResidentIndia ? "Yes" : "No")}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">Check against the PAN card or GST certificate the partner sent you before accepting. These change the TDS suggestion.</p>
      <div className="mt-3 flex flex-wrap gap-3">
        <ActionForm action={reviewTaxDetailsAction} submit="Verify and apply">
          <input type="hidden" name="id" value={p.id} /><input type="hidden" name="decision" value="accept" />
        </ActionForm>
        <ActionForm action={reviewTaxDetailsAction} submit="Discard" variant="secondary">
          <input type="hidden" name="id" value={p.id} /><input type="hidden" name="decision" value="discard" />
        </ActionForm>
      </div>
    </>
  );
}
