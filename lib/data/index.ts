/**
 * Data access. Today this is an in-memory demo store built from lib/data/seed.ts.
 * Reads go through getDataset(); writes go through withDataset(), which runs a
 * lib/mutations function against the same store.
 *
 * When Supabase is connected: getDataset() becomes Drizzle queries returning
 * the same Dataset shape, and withDataset() runs the mutation inside a
 * transaction and writes the changed rows (DECISIONS.md D-02, D-18).
 *
 * Demo caveat: the store lives in server memory, so writes reset when the
 * server restarts (and are per-instance on serverless hosts).
 */
import "server-only";
import { connection } from "next/server";
import { todayIST } from "../dates";
import type { Dataset } from "../types";
import { buildDemoDataset } from "./seed";
import { applyProgramConfig, DEFAULT_PROGRAM_CONFIG } from "../program-config";

// Kept on globalThis so dev hot reloads don't wipe demo writes.
const store = globalThis as unknown as { __pxlDemo?: Dataset };

function current(): Dataset {
  const today = todayIST();
  if (!store.__pxlDemo) store.__pxlDemo = buildDemoDataset(today);
  store.__pxlDemo.today = today;
  return store.__pxlDemo;
}

/** Request-time data: awaits connection() so pages render dynamically. */
export async function getDataset(): Promise<Dataset> {
  await connection();
  return current();
}

/** Run a write against the store. Mutations validate before changing anything. */
export async function withDataset<T>(fn: (data: Dataset) => T): Promise<T> {
  return fn(current());
}

/** Demo only: throw away all writes (and settings changes) and rebuild the seed data. */
export async function resetDemoData(): Promise<void> {
  applyProgramConfig(DEFAULT_PROGRAM_CONFIG);
  store.__pxlDemo = buildDemoDataset(todayIST());
}

export const DATA_SOURCE = "demo" as const;
