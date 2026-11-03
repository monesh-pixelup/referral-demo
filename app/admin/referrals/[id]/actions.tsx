import { ActionForm, Checkbox, Field, Input, MoneyInput, Select, Textarea } from "@/components/forms";
import {
  advanceReferralAction, approveReferralAction, declineReferralAction, logPaymentAction, markLostAction, markWonAction,
  recordRefundAction, saveReferralNotesAction, revertStageAction, editReferralAction, editPaymentAction, deletePaymentAction, undoRefundAction,
} from "@/lib/actions/admin";
import { CONFIRM_KEYS, nextStage } from "@/lib/mutations";
import { formatDate } from "@/lib/dates";
import { NEED_LABEL, STAGE_LABEL, type ClientPayment, type Partner, type Referral } from "@/lib/types";
import type { CheckItem } from "@/lib/commission";
import { programConfig } from "@/lib/program-config";

const DECLINE_REASONS = [
  "Already a client within the last 12 months",
  "Already in active conversation with our team",
  "Duplicate: registered earlier by another partner",
  "Self-referral",
  "Cold list, not a warm introduction",
  "Outside our service area",
];
const LOST_REASONS = ["Chose an in-house team", "Budget moved to next year", "Went with a lower-cost agency", "Project paused", "No response after proposal"];

/** Approve (with the manual checklist ticks) or decline. Admin only. */
export function DecisionForms({ r, checklist }: { r: Referral; checklist: CheckItem[] }) {
  const blocked = checklist.filter((c) => c.state === "fail");
  return (
    <div className="mt-4 space-y-4 border-t border-line pt-4">
      {blocked.length === 0 ? (
        <ActionForm action={approveReferralAction} submit="Approve referral">
          <input type="hidden" name="id" value={r.id} />
          {checklist.filter((c) => (CONFIRM_KEYS as readonly string[]).includes(c.key)).map((c) => (
            <Checkbox key={c.key} name="confirm" value={c.key} label={`I've confirmed: ${c.label.toLowerCase()}`} />
          ))}
        </ActionForm>
      ) : (
        <p className="text-sm text-bad">Can&apos;t be approved: {blocked.map((c) => c.label.toLowerCase()).join("; ")}.</p>
      )}
      <details className="group" open={blocked.length > 0}>
        <summary className="cursor-pointer text-sm font-medium text-ink-2 hover:text-ink">Decline…</summary>
        <ActionForm action={declineReferralAction} submit="Decline referral" variant="danger" className="mt-3">
          <input type="hidden" name="id" value={r.id} />
          <Field label="Reason (the partner sees this)">
            <Input name="reason" list="decline-reasons" required defaultValue={r.duplicateOf ? DECLINE_REASONS[2] : blocked.some((b) => b.key === "self") ? DECLINE_REASONS[3] : ""} />
            <datalist id="decline-reasons">{DECLINE_REASONS.map((x) => <option key={x} value={x} />)}</datalist>
          </Field>
        </ActionForm>
      </details>
    </div>
  );
}

