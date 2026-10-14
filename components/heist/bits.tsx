import type { ReactNode } from "react";
import { Coins, Flag, Footprints, Magnet, MapPin, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActionType } from "@/lib/game/types";

export function TrackDivider({ className }: { className?: string }) {
  return <div role="presentation" className={cn("track-divider my-4", className)} />;
}

const TONES = {
  gold: "text-gold",
  signal: "text-signal",
  warn: "text-warn",
  ok: "text-ok",
  danger: "text-danger",
  muted: "text-muted-foreground",
} as const;
export type Tone = keyof typeof TONES;

export function SignalDot({ tone = "signal", className, pulse }: { tone?: Tone; className?: string; pulse?: boolean }) {
  return <span aria-hidden className={cn("signal-dot", TONES[tone], pulse && "motion-safe:animate-pulse", className)} />;
}

export function StatTile({
  label,
  value,
  hint,
  tone = "signal",
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border bg-card/70 p-3.5", className)}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {icon && <span className={TONES[tone]}>{icon}</span>}
        {label}
      </div>
      <div className={cn("hud-number mt-1 text-2xl font-semibold", TONES[tone])}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

const ACTION_STYLE: Record<ActionType, { label: string; cls: string; Icon: typeof Coins }> = {
  NORMAL: { label: "Checkpoint", cls: "border-signal/30 bg-signal/10 text-signal", Icon: MapPin },
  BONUS: { label: "BONUS", cls: "border-gold/35 bg-gold/10 text-gold", Icon: Coins },
  SUPER_SHOES: { label: "SUPER SHOES", cls: "border-ok/35 bg-ok/10 text-ok", Icon: Footprints },
  MAGNET: { label: "MAGNET", cls: "border-warn/35 bg-warn/10 text-warn", Icon: Magnet },
  FINISH: { label: "VAULT", cls: "border-gold/45 bg-gold/15 text-gold", Icon: Flag },
};

export function ActionBadge({ action, className }: { action: ActionType; className?: string }) {
  const s = ACTION_STYLE[action] ?? ACTION_STYLE.NORMAL;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide", s.cls, className)}>
      <s.Icon className="size-3" aria-hidden />
      {s.label}
    </span>
  );
}

export function CoinScore({ score, className }: { score: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 text-gold", className)}>
      <Coins className="size-4" aria-hidden />
      <span className="hud-number text-sm font-semibold">{score}</span>
      <span className="sr-only">points</span>
    </span>
  );
}

/**
 * The mission card participants see. Also used by the organizer clue editor
 * as an exact preview.
 */
export function MissionCard({
  eyebrow,
  title,
  text,
  action,
  footer,
  tone = "signal",
  testMode,
}: {
  eyebrow: string;
  title: string;
  text: string;
  action?: ActionType | null;
  footer?: ReactNode;
  tone?: Tone;
  testMode?: boolean;
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-card p-5 shadow-[0_0_0_1px_oklch(1_0_0/3%)]",
        tone === "gold" && "border-gold/30",
        tone === "signal" && "border-signal/25",
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-signal/60 to-transparent" />
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        <Sparkles className="size-3.5 text-signal" aria-hidden />
        {eyebrow}
        {action && action !== "NORMAL" && <ActionBadge action={action} />}
        {testMode && <span className="rounded bg-warn/15 px-1.5 py-0.5 text-[10px] tracking-wider text-warn">TEST MODE</span>}
      </div>
      <h2 className="mt-2 font-heading text-xl font-semibold">{title}</h2>
      <p className="clue-text mt-3 text-[15px] leading-relaxed text-foreground/95">{text.trim()}</p>
      {footer && <div className="mt-4">{footer}</div>}
    </section>
  );
}

export function EmptyState({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed p-6 text-center">
      {icon && <div className="mx-auto mb-2 flex justify-center text-muted-foreground">{icon}</div>}
      <div className="font-medium">{title}</div>
      {children && <div className="mt-1 text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

export function PageTitle({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-wide">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function formatTime(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function formatDateTime(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
