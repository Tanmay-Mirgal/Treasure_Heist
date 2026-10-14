"use client";

import { useState, type FormEvent } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PageTitle } from "@/components/heist/bits";
import { api, ApiClientError } from "@/lib/client/api";

export function AccountClient() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mismatch = confirm.length > 0 && next !== confirm;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (next !== confirm) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/admin/password", { method: "POST", body: { currentPassword: current, newPassword: next } });
      toast.success("Password changed. Other admin sessions were signed out.");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not change the password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md space-y-5">
      <PageTitle title="Account" subtitle="Change the administrator password. Required before production use if the seeded default is still active." />
      <form onSubmit={submit} className="space-y-4 rounded-xl border bg-card p-5">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="cur">Current password</Label>
          <Input id="cur" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new">New password (min 10 characters)</Label>
          <Input id="new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirm new password</Label>
          <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={mismatch} />
          {mismatch && <p className="text-xs text-danger">Passwords do not match.</p>}
        </div>
        <Button type="submit" disabled={busy || !current || next.length < 10 || next !== confirm} className="w-full">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />} Change password
        </Button>
      </form>
    </div>
  );
}
