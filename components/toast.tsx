"use client";

import { useSyncExternalStore } from "react";
import { Check, X } from "lucide-react";

/**
 * Success toasts that outlive the form that raised them: a successful action
 * often re-renders the page without that form (e.g. "Approve" disappears once
 * approved), so the confirmation is shown here, in the root layout.
 */
type Toast = { id: number; message: string };
let toasts: Toast[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(message: string) {
  const t = { id: ++seq, message };
  toasts = [...toasts.slice(-2), t];
  emit();
  setTimeout(() => dismiss(t.id), 5000);
}

function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const EMPTY: Toast[] = [];

export function Toaster() {
  const items = useSyncExternalStore(subscribe, () => toasts, () => EMPTY);
  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 left-4 z-50 flex flex-col items-end gap-2 sm:left-auto">
      {items.map((t) => (
        <div key={t.id} data-toast className="pointer-events-auto flex max-w-sm items-start gap-2 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm shadow-lg">
          <Check className="mt-0.5 size-4 shrink-0 text-good" aria-hidden />
          <span className="flex-1">{t.message}</span>
          <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-muted hover:text-ink"><X className="size-4" /></button>
        </div>
      ))}
    </div>
  );
}
