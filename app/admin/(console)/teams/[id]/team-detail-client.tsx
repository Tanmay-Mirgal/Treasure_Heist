"use client";

import Link from "next/link";
import { use, useState } from "react";
import { ArrowLeft, CheckCircle2, Eraser, MessageSquare, Minus, NotebookPen, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActionBadge, PageTitle, StatTile, formatDateTime, formatTime } from "@/components/heist/bits";
import { OutcomeText, ReasonDialog, StatusPill } from "@/components/heist/admin-kit";
import { api } from "@/lib/client/api";
import { usePoll } from "@/hooks/use-poll";
import type { ActionType } from "@/lib/game/types";

type Detail = {
  team: {
    id: string;
    username: string;
    name: string;
    number: number;
    status: string;
    score: number;
    ledgerTotal: number;
    currentPosition: number;
    awaitingAnswer: { position: number } | null;
    hints: { available: number; used: number };
    gameStartedAt: string | null;
    finishedAt: string | null;
    lastActivityAt: string | null;
    lastLoginAt: string | null;
    adminNotes: { _id: string; text: string; adminUsername: string; at: string }[];
  };
  sequence: {
    version: number;
    startingClue: { riddle: string; location: string; answer: string } | null;
    entries: {
      position: number;
      copyId: string;
      actionType: ActionType;
      mode: string;
      status: string;
      placement: { code: string; label: string } | null;
      clueText: string;
      completed: boolean;
      completedAt: string | null;
      completionSource: string | null;
      points: number | null;
    }[];
  } | null;
  transactions: { id: string; label: string; type: string; delta: number; balanceAfter: number; position: number | null; counterparty: string | null; reason: string | null; adminUsername: string | null; isTest: boolean; at: string }[];
  powerUps: { id: string; status: string; copyId: string; amount: number; target: string | null; grantedAt: string; activatedAt: string | null }[];
  hints: { position: number; text: string; at: string }[];
  notifications: { id: string; type: string; message: string; read: boolean; at: string }[];
  scans: { id: string; outcome: string; reason: string | null; copyId: string | null; position: number | null; expectedPosition: number | null; source: string; points: number; isTest: boolean; at: string }[];
  issues: { id: string; message: string; status: string; at: string }[];
};

type Tool = "verify" | "adjust" | "reset-score" | "reset-scan" | "rollback" | "note" | "message" | "reset-progress" | null;

