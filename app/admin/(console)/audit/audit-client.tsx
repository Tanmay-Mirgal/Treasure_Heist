"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageTitle, formatDateTime } from "@/components/heist/bits";
import { JsonBlock } from "@/components/heist/admin-kit";
import { api } from "@/lib/client/api";
import { usePoll } from "@/hooks/use-poll";

type Audit = {
  total: number;
  page: number;
  pageSize: number;
  actions: string[];
  items: { id: string; at: string; admin: string; action: string; entityType: string; entityId: string | null; before: unknown; after: unknown; reason: string | null }[];
};

export function AuditClient() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("all");
  const { data } = usePoll<Audit>(
    (signal) => api<Audit>(`/api/admin/audit-logs?page=${page}&pageSize=50${action !== "all" ? `&action=${action}` : ""}`, { signal, redirectOn401: "admin" }),
    30_000,
    [page, action],
  );
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-5">
      <PageTitle
        title="Audit log"
        subtitle="Who changed what, when and why. Entries are append-only."
        actions={
          <Select
            value={action}
            onValueChange={(v) => {
              setAction(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-60" aria-label="Action filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {data?.actions.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
      {!data ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Before</TableHead>
                  <TableHead>After</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((a) => (
                  <TableRow key={a.id} className="align-top">
                    <TableCell className="whitespace-nowrap text-xs">{formatDateTime(a.at)}</TableCell>
                    <TableCell className="text-xs">{a.admin}</TableCell>
                    <TableCell className="font-mono text-[11px]">{a.action}</TableCell>
                    <TableCell className="text-xs">
                      {a.entityType}
                      <div className="font-mono text-[10px] text-muted-foreground">{a.entityId}</div>
                    </TableCell>
                    <TableCell>
                      <JsonBlock value={a.before} />
                    </TableCell>
                    <TableCell>
                      <JsonBlock value={a.after} />
                    </TableCell>
                    <TableCell className="max-w-56 text-xs">{a.reason ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-end gap-2 text-sm">
            <span className="text-muted-foreground">
              Page {data.page} of {pages} · {data.total} entries
            </span>
            <Button size="icon-sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
              <ChevronLeft className="size-4" />
            </Button>
            <Button size="icon-sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
