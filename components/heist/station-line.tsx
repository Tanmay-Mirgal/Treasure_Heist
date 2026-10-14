import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Progress drawn as an authentic Subway Surfers railway track with railroad sleepers,
 * glowing steel rails, and an animated hoverboard indicator for the active station.
 */
export function StationLine({ completed, total, finished }: { completed: number; total: number; finished: boolean }) {
  if (total <= 0) return null;
  const progressPercent = total > 1 ? (Math.min(completed, total - 1) / (total - 1)) * 100 : 0;

  return (
    <div className="relative pt-7 pb-3 px-1" role="img" aria-label={`${completed} of ${total} stations cleared`}>
      {/* Railroad Sleepers / Ties Pattern */}
      <div className="absolute inset-x-2 top-[calc(50%+14px)] h-5 -translate-y-1/2 opacity-40 bg-[repeating-linear-gradient(90deg,#94A3B8_0px,#94A3B8_3px,transparent_3px,transparent_14px)]" />

      {/* Two Steel Rail Bars (Subway Tracks) */}
      <div className="absolute inset-x-2 top-[calc(50%+10px)] h-1 rounded-full bg-slate-700 shadow-inner" />
      <div className="absolute inset-x-2 top-[calc(50%+18px)] h-1 rounded-full bg-slate-700 shadow-inner" />

      {/* Active Glowing Electric Subway Rail Progress */}
      <div
        className="absolute left-2 top-[calc(50%+10px)] h-1 rounded-full bg-gradient-to-r from-cyan-400 via-emerald-400 to-amber-400 shadow-[0_0_10px_rgba(6,182,212,0.8)] transition-all duration-700 ease-out"
        style={{ width: `calc((100% - 1rem) * ${progressPercent / 100})` }}
      />
      <div
        className="absolute left-2 top-[calc(50%+18px)] h-1 rounded-full bg-gradient-to-r from-cyan-400 via-emerald-400 to-amber-400 shadow-[0_0_10px_rgba(6,182,212,0.8)] transition-all duration-700 ease-out"
        style={{ width: `calc((100% - 1rem) * ${progressPercent / 100})` }}
      />

      <ol className="relative flex justify-between">
        {Array.from({ length: total }, (_, i) => {
          const n = i + 1;
          const done = n <= completed;
          const current = !finished && n === completed + 1;
          const last = n === total;

          return (
            <li key={n} className="group relative grid place-items-center">
              {/* Mini Subway Surfers Hoverboard icon surfing on active station */}
              {current && (
                <div className="absolute -top-7 animate-hoverboard flex flex-col items-center">
                  <span className="text-xs filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">🛹</span>
                  <span className="size-1 rounded-full bg-cyan-400 animate-ping" />
                </div>
              )}

              {/* Station Node Badge */}
              <span
                className={cn(
                  "relative grid place-items-center rounded-xl border-2 text-[10px] font-black transition-all duration-300 shadow-md",
                  last ? "size-7 rounded-2xl" : "size-6",
                  done &&
                    "border-emerald-300 bg-emerald-500 text-slate-950 shadow-[0_0_12px_rgba(34,197,94,0.7)]",
                  current &&
                    "border-cyan-300 bg-gradient-to-b from-cyan-400 to-cyan-600 text-slate-950 ring-4 ring-cyan-400/35 shadow-[0_0_20px_rgba(6,182,212,0.9)] motion-safe:scale-110",
                  !done && !current &&
                    "border-slate-700 bg-slate-900/90 text-slate-400",
                  last && !done &&
                    "border-amber-400 bg-gradient-to-b from-amber-400 to-yellow-500 text-slate-950 shadow-[0_0_15px_rgba(245,158,11,0.5)]",
                )}
              >
                {done ? (
                  <Check className="size-3.5 stroke-[3.5]" />
                ) : last ? (
                  <span className="text-xs">🏆</span>
                ) : (
                  <span className="text-[10px] font-black">{n}</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
