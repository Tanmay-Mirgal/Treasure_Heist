"use client";

import Link from "next/link";
import { useState } from "react";
import { Download, KeyRound, Plus, Power, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageTitle, formatTime } from "@/components/heist/bits";
import { ReasonDialog, StatusPill } from "@/components/heist/admin-kit";
import { api } from "@/lib/client/api";
import { usePoll } from "@/hooks/use-poll";

type TeamRow = {
  id: string;
  username: string;
  name: string;
  number: number;
  status: "ACTIVE" | "DISABLED";
  score: number;
  completed: number;
  total: number;
  hasSequence: boolean;
  hintsAvailable: number;
  awaitingAnswer: boolean;
  finishedAt: string | null;
  lastActivityAt: string | null;
  lastLoginAt: string | null;
  openIssues: number;
};

export function TeamsClient() {
  const { data, refresh } = usePoll<{ teams: TeamRow[] }>((signal) => api("/api/admin/teams", { signal, redirectOn401: "admin" }), 15_000);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ username: "", displayName: "", teamNumber: "", password: "" });
  const [pwFor, setPwFor] = useState<TeamRow | null>(null);
  const [newPw, setNewPw] = useState("");
  const [statusFor, setStatusFor] = useState<TeamRow | null>(null);

  const rows = (data?.teams ?? []).filter((t) => !q || `${t.name} ${t.username}`.toLowerCase().includes(q.toLowerCase()));
  const nextNumber = Math.max(0, ...(data?.teams ?? []).map((t) => t.number)) + 1;

  return (
    <div className="space-y-5">
      <PageTitle
        title="Teams"
        subtitle="Accounts, status and progress. Passwords are stored as bcrypt hashes and never exported."
        actions={
          <>
            <Button asChild variant="outline">
              <a href="/api/admin/teams/export" download>
                <Download className="size-4" /> Export CSV
              </a>
            </Button>
            <Button
              onClick={() => {
                setForm({ username: `Team${nextNumber}`, displayName: `Team ${nextNumber}`, teamNumber: String(nextNumber), password: "" });
                setCreating(true);
              }}
            >
              <Plus className="size-4" /> New team
            </Button>
          </>
        }
      />
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input placeholder="Filter teams" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" aria-label="Filter teams" />
      </div>

      {!data ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Hints</TableHead>
                <TableHead>Last login / activity</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="hud-number">{t.number}</TableCell>
                  <TableCell>
                    <Link href={`/admin/teams/${t.id}`} className="font-medium hover:underline">
                      {t.name}
                    </Link>
                    <div className="font-mono text-xs text-muted-foreground">{t.username}</div>
                  </TableCell>
                  <TableCell className="space-x-1">
                    <StatusPill status={t.status} />
                    {t.finishedAt && <Badge className="bg-ok/15 text-ok">FINISHED</Badge>}
                    {t.awaitingAnswer && <Badge className="bg-signal/15 text-signal">ANSWER PENDING</Badge>}
                    {!t.hasSequence && <Badge className="bg-danger/15 text-danger">NO ROUTE</Badge>}
                    {t.openIssues > 0 && <Badge className="bg-warn/15 text-warn">{t.openIssues} issue(s)</Badge>}
                  </TableCell>
                  <TableCell className="hud-number text-right font-semibold text-gold">{t.score}</TableCell>
                  <TableCell className="hud-number">
                    {t.completed}/{t.total}
                  </TableCell>
                  <TableCell className="hud-number">{t.hintsAvailable}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatTime(t.lastLoginAt)} / {formatTime(t.lastActivityAt)}
                  </TableCell>
                  <TableCell className="space-x-1 text-right whitespace-nowrap">
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/admin/teams/${t.id}`}>Manage</Link>
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setNewPw(""); setPwFor(t); }} aria-label={`Reset password for ${t.name}`}>
                      <KeyRound className="size-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setStatusFor(t)} aria-label={`${t.status === "ACTIVE" ? "Disable" : "Enable"} ${t.name}`}>
                      <Power className={t.status === "ACTIVE" ? "size-4 text-ok" : "size-4 text-danger"} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ReasonDialog
        open={creating}
        onOpenChange={setCreating}
        title="Create team"
        description="The new team needs a route — assign one in Sequences."
        requireReason={false}
        confirmLabel="Create"
        extraValid={Boolean(form.username && form.displayName && Number(form.teamNumber) > 0 && form.password.length >= 4)}
        onConfirm={async () => {
          await api("/api/admin/teams", {
            method: "POST",
            body: { username: form.username, displayName: form.displayName, teamNumber: Number(form.teamNumber), password: form.password },
          });
          toast.success("Team created");
          await refresh();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["username", "Username"],
              ["displayName", "Display name"],
              ["teamNumber", "Team number"],
              ["password", "Initial password"],
            ] as const
          ).map(([k, label]) => (
            <div key={k} className="space-y-1.5">
              <Label htmlFor={`new-${k}`}>{label}</Label>
              <Input
                id={`new-${k}`}
                type={k === "teamNumber" ? "number" : k === "password" ? "password" : "text"}
                autoComplete={k === "password" ? "new-password" : "off"}
                value={form[k]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              />
            </div>
          ))}
        </div>
      </ReasonDialog>

      <ReasonDialog
        open={Boolean(pwFor)}
        onOpenChange={(o) => !o && setPwFor(null)}
        title={`Reset password — ${pwFor?.name ?? ""}`}
        description="The team's existing sessions are signed out immediately."
        confirmLabel="Reset password"
        extraValid={newPw.length >= 4}
        onConfirm={async (reason) => {
          await api(`/api/admin/teams/${pwFor!.id}/password`, { method: "POST", body: { password: newPw, reason } });
          toast.success("Password reset");
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="new-pw">New password (min 4 characters)</Label>
          <Input id="new-pw" type="password" autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
        </div>
      </ReasonDialog>

      <ReasonDialog
        open={Boolean(statusFor)}
        onOpenChange={(o) => !o && setStatusFor(null)}
        title={`${statusFor?.status === "ACTIVE" ? "Disable" : "Enable"} ${statusFor?.name ?? ""}?`}
        description={statusFor?.status === "ACTIVE" ? "A disabled team is signed out and cannot log in or scan. Progress is kept." : "The team can log in again."}
        destructive={statusFor?.status === "ACTIVE"}
        onConfirm={async (reason) => {
          await api(`/api/admin/teams/${statusFor!.id}`, {
            method: "PATCH",
            body: { status: statusFor!.status === "ACTIVE" ? "DISABLED" : "ACTIVE", reason },
          });
          await refresh();
        }}
      />
    </div>
  );
}
