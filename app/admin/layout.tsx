import { Suspense } from "react";
import { AdminNav, NavView } from "@/components/admin-nav";
import { requireStaff } from "@/lib/auth";
import { getDataset, DATA_SOURCE } from "@/lib/data";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Suspense fallback={<NavView path="" />}>
        <Nav />
      </Suspense>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:py-8">
        <div className="mx-auto max-w-[1280px]">
          <Suspense fallback={<div aria-busy="true" className="h-40 animate-pulse rounded-xl bg-surface-2" />}><StaffGate>{children}</StaffGate></Suspense>
        </div>
      </main>
    </div>
  );
}

async function Nav() {
  const user = await requireStaff();
  const data = await getDataset();
  const applications = data.applications.filter((a) => a.status === "new").length;
  return <AdminNav user={{ name: user.name, role: user.role }} badges={{ applications }} demo={DATA_SOURCE === "demo"} />;
}

/** Pages render only for admin/team. proxy.ts checks the cookie first; actions check again. */
async function StaffGate({ children }: { children: React.ReactNode }) {
  await requireStaff();
  return <>{children}</>;
}
