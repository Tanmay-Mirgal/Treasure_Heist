import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Wordmark } from "@/components/heist/brand";
import { TrackDivider } from "@/components/heist/bits";
import { LoginForm } from "@/components/heist/login-form";

export const metadata: Metadata = { title: "Team login" };

export default function TeamLoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
      <Link href="/" className="mx-auto">
        <Wordmark tagline />
      </Link>
      <div className="mt-8 rounded-2xl border bg-card p-6">
        <h1 className="font-heading text-2xl font-semibold">Crew check-in</h1>
        <p className="mt-1 text-sm text-muted-foreground">Use the team username and password from the Event Desk.</p>
        <TrackDivider />
        <Suspense>
          <LoginForm role="team" />
        </Suspense>
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">
        Organizer? <Link href="/admin/login" className="underline underline-offset-4">Admin login</Link>
      </p>
    </main>
  );
}
