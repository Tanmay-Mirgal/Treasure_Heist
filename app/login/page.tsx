import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Wordmark } from "@/components/heist/brand";
import { LoginForm } from "@/components/heist/login-form";

export const metadata: Metadata = { title: "Runner Check-in · Subway Heist" };

export default function TeamLoginPage() {
  return (
    <div className="relative min-h-screen flex flex-col justify-center overflow-x-hidden">
      {/* Top Hazard Stripe */}
      <div className="h-2 w-full subway-hazard opacity-90 shadow-md absolute top-0 inset-x-0" />

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
        <Link href="/" className="mx-auto transition-transform hover:scale-105 active:scale-95">
          <Wordmark tagline />
        </Link>

        {/* Turnstile Check-in Card */}
        <div className="relative mt-8 overflow-hidden rounded-3xl border-2 border-slate-700 bg-gradient-to-b from-slate-900/95 via-slate-900/90 to-slate-950 p-5 sm:p-6 shadow-2xl backdrop-blur-xl">
          {/* Card Top Hazard Bar */}
          <div className="absolute inset-x-0 top-0 h-1.5 subway-hazard" />

          <div className="mt-1 flex items-center justify-between">
            <span className="rounded-full border border-yellow-400/50 bg-yellow-400/15 px-3 py-0.5 text-[10px] font-black uppercase tracking-wider text-yellow-300">
              SUBWAY TURNSTILE
            </span>
            <span className="text-xl">🛹</span>
          </div>

          <h1 className="mt-3 font-heading text-2xl font-black tracking-tight text-white">
            Runner Crew Check-in
          </h1>
          <p className="mt-1 text-sm font-medium text-slate-300">
            Enter your team credentials from the Event Desk to activate your subway pass and hit the rails.
          </p>

          <div className="my-5 h-0.5 w-full bg-gradient-to-r from-transparent via-slate-700 to-transparent" />

          <Suspense>
            <LoginForm role="team" />
          </Suspense>
        </div>

        <p className="mt-6 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">
          Organizer or Admin?{" "}
          <Link href="/admin/login" className="text-cyan-400 underline underline-offset-4 hover:text-cyan-300">
            Control Room Login
          </Link>
        </p>
      </main>
    </div>
  );
}
