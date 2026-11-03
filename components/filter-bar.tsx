"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";

export interface FilterDef {
  name: string;
  label: string;
  options?: { value: string; label: string }[];
  type?: "select" | "date" | "search";
}

/** One row of filters above the content; every change is reflected in the URL so lists are linkable. */
export function FilterBar({ filters, keep = [] }: { filters: FilterDef[]; keep?: string[] }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();

  const set = (name: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(name, value); else next.delete(name);
    router.replace(`${path}${next.size ? `?${next}` : ""}`, { scroll: false });
  };
  const active = filters.some((f) => params.get(f.name));
  const clear = () => {
    const next = new URLSearchParams();
    for (const k of keep) { const v = params.get(k); if (v) next.set(k, v); }
    router.replace(`${path}${next.size ? `?${next}` : ""}`, { scroll: false });
  };

  const control = "h-8 rounded-lg border border-line-strong bg-surface px-2.5 text-sm text-ink focus:outline-2 focus:outline-accent";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {filters.map((f) => {
        const value = params.get(f.name) ?? "";
        if (f.type === "date") {
          return (
            <label key={f.name} className="flex items-center gap-1.5 text-xs text-muted">
              {f.label}
              <input type="date" value={value} onChange={(e) => set(f.name, e.target.value)} className={control} />
            </label>
          );
        }
        if (f.type === "search") {
          return (
            <input key={f.name} type="search" placeholder={f.label} aria-label={f.label} defaultValue={value}
              onKeyDown={(e) => { if (e.key === "Enter") set(f.name, (e.target as HTMLInputElement).value); }}
              onBlur={(e) => { if (e.target.value !== value) set(f.name, e.target.value); }}
              className={`${control} w-44`} />
          );
        }
        return (
          <select key={f.name} aria-label={f.label} value={value} onChange={(e) => set(f.name, e.target.value)} className={control}>
            <option value="">{f.label}: all</option>
            {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        );
      })}
      {active && (
        <button type="button" onClick={clear} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-sm text-ink-2 hover:bg-surface-2">
          <X className="size-3.5" aria-hidden /> Clear
        </button>
      )}
    </div>
  );
}
