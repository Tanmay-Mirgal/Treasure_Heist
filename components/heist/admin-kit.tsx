"use client";

import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiClientError } from "@/lib/client/api";
import { cn } from "@/lib/utils";

/**
 * Confirmation dialog that collects a reason before an organizer action that
 * changes official progress, scores or configuration (all are audited).
 */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  destructive,
  requireReason = true,
  children,
  extraValid = true,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  requireReason?: boolean;
  children?: ReactNode;
  extraValid?: boolean;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = (!requireReason || reason.trim().length >= 3) && extraValid;

  async function go() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      setReason("");
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!busy) {
          setError(null);
          onOpenChange(o);
        }
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription asChild><div>{description}</div></DialogDescription>}
        </DialogHeader>
        {children}
        <div className="space-y-1.5">
          <Label htmlFor="reason">Reason {requireReason ? "(required, audited)" : "(optional)"}</Label>
          <Textarea id="reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={go} disabled={!valid || busy} className={cn(destructive && "bg-danger text-white hover:bg-danger/90")}>
            {busy && <Loader2 className="size-4 animate-spin" />} {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function toastError(e: unknown) {
  toast.error(e instanceof ApiClientError ? e.message : "Request failed.");
}

const SEV = {
  ERROR: "bg-danger/15 text-danger border-danger/30",
  WARNING: "bg-warn/15 text-warn border-warn/30",
  INFO: "bg-signal/15 text-signal border-signal/30",
} as const;

export function SeverityBadge({ severity }: { severity: keyof typeof SEV }) {
  return <Badge className={cn("border", SEV[severity])}>{severity}</Badge>;
}

const OUTCOME_TONE: Record<string, string> = {
  ACCEPTED: "text-ok",
  AWAITING_ANSWER: "text-signal",
  DUPLICATE: "text-signal",
  REJECTED: "text-danger",
  INACTIVE_QR: "text-warn",
  EVENT_CLOSED: "text-warn",
  ALREADY_FINISHED: "text-gold",
  RATE_LIMITED: "text-warn",
};

export function OutcomeText({ outcome }: { outcome: string }) {
  return <span className={cn("font-mono text-xs font-semibold", OUTCOME_TONE[outcome])}>{outcome}</span>;
}

export function StatusPill({ status }: { status: string }) {
  const tone =
    status === "RUNNING" || status === "ACTIVE"
      ? "bg-ok/15 text-ok"
      : status === "PAUSED" || status === "DAMAGED" || status === "INACTIVE"
        ? "bg-warn/15 text-warn"
        : status === "ENDED" || status === "DISABLED"
          ? "bg-danger/15 text-danger"
          : "bg-signal/15 text-signal";
  return <Badge className={tone}>{status}</Badge>;
}

export function JsonBlock({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>;
  return (
    <pre className="max-h-40 max-w-md overflow-auto whitespace-pre-wrap rounded bg-secondary/60 p-2 font-mono text-[11px] leading-snug">
      {JSON.stringify(value, null, 1)}
    </pre>
  );
}
