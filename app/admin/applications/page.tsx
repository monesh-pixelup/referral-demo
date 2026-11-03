import Link from "next/link";
import { Suspense } from "react";
import clsx from "clsx";
import { getStaffDataset } from "@/lib/auth";
import { can, requireStaff } from "@/lib/auth";
import { approveApplicationAction, rejectApplicationAction } from "@/lib/actions/admin";
import { formatDateTime } from "@/lib/dates";
import { PARTNER_TYPE_LABEL, type ApplicationStatus } from "@/lib/types";
import { ActionForm, Field, Input } from "@/components/forms";
import { Card, Empty, Label, PageHeader, Tag } from "@/components/ui";

export const metadata = { title: "Applications" };

export default function Page(props: PageProps<"/admin/applications">) {
  return <Suspense fallback={<PageHeader title="Applications" />}><Applications {...props} /></Suspense>;
}

const TABS: { value: ApplicationStatus; label: string }[] = [{ value: "new", label: "To review" }, { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" }];

async function Applications({ searchParams }: PageProps<"/admin/applications">) {
  const sp = await searchParams;
  const [data, user] = await Promise.all([getStaffDataset(), requireStaff()]);
  const canReview = can(user.role, "application.review");
  const status = (TABS.find((t) => t.value === sp.status)?.value ?? "new") as ApplicationStatus;
  const apps = data.applications.filter((a) => a.status === status).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <>
      <PageHeader title="Applications" description="People who applied on the public page. Approving creates the partner; record the signed agreement on their page."
        actions={
          <div className="inline-flex rounded-lg border border-line-strong bg-surface p-0.5 text-sm" role="tablist">
            {TABS.map((t) => (
              <Link key={t.value} href={t.value === "new" ? "/admin/applications" : `/admin/applications?status=${t.value}`} role="tab" aria-selected={status === t.value}
                className={clsx("rounded-md px-3 py-1", status === t.value ? "bg-ink text-surface" : "text-ink-2 hover:text-ink")}>
                {t.label} <span className="tabular opacity-70">{data.applications.filter((a) => a.status === t.value).length}</span>
              </Link>
            ))}
          </div>
        } />

      {apps.length === 0 ? <Card><Empty>No applications here.</Empty></Card> : (
        <div className="space-y-4">
          {apps.map((a) => {
            const partner = a.partnerId ? data.partners.find((p) => p.id === a.partnerId) : null;
            return (
              <Card key={a.id} title={a.fullName} subtitle={<>{a.email}{a.phone && ` · ${a.phone}`} · applied {formatDateTime(a.createdAt)}</>}
                actions={<Tag tone={a.status === "approved" ? "good" : a.status === "rejected" ? "neutral" : "info"}>{PARTNER_TYPE_LABEL[a.partnerType]}</Tag>}>
                <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                  <div><dt><Label>Company</Label></dt><dd className="mt-0.5">{a.company || "—"}</dd></div>
                  <div><dt><Label>Country</Label></dt><dd className="mt-0.5">{a.country}</dd></div>
                  <div><dt><Label>LinkedIn</Label></dt><dd className="mt-0.5 truncate">{a.linkedinUrl ? <a className="underline underline-offset-2" href={a.linkedinUrl} target="_blank" rel="noreferrer noopener">{a.linkedinUrl.replace(/^https?:\/\/(www\.)?/, "")}</a> : "—"}</dd></div>
                  <div className="sm:col-span-3"><dt><Label>How they know potential clients</Label></dt><dd className="mt-0.5 text-ink-2">{a.howTheyKnowClients || "—"}</dd></div>
                </dl>
                {a.status !== "new" && (
                  <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
                    {a.status === "approved" ? "Approved" : "Rejected"} by {a.reviewedBy} {formatDateTime(a.reviewedAt)}
                    {a.rejectReason && <> · {a.rejectReason}</>}
                    {partner && <> · <Link className="underline underline-offset-2 hover:text-ink" href={`/admin/partners/${partner.id}`}>Open partner</Link></>}
                  </p>
                )}
                {a.status === "new" && canReview && (
                  <div className="mt-4 flex flex-wrap items-start gap-6 border-t border-line pt-4">
                    <ActionForm action={approveApplicationAction} submit="Approve and create partner">
                      <input type="hidden" name="id" value={a.id} />
                    </ActionForm>
                    <details>
                      <summary className="cursor-pointer pt-1.5 text-sm font-medium text-ink-2 hover:text-ink">Reject…</summary>
                      <ActionForm action={rejectApplicationAction} submit="Reject" variant="danger" className="mt-3 w-80">
                        <input type="hidden" name="id" value={a.id} />
                        <Field label="Reason (sent to the applicant)"><Input name="reason" required /></Field>
                      </ActionForm>
                    </details>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
