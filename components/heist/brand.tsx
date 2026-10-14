import { cn } from "@/lib/utils";

/** Original mark: a vault dial crossed by two rails. */
export function HeistMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={cn("size-9", className)}>
      <rect x="1.5" y="1.5" width="45" height="45" rx="11" fill="var(--surface-2)" stroke="var(--rail)" />
      <path d="M6 33h36M6 38h36" stroke="var(--rail)" strokeWidth="1.5" />
      <path d="M11 31v9M17 31v9M23 31v9M29 31v9M35 31v9" stroke="var(--rail)" strokeWidth="1.2" />
      <circle cx="24" cy="19" r="11" fill="none" stroke="var(--gold)" strokeWidth="2.5" />
      <circle cx="24" cy="19" r="4" fill="var(--gold)" />
      <path d="M24 8v4M24 26v4M13 19h4M31 19h4" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" />
      <path d="M24 19l5.5-5.5" stroke="var(--signal)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ className, tagline = false }: { className?: string; tagline?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <HeistMark />
      <div className="leading-none">
        <div className="font-heading text-lg font-bold tracking-[0.18em] text-foreground">
          THE <span className="text-gold">HEIST</span>
        </div>
        {tagline && (
          <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.32em] text-muted-foreground">
            Decode · Discover · Escape
          </div>
        )}
      </div>
    </div>
  );
}
