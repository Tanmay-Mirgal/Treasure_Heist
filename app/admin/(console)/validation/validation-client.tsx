"use client";

import Link from "next/link";
import { useState } from "react";
import { FileSpreadsheet, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageTitle, StatTile, formatDateTime } from "@/components/heist/bits";
import { SeverityBadge } from "@/components/heist/admin-kit";
import { api } from "@/lib/client/api";
import { usePoll } from "@/hooks/use-poll";

type Issue = {
  severity: "ERROR" | "WARNING" | "INFO";
  code: string;
  message: string;
  teamNumber?: number | null;
  position?: number | null;
  copyId?: string | null;
  cell?: string | null;
  sheet?: string | null;
  suggestions?: string[];
  qrRef?: string | null;
};
type Report = {
  generatedAt: string;
  summary: { errors: number; warnings: number; info: number; byCode: Record<string, number> };
  issues: Issue[];
  lastImport: {
    at: string;
    fileName: string;
    sha256: string;
    summary: Record<string, unknown> & { issueSummary?: { errors: number; warnings: number; info: number } };
    applied: Record<string, unknown> & { sequencesSkipped?: { teamNumber: number; reason: string }[] };
    issues: Issue[];
  } | null;
};

export function ValidationClient() {
  const { data, refresh, loading } = usePoll<Report>((signal) => api<Report>("/api/admin/validation", { signal, redirectOn401: "admin" }), 120_000);
  const [source, setSource] = useState<"live" | "import">("live");
  const [sev, setSev] = useState("ERRWARN");
  const [code, setCode] = useState("all");

  if (!data) return <Skeleton className="h-96 w-full" />;
  const issues = (source === "live" ? data.issues : data.lastImport?.issues ?? [])
    .filter((i) => (sev === "ALL" ? true : sev === "ERRWARN" ? i.severity !== "INFO" : i.severity === sev))
    .filter((i) => code === "all" || i.code === code);
  const codes = Object.keys(data.summary.byCode).sort();
  const li = data.lastImport;

  return (
    <div className="space-y-5">
      <PageTitle
        title="Data validation"
        subtitle="Inconsistencies found in the workbook and in the live configuration. Nothing here is changed automatically — fix items in the clue or sequence editors."
        actions={
          <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className="size-4" /> Re-run checks
          </Button>
        }
      />
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Errors" value={data.summary.errors} tone="danger" hint="must fix before the event" />
        <StatTile label="Warnings" value={data.summary.warnings} tone="warn" hint="review" />
        <StatTile label="Info" value={data.summary.info} tone="signal" />
      </div>

      {li && (
        <section className="rounded-xl border p-4 text-sm">
          <h2 className="flex items-center gap-2 font-heading text-lg font-semibold">
            <FileSpreadsheet className="size-5 text-ok" /> Last workbook import
          </h2>
          <p className="mt-1 text-muted-foreground">
            {li.fileName} · {formatDateTime(li.at)} · sha256 {li.sha256.slice(0, 12)}…
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
            {[
              ["Teams", li.summary.teamsFound],
              ["Starting clues", li.summary.startingCluesFound],
              ["Sequence entries", li.summary.sequenceEntriesFound],
              ["QR copies", li.summary.qrCopiesFound],
              ["Base QR ids", li.summary.baseQrIdsFound],
              ["Locations", li.summary.locationsFound],
              ["Shared finish", li.summary.sharedFinish ?? "—"],
              ["QR created/updated", `${li.applied.qrCreated ?? 0}/${li.applied.qrUpdated ?? 0}`],
            ].map(([k, v]) => (
              <div key={String(k)} className="flex justify-between gap-2 border-b border-border/50 py-1">
                <dt className="text-muted-foreground">{String(k)}</dt>
                <dd className="hud-number">{String(v)}</dd>
              </div>
            ))}
          </dl>
          {(li.applied.sequencesSkipped?.length ?? 0) > 0 && (
            <ul className="mt-3 list-disc pl-5 text-warn">
              {li.applied.sequencesSkipped!.map((s) => (
                <li key={s.teamNumber}>
                  Team {s.teamNumber}: {s.reason}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Select value={source} onValueChange={(v) => setSource(v as "live" | "import")}>
          <SelectTrigger className="w-52" aria-label="Report source">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="live">Live checks (current data)</SelectItem>
            <SelectItem value="import">Workbook import report</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sev} onValueChange={setSev}>
          <SelectTrigger className="w-44" aria-label="Severity filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ERRWARN">Errors + warnings</SelectItem>
            <SelectItem value="ERROR">Errors</SelectItem>
            <SelectItem value="WARNING">Warnings</SelectItem>
            <SelectItem value="INFO">Info</SelectItem>
            <SelectItem value="ALL">Everything</SelectItem>
          </SelectContent>
        </Select>
        <Select value={code} onValueChange={setCode}>
          <SelectTrigger className="w-72" aria-label="Issue type filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All issue types</SelectItem>
            {codes.map((c) => (
              <SelectItem key={c} value={c}>
                {c} ({data.summary.byCode[c]})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{issues.length} shown · checked {formatDateTime(data.generatedAt)}</span>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Severity</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Where</TableHead>
              <TableHead className="min-w-96">Details</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {issues.map((i, n) => (
              <TableRow key={n}>
                <TableCell>
                  <SeverityBadge severity={i.severity} />
                </TableCell>
                <TableCell className="font-mono text-[11px]">{i.code}</TableCell>
                <TableCell className="whitespace-nowrap text-xs">
                  {i.teamNumber ? `Team ${i.teamNumber}` : ""}
                  {i.position ? ` #${i.position}` : ""}
                  {i.cell ? <div className="text-muted-foreground">{i.sheet ? `${i.sheet}!` : ""}{i.cell}</div> : null}
                </TableCell>
                <TableCell className="text-xs">
                  {i.message}
                  {i.suggestions && i.suggestions.length > 0 && <div className="mt-1 text-signal">{i.suggestions.length} workbook riddle(s) suggested — open the clue editor.</div>}
                </TableCell>
                <TableCell>
                  {i.qrRef && (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/admin/clues?qr=${i.qrRef}`}>Fix</Link>
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
