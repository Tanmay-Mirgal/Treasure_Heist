import Image from "next/image";
import { cn } from "@/lib/utils";

/** Subway Surfers 3D Game Icon Mark */
export function HeistMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative inline-flex size-10 shrink-0 overflow-hidden rounded-2xl border-2 border-yellow-400 bg-slate-950 shadow-[0_4px_16px_rgba(245,158,11,0.5)] transition-transform duration-200 hover:scale-105 active:scale-95",
        className,
      )}
    >
      <Image
        src="/logo.png"
        alt="Subway Heist Game Logo"
        width={64}
        height={64}
        className="size-full object-cover"
        priority
      />
    </div>
  );
}

export function Wordmark({ className, tagline = false }: { className?: string; tagline?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5 select-none", className)}>
      <HeistMark className="drop-shadow-[0_4px_12px_rgba(245,158,11,0.4)]" />
      <div className="leading-tight">
        <div className="flex items-center gap-1.5 font-heading text-lg font-black tracking-wider uppercase text-foreground">
          <span className="text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">SUBWAY</span>
          <span className="bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 bg-clip-text text-transparent drop-shadow-[0_2px_8px_rgba(245,158,11,0.6)]">
            HEIST
          </span>
        </div>
        {tagline && (
          <div className="mt-0.5 flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400">
            <span>SURF THE CAMPUS TRACKS</span>
          </div>
        )}
      </div>
    </div>
  );
}
