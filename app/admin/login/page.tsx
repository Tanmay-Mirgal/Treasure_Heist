import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ShieldCheck } from "lucide-react";
import { Wordmark } from "@/components/heist/brand";
import { TrackDivider } from "@/components/heist/bits";
import { LoginForm } from "@/components/heist/login-form";
import { redirectIfAuthenticated } from "@/lib/auth/server-guard";

export const metadata: Metadata = { title: "Organizer login" };

export const instant = false;

export default async function AdminLoginPage() {
  await redirectIfAuthenticated("admin");
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
      <Link href="/" className="mx-auto">
        <Wordmark />
      </Link>
      <div className="mt-8 rounded-2xl border border-warn/20 bg-card p-6">
        <div className="flex items-center gap-2 text-warn">
          <ShieldCheck className="size-5" aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-[0.25em]">Control room</span>
        </div>
        <h1 className="mt-2 font-heading text-2xl font-semibold">Organizer login</h1>
        <p className="mt-1 text-sm text-muted-foreground">Restricted to event administrators.</p>
        <TrackDivider />
        <Suspense>
          <LoginForm role="admin" />
        </Suspense>
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">
        Participant? <Link href="/login" className="underline underline-offset-4">Team login</Link>
      </p>
    </main>
  );
}
