"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useState } from "react";
import { LayoutDashboard, Users, GitBranch, IndianRupee, Wallet, ScrollText, Settings, Menu, X, Inbox, LogOut } from "lucide-react";
import { signOutAction } from "@/lib/actions/public";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/referrals", label: "Referrals", icon: GitBranch },
  { href: "/admin/partners", label: "Partners", icon: Users },
  { href: "/admin/applications", label: "Applications", icon: Inbox, badge: "applications" as const },
  { href: "/admin/payments", label: "Client payments", icon: IndianRupee },
  { href: "/admin/payouts", label: "Payouts", icon: Wallet },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 41.1885 35.6689" className={className} aria-hidden>
      <path fill="currentColor" d="M20.5938 22.9268L13.2363 35.6689L0 12.7432H14.7148L20.5938 22.9268ZM41.1885 12.7441L35.3086 22.9287L20.5947 22.9268L26.4736 12.7441H14.7158L7.3584 0H33.8301L41.1885 12.7441Z" />
    </svg>
  );
}

export interface NavUser { name: string; role: string }
interface NavProps { user?: NavUser; badges?: { applications?: number }; demo?: boolean }

export function AdminNav(props: NavProps) {
  return <NavView path={usePathname()} {...props} />;
}

/** Rendered without an active link (and without the user) while the session streams in. */
export function NavView({ path, user, badges, demo }: NavProps & { path: string }) {
  const [open, setOpen] = useState(false);
  const links = (
    <nav className="flex flex-col gap-0.5" aria-label="Admin">
      {NAV.map(({ href, label, icon: Icon, exact, badge }) => {
        const count = badge ? badges?.[badge] : undefined;
        const active = exact ? path === href : path.startsWith(href);
        return (
          <Link key={href} href={href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined}
            className={clsx("flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm transition-colors",
              active ? "bg-surface-2 font-medium text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}>
            <Icon className="size-4" aria-hidden /> {label}
            {!!count && <span className="ml-auto rounded-full bg-accent px-1.5 text-[11px] leading-[18px] font-medium text-accent-ink tabular">{count}</span>}
          </Link>
        );
      })}
    </nav>
  );
  const brand = (
    <Link href="/admin" className="flex items-center gap-2.5 px-3">
      <Mark className="h-5 w-auto text-ink" />
      <span className="leading-tight">
        <span className="block text-[13px] font-bold tracking-[0.04em]">PIXELUP LABS</span>
        <span className="block font-mono text-[10px] uppercase tracking-[0.08em] text-muted">Referral tracker</span>
      </span>
    </Link>
  );
  const userBlock = user && (
    <div className="flex items-center gap-2 px-3">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{user.name}</span>
        <span className="block font-mono text-[10px] uppercase tracking-[0.08em] text-muted">{user.role}</span>
      </span>
      <form action={signOutAction}>
        <button type="submit" aria-label="Sign out" title="Sign out" className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink"><LogOut className="size-4" /></button>
      </form>
    </div>
  );
  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-6 border-r border-line bg-surface py-5 pr-3 pl-3 lg:flex">
        {brand}
        {links}
        <div className="mt-auto space-y-3">
          {demo && (
            <div className="rounded-lg border border-dashed border-line-strong px-3 py-2.5 text-xs text-muted">
              <span className="font-medium text-ink-2">Demo data.</span> Supabase not connected yet; changes you make live in server memory until restart.
            </div>
          )}
          {userBlock}
        </div>
      </aside>
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-surface px-4 py-3 lg:hidden">
        {brand}
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Menu" className="rounded-lg p-2 hover:bg-surface-2">
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>
      {open && <div className="space-y-3 border-b border-line bg-surface p-3 lg:hidden">{links}{userBlock}</div>}
    </>
  );
}
