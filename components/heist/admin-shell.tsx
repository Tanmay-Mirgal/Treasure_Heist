"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  ClipboardCheck,
  FileWarning,
  Gauge,
  KeyRound,
  ListOrdered,
  Menu,
  MessageSquareText,
  QrCode,
  ScrollText,
  SlidersHorizontal,
  Trophy,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { api } from "@/lib/client/api";
import { Wordmark } from "./brand";
import { LogoutButton } from "./team-actions";

const NAV = [
  { href: "/admin", label: "Overview", icon: Gauge },
  { href: "/admin/event", label: "Event controls", icon: Activity },
  { href: "/admin/teams", label: "Teams", icon: Users },
  { href: "/admin/sequences", label: "Sequences", icon: ListOrdered },
  { href: "/admin/clues", label: "Clues", icon: MessageSquareText },
  { href: "/admin/qr", label: "QR codes", icon: QrCode },
  { href: "/admin/scoring", label: "Scoring", icon: SlidersHorizontal },
  { href: "/admin/validation", label: "Data validation", icon: FileWarning },
  { href: "/admin/scans", label: "Scan monitor", icon: ClipboardCheck },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/admin/account", label: "Account", icon: KeyRound },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav aria-label="Admin navigation" className="space-y-0.5">
      {NAV.map((n) => {
        const active = n.href === "/admin" ? path === "/admin" : path.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              active && "bg-accent text-foreground",
            )}
          >
            <n.icon className={cn("size-4", active && "text-gold")} />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

function PasswordBanner() {
  const [must, setMust] = useState(false);
  const path = usePathname();
  useEffect(() => {
    api<{ admin: { mustChangePassword: boolean } | null }>("/api/auth/session")
      .then((s) => setMust(Boolean(s.admin?.mustChangePassword)))
      .catch(() => {});
  }, [path]);
  if (!must || path === "/admin/account") return null;
  return (
    <Alert className="mb-4 border-warn/40 bg-warn/10">
      <AlertDescription className="text-warn">
        You are using the default administrator password. <Link href="/admin/account" className="font-semibold underline">Change it now</Link>{" "}
        — it is required before production use.
      </AlertDescription>
    </Alert>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-dvh w-full">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-sidebar p-4 lg:flex">
        <Wordmark />
        <p className="mt-1 pl-12 text-[10px] font-semibold uppercase tracking-[0.3em] text-warn">Control room</p>
        <div className="mt-6 flex-1 overflow-y-auto">
          <Suspense fallback={<div className="h-64" aria-hidden />}>
            <NavList />
          </Suspense>
        </div>
        <LogoutButton role="admin" className="mt-4 w-full" />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur lg:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-4">
              <SheetHeader className="p-0">
                <SheetTitle>
                  <Wordmark />
                </SheetTitle>
              </SheetHeader>
              <div className="mt-4">
                <Suspense fallback={null}>
                  <NavList onNavigate={() => setOpen(false)} />
                </Suspense>
              </div>
              <LogoutButton role="admin" className="mt-6 w-full" />
            </SheetContent>
          </Sheet>
          <span className="font-heading text-sm font-semibold tracking-[0.2em]">CONTROL ROOM</span>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-8">
          <Suspense fallback={null}>
            <PasswordBanner />
          </Suspense>
          {children}
        </main>
      </div>
    </div>
  );
}
