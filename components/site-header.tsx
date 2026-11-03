import Link from "next/link";

export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 41.1885 35.6689" className={className} aria-hidden>
      <path fill="currentColor" d="M20.5938 22.9268L13.2363 35.6689L0 12.7432H14.7148L20.5938 22.9268ZM41.1885 12.7441L35.3086 22.9287L20.5947 22.9268L26.4736 12.7441H14.7158L7.3584 0H33.8301L41.1885 12.7441Z" />
    </svg>
  );
}

export function SiteHeader({ right }: { right?: React.ReactNode }) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-[1080px] items-center justify-between gap-4 px-4 py-3 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <Mark className="h-5 w-auto text-ink" />
          <span className="leading-tight">
            <span className="block text-[13px] font-bold tracking-[0.04em]">PIXELUP LABS</span>
            <span className="block font-mono text-[10px] uppercase tracking-[0.08em] text-muted">Partner program</span>
          </span>
        </Link>
        <div className="flex items-center gap-2">{right}</div>
      </div>
    </header>
  );
}
