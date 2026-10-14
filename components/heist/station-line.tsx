import { cn } from "@/lib/utils";

/**
 * Progress drawn as a subway line. Shows only counts (completed / total),
 * never which QR or place each station is.
 */
export function StationLine({ completed, total, finished }: { completed: number; total: number; finished: boolean }) {
  if (total <= 0) return null;
  return (
    <div className="relative" role="img" aria-label={`${completed} of ${total} checkpoints secured`}>
      <div className="absolute inset-x-2 top-1/2 h-0.5 -translate-y-1/2 bg-rail" />
      <div
        className="absolute left-2 top-1/2 h-0.5 -translate-y-1/2 bg-ok transition-[width] duration-700"
        style={{ width: `calc((100% - 1rem) * ${total > 1 ? Math.min(completed, total - 1) / (total - 1) : 0})` }}
      />
      <ol className="relative flex justify-between">
        {Array.from({ length: total }, (_, i) => {
          const n = i + 1;
          const done = n <= completed;
          const current = !finished && n === completed + 1;
          const last = n === total;
          return (
            <li key={n} className="grid place-items-center">
              <span
                className={cn(
                  "grid place-items-center rounded-full border-2 bg-background text-[9px] font-bold",
                  last ? "size-5" : "size-3.5",
                  done && "border-ok bg-ok text-background",
                  current && "border-signal text-signal ring-4 ring-signal/20 motion-safe:animate-pulse",
                  !done && !current && "border-rail",
                  last && !done && "border-gold/60",
                )}
              >
                {last ? "★" : ""}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
