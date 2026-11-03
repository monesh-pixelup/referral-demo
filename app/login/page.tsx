import { Suspense } from "react";
import { getDataset } from "@/lib/data";
import { DEMO_STAFF } from "@/lib/data/seed";
import { demoLoginEnabled } from "@/lib/auth";
import { demoSignInAction } from "@/lib/actions/public";
import { ActionForm, control, Field } from "@/components/forms";
import { SiteHeader } from "@/components/site-header";
import { PARTNER_STATUS_LABEL } from "@/lib/types";

export const metadata = { title: "Sign in" };

export default function Page(props: PageProps<"/login">) {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-md px-4 py-12">
        <h1 className="text-[26px] font-medium tracking-tight">Sign in</h1>
        <Suspense fallback={<div className="mt-6 h-40 animate-pulse rounded-xl bg-surface-2" />}>
          <SignIn {...props} />
        </Suspense>
      </main>
    </div>
  );
}

async function SignIn({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "";
  if (!demoLoginEnabled()) {
    return <p className="mt-3 text-sm text-muted">Magic-link sign-in arrives with the Supabase connection. Demo sign-in is turned off on this deployment.</p>;
  }
  const data = await getDataset();
  const partners = data.partners.filter((p) => p.status !== "removed").sort((a, b) => a.fullName.localeCompare(b.fullName));
  return (
    <>
      <p className="mt-2 text-sm text-muted">
        Demo sign-in: pick an account, no password. With Supabase this becomes an email magic link, and admin access comes from <code className="font-mono text-xs">ADMIN_EMAILS</code>.
      </p>
      <div className="mt-6 rounded-xl border border-line bg-surface p-5">
        <ActionForm action={demoSignInAction} submit="Sign in">
          <input type="hidden" name="next" value={next} />
          <Field label="Account">
            <select name="account" className={control} defaultValue={next.startsWith("/portal") ? `partner:${partners[0]?.id}` : `staff:${DEMO_STAFF[0].email}`}>
              <optgroup label="PIXELUP team">
                {DEMO_STAFF.map((s) => <option key={s.email} value={`staff:${s.email}`}>{s.name} ({s.role})</option>)}
              </optgroup>
              <optgroup label="Partners (portal)">
                {partners.map((p) => <option key={p.id} value={`partner:${p.id}`}>{p.fullName}{p.status !== "active" ? ` (${PARTNER_STATUS_LABEL[p.status].toLowerCase()})` : ""}</option>)}
              </optgroup>
            </select>
          </Field>
        </ActionForm>
      </div>
    </>
  );
}
