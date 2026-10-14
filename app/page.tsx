import Link from "next/link";
import { ArrowRight, Coins, Footprints, KeyRound, Magnet, QrCode, ScanLine, Sparkles, Trophy } from "lucide-react";
import { Wordmark } from "@/components/heist/brand";
import { SubwayCoinIcon, TrackDivider } from "@/components/heist/bits";

const steps = [
  {
    step: "01",
    tag: "CREW CHECK-IN",
    icon: KeyRound,
    title: "Grab Crew Pass",
    text: "Log in with your team credentials at the turnstile and unlock your starting station dispatch.",
    color: "from-cyan-500/20 to-blue-600/10 border-cyan-400/40 text-cyan-300",
  },
  {
    step: "02",
    tag: "SURF THE TRACKS",
    icon: ScanLine,
    title: "Scan Station QRs",
    text: "Sprint across campus, find hidden QR checkpoint tags, and scan them to bag instant coins.",
    color: "from-amber-500/20 to-yellow-600/10 border-amber-400/40 text-amber-300",
  },
  {
    step: "03",
    tag: "HIGH SCORE",
    icon: Trophy,
    title: "Crack The Vault",
    text: "Clear all railway stations before time expires and seal your crew's name on the champion leaderboard.",
    color: "from-emerald-500/20 to-teal-600/10 border-emerald-400/40 text-emerald-300",
  },
];

const powers = [
  {
    badge: "2X BOOST",
    icon: Coins,
    name: "2X COIN STASH",
    tone: "border-amber-400/60 bg-gradient-to-b from-amber-500/20 to-amber-950/40 text-amber-300",
    text: "Massive coin drops for quick-thinking runner crews at secret bonus stations.",
  },
  {
    badge: "SPEED SPRINT",
    icon: Footprints,
    name: "SUPER SNEAKERS",
    tone: "border-emerald-400/60 bg-gradient-to-b from-emerald-500/20 to-emerald-950/40 text-emerald-300",
    text: "Bypass sticky riddles with bonus velocity and instant decrypted intel hints.",
  },
  {
    badge: "RIVAL STEAL",
    icon: Magnet,
    name: "COIN MAGNET",
    tone: "border-orange-400/60 bg-gradient-to-b from-orange-500/20 to-orange-950/40 text-orange-300",
    text: "Unleash high-voltage magnetic pull to snatch points from rival teams on the run.",
  },
];

