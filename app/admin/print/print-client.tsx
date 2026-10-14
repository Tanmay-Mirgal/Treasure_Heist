"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { api } from "@/lib/client/api";

type Item = {
  id: string;
  copyId: string;
  teamNumber: number | null;
  placement: { code: string; label: string };
  status: string;
  manualCode: string;
  references: { teamNumber: number; position: number }[];
  svg: string;
};

export function PrintClient() {
  const team = useSearchParams().get("team");
  const [data, setData] = useState<{ baseUrl: string; items: Item[] } | null>(null);
  const [sheet, setSheet] = useState<"labels" | "organizer">("labels");
  const [opts, setOpts] = useState({ manualCode: true, copyId: true, team: false, placement: false, brand: true });

  useEffect(() => {
    api<{ baseUrl: string; items: Item[] }>(`/api/admin/qr/print${team ? `?team=${encodeURIComponent(team)}` : ""}`, { redirectOn401: "admin" }).then(setData);
  }, [team]);

  if (!data)
    return (
      <div className="grid min-h-dvh place-items-center">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  const items = [...data.items].sort((a, b) => (a.teamNumber ?? 99) - (b.teamNumber ?? 99) || (a.references[0]?.position ?? 99) - (b.references[0]?.position ?? 99));
  const insecure = /localhost|127\.0\.0\.1/.test(data.baseUrl) || data.baseUrl.startsWith("http:");

  return (
    <div className="min-h-dvh bg-white text-black">
      <div className="no-print sticky top-0 z-10 space-y-3 border-b bg-background p-4 text-foreground">
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/qr">
              <ArrowLeft className="size-4" /> QR codes
            </Link>
          </Button>
          <span className="font-heading font-semibold">
            Print {team ? `Team ${team}` : "all teams"} — {items.length} QR codes
          </span>
          <div className="ml-auto flex gap-2">
            <Button variant={sheet === "labels" ? "default" : "outline"} size="sm" onClick={() => setSheet("labels")}>
              QR labels
            </Button>
            <Button variant={sheet === "organizer" ? "default" : "outline"} size="sm" onClick={() => setSheet("organizer")}>
              Organizer placement sheet
            </Button>
            <Button size="sm" onClick={() => window.print()}>
              <Printer className="size-4" /> Print
            </Button>
          </div>
        </div>
        {sheet === "labels" && (
          <div className="flex flex-wrap gap-4 text-sm">
            {(
              [
                ["brand", "THE HEIST header"],
                ["manualCode", "Manual code"],
                ["copyId", "Copy id (e.g. QR19-T1)"],
                ["team", "Team number"],
                ["placement", "Placement (organizer copy only!)"],
              ] as const
            ).map(([k, label]) => (
              <div key={k} className="flex items-center gap-2">
                <Checkbox id={`o-${k}`} checked={opts[k]} onCheckedChange={(v) => setOpts({ ...opts, [k]: Boolean(v) })} />
                <Label htmlFor={`o-${k}`}>{label}</Label>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          QR codes encode <span className="font-mono">{data.baseUrl}/s/…</span>. Copy ids and team numbers can hint at ownership — disable them for labels players will see.
        </p>
        {insecure && (
          <Alert variant="destructive">
            <AlertDescription>
              These codes point to {data.baseUrl}. Set NEXT_PUBLIC_APP_URL to your public HTTPS address before printing for the event — phone cameras need HTTPS.
            </AlertDescription>
          </Alert>
        )}
      </div>

      {sheet === "labels" ? (
        <div className="grid grid-cols-2 gap-4 p-6 print:gap-3 print:p-0 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((i) => (
            <figure key={i.id} className="flex break-inside-avoid flex-col items-center rounded-lg border-2 border-black p-3 text-center">
              {opts.brand && <div className="text-xs font-bold tracking-[0.3em]">THE HEIST</div>}
              <div className="w-full max-w-[200px] [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: i.svg }} />
              {opts.manualCode && <div className="font-mono text-lg font-bold tracking-widest">{i.manualCode}</div>}
              <figcaption className="text-[10px] leading-tight text-neutral-600">
                {[opts.copyId && i.copyId, opts.team && i.teamNumber && `Team ${i.teamNumber}`, opts.placement && `${i.placement.code} ${i.placement.label}`].filter(Boolean).join(" · ")}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <div className="p-6 print:p-0">
          <h1 className="text-xl font-bold">THE HEIST — QR placement sheet (ORGANIZERS ONLY)</h1>
          <p className="mb-4 text-xs">Do not show this sheet to participants. Generated {new Date().toLocaleString()}.</p>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b-2 border-black text-left">
                <th className="py-1 pr-2">Team</th>
                <th className="py-1 pr-2">#</th>
                <th className="py-1 pr-2">Copy id</th>
                <th className="py-1 pr-2">Place at</th>
                <th className="py-1 pr-2">Manual code</th>
                <th className="py-1 pr-2">Status</th>
                <th className="py-1">Placed ✓</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-b border-neutral-300">
                  <td className="py-1 pr-2">{i.references[0]?.teamNumber ?? i.teamNumber ?? "—"}</td>
                  <td className="py-1 pr-2">{i.references[0]?.position ?? "—"}</td>
                  <td className="py-1 pr-2 font-mono">{i.copyId}</td>
                  <td className="py-1 pr-2">
                    {i.placement.code} {i.placement.label}
                  </td>
                  <td className="py-1 pr-2 font-mono">{i.manualCode}</td>
                  <td className="py-1 pr-2">{i.status}</td>
                  <td className="py-1">☐</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
