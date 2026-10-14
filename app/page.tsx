import Link from "next/link";
import { ArrowRight, Coins, Footprints, KeyRound, Magnet, QrCode, ScanLine, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/heist/brand";
import { TrackDivider } from "@/components/heist/bits";

const steps = [
  { icon: KeyRound, title: "Decode", text: "Log in with your team credentials and read your first riddle." },
  { icon: ScanLine, title: "Discover", text: "Find the hidden checkpoint and scan its QR. Each valid scan unlocks the next clue." },
  { icon: Trophy, title: "Escape", text: "Follow your team's route to the vault. Every checkpoint is verified on the server." },
];

const powers = [
  { icon: Coins, name: "BONUS", tone: "text-gold border-gold/30 bg-gold/10", text: "Extra points for sharp-eyed crews." },
  { icon: Footprints, name: "SUPER SHOES", tone: "text-ok border-ok/30 bg-ok/10", text: "Points plus an extra hint for the road ahead." },
  { icon: Magnet, name: "MAGNET", tone: "text-warn border-warn/30 bg-warn/10", text: "Pull points from a rival team — once." },
];

export default function Landing() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pb-16 pt-6 sm:px-6">
      <header className="flex items-center justify-between">
        <Wordmark />
        <Link href="/admin/login" className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Organizer login
        </Link>
      </header>

      <section className="mt-14 grid items-center gap-10 md:mt-20 md:grid-cols-[1.2fr_1fr]">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-signal/30 bg-signal/10 px-3 py-1 text-xs font-medium text-signal">
            <span className="signal-dot text-signal motion-safe:animate-pulse" aria-hidden /> Live campus mission
          </p>
          <h1 className="mt-5 font-heading text-5xl font-bold leading-[1.02] tracking-wide sm:text-6xl">
            THE <span className="text-gold">HEIST</span>
          </h1>
          <p className="mt-3 font-heading text-lg tracking-[0.3em] text-muted-foreground">DECODE. DISCOVER. ESCAPE.</p>
          <p className="mt-6 max-w-md text-base leading-relaxed text-foreground/85">
            Ten crews. One vault. Hidden QR checkpoints run through the building like a subway line — solve each riddle,
            reach the next station and race the other teams to the finish.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="h-12 px-6 text-base font-semibold">
              <Link href="/login">
                Enter the Mission <ArrowRight className="size-5" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-12 px-5">
              <Link href="/leaderboard">Leaderboard</Link>
            </Button>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-sm">
          <div className="rounded-3xl border bg-card/80 p-5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-heading tracking-[0.25em]">LINE H · OUTBOUND</span>
              <span className="inline-flex items-center gap-1.5 text-ok">
                <span className="signal-dot" aria-hidden /> signal
              </span>
            </div>
            <div className="mt-6 grid place-items-center">
              <div className="scan-frame relative grid size-44 place-items-center rounded-xl">
                <QrCode className="size-24 text-foreground/80" aria-hidden />
                <div className="scan-sweep absolute inset-x-3 top-3 h-0.5 rounded bg-gold/80 [--sweep:150px]" />
              </div>
            </div>
            <TrackDivider className="mt-6" />
            <ol className="space-y-2 text-sm">
              {["Station 01 — secured", "Station 02 — secured", "Station 03 — active"].map((s, i) => (
                <li key={s} className="flex items-center gap-2">
                  <span className={`signal-dot ${i < 2 ? "text-ok" : "text-signal motion-safe:animate-pulse"}`} aria-hidden />
                  <span className={i < 2 ? "text-muted-foreground" : "text-foreground"}>{s}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <TrackDivider className="mt-16" />

      <section aria-labelledby="how" className="mt-6">
        <h2 id="how" className="font-heading text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">
          How it works
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {steps.map((s, i) => (
            <div key={s.title} className="rounded-2xl border bg-card/60 p-5">
              <div className="flex items-center gap-2 text-signal">
                <s.icon className="size-5" aria-hidden />
                <span className="hud-number text-xs text-muted-foreground">0{i + 1}</span>
              </div>
              <h3 className="mt-3 font-heading text-lg font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="powers" className="mt-10">
        <h2 id="powers" className="font-heading text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">
          Power-ups on the line
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {powers.map((p) => (
            <div key={p.name} className={`rounded-2xl border p-5 ${p.tone}`}>
              <p.icon className="size-5" aria-hidden />
              <div className="mt-3 font-heading text-lg font-semibold tracking-wide">{p.name}</div>
              <p className="mt-1 text-sm text-foreground/75">{p.text}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Exact point values are set by the organizers and shown in your team&apos;s score screen.
        </p>
      </section>
    </main>
  );
}
