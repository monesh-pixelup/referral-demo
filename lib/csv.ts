export interface Column<T> { header: string; value: (row: T) => string | number | boolean | null | undefined }

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  // Guard against CSV formula injection when opened in Excel/Sheets.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function toCSV<T>(rows: T[], columns: Column<T>[]): string {
  const head = columns.map((c) => cell(c.header)).join(",");
  const body = rows.map((r) => columns.map((c) => cell(c.value(r))).join(","));
  return [head, ...body].join("\r\n") + "\r\n";
}

/** Rupees with 2 decimals, no grouping or symbol, so spreadsheets read it as a number. */
export const csvRupees = (paise: number) => (paise / 100).toFixed(2);
