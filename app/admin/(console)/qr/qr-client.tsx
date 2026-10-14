"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AlertTriangle, Download, Printer, RefreshCcw, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ActionBadge, PageTitle, formatDateTime } from "@/components/heist/bits";
import { ReasonDialog, StatusPill } from "@/components/heist/admin-kit";
import { api } from "@/lib/client/api";
import { usePoll } from "@/hooks/use-poll";
import type { ActionType } from "@/lib/game/types";

type Item = {
  id: string;
  copyId: string;
  qrId: string;
  teamNumber: number | null;
  actionType: ActionType;
  status: "ACTIVE" | "INACTIVE" | "DAMAGED";
  placement: { code: string; label: string };
  manualCode: string;
  tokenVersion: number;
  tokenIssuedAt: string;
  scanUrl: string | null;
  references: { teamNumber: number; position: number }[];
};
type List = { items: Item[]; warnings: { unassigned: string[]; inactive: string[]; multiplyReferenced: string[] } };
type Verify = { valid: boolean; reason: string | null; copyId?: string; status?: string; actionType?: string; placement?: { code: string; label: string }; references?: { teamNumber: number; position: number }[]; matchedBy?: string };

export function QrClient() {
  const { data, refresh } = usePoll<List>((signal) => api<List>("/api/admin/qr", { signal, redirectOn401: "admin" }), 60_000);
  const [team, setTeam] = useState("all");
  const [q, setQ] = useState("");
  const [preview, setPreview] = useState<Item | null>(null);
  const [revoke, setRevoke] = useState<Item | null>(null);
  const [statusChange, setStatusChange] = useState<{ item: Item; status: Item["status"] } | null>(null);
  const [verifyInput, setVerifyInput] = useState("");
  const [verify, setVerify] = useState<Verify | null>(null);

  if (!data) return <Skeleton className="h-96 w-full" />;
  const teams = [...new Set(data.items.map((i) => i.teamNumber).filter((n): n is number => n !== null))].sort((a, b) => a - b);
  const rows = data.items
    .filter((i) => team === "all" || String(i.teamNumber) === team)
    .filter((i) => !q || `${i.copyId} ${i.placement.label} ${i.manualCode}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.teamNumber ?? 99) - (b.teamNumber ?? 99) || (a.references[0]?.position ?? 99) - (b.references[0]?.position ?? 99));

  async function doVerify(e: FormEvent) {
    e.preventDefault();
    setVerify(await api<Verify>("/api/admin/qr/verify", { method: "POST", body: { input: verifyInput } }));
  }

  const w = data.warnings;
  return (
    <div className="space-y-5">
      <PageTitle
        title="QR codes"
        subtitle="Each printed QR encodes an opaque random token (URL /s/<token>) plus a short manual code. Neither reveals the route, team or answer."
        actions={
          <Button asChild>
            <Link href={`/admin/print${team !== "all" ? `?team=${team}` : ""}`}>
              <Printer className="size-4" /> Print {team !== "all" ? `Team ${team}` : "all"}
            </Link>
          </Button>
        }
      />

      {(w.unassigned.length > 0 || w.inactive.length > 0 || w.multiplyReferenced.length > 0) && (
        <div className="space-y-1 rounded-xl border border-warn/30 bg-warn/5 p-3 text-sm">
          {w.inactive.length > 0 && (
            <p className="flex gap-2"><AlertTriangle className="size-4 text-warn" /> Inactive / damaged: {w.inactive.join(", ")}</p>
          )}
          {w.unassigned.length > 0 && <p className="flex gap-2"><AlertTriangle className="size-4 text-warn" /> Not in any route: {w.unassigned.join(", ")}</p>}
          {w.multiplyReferenced.length > 0 && <p className="flex gap-2"><AlertTriangle className="size-4 text-danger" /> Used by more than one route: {w.multiplyReferenced.join(", ")}</p>}
        </div>
      )}

      <form onSubmit={doVerify} className="rounded-xl border bg-card/60 p-4">
        <Label htmlFor="verify" className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-signal" /> Verify a QR (test mode — changes nothing)
        </Label>
        <div className="mt-2 flex flex-wrap gap-2">
          <Input id="verify" value={verifyInput} onChange={(e) => setVerifyInput(e.target.value)} placeholder="Paste scanned URL, token or manual code" className="min-w-64 flex-1" />
          <Button type="submit" disabled={!verifyInput.trim()}>
            Verify
          </Button>
        </div>
        {verify && (
          <div className={`mt-3 rounded-lg p-3 text-sm ${verify.valid ? "bg-ok/10" : "bg-danger/10"}`}>
            {verify.valid ? (
              <>
                <b>{verify.copyId}</b> ({verify.matchedBy}) · {verify.status} · {verify.actionType} · placed at {verify.placement?.code} {verify.placement?.label} ·{" "}
                {verify.references?.map((r) => `Team ${r.teamNumber} #${r.position}`).join(", ") || "no route"}
                {verify.reason && <div className="text-warn">{verify.reason}</div>}
              </>
            ) : (
              verify.reason
            )}
          </div>
        )}
      </form>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={team} onValueChange={setTeam}>
          <SelectTrigger className="w-36" aria-label="Team filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All teams</SelectItem>
            {teams.map((t) => (
              <SelectItem key={t} value={String(t)}>
                Team {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} className="w-56 pl-8" aria-label="Search QR codes" />
        </div>
        <span className="text-xs text-muted-foreground">{rows.length} of {data.items.length}</span>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>QR</TableHead>
              <TableHead>Copy</TableHead>
              <TableHead>Route</TableHead>
              <TableHead>Placement</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Manual code</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((i) => (
              <TableRow key={i.id}>
                <TableCell>
                  <button type="button" onClick={() => setPreview(i)} aria-label={`Preview ${i.copyId}`} className="block rounded bg-white p-0.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/admin/qr/${i.id}/image?v=${i.tokenVersion}`} alt="" width={44} height={44} loading="lazy" />
                  </button>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {i.copyId}
                  <div className="text-[10px] text-muted-foreground">token v{i.tokenVersion}</div>
                </TableCell>
                <TableCell className="text-xs">{i.references.map((r) => `T${r.teamNumber} #${r.position}`).join(", ") || <span className="text-warn">unassigned</span>}</TableCell>
                <TableCell className="text-xs">{i.placement.code} {i.placement.label}</TableCell>
                <TableCell>
                  <ActionBadge action={i.actionType} />
                </TableCell>
                <TableCell className="font-mono text-xs">{i.manualCode}</TableCell>
                <TableCell>
                  <Select value={i.status} onValueChange={(v) => setStatusChange({ item: i, status: v as Item["status"] })}>
                    <SelectTrigger size="sm" className="w-28" aria-label={`Status of ${i.copyId}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                      <SelectItem value="INACTIVE">INACTIVE</SelectItem>
                      <SelectItem value="DAMAGED">DAMAGED</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="space-x-1 whitespace-nowrap text-right">
                  <Button asChild size="sm" variant="ghost" aria-label={`Download ${i.copyId} PNG`}>
                    <a href={`/api/admin/qr/${i.id}/image?format=png&download=1`}>
                      <Download className="size-4" /> PNG
                    </a>
                  </Button>
                  <Button asChild size="sm" variant="ghost" aria-label={`Download ${i.copyId} SVG`}>
                    <a href={`/api/admin/qr/${i.id}/image?format=svg&download=1`}>SVG</a>
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRevoke(i)} aria-label={`Revoke ${i.copyId}`}>
                    <RefreshCcw className="size-4 text-warn" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={Boolean(preview)} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{preview?.copyId}</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-3 text-center">
              <div className="mx-auto w-64 rounded-lg bg-white p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/admin/qr/${preview.id}/image?v=${preview.tokenVersion}`} alt={`QR code ${preview.copyId}`} className="w-full" />
              </div>
              <div className="font-mono text-lg tracking-widest">{preview.manualCode}</div>
              <p className="text-xs text-muted-foreground">Issued {formatDateTime(preview.tokenIssuedAt)} · placed at {preview.placement.label}</p>
              <StatusPill status={preview.status} />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ReasonDialog
        open={Boolean(revoke)}
        onOpenChange={(o) => !o && setRevoke(null)}
        title={`Revoke & regenerate ${revoke?.copyId}`}
        description="The printed QR and its manual code stop working immediately. Print and place the new code. Team progress is unaffected."
        destructive
        confirmLabel="Revoke and regenerate"
        onConfirm={async (reason) => {
          await api(`/api/admin/qr/${revoke!.id}/revoke`, { method: "POST", body: { reason } });
          toast.success("New token issued — reprint this QR");
          await refresh();
        }}
      />
      <ReasonDialog
        open={Boolean(statusChange)}
        onOpenChange={(o) => !o && setStatusChange(null)}
        title={`Mark ${statusChange?.item.copyId} as ${statusChange?.status}`}
        description={
          statusChange?.status === "ACTIVE"
            ? "Teams can scan this checkpoint again."
            : "Teams scanning it get “temporarily unavailable — contact the Event Desk”. Use manual verification for affected teams."
        }
        onConfirm={async (reason) => {
          await api(`/api/admin/qr/${statusChange!.item.id}`, { method: "PATCH", body: { status: statusChange!.status, reason } });
          await refresh();
        }}
      />
    </div>
  );
}
