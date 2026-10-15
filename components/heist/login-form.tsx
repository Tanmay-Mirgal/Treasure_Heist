"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { api, ApiClientError, safeNext } from "@/lib/client/api";
import { cn } from "@/lib/utils";

/** Shared login form for teams and organizers. */
export function LoginForm({ role }: { role: "team" | "admin" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({});

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const fe: typeof fieldErrors = {};
    if (!username.trim()) fe.username = role === "team" ? "Enter your team username." : "Enter your username.";
    if (!password) fe.password = "Enter your password.";
    setFieldErrors(fe);
    if (fe.username || fe.password) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ admin?: { mustChangePassword: boolean } }>(`/api/auth/${role}/login`, {
        method: "POST",
        body: { username: username.trim(), password },
      });
      const fallback = role === "team" ? "/play" : res.admin?.mustChangePassword ? "/admin/account" : "/admin";
      router.replace(safeNext(params.get("next"), fallback, role));
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Login failed. Please try again.");
      setBusy(false);
    }
  }

  const id = (s: string) => `${role}-${s}`;
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4" aria-describedby={error ? id("error") : undefined}>
      {error && (
        <Alert variant="destructive" id={id("error")} role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-1.5">
        <Label htmlFor={id("username")}>{role === "team" ? "Team username" : "Username"}</Label>
        <Input
          id={id("username")}
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder={role === "team" ? "e.g. Team1" : ""}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          aria-invalid={Boolean(fieldErrors.username)}
          aria-describedby={fieldErrors.username ? id("username-err") : undefined}
          className="h-11 text-base"
        />
        {fieldErrors.username && (
          <p id={id("username-err")} className="text-xs text-danger">
            {fieldErrors.username}
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={id("password")}>Password</Label>
        <div className="relative">
          <Input
            id={id("password")}
            name="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby={fieldErrors.password ? id("password-err") : undefined}
            className="h-11 pr-11 text-base"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted-foreground hover:text-foreground"
            aria-label={show ? "Hide password" : "Show password"}
            aria-pressed={show}
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {fieldErrors.password && (
          <p id={id("password-err")} className="text-xs text-danger">
            {fieldErrors.password}
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={busy}
        className={cn(
          "h-13 w-full rounded-2xl font-heading text-sm sm:text-base font-black tracking-wider uppercase transition-all flex items-center justify-center gap-2 px-3",
          role === "team" ? "subway-btn-gold" : "subway-btn-cyan",
          busy && "opacity-75 cursor-wait"
        )}
      >
        {busy ? <Loader2 className="size-5 animate-spin shrink-0" /> : <LogIn className="size-5 stroke-[2.5] shrink-0" />}
        <span className="truncate">{busy ? "CHECKING CREW TICKET…" : role === "team" ? "START SURFING 🛹" : "ENTER CONTROL ROOM"}</span>
      </button>
    </form>
  );
}
