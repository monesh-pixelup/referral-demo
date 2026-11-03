import { Suspense } from "react";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { requirePartner } from "@/lib/auth";
import { signOutAction } from "@/lib/actions/public";
import { SiteHeader } from "@/components/site-header";

export default function PortalLayout({ children }: LayoutProps<"/portal">) {
  return (
    <div className="min-h-screen">
      <SiteHeader right={<Suspense><UserMenu /></Suspense>} />
      <main className="mx-auto max-w-[1080px] px-4 py-6 sm:px-8 lg:py-8">
        <Suspense fallback={<div aria-busy="true" className="h-40 animate-pulse rounded-xl bg-surface-2" />}><PartnerGate>{children}</PartnerGate></Suspense>
      </main>
    </div>
  );
}

async function UserMenu() {
  const user = await requirePartner();
  return (
    <>
      <span className="hidden text-sm font-medium md:block">{user.name}</span>
      <Link href="/portal" className="inline-flex h-8 items-center rounded-lg px-2.5 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink">Overview</Link>
      <Link href="/portal/details" className="inline-flex h-8 items-center rounded-lg px-2.5 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink">My details</Link>
      <form action={signOutAction}>
        <button type="submit" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink"><LogOut className="size-4" aria-hidden /> <span className="hidden sm:inline">Sign out</span></button>
      </form>
    </>
  );
}

/** Only partners reach the portal; every query below is scoped to the session's partner id. */
async function PartnerGate({ children }: { children: React.ReactNode }) {
  await requirePartner();
  return <>{children}</>;
}
