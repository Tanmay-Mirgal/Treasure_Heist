"use client";

import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageTitle, formatDateTime } from "@/components/heist/bits";
import { OutcomeText } from "@/components/heist/admin-kit";
import { api } from "@/lib/client/api";
import { usePoll } from "@/hooks/use-poll";
import { SCAN_OUTCOMES } from "@/lib/game/types";

type Scan = {
  id: string;
  team: string;
  outcome: string;
  reason: string | null;
  copyId: string | null;
  position: number | null;
  expectedPosition: number | null;
  source: string;
  points: number;
  correlationId: string;
  isTest: boolean;
  at: string;
};

export function ScansClient() {
  const [outcome, setOutcome] = useState("all");
  const { data } = usePoll<{ scans: Scan[] }>(
    (signal) => api(`/api/admin/scans?limit=200${outcome !== "all" ? `&outcome=${outcome}` : ""}`, { signal, redirectOn401: "admin" }),
    8_000,
    [outcome],
  );

  return (
    <div className="space-y-5">
      <PageTitle
        title="Scan monitor"
        subtitle="Every scan attempt with its internal reason (never shown to participants). Repeated rejections may indicate a damaged QR or a confused team — not necessarily cheating."
        actions={
          <Select value={outcome} onValueChange={setOutcome}>
            <SelectTrigger className="w-48" aria-label="Outcome filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All outcomes</SelectItem>
              {SCAN_OUTCOMES.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
      {!data ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>QR</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Pts</TableHead>
                <TableHead>Internal reason</TableHead>
                <TableHead>Correlation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.scans.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="whitespace-nowrap text-xs">{formatDateTime(s.at)}</TableCell>
                  <TableCell>{s.team}</TableCell>
                  <TableCell>
                    <OutcomeText outcome={s.outcome} /> {s.isTest && <span className="text-[10px] text-warn">TEST</span>}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {s.copyId ?? "—"} {s.position ? `@${s.position}` : ""}
                  </TableCell>
                  <TableCell className="text-xs">{s.source}</TableCell>
                  <TableCell className="hud-number text-right">{s.points || ""}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {s.reason ?? ""} {s.expectedPosition && s.outcome === "REJECTED" ? `(expected #${s.expectedPosition})` : ""}
                  </TableCell>
                  <TableCell className="font-mono text-[10px] text-muted-foreground">{s.correlationId.slice(0, 8)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