export default function Landing() {
  return (
    <div className="relative min-h-screen flex flex-col overflow-x-hidden">
      {/* Subway Hazard Stripe Tape at very top */}
      <div className="h-2 w-full subway-hazard opacity-90 shadow-md" />

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pb-20 pt-6 sm:px-6">
        {/* Navigation Header */}
        <header className="flex items-center justify-between gap-3">
          <Wordmark tagline />
          <Link
            href="/admin/login"
            className="rounded-full border border-slate-700 bg-slate-900/80 px-2.5 py-1 text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider transition-colors hover:border-slate-500 hover:text-white shrink-0"
          >
            Organizer Login
          </Link>
        </header>

        {/* Hero Section */}
        <section className="mt-8 grid items-center gap-8 md:mt-16 md:grid-cols-[1.2fr_1fr]">
          <div>
            {/* Subway tag sticker */}
            <div className="inline-flex items-center gap-2 rounded-full border-2 border-yellow-400 bg-yellow-400/20 px-3 py-1 text-[11px] sm:text-xs font-black uppercase tracking-wider text-yellow-300 shadow-[0_0_15px_rgba(250,204,21,0.4)]">
              <span className="size-2 rounded-full bg-yellow-400 animate-ping" />
              <span>LIVE CAMPUS SURFERS MISSION</span>
            </div>

            <h1 className="mt-4 font-heading text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl text-white drop-shadow-[0_4px_16px_rgba(0,0,0,0.8)]">
              SUBWAY <span className="bg-gradient-to-r from-yellow-300 via-amber-400 to-orange-500 bg-clip-text text-transparent">HEIST</span>
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-1.5 sm:gap-2 font-heading text-xs sm:text-sm font-black tracking-[0.2em] sm:tracking-[0.25em] text-cyan-400 uppercase">
              <span>RUN THE TRACKS</span>
              <span className="text-slate-600">·</span>
              <span>BAG THE COINS</span>
              <span className="text-slate-600">·</span>
              <span>CRACK THE VAULT</span>
            </div>

            <p className="mt-5 max-w-lg text-sm sm:text-base leading-relaxed text-slate-300 font-medium">
              Ten rival crews. Endless subway rails spanning across the entire campus. Crack hidden riddles, sprint to
              each railway station, scan verified QR tags, and trigger game-changing power-ups before time runs out!
            </p>

            {/* Chunky Subway Surfers 3D Arcade CTAs - Full width on mobile, auto on desktop */}
            <div className="mt-7 flex flex-col sm:flex-row gap-3.5">
              <Link
                href="/login"
                className="subway-btn-gold inline-flex h-14 w-full sm:w-auto items-center justify-center gap-2.5 rounded-2xl px-8 font-heading text-base font-black tracking-wider uppercase"
              >
                <span>START RUNNING</span>
                <span className="text-xl">🛹</span>
                <ArrowRight className="size-5 stroke-[3]" />
              </Link>

              <Link
                href="/leaderboard"
                className="subway-btn-cyan inline-flex h-14 w-full sm:w-auto items-center justify-center gap-2.5 rounded-2xl px-6 font-heading text-base font-black tracking-wider uppercase"
              >
                <Trophy className="size-5 stroke-[2.5]" />
                <span>HIGH SCORES</span>
              </Link>
            </div>
          </div>

          {/* Interactive Subway Surfers Station Preview Card */}
          <div className="relative mx-auto w-full max-w-sm">
            <div className="relative overflow-hidden rounded-3xl border-2 border-slate-700 bg-gradient-to-b from-slate-900/95 via-slate-900/90 to-slate-950 p-6 shadow-2xl backdrop-blur-xl">
              {/* Hazard top accent */}
              <div className="absolute inset-x-0 top-0 h-1.5 subway-hazard" />

              <div className="flex items-center justify-between text-xs font-black uppercase tracking-widest text-slate-400">
                <span className="flex items-center gap-1.5 text-cyan-400">
                  <span className="size-2 rounded-full bg-cyan-400 animate-ping" />
                  LINE 01 · INBOUND
                </span>
                <span className="flex items-center gap-1 text-emerald-400">
                  <span>LIVE TRACKS</span>
                </span>
              </div>

              {/* Subway Scanner Simulation Box */}
              <div className="mt-6 grid place-items-center">
                <div className="relative grid size-44 place-items-center rounded-2xl border-2 border-yellow-400/40 bg-slate-950/80 p-3 shadow-inner">
                  {/* Four Corner Subway Rail Brackets */}
                  <span className="absolute left-2 top-2 size-4 border-l-2 border-t-2 border-yellow-400" />
                  <span className="absolute right-2 top-2 size-4 border-r-2 border-t-2 border-yellow-400" />
                  <span className="absolute bottom-2 left-2 size-4 border-b-2 border-l-2 border-yellow-400" />
                  <span className="absolute bottom-2 right-2 size-4 border-b-2 border-r-2 border-yellow-400" />

                  <QrCode className="size-24 text-slate-200" aria-hidden />

                  {/* Animated Gold Scanner Beam */}
                  <div className="absolute inset-x-3 top-3 h-1 rounded-full bg-gradient-to-r from-transparent via-yellow-400 to-transparent shadow-[0_0_12px_rgba(250,204,21,1)] animate-bounce" />

                  {/* Mini Hoverboard floating badge */}
                  <div className="absolute -bottom-3 rounded-full border border-yellow-300 bg-yellow-400 px-2.5 py-0.5 text-[10px] font-black text-slate-950 shadow-md">
                    SCAN STATION
                  </div>
                </div>
              </div>

              {/* Station Progress with Railway ties */}
              <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-950/70 p-3.5 shadow-inner">
                <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">
                  <span>Track Route</span>
                  <span className="text-amber-400 flex items-center gap-1">
                    <SubwayCoinIcon className="size-3.5" /> +100 COINS
                  </span>
                </div>
                <div className="space-y-2 text-xs font-bold">
                  <div className="flex items-center justify-between rounded-lg bg-emerald-500/15 px-2.5 py-1.5 text-emerald-300 border border-emerald-400/30">
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-emerald-400" /> Station 01 — Platform Cleared
                    </span>
                    <span className="text-[10px]">✓</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-cyan-500/15 px-2.5 py-1.5 text-cyan-300 border border-cyan-400/30">
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-cyan-400 animate-ping" /> Station 02 — Active Runner Track
                    </span>
                    <span className="text-[10px]">🛹</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-slate-800/40 px-2.5 py-1.5 text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-slate-600" /> Station 03 — The Final Vault
                    </span>
                    <span className="text-[10px]">🏆</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <TrackDivider className="mt-16" />

        {/* How It Works Section */}
        <section aria-labelledby="how-it-works" className="mt-8">
          <div className="flex items-center gap-2">
            <span className="text-xl">🛹</span>
            <h2 id="how-it-works" className="font-heading text-lg font-black uppercase tracking-widest text-slate-300">
              RUNNER&apos;S GAMEPLAY RULES
            </h2>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {steps.map((s) => (
              <div
                key={s.title}
                className={`relative overflow-hidden rounded-3xl border-2 bg-gradient-to-b ${s.color} p-6 shadow-xl backdrop-blur-xl transition-all duration-200 hover:-translate-y-1`}
              >
                <div className="flex items-center justify-between">
                  <span className="rounded-xl border border-white/20 bg-black/40 px-2.5 py-0.5 font-mono text-xs font-black text-white">
                    {s.step}
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-80">
                    {s.tag}
                  </span>
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <div className="grid size-11 place-items-center rounded-2xl bg-black/40 shadow-inner">
                    <s.icon className="size-6 stroke-[2.5]" aria-hidden />
                  </div>
                  <h3 className="font-heading text-xl font-black text-white">{s.title}</h3>
                </div>
                <p className="mt-3 text-sm font-medium leading-relaxed text-slate-200">{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Subway Surfers Power-ups on the Line */}
        <section aria-labelledby="powers-title" className="mt-14">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">⚡</span>
              <h2 id="powers-title" className="font-heading text-base sm:text-lg font-black uppercase tracking-widest text-slate-300">
                POWER-UPS ON THE TRACKS
              </h2>
            </div>
            <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-yellow-400">
              ★ OFFICIAL EVENT ITEMS
            </span>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {powers.map((p) => (
              <div
                key={p.name}
                className={`relative overflow-hidden rounded-3xl border-2 p-6 shadow-xl backdrop-blur-xl transition-all duration-200 hover:-translate-y-1 ${p.tone}`}
              >
                <div className="flex items-center justify-between">
                  <div className="grid size-11 place-items-center rounded-2xl bg-black/40 shadow-inner">
                    <p.icon className="size-6 stroke-[2.5]" aria-hidden />
                  </div>
                  <span className="rounded-full border border-white/20 bg-black/40 px-3 py-0.5 text-[10px] font-black tracking-wider uppercase text-white">
                    {p.badge}
                  </span>
                </div>
                <h3 className="mt-4 font-heading text-xl font-black tracking-wide text-white">{p.name}</h3>
                <p className="mt-2 text-sm font-medium leading-relaxed text-slate-200">{p.text}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
