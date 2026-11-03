/** Money is always integer paise. Display as INR with Indian digit grouping. */

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inrPaise = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ₹1,25,000 — whole rupees, unless the amount has paise. */
export function formatINR(paise: number, opts: { exact?: boolean } = {}): string {
  const hasPaise = paise % 100 !== 0;
  return (opts.exact || hasPaise ? inrPaise : inr).format(paise / 100);
}

/** ₹12.5L / ₹1.2Cr for chart axes and tight tiles. */
export function formatINRCompact(paise: number): string {
  const r = paise / 100;
  const abs = Math.abs(r);
  if (abs >= 1_00_00_000) return `₹${trim(r / 1_00_00_000)}Cr`;
  if (abs >= 1_00_000) return `₹${trim(r / 1_00_000)}L`;
  if (abs >= 1_000) return `₹${trim(r / 1_000)}K`;
  return `₹${Math.round(r)}`;
}

function trim(n: number): string {
  return n.toFixed(n >= 100 ? 0 : 1).replace(/\.0$/, "");
}

export function rupees(r: number): number {
  return Math.round(r * 100);
}

/** Apply a rate in 1/10,000 units, rounding half away from zero to the nearest paisa. */
export function applyRate(paise: number, rateBp: number): number {
  const sign = paise < 0 ? -1 : 1;
  return sign * Math.round((Math.abs(paise) * rateBp) / 10_000);
}

export function formatRate(rateBp: number): string {
  return `${(rateBp / 100).toFixed(rateBp % 100 === 0 ? 0 : 1)}%`;
}
