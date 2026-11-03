/**
 * Shared plumbing for write operations.
 *
 * Every mutation is a plain function over a Dataset: it validates first, then
 * changes rows and appends audit entries. Nothing is changed when validation
 * fails, so a thrown MutationError leaves the data as it was. With Supabase,
 * the same functions run inside one database transaction (DECISIONS.md D-18).
 */
import { randomUUID } from "node:crypto";
import type { AuditEntry, Dataset } from "../types";

export class MutationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MutationError";
  }
}

export interface Ctx {
  data: Dataset;
  /** Display name recorded in the audit log and on stage changes. */
  actor: string;
  /** Current timestamp (ISO). `data.today` is its IST date. */
  now: string;
}

export const newId = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 12)}`;

export function audit(ctx: Ctx, table: string, rowId: string, action: AuditEntry["action"], before: unknown, after: unknown) {
  ctx.data.audit.unshift({ id: newId("aud"), actor: ctx.actor, table, rowId, action, before, after, at: ctx.now });
}

export function fail(message: string): never {
  throw new MutationError(message);
}

export function find<T extends { id: string }>(rows: T[], id: string, what: string): T {
  const row = rows.find((r) => r.id === id);
  if (!row) fail(`${what} not found`);
  return row;
}

/** Shallow before/after of only the fields that changed, for the audit log. */
export function diff<T extends object>(before: T, after: Partial<T>): { before: Partial<T>; after: Partial<T> } {
  const b: Partial<T> = {};
  const a: Partial<T> = {};
  for (const k of Object.keys(after) as (keyof T)[]) {
    if (before[k] !== after[k]) { b[k] = before[k]; a[k] = after[k]; }
  }
  return { before: b, after: a };
}
