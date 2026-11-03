import { ActionForm, Field, Input, MoneyInput, Textarea } from "@/components/forms";
import { editPayoutAction, rejectInvoiceAction, reversePayoutAction } from "@/lib/actions/admin";
import type { PartnerInvoice, Payout } from "@/lib/types";

export function PayoutFixForms({ x, latest }: { x: Payout; latest: boolean }) {
  return (
    <details>
      <summary className="cursor-pointer text-xs text-muted hover:text-ink">Fix</summary>
      <div className="mt-2 w-72 space-y-3">
        <ActionForm action={editPayoutAction} submit="Save payout" variant="secondary">
          <input type="hidden" name="payoutId" value={x.id} />
          <Field label="TDS deducted" hint="Net is recalculated"><MoneyInput name="tdsAmount" defaultValue={(x.tdsAmount / 100).toFixed(2).replace(/\.00$/, "")} required /></Field>
          <Field label="Partner invoice no."><Input name="partnerInvoiceNumber" defaultValue={x.partnerInvoiceNumber} required /></Field>
          <Field label="Bank reference (UTR)"><Input name="bankReference" defaultValue={x.bankReference} required /></Field>
          <Field label="Notes"><Textarea name="notes" rows={2} defaultValue={x.notes ?? ""} /></Field>
        </ActionForm>
        {latest ? (
          <ActionForm action={reversePayoutAction} submit="Reverse payout" variant="danger"
            confirm="Reverse this payout? Use this only if it was recorded by mistake; its lines go back to pending.">
            <input type="hidden" name="payoutId" value={x.id} />
          </ActionForm>
        ) : <p className="text-xs text-muted">Only the partner&apos;s latest payout can be reversed.</p>}
      </div>
    </details>
  );
}

export function RejectInvoiceForm({ inv }: { inv: PartnerInvoice }) {
  return (
    <details>
      <summary className="cursor-pointer text-xs text-muted hover:text-ink">Reject invoice</summary>
      <ActionForm action={rejectInvoiceAction} submit="Reject" variant="danger" className="mt-2 w-64">
        <input type="hidden" name="invoiceId" value={inv.id} />
        <Field label="Reason (the partner sees it)"><Input name="reason" required /></Field>
      </ActionForm>
    </details>
  );
}
