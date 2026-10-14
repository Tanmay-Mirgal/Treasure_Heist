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
  const toneGlows = {
    gold: "border-b-4 border-b-amber-500/80 border-amber-400/30 bg-gradient-to-b from-amber-500/10 via-card to-card shadow-[0_4px_16px_rgba(245,158,11,0.2)]",
    signal: "border-b-4 border-b-cyan-500/80 border-cyan-400/30 bg-gradient-to-b from-cyan-500/10 via-card to-card shadow-[0_4px_16px_rgba(14,165,233,0.2)]",
    warn: "border-b-4 border-b-orange-500/80 border-orange-400/30 bg-gradient-to-b from-orange-500/10 via-card to-card shadow-[0_4px_16px_rgba(249,115,22,0.2)]",
    ok: "border-b-4 border-b-emerald-500/80 border-emerald-400/30 bg-gradient-to-b from-emerald-500/10 via-card to-card shadow-[0_4px_16px_rgba(34,197,94,0.2)]",
    danger: "border-b-4 border-b-rose-500/80 border-rose-400/30 bg-gradient-to-b from-rose-500/10 via-card to-card shadow-[0_4px_16px_rgba(244,63,94,0.2)]",
    muted: "border-b-4 border-b-border/80 border-border/40 bg-card/80",
  };

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border p-4 backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5",
        toneGlows[tone],
        className,
      )}
    >
      <div className="flex items-center justify-between gap-1.5">
        <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground transition-colors group-hover:text-foreground">
          {label}
        </span>
        {icon && (
          <span className={cn("grid size-7 place-items-center rounded-xl bg-background/70 p-1.5 shadow-sm transition-transform group-hover:scale-110", TONES[tone])}>
            {icon}
          </span>
        )}
      </div>
      <div className={cn("hud-number mt-2 text-2xl font-black tracking-tight", TONES[tone])}>{value}</div>
      {hint && <div className="mt-1 text-xs font-semibold text-muted-foreground/80">{hint}</div>}
    </div>
  );
}

const ACTION_STYLE: Record<ActionType, { label: string; cls: string; Icon: typeof Coins }> = {
  NORMAL: { label: "CHECKPOINT", cls: "border-cyan-400/50 bg-cyan-950/40 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.3)]", Icon: MapPin },
  BONUS: { label: "2X MULTIPLIER", cls: "border-amber-400/70 bg-amber-950/50 text-amber-300 shadow-[0_0_14px_rgba(250,204,21,0.45)] animate-pulse", Icon: Coins },
  SUPER_SHOES: { label: "SUPER SNEAKERS", cls: "border-emerald-400/70 bg-emerald-950/50 text-emerald-300 shadow-[0_0_14px_rgba(52,211,153,0.45)]", Icon: Footprints },
  MAGNET: { label: "COIN MAGNET", cls: "border-orange-400/70 bg-orange-950/50 text-orange-300 shadow-[0_0_14px_rgba(251,146,60,0.45)]", Icon: Magnet },
  FINISH: { label: "THE VAULT", cls: "border-amber-300/80 bg-gradient-to-r from-amber-500/30 to-yellow-500/30 text-amber-200 shadow-[0_0_18px_rgba(252,211,77,0.5)] font-black", Icon: Flag },
};

export function ActionBadge({ action, className }: { action: ActionType; className?: string }) {
  const s = ACTION_STYLE[action] ?? ACTION_STYLE.NORMAL;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-[11px] font-black tracking-wider uppercase", s.cls, className)}>
      <s.Icon className="size-3.5" aria-hidden />
      {s.label}
    </span>
  );
}

export function SubwayCoinIcon({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-yellow-300 via-amber-400 to-amber-600 shadow-[0_2px_8px_rgba(245,158,11,0.7)] border border-yellow-200 select-none", className)}>
      <span className="text-[10px] font-black text-amber-950 leading-none">★</span>
    </span>
  );
}

export function CoinScore({ score, className }: { score: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border-2 border-amber-300/60 bg-gradient-to-r from-amber-500/25 via-yellow-400/30 to-amber-500/25 px-3 py-1 shadow-[0_4px_14px_rgba(245,158,11,0.4)] backdrop-blur-md transition-all hover:scale-105 active:scale-95",
        className,
      )}
    >
      <SubwayCoinIcon />
      <span className="hud-number font-heading text-sm font-black tracking-tight text-amber-300 drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">{score}</span>
      <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">COINS</span>
      <span className="sr-only">points</span>
    </span>
  );
}

/**
 * The mission card participants see with Subway Surfers street graffiti theme.
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
        "relative overflow-hidden rounded-3xl border-2 bg-gradient-to-b from-card/95 via-card/85 to-card/75 p-6 shadow-2xl backdrop-blur-xl transition-all",
        tone === "gold" && "border-amber-400/50 shadow-[0_0_35px_rgba(245,158,11,0.3)]",
        tone === "signal" && "border-cyan-400/40 shadow-[0_0_35px_rgba(6,182,212,0.25)]",
        tone !== "gold" && tone !== "signal" && "border-border/60",
      )}
    >
      {/* Subway Hazard stripe accent ribbon at top */}
      <div className="absolute inset-x-0 top-0 h-1.5 subway-hazard opacity-80" />
      
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-cyan-400">
          <span className="inline-block size-2 rounded-full bg-cyan-400 motion-safe:animate-ping" />
          <span>{eyebrow}</span>
        </div>
        <div className="flex items-center gap-2">
          {action && action !== "NORMAL" && <ActionBadge action={action} />}
        </div>
      </div>
      <h2 className="mt-3 font-heading text-2xl font-black tracking-tight text-foreground">{title}</h2>
      <div className="mt-3.5 rounded-2xl border-2 border-border/50 bg-background/80 p-4 shadow-inner">
        <p className="clue-text text-[15px] font-semibold leading-relaxed text-foreground/95">{text.trim()}</p>
      </div>
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
