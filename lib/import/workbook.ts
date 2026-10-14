import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import type { ActionType } from "../game/types";

/**
 * Parses HEIST.xlsx into a normalized structure. The workbook is treated as
 * data only: formulas are read as cached values and nothing is executed.
 * Clue text is preserved verbatim.
 */

export type ParsedLocation = { raw: string; code: string; label: string; isFinish: boolean };

export type ParsedRow = {
  sheet: string;
  rowNumber: number;
  teamCell: string;
  scanLabel: string;
  /** 1-based order within the team sheet. */
  order: number;
  copyId: string;
  qrId: string;
  copyTeam: number | null;
  placement: ParsedLocation;
  clueText: string;
  destination: ParsedLocation;
  nextQrRaw: string;
  nextCopyId: string | null;
  actionType: ActionType;
  annotations: { cell: string; value: string }[];
  cells: { copy: string; clue: string; placement: string; destination: string; next: string };
};

export type ParsedTeamSheet = { sheet: string; teamNumber: number; headers: string[]; rows: ParsedRow[] };
export type SequenceRow = { teamNumber: number; teamLabel: string; rowNumber: number; columns: string[]; qrIds: string[] };
export type StartingClueRow = {
  teamNumber: number;
  teamLabel: string;
  rowNumber: number;
  qrId: string;
  location: string;
  riddle: string;
  answer: string;
};

export type ParsedWorkbook = {
  fileName: string;
  sha256: string;
  sheetNames: string[];
  sequence: SequenceRow[];
  sequenceNotes: { cell: string; value: string }[];
  starting: StartingClueRow[];
  teamSheets: ParsedTeamSheet[];
  missingSheets: string[];
};

export function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) return value.richText.map((r) => r.text).join("");
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value) return cellText((value as { result?: ExcelJS.CellValue }).result ?? null);
    if ("error" in value) return "";
  }
  return String(value);
}

export function parseTeamNumber(label: string): number | null {
  const m = label.trim().match(/^(?:team\s*|t)(\d+)$/i);
  return m ? Number(m[1]) : null;
}

export function parseLocation(raw: string): ParsedLocation {
  const text = raw.trim();
  if (/^finish$/i.test(text)) return { raw, code: "", label: "FINISH", isFinish: true };
  const m = text.match(/^(L\d+)\s*[—–-]\s*(.+)$/);
  if (m) return { raw, code: m[1]!, label: m[2]!.trim(), isFinish: false };
  return { raw, code: "", label: text, isFinish: false };
}

const ACTION_RE = /^[\s"“”']*(MAGNET|BONUS|SUPER\s*SHOES)\s*:/i;

export function detectAction(clueText: string, scanLabel: string, destination: ParsedLocation): ActionType {
  if (/^finish$/i.test(scanLabel.trim()) || destination.isFinish) return "FINISH";
  const m = clueText.match(ACTION_RE);
  if (!m) return "NORMAL";
  const k = m[1]!.toUpperCase().replace(/\s+/g, " ");
  return k === "MAGNET" ? "MAGNET" : k === "BONUS" ? "BONUS" : "SUPER_SHOES";
}

export function baseQrId(copyId: string): string {
  return copyId.trim().split("-")[0]!.toUpperCase();
}

function copyTeamOf(copyId: string): number | null {
  const m = copyId.match(/-T(\d+)$/i);
  return m ? Number(m[1]) : null;
}

const isBlankId = (s: string) => !s.trim() || /^[—–\-–—]+$/.test(s.trim());

function headerIndex(headers: string[], ...names: string[]): number {
  const norm = headers.map((h) => h.trim().toLowerCase());
  for (const n of names) {
    const i = norm.indexOf(n.toLowerCase());
    if (i >= 0) return i;
  }
  return -1;
}

function rowValues(ws: ExcelJS.Worksheet, r: number, maxCol: number): string[] {
  const row = ws.getRow(r);
  const out: string[] = [];
  for (let c = 1; c <= maxCol; c++) out.push(cellText(row.getCell(c).value));
  return out;
}

function colLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function lastUsedColumn(ws: ExcelJS.Worksheet): number {
  let max = 0;
  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      if (cellText(cell.value).trim()) max = Math.max(max, col);
    });
  });
  return max;
}

function findSheet(wb: ExcelJS.Workbook, name: string): ExcelJS.Worksheet | undefined {
  return wb.worksheets.find((w) => w.name.trim().toLowerCase() === name.toLowerCase());
}

