/** Helpers shared by the Server Action files (which may only export actions). */
import "server-only";
import { refresh } from "next/cache";
import { withDataset } from "../data";
import { authorize, AuthError, type Permission, type SessionUser } from "../auth";
import { MutationError, type Ctx } from "../mutations";

export type ActionState = { ok: boolean; message: string; at: number } | null;

/**
 * Authorise, run a mutation against the store, refresh the page.
 * Expected failures (validation, permission) come back as a message for the
 * form; anything else (including redirect()) is rethrown.
 */
export async function runAction(
  perm: Permission | null,
  fn: (ctx: Ctx, user: SessionUser) => string,
  opts: { refresh?: boolean } = {},
): Promise<ActionState> {
  try {
    const user = await authorize(perm ?? undefined);
    const message = await withDataset((data) => fn({ data, actor: user.name, now: new Date().toISOString() }, user));
    if (opts.refresh !== false) refresh();
    return { ok: true, message, at: Date.now() };
  } catch (e) {
    return failure(e);
  }
}

export function failure(e: unknown): ActionState {
  if (e instanceof MutationError || e instanceof AuthError || e instanceof FormError) return { ok: false, message: e.message, at: Date.now() };
  throw e;
}

/* ---------- FormData parsing ---------- */

export class FormError extends Error {}

export const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
export const bool = (fd: FormData, k: string) => ["on", "true", "1"].includes(str(fd, k));
export const all = (fd: FormData, k: string) => fd.getAll(k).map(String);

export function required(fd: FormData, k: string, label: string): string {
  const v = str(fd, k);
  if (!v) throw new FormError(`${label} is required.`);
  return v;
}

export function date(fd: FormData, k: string, label: string): string {
  const v = required(fd, k, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new FormError(`${label} must be a date.`);
  return v;
}

/** "1,25,000.50" rupees → 12500050 paise. */
export function rupeesToPaise(fd: FormData, k: string, label: string, opts: { allowZero?: boolean } = {}): number {
  const raw = required(fd, k, label).replace(/[₹,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) throw new FormError(`${label} must be an amount in rupees, like 125000 or 125000.50.`);
  const paise = Math.round(Number(raw) * 100);
  if (!opts.allowZero && paise <= 0) throw new FormError(`${label} must be more than zero.`);
  return paise;
}

/** "12.5" percent → 1250 basis points of 1/10,000. */
export function percentToBp(fd: FormData, k: string, label: string): number {
  const raw = required(fd, k, label).replace("%", "");
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) throw new FormError(`${label} must be a percentage, like 12.5.`);
  return Math.round(Number(raw) * 100);
}

export function int(fd: FormData, k: string, label: string): number {
  const raw = required(fd, k, label);
  if (!/^\d+$/.test(raw)) throw new FormError(`${label} must be a whole number.`);
  return Number(raw);
}

export function oneOf<T extends string>(fd: FormData, k: string, values: readonly T[], label: string): T {
  const v = str(fd, k);
  if (!(values as readonly string[]).includes(v)) throw new FormError(`Choose a ${label.toLowerCase()}.`);
  return v as T;
}