export function TeamDetailClient({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, refresh } = usePoll<Detail>((signal) => api<Detail>(`/api/admin/teams/${id}`, { signal, redirectOn401: "admin" }), 10_000, [id]);
  const [tool, setTool] = useState<Tool>(null);
  const [delta, setDelta] = useState("1");
  const [notify, setNotify] = useState(true);
  const [toPos, setToPos] = useState("0");
  const [reverse, setReverse] = useState(true);
  const [text, setText] = useState("");

  if (!data) return <Skeleton className="h-96 w-full" />;
  const { team, sequence } = data;
  const next = sequence?.entries.find((e) => e.position === team.currentPosition + 1);

  const recover = async (body: Record<string, unknown>, msg: string) => {
    await api(`/api/admin/teams/${id}/recovery`, { method: "POST", body });
    toast.success(msg);
    setText("");
    await refresh();
  };

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin/teams">
          <ArrowLeft className="size-4" /> Teams
        </Link>
      </Button>
      <PageTitle
        title={team.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{team.username}</span> · #{team.number} <StatusPill status={team.status} />
            {team.finishedAt && <StatusPill status="FINISHED" />}
            {sequence && <span className="text-xs">route v{sequence.version}</span>}
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile label="Score" value={team.score} tone="gold" hint={team.ledgerTotal === team.score ? "matches ledger" : `ledger says ${team.ledgerTotal}!`} />
        <StatTile label="Progress" value={`${team.currentPosition}/${sequence?.entries.length ?? 0}`} tone="ok" />
        <StatTile label="Next" value={next?.copyId ?? (team.finishedAt ? "finished" : "—")} tone="signal" className="[&_.hud-number]:text-lg" hint={next?.placement?.label} />
        <StatTile label="Hints" value={`${team.hints.available}`} tone="signal" hint={`${team.hints.used} used`} />
        <StatTile label="Started / finished" value={formatTime(team.gameStartedAt)} className="[&_.hud-number]:text-base" hint={team.finishedAt ? `finished ${formatTime(team.finishedAt)}` : "not finished"} />
      </div>

      <section className="rounded-xl border border-warn/30 p-4">
        <h2 className="flex items-center gap-2 font-heading text-lg font-semibold">
          <ShieldCheck className="size-5 text-warn" /> Manual recovery
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Every action that changes progress or score requires a reason and is written to the audit log.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setTool("verify")} disabled={!next}>
            <CheckCircle2 className="size-4" /> Verify next checkpoint{next ? ` (${next.copyId})` : ""}
          </Button>
          <Button variant="outline" onClick={() => setTool("adjust")}>
            <Minus className="size-4" /> Correct score
          </Button>
          <Button variant="outline" onClick={() => setTool("reset-score")} disabled={team.score === 0}>
            <RotateCcw className="size-4" /> Reset points to 0
          </Button>
          <Button variant="outline" onClick={() => setTool("rollback")} disabled={team.currentPosition === 0}>
            <RotateCcw className="size-4" /> Restore earlier state
          </Button>
          <Button variant="outline" onClick={() => setTool("reset-scan")} disabled={!team.awaitingAnswer}>
            <Eraser className="size-4" /> Reset incomplete scan
          </Button>
          <Button variant="outline" onClick={() => setTool("message")}>
            <MessageSquare className="size-4" /> Message team
          </Button>
          <Button variant="outline" onClick={() => setTool("note")}>
            <NotebookPen className="size-4" /> Add note
          </Button>
          <Button variant="destructive" onClick={() => setTool("reset-progress")}>
            <Trash2 className="size-4" /> Reset progress
          </Button>
        </div>
        {team.adminNotes.length > 0 && (
          <ul className="mt-4 space-y-1 text-sm">
            {team.adminNotes.map((n) => (
              <li key={n._id} className="rounded bg-secondary/50 px-2 py-1">
                <span className="text-xs text-muted-foreground">{formatDateTime(n.at)} · {n.adminUsername}:</span> {n.text}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Tabs defaultValue="route">
        <TabsList className="flex-wrap">
          <TabsTrigger value="route">Route (private)</TabsTrigger>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
          <TabsTrigger value="scans">Scans</TabsTrigger>
          <TabsTrigger value="other">Power-ups & messages</TabsTrigger>
        </TabsList>
        <TabsContent value="route">
          {sequence?.startingClue && (
            <div className="mb-3 rounded-xl border bg-card/60 p-3 text-sm">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Starting clue</div>
              <p className="clue-text mt-1">{sequence.startingClue.riddle}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Location: {sequence.startingClue.location} · Answer: {sequence.startingClue.answer || "—"}
              </p>
            </div>
          )}
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>QR copy</TableHead>
                  <TableHead>Placement</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>QR status</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead className="text-right">Pts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sequence?.entries.map((e) => (
                  <TableRow key={e.position} className={e.position === team.currentPosition + 1 ? "bg-signal/5" : undefined}>
                    <TableCell className="hud-number">{e.position}</TableCell>
                    <TableCell className="font-mono text-xs">{e.copyId}</TableCell>
                    <TableCell className="text-xs">{e.placement ? `${e.placement.code} ${e.placement.label}` : "—"}</TableCell>
                    <TableCell>
                      <ActionBadge action={e.actionType} />
                      {e.mode === "ANSWER" && <span className="ml-1 text-[10px] text-signal">ANSWER</span>}
                    </TableCell>
                    <TableCell>
                      <StatusPill status={e.status} />
                    </TableCell>
                    <TableCell className="text-xs">
                      {e.completed ? `${formatTime(e.completedAt)} · ${e.completionSource}` : e.position === team.currentPosition + 1 ? "← next" : ""}
                    </TableCell>
                    <TableCell className="hud-number text-right">{e.points ?? ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
        <TabsContent value="ledger">
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Δ</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.transactions.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-xs">{formatDateTime(t.at)}</TableCell>
                    <TableCell className="text-xs">
                      {t.label} {t.isTest && <span className="text-warn">TEST</span>}
                    </TableCell>
                    <TableCell className={`hud-number text-right ${t.delta < 0 ? "text-danger" : "text-gold"}`}>{t.delta > 0 ? `+${t.delta}` : t.delta}</TableCell>
                    <TableCell className="hud-number text-right">{t.balanceAfter}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {[t.position && `checkpoint ${t.position}`, t.counterparty && `↔ ${t.counterparty}`, t.reason, t.adminUsername && `by ${t.adminUsername}`].filter(Boolean).join(" · ")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
        <TabsContent value="scans">
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>QR</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Internal reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.scans.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs">{formatDateTime(s.at)}</TableCell>
                    <TableCell>
                      <OutcomeText outcome={s.outcome} />
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {s.copyId ?? "—"} {s.position ? `@${s.position}` : ""}
                    </TableCell>
                    <TableCell className="text-xs">{s.source}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {s.reason ?? ""} {s.expectedPosition ? `(expected #${s.expectedPosition})` : ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
        <TabsContent value="other" className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border p-3">
            <h3 className="font-medium">Power-ups</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {data.powerUps.length === 0 && <li className="text-muted-foreground">None.</li>}
              {data.powerUps.map((p) => (
                <li key={p.id}>
                  MAGNET from {p.copyId} — <StatusPill status={p.status} /> {p.target && `→ ${p.target} (${p.amount})`}
                </li>
              ))}
            </ul>
            <h3 className="mt-4 font-medium">Hints used</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {data.hints.length === 0 && <li className="text-muted-foreground">None.</li>}
              {data.hints.map((h) => (
                <li key={h.position}>
                  Mission {h.position}: {h.text}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border p-3">
            <h3 className="font-medium">Notifications</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {data.notifications.length === 0 && <li className="text-muted-foreground">None.</li>}
              {data.notifications.map((n) => (
                <li key={n.id}>
                  <span className="text-xs text-muted-foreground">{formatTime(n.at)} {n.read ? "· read" : "· unread"}</span> {n.message}
                </li>
              ))}
            </ul>
            <h3 className="mt-4 font-medium">Issue reports</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {data.issues.length === 0 && <li className="text-muted-foreground">None.</li>}
              {data.issues.map((i) => (
                <li key={i.id}>
                  <StatusPill status={i.status} /> {i.message}
                </li>
              ))}
            </ul>
          </div>
        </TabsContent>
      </Tabs>

      <ReasonDialog
        open={tool === "verify"}
        onOpenChange={(o) => !o && setTool(null)}
        title={`Verify ${next?.copyId ?? ""} manually`}
        description={`Completes checkpoint ${next?.position} for ${team.name} as if it had been scanned, and awards points per the scoring rules.`}
        confirmLabel="Verify checkpoint"
        onConfirm={(reason) => recover({ action: "verify-next", reason }, "Checkpoint verified")}
      />
      <ReasonDialog
        open={tool === "adjust"}
        onOpenChange={(o) => !o && setTool(null)}
        title="Correct score"
        description="Adds a signed ORGANIZER adjustment to the ledger. A score can never go below zero."
        confirmLabel="Apply correction"
        extraValid={Number.isInteger(Number(delta)) && Number(delta) !== 0}
        onConfirm={(reason) => recover({ action: "adjust-score", delta: Number(delta), reason, notify }, "Score corrected")}
      >
        <div className="flex items-end gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="delta">Points (e.g. 2 or -1)</Label>
            <Input id="delta" type="number" value={delta} onChange={(e) => setDelta(e.target.value)} className="w-28" />
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Switch id="notify" checked={notify} onCheckedChange={setNotify} />
            <Label htmlFor="notify">Notify the team</Label>
          </div>
        </div>
      </ReasonDialog>
      <ReasonDialog
        open={tool === "rollback"}
        onOpenChange={(o) => !o && setTool(null)}
        title="Restore an earlier state"
        description="Voids completions after the chosen position (kept for audit). Unused MAGNETs from voided checkpoints are voided too."
        confirmLabel="Restore"
        destructive
        extraValid={Number(toPos) >= 0 && Number(toPos) < team.currentPosition}
        onConfirm={(reason) => recover({ action: "rollback", toPosition: Number(toPos), reversePoints: reverse, reason }, "Team state restored")}
      >
        <div className="flex items-end gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="to-pos">Keep checkpoints 1…</Label>
            <Input id="to-pos" type="number" min={0} max={team.currentPosition - 1} value={toPos} onChange={(e) => setToPos(e.target.value)} className="w-28" />
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Switch id="reverse" checked={reverse} onCheckedChange={setReverse} />
            <Label htmlFor="reverse">Reverse their points</Label>
          </div>
        </div>
      </ReasonDialog>
      <ReasonDialog
        open={tool === "reset-score"}
        onOpenChange={(o) => !o && setTool(null)}
        title={`Reset points to 0 for ${team.name}`}
        description={`Sets score to 0 (current: ${team.score}). A negative ledger adjustment is recorded and the team is notified.`}
        destructive
        confirmLabel="Reset points to 0"
        onConfirm={(reason) => recover({ action: "reset-score", reason }, "Team points reset to 0")}
      />
      <ReasonDialog
        open={tool === "reset-scan"}
        onOpenChange={(o) => !o && setTool(null)}
        title="Reset incomplete scan"
        description="Clears the pending answer-gated checkpoint so the team can scan it again."
        onConfirm={(reason) => recover({ action: "reset-scan", reason }, "Pending scan reset")}
      />
      <ReasonDialog
        open={tool === "reset-progress"}
        onOpenChange={(o) => !o && setTool(null)}
        title="Reset all progress for this team"
        description="Wipes this team's checkpoint completions, score, ledger, power-ups, hints, notifications and scans back to starting state."
        destructive
        confirmLabel="Reset team"
        onConfirm={(reason) => recover({ action: "reset-progress", reason }, "Team progress reset")}
      />
      <ReasonDialog
        open={tool === "note" || tool === "message"}
        onOpenChange={(o) => !o && setTool(null)}
        title={tool === "note" ? "Add organizer note" : "Message the team"}
        description={tool === "note" ? "Private note, visible to organizers only." : "Appears as a persistent notification on the team's dashboard."}
        requireReason={false}
        confirmLabel={tool === "note" ? "Add note" : "Send"}
        extraValid={text.trim().length > 0}
        onConfirm={() => recover({ action: tool === "note" ? "note" : "message", text }, tool === "note" ? "Note added" : "Message sent")}
      >
        <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={tool === "note" ? 1000 : 500} aria-label="Text" />
      </ReasonDialog>
    </div>
  );
}