/** Pipeline moves for approved → proposal, plus won / lost. Admin and team. */
export function PipelineForms({ r, partner, today }: { r: Referral; partner: Partner; today: string }) {
  const next = nextStage(r.stage);
  const canWin = ["introduced", "discovery", "proposal"].includes(r.stage);
  return (
    <div className="space-y-4">
      {next && (
        <ActionForm action={advanceReferralAction} submit={`Move to ${STAGE_LABEL[next]}`}>
          <input type="hidden" name="id" value={r.id} />
          {next === "introduced" ? (
            <Field label="Introduction date" hint={`Starts the ${programConfig.attributionWindowMonths}-month attribution window.`}>
              <Input type="date" name="introducedAt" defaultValue={today} max={today} required />
            </Field>
          ) : (
            <Field label="Note (optional)"><Input name="note" placeholder={next === "proposal" ? "Proposal sent" : "Discovery call held"} /></Field>
          )}
        </ActionForm>
      )}
      {canWin && (
        <details className="border-t border-line pt-4">
          <summary className="cursor-pointer text-sm font-medium text-ink-2 hover:text-ink">Mark won…</summary>
          <ActionForm action={markWonAction} submit="Mark won and lock rate" className="mt-3">
            <input type="hidden" name="id" value={r.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Contract signed on" hint={r.attributionExpiresAt ? `Attribution ends ${formatDate(r.attributionExpiresAt)}` : undefined}>
                <Input type="date" name="signedAt" defaultValue={today} max={today} min={r.introducedAt ?? undefined} required />
              </Field>
              <Field label="First contract, net of GST"><MoneyInput name="firstContractValue" placeholder="5,00,000" required /></Field>
            </div>
            {partner.partnerType === "vc_accelerator" && (
              <Checkbox name="vcDiscount" label="Give the commission to the client as a discount" hint="VC option: no cash payout on this referral." />
            )}
          </ActionForm>
        </details>
      )}
      {(canWin || r.stage === "approved") && (
        <details className="border-t border-line pt-4">
          <summary className="cursor-pointer text-sm font-medium text-ink-2 hover:text-ink">Mark lost…</summary>
          <ActionForm action={markLostAction} submit="Mark lost" variant="danger" className="mt-3">
            <input type="hidden" name="id" value={r.id} />
            <Field label="Reason">
              <Input name="reason" list="lost-reasons" required />
              <datalist id="lost-reasons">{LOST_REASONS.map((x) => <option key={x} value={x} />)}</datalist>
            </Field>
          </ActionForm>
        </details>
      )}
    </div>
  );
}

export function NotesForm({ r }: { r: Referral }) {
  return (
    <ActionForm action={saveReferralNotesAction} submit="Save notes" variant="secondary">
      <input type="hidden" name="id" value={r.id} />
      <Textarea name="notes" defaultValue={r.internalNotes ?? ""} placeholder="Visible to the PIXELUP team only" aria-label="Internal notes" />
    </ActionForm>
  );
}

export function LogPaymentForm({ r, today }: { r: Referral; today: string }) {
  return (
    <ActionForm action={logPaymentAction} submit="Log payment">
      <input type="hidden" name="referralId" value={r.id} />
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Received on"><Input type="date" name="receivedOn" defaultValue={today} max={today} min={r.signedAt ?? undefined} required /></Field>
        <Field label="Net amount" hint="Excluding GST"><MoneyInput name="netAmount" required /></Field>
        <Field label="Kind">
          <Select name="kind" options={[{ value: "milestone", label: "Milestone" }, { value: "retainer", label: "Retainer" }, { value: "repeat_work", label: "Repeat work" }]} />
        </Field>
        <Field label="Our invoice no."><Input name="invoiceNumber" placeholder="PXL-2611-0123" /></Field>
      </div>
    </ActionForm>
  );
}

export function RefundForm({ p, today }: { p: ClientPayment; today: string }) {
  return (
    <details>
      <summary className="cursor-pointer text-xs text-muted hover:text-ink">Record refund</summary>
      <ActionForm action={recordRefundAction} submit="Record refund" variant="danger" className="mt-2 w-64"
        confirm="Record this refund? Commission is voided or clawed back automatically.">
        <input type="hidden" name="paymentId" value={p.id} />
        <Field label="Refunded on"><Input type="date" name="refundedOn" defaultValue={today} min={p.receivedOn} max={today} required /></Field>
        <Field label="Amount refunded"><MoneyInput name="amount" defaultValue={(p.netAmount / 100).toFixed(2).replace(/\.00$/, "")} required /></Field>
      </ActionForm>
    </details>
  );
}

/* ---------- corrections (admin) ---------- */

export function CorrectionsForms({ r, canRevert }: { r: Referral; canRevert: boolean }) {
  return (
    <div className="space-y-4">
      {canRevert && (
        <ActionForm action={revertStageAction} submit={`Undo "${STAGE_LABEL[r.stage]}"`} variant="secondary"
          confirm={r.stage === "won" ? "Undo the win? The locked rate and signing details are cleared." : "Move this referral back one stage?"}>
          <input type="hidden" name="id" value={r.id} />
          <p className="text-xs text-muted">Moves it back to the previous stage if this one was set by mistake.</p>
        </ActionForm>
      )}
      <details className={canRevert ? "border-t border-line pt-4" : ""}>
        <summary className="cursor-pointer text-sm font-medium text-ink-2 hover:text-ink">Edit company and contact…</summary>
        <ActionForm action={editReferralAction} submit="Save details" variant="secondary" className="mt-3">
          <input type="hidden" name="id" value={r.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Company"><Input name="companyName" defaultValue={r.companyName} readOnly={r.stage !== "registered"} required /></Field>
            <Field label="Website" hint={r.stage !== "registered" ? "Locked after the decision" : undefined}><Input name="companyDomain" defaultValue={r.companyDomain} readOnly={r.stage !== "registered"} /></Field>
            <Field label="Contact name"><Input name="contactName" defaultValue={r.contactName} /></Field>
            <Field label="Contact email"><Input type="email" name="contactEmail" defaultValue={r.contactEmail} /></Field>
            <Field label="Contact role"><Input name="contactRole" defaultValue={r.contactRole} /></Field>
            <Field label="Need"><Select name="need" defaultValue={r.need} options={Object.entries(NEED_LABEL).map(([value, label]) => ({ value, label }))} /></Field>
          </div>
        </ActionForm>
      </details>
    </div>
  );
}

export function PaymentFixForms({ p, today, signedAt }: { p: ClientPayment; today: string; signedAt: string | null }) {
  return (
    <details>
      <summary className="cursor-pointer text-xs text-muted hover:text-ink">Fix</summary>
      <div className="mt-2 w-72 space-y-3">
        {p.refunded ? (
          <ActionForm action={undoRefundAction} submit="Undo refund" variant="secondary" confirm="Undo this refund? Its commission adjustment is removed.">
            <input type="hidden" name="paymentId" value={p.id} />
          </ActionForm>
        ) : (
          <>
            <ActionForm action={editPaymentAction} submit="Save payment" variant="secondary">
              <input type="hidden" name="paymentId" value={p.id} />
              <Field label="Received on"><Input type="date" name="receivedOn" defaultValue={p.receivedOn} min={signedAt ?? undefined} max={today} required /></Field>
              <Field label="Net amount"><MoneyInput name="netAmount" defaultValue={(p.netAmount / 100).toFixed(2).replace(/\.00$/, "")} required /></Field>
              <Field label="Kind"><Select name="kind" defaultValue={p.kind} options={[{ value: "milestone", label: "Milestone" }, { value: "retainer", label: "Retainer" }, { value: "repeat_work", label: "Repeat work" }]} /></Field>
              <Field label="Invoice no."><Input name="invoiceNumber" defaultValue={p.invoiceNumber} /></Field>
            </ActionForm>
            <ActionForm action={deletePaymentAction} submit="Delete payment" variant="danger" confirm="Delete this payment and its unpaid commission?">
              <input type="hidden" name="paymentId" value={p.id} />
            </ActionForm>
          </>
        )}
      </div>
    </details>
  );
}