export async function parseWorkbook(buffer: Buffer | ArrayBuffer, fileName = "HEIST.xlsx"): Promise<ParsedWorkbook> {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const sheetNames = wb.worksheets.map((w) => w.name);
  const missingSheets: string[] = [];

  /* ---- sequence sheet ---- */
  const sequence: SequenceRow[] = [];
  const sequenceNotes: { cell: string; value: string }[] = [];
  const seqWs = findSheet(wb, "sequence sheet");
  if (!seqWs) missingSheets.push("sequence sheet");
  else {
    const maxCol = lastUsedColumn(seqWs);
    const headers = rowValues(seqWs, 1, maxCol);
    for (let r = 2; r <= seqWs.rowCount; r++) {
      const vals = rowValues(seqWs, r, maxCol);
      if (vals.every((v) => !v.trim())) continue;
      const teamNumber = parseTeamNumber(vals[0] ?? "");
      if (teamNumber === null) {
        vals.forEach((v, i) => v.trim() && sequenceNotes.push({ cell: `${colLetter(i + 1)}${r}`, value: v }));
        continue;
      }
      const qrIds: string[] = [];
      const columns: string[] = [];
      for (let c = 1; c < maxCol; c++) {
        const v = (vals[c] ?? "").trim();
        if (!v) continue;
        qrIds.push(v.toUpperCase());
        columns.push(headers[c] ?? `Column ${colLetter(c + 1)}`);
      }
      sequence.push({ teamNumber, teamLabel: vals[0]!.trim(), rowNumber: r, columns, qrIds });
    }
  }

  /* ---- starting clues ---- */
  const starting: StartingClueRow[] = [];
  const startWs = findSheet(wb, "starting clues");
  if (!startWs) missingSheets.push("Starting clues");
  else {
    const maxCol = Math.max(5, lastUsedColumn(startWs));
    const headers = rowValues(startWs, 1, maxCol);
    const iTeam = headerIndex(headers, "team name", "team");
    const iQr = headerIndex(headers, "qr code", "qr");
    const iLoc = headerIndex(headers, "location");
    const iRiddle = headerIndex(headers, "riddle", "clue");
    const iAns = headerIndex(headers, "answer");
    for (let r = 2; r <= startWs.rowCount; r++) {
      const vals = rowValues(startWs, r, maxCol);
      if (vals.every((v) => !v.trim())) continue;
      const teamLabel = (vals[iTeam] ?? "").trim();
      const teamNumber = parseTeamNumber(teamLabel);
      if (teamNumber === null) continue;
      starting.push({
        teamNumber,
        teamLabel,
        rowNumber: r,
        qrId: (vals[iQr] ?? "").trim().toUpperCase(),
        location: (vals[iLoc] ?? "").trim(),
        riddle: vals[iRiddle] ?? "",
        answer: (vals[iAns] ?? "").trim(),
      });
    }
  }

  /* ---- team sheets ---- */
  const teamSheets: ParsedTeamSheet[] = [];
  const teamNumbers = new Set<number>([...sequence.map((s) => s.teamNumber), ...starting.map((s) => s.teamNumber)]);
  for (const ws of wb.worksheets) {
    const n = parseTeamNumber(ws.name);
    if (n !== null) teamNumbers.add(n);
  }
  for (const n of [...teamNumbers].sort((a, b) => a - b)) {
    const ws = findSheet(wb, `Team ${n}`);
    if (!ws) {
      missingSheets.push(`Team ${n}`);
      continue;
    }
    const maxCol = lastUsedColumn(ws);
    const headers = rowValues(ws, 1, maxCol);
    const iTeam = headerIndex(headers, "team");
    const iScan = headerIndex(headers, "scan");
    const iCopy = headerIndex(headers, "qr copy", "qr");
    const iPlace = headerIndex(headers, "current placement", "placement");
    const iClue = headerIndex(headers, "clue text", "clue");
    const iDest = headerIndex(headers, "destination");
    const iNext = headerIndex(headers, "next qr");
    const known = new Set([iTeam, iScan, iCopy, iPlace, iClue, iDest, iNext]);
    const rows: ParsedRow[] = [];
    for (let r = 2; r <= ws.rowCount; r++) {
      const vals = rowValues(ws, r, maxCol);
      if (vals.every((v) => !v.trim())) continue;
      const copyId = (vals[iCopy] ?? "").trim().toUpperCase();
      const scanLabel = (vals[iScan] ?? "").trim();
      const destination = parseLocation(vals[iDest] ?? "");
      const clueText = vals[iClue] ?? "";
      const nextQrRaw = (vals[iNext] ?? "").trim();
      const annotations: { cell: string; value: string }[] = [];
      vals.forEach((v, i) => {
        if (!known.has(i) && v.trim()) annotations.push({ cell: `${colLetter(i + 1)}${r}`, value: v.trim() });
      });
      rows.push({
        sheet: ws.name,
        rowNumber: r,
        teamCell: (vals[iTeam] ?? "").trim(),
        scanLabel: /^\d+(\.0+)?$/.test(scanLabel) ? String(Number(scanLabel)) : scanLabel,
        order: rows.length + 1,
        copyId,
        qrId: copyId ? baseQrId(copyId) : "",
        copyTeam: copyTeamOf(copyId),
        placement: parseLocation(vals[iPlace] ?? ""),
        clueText,
        destination,
        nextQrRaw,
        nextCopyId: isBlankId(nextQrRaw) ? null : nextQrRaw.toUpperCase(),
        actionType: detectAction(clueText, scanLabel, destination),
        annotations,
        cells: {
          copy: `${colLetter(iCopy + 1)}${r}`,
          clue: `${colLetter(iClue + 1)}${r}`,
          placement: `${colLetter(iPlace + 1)}${r}`,
          destination: `${colLetter(iDest + 1)}${r}`,
          next: `${colLetter(iNext + 1)}${r}`,
        },
      });
    }
    teamSheets.push({ sheet: ws.name, teamNumber: n, headers, rows });
  }

  return {
    fileName,
    sha256: createHash("sha256").update(buf).digest("hex"),
    sheetNames,
    sequence,
    sequenceNotes,
    starting,
    teamSheets,
    missingSheets,
  };
}
