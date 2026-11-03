import { ActionForm, Field, Input, MoneyInput } from "@/components/forms";
import { submitInvoiceAction, withdrawInvoiceAction } from "@/lib/actions/portal";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import type { PartnerInvoice } from "@/lib/types";
import { Card, Tag } from "@/components/ui";

/** "Get paid": the partner invoices what they're owed; the admin pays it in the next run. */
export function InvoiceCard({ owed, open, lastRejected, today, suggestedNumber }: {
  owed: number; open: PartnerInvoice | null; lastRejected: PartnerInvoice | null; today: string; suggestedNumber: string;
}) {
  return (
    <Card title="Get paid" subtitle="Send an invoice for what you're owed. We pay it in the next payout run (1st and 16th).">
      {open ? (
        <div className="space-y-3 text-sm">
          <p><Tag tone="warn">Waiting for payment</Tag> Invoice <span className="font-medium">{open.invoiceNumber}</span> for {formatINR(open.amount)}, issued {formatDate(open.issuedOn)}.</p>
          {open.amount !== owed && owed > 0 && <p className="text-xs text-warn">You&apos;re now owed {formatINR(owed)}. Withdraw this invoice and send a new one if you&apos;d like it to match.</p>}
          <ActionForm action={withdrawInvoiceAction} submit="Withdraw invoice" variant="secondary" confirm="Withdraw this invoice?">
            <input type="hidden" name="invoiceId" value={open.id} />
          </ActionForm>
        </div>
      ) : owed <= 0 ? (
        <p className="text-sm text-muted">Nothing is owed right now. Commission appears here as your clients pay.</p>
      ) : (
        <>
          {lastRejected && <p className="mb-3 rounded-lg bg-bad-wash px-3 py-2 text-sm text-bad">Invoice {lastRejected.invoiceNumber} was returned: {lastRejected.rejectReason}</p>}
          <ActionForm action={submitInvoiceAction} submit={`Send invoice`}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Invoice number"><Input name="invoiceNumber" defaultValue={suggestedNumber} required /></Field>
              <Field label="Amount" hint={`You're owed ${formatINR(owed)}`}><MoneyInput name="amount" defaultValue={(owed / 100).toFixed(2).replace(/\.00$/, "")} required /></Field>
              <Field label="Invoice date"><Input type="date" name="issuedOn" defaultValue={today} max={today} required /></Field>
            </div>
            <Field label="Note (optional)"><Input name="notes" placeholder="e.g. GST invoice attached by email" /></Field>
          </ActionForm>
        </>
      )}
    </Card>
  );
}
