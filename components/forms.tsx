"use client";

import clsx from "clsx";
import { useActionState, type ReactNode } from "react";
import { Check, CircleAlert, LoaderCircle } from "lucide-react";
import type { ActionState } from "@/lib/actions/run";
import { toast } from "./toast";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/**
 * A form bound to a Server Action with pending state and an inline result.
 * Works without JS (progressive enhancement); `confirm` asks before submitting.
 */
export function ActionForm({ action, children, submit, variant = "primary", className, confirm, footer, inlineSuccess }: {
  action: Action;
  children?: ReactNode;
  submit: string;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
  confirm?: string;
  footer?: ReactNode;
  /** Show success under the form instead of as a toast (for forms that stay on screen, like the public one). */
  inlineSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(async (prev: ActionState, fd: FormData) => {
    const res = await action(prev, fd);
    if (res?.ok && !inlineSuccess) toast(res.message);
    return res;
  }, null);
  return (
    <form action={formAction} className={clsx("space-y-3", className)}
      onSubmit={confirm ? (e) => { if (!window.confirm(confirm)) e.preventDefault(); } : undefined}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant={variant} disabled={pending}>
          {pending && <LoaderCircle className="size-3.5 animate-spin" aria-hidden />} {submit}
        </Button>
        {footer}
      </div>
      {state && (!state.ok || inlineSuccess) && !pending && <Result state={state} />}
    </form>
  );
}

function Result({ state }: { state: NonNullable<ActionState> }) {
  return (
    <p role={state.ok ? "status" : "alert"} key={state.at}
      className={clsx("flex items-start gap-1.5 text-sm", state.ok ? "text-good" : "text-bad")}>
      {state.ok ? <Check className="mt-0.5 size-4 shrink-0" aria-hidden /> : <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />}
      {state.message}
    </p>
  );
}

export function Button({ variant = "primary", className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  const style = {
    primary: "bg-ink text-surface hover:opacity-90",
    secondary: "border border-line-strong bg-surface hover:bg-surface-2",
    danger: "border border-bad/40 bg-surface text-bad hover:bg-bad-wash",
  }[variant];
  return <button {...props} className={clsx("inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors disabled:opacity-60", style, className)} />;
}

export const control = "h-9 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-muted focus:outline-2 focus:outline-offset-1 focus:outline-accent";

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={clsx("block", className)}>
      <span className="mb-1 block text-[13px] font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx(control, props.className)} />;
}

export function MoneyInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted">₹</span>
      <input inputMode="decimal" autoComplete="off" {...props} className={clsx(control, "pl-7 tabular", props.className)} />
    </div>
  );
}

export function Select({ options, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) {
  return (
    <select {...props} className={clsx(control, props.className)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={clsx(control, "h-auto py-2", props.className)} />;
}

export function Checkbox({ label, hint, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; hint?: ReactNode }) {
  return (
    <label className="flex items-start gap-2.5 text-sm">
      <input type="checkbox" {...props} className="mt-0.5 size-4 shrink-0 accent-accent" />
      <span>{label}{hint && <span className="block text-xs text-muted">{hint}</span>}</span>
    </label>
  );
}
