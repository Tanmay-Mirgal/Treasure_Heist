"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LifeBuoy, Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { api, ApiClientError } from "@/lib/client/api";

export function LogoutButton({ role = "team", className }: { role?: "team" | "admin"; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      className={className}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await api("/api/auth/logout", { method: "POST", body: { role } });
        } finally {
          router.replace(role === "team" ? "/login" : "/admin/login");
          router.refresh();
        }
      }}
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />} Log out
    </Button>
  );
}

export function HelpDialog({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/team/issues", { method: "POST", body: { message } });
      toast.success("Report sent", { description: "An organizer has been notified." });
      setMessage("");
      setOpen(false);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Could not send the report.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className={className}>
          <LifeBuoy className="size-4" /> Help / report issue
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Need help?</DialogTitle>
          <DialogDescription>
            Damaged QR, camera trouble or something unclear? Tell the organizers. For urgent help go to the Event Desk.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="issue-message">What happened?</Label>
          <Textarea
            id="issue-message"
            rows={4}
            maxLength={1000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. The QR at the second-floor noticeboard is torn."
          />
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy || message.trim().length < 3}>
            {busy && <Loader2 className="size-4 animate-spin" />} Send report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
