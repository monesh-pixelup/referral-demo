/**
 * Calendar dates are ISO strings "YYYY-MM-DD" (Postgres `date`).
 * Timestamps are ISO strings with offset (Postgres `timestamptz`).
 * All date arithmetic is done in UTC on calendar dates so it never drifts
 * with the server's timezone; "today" and timestamp→date use IST.
 */

export type ISODate = string;

const IST = "Asia/Kolkata";

function parse(d: ISODate): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

function fmt(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: ISODate, n: number): ISODate {
  const x = parse(d);
  x.setUTCDate(x.getUTCDate() + n);
  return fmt(x);
}

/** Calendar months, clamping to month end (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(d: ISODate, n: number): ISODate {
  const x = parse(d);
  const day = x.getUTCDate();
  const target = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return fmt(target);
}

/** Monday–Friday working days. Public holidays are not excluded (see DECISIONS.md). */
export function addWorkingDays(d: ISODate, n: number): ISODate {
  let x = d;
  let left = n;
  while (left > 0) {
    x = addDays(x, 1);
    const dow = parse(x).getUTCDay();
    if (dow !== 0 && dow !== 6) left--;
  }
  return x;
}

export function daysBetween(from: ISODate, to: ISODate): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / 86_400_000);
}

/** The IST calendar date of a timestamp. */
export function istDate(ts: string | Date): ISODate {
  const d = typeof ts === "string" ? new Date(ts) : ts;
  return new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function todayIST(): ISODate {
  return istDate(new Date());
}

/** Indian financial year: 1 April to 31 March. Returns the FY start year (FY 2026-27 → 2026). */
export function fyStartYear(d: ISODate): number {
  const [y, m] = d.split("-").map(Number);
  return m >= 4 ? y : y - 1;
}

export function fyRange(d: ISODate): { start: ISODate; end: ISODate; label: string } {
  const y = fyStartYear(d);
  return { start: `${y}-04-01`, end: `${y + 1}-03-31`, label: `FY ${y}-${String((y + 1) % 100).padStart(2, "0")}` };
}

export function inRange(d: ISODate, start: ISODate, end: ISODate): boolean {
  return d >= start && d <= end;
}

/** Quarterly tier reviews follow FY quarters: 1 Apr, 1 Jul, 1 Oct, 1 Jan. */
export function lastQuarterReview(d: ISODate): ISODate {
  const [y, m] = d.split("-").map(Number);
  const startMonth = [1, 4, 7, 10].filter((q) => q <= m).pop()!;
  return `${y}-${String(startMonth).padStart(2, "0")}-01`;
}

export function nextQuarterReview(d: ISODate): ISODate {
  return addMonths(lastQuarterReview(d), 3);
}

export function monthKey(d: ISODate): string {
  return d.slice(0, 7);
}

export function formatDate(d: ISODate | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(parse(d));
}

export function formatDateTime(ts: string | null | undefined): string {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: IST,
  }).format(new Date(ts)) + " IST";
}

export function formatMonth(key: string): string {
  return new Intl.DateTimeFormat("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" }).format(parse(`${key}-01`));
}
