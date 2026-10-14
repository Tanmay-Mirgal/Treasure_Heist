import { ImportRun, QRCheckpoint, Team, TeamSequence, type QRCheckpointDoc, type TeamDoc } from "../models";
import { isDuplicateKeyError } from "../db";
import { ready } from "../services/bootstrap";
import { newManualCode, newScanToken } from "../services/qr";
import type { GameRules } from "../game/types";
import type { ParsedRow, ParsedWorkbook } from "./workbook";
import { datasetFromWorkbook, summarizeIssues, validateDataset, type Issue } from "./validate";

/** Fields of a QR checkpoint that come from the workbook (and may be organizer-edited). */
const QR_SOURCE_FIELDS = ["qrId", "teamNumber", "actionType", "clueText", "placement", "destination", "sourceNextCopyId", "annotations"] as const;

/** Errors that make a team's route ambiguous; such routes are not imported. */
const BLOCKING_CODES = new Set([
  "SEQUENCE_MISMATCH",
  "SEQUENCE_LENGTH_MISMATCH",
  "MISSING_QR_COPY",
  "DUPLICATE_COPY_ID",
  "NO_SEQUENCE",
  "MISSING_SEQUENCE_ROW",
]);

export type ImportSummary = {
  sheets: number;
  teamsFound: number;
  startingCluesFound: number;
  sequenceEntriesFound: number;
  qrCopiesFound: number;
  baseQrIdsFound: number;
  locationsFound: number;
  sharedFinish: string | null;
  issueSummary: ReturnType<typeof summarizeIssues>;
};

export type ImportApplied = {
  qrCreated: number;
  qrUpdated: number;
  qrUnchanged: number;
  qrEditsPreserved: number;
  sequencesCreated: number;
  sequencesUpdated: number;
  sequencesUnchanged: number;
  sequencesSkipped: { teamNumber: number; reason: string }[];
  startingCluesPreserved: number;
};

export type ImportReport = {
  fileName: string;
  sha256: string;
  dryRun: boolean;
  summary: ImportSummary;
  applied: ImportApplied | null;
  issues: Issue[];
  importRunId: string | null;
};

export function summarize(wb: ParsedWorkbook, issues: Issue[]): ImportSummary {
  const rows = wb.teamSheets.flatMap((s) => s.rows);
  const finishIds = new Set(wb.sequence.map((s) => s.qrIds[s.qrIds.length - 1]).filter(Boolean));
  const locations = new Set(rows.flatMap((r) => [r.placement.code, r.destination.code]).filter(Boolean));
  return {
    sheets: wb.sheetNames.length,
    teamsFound: new Set([...wb.sequence.map((s) => s.teamNumber), ...wb.teamSheets.map((s) => s.teamNumber)]).size,
    startingCluesFound: wb.starting.length,
    sequenceEntriesFound: wb.sequence.reduce((n, s) => n + s.qrIds.length, 0),
    qrCopiesFound: new Set(rows.map((r) => r.copyId)).size,
    baseQrIdsFound: new Set(rows.map((r) => r.qrId)).size,
    locationsFound: locations.size,
    sharedFinish: finishIds.size === 1 ? [...finishIds][0]! : null,
    issueSummary: summarizeIssues(issues),
  };
}

function qrFieldsFromRow(row: ParsedRow, teamNumber: number) {
  return {
    qrId: row.qrId,
    teamNumber: row.copyTeam ?? teamNumber,
    actionType: row.actionType,
    clueText: row.clueText,
    placement: { code: row.placement.code, label: row.placement.label },
    destination: { code: row.destination.code, label: row.destination.label },
    sourceNextCopyId: row.nextCopyId ?? "",
    annotations: row.annotations.map((a) => `${a.cell}: ${a.value}`),
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export async function createQrWithFreshCodes(doc: Record<string, unknown>) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await QRCheckpoint.create({ ...doc, token: newScanToken(), manualCode: newManualCode(), tokenIssuedAt: new Date() });
    } catch (err) {
      if (isDuplicateKeyError(err) && !String((err as Error).message).includes("copyId")) continue;
      throw err;
    }
  }
  throw new Error("Could not generate a unique QR token after 5 attempts.");
}

/**
 * Validate the parsed workbook and (unless dryRun) upsert it into MongoDB.
 * Re-running is safe: QR tokens are never regenerated, organizer edits are
 * preserved, and routes of teams that already have progress are not changed
 * unless forceSequences is set.
 */
export async function importWorkbook(
  wb: ParsedWorkbook,
  opts: { dryRun: boolean; forceSequences?: boolean; rules: GameRules },
): Promise<ImportReport> {
  const ds = datasetFromWorkbook(wb);
  const issues = validateDataset(ds, opts.rules);
  const summary = summarize(wb, issues);
  if (opts.dryRun) return { fileName: wb.fileName, sha256: wb.sha256, dryRun: true, summary, applied: null, issues, importRunId: null };

  await ready();
  const applied: ImportApplied = {
    qrCreated: 0,
    qrUpdated: 0,
    qrUnchanged: 0,
    qrEditsPreserved: 0,
    sequencesCreated: 0,
    sequencesUpdated: 0,
    sequencesUnchanged: 0,
    sequencesSkipped: [],
    startingCluesPreserved: 0,
  };
  const now = new Date();

  /* 1. QR checkpoints (one per physical copy) */
  const qrByCopy = new Map<string, QRCheckpointDoc>();
  for (const sheet of wb.teamSheets) {
    for (const row of sheet.rows) {
      if (!row.copyId) continue;
      const fields = qrFieldsFromRow(row, sheet.teamNumber);
      const source = {
        sheet: row.sheet,
        row: row.rowNumber,
        scanLabel: row.scanLabel,
        clueText: row.clueText,
        placementRaw: row.placement.raw,
        destinationRaw: row.destination.raw,
        nextQrRaw: row.nextQrRaw,
        actionType: row.actionType,
        importedAt: now,
      };
      const existing = await QRCheckpoint.findOne({ copyId: row.copyId }).lean<QRCheckpointDoc>();
      if (!existing) {
        const created = await createQrWithFreshCodes({ copyId: row.copyId, ...fields, source });
        qrByCopy.set(row.copyId, created.toObject() as QRCheckpointDoc);
        applied.qrCreated++;
        continue;
      }
      const set: Record<string, unknown> = { source };
      let changed = false;
      for (const key of QR_SOURCE_FIELDS) {
        if (existing.editedFields?.includes(key)) {
          if (!same(existing[key as keyof QRCheckpointDoc], fields[key])) applied.qrEditsPreserved++;
          continue;
        }
        if (!same(existing[key as keyof QRCheckpointDoc], fields[key])) changed = true;
        set[key] = fields[key];
      }
      await QRCheckpoint.updateOne({ _id: existing._id }, { $set: set });
      if (changed) applied.qrUpdated++;
      else applied.qrUnchanged++;
      qrByCopy.set(row.copyId, { ...existing, ...set } as QRCheckpointDoc);
    }
  }

  /* 2. Team routes + starting clues */
  const blockedTeams = new Set(issues.filter((i) => BLOCKING_CODES.has(i.code) && i.teamNumber).map((i) => i.teamNumber!));
  const duplicateCopies = new Set(issues.filter((i) => i.code === "DUPLICATE_COPY_ID").map((i) => i.copyId));
  for (const sheet of wb.teamSheets) {
    const T = sheet.teamNumber;
    const team = await Team.findOne({ teamNumber: T }).lean<TeamDoc>();
    if (!team) {
      applied.sequencesSkipped.push({ teamNumber: T, reason: `Team ${T} does not exist yet. Run "npm run db:seed" first.` });
      continue;
    }
    if (blockedTeams.has(T) || sheet.rows.some((r) => duplicateCopies.has(r.copyId))) {
      applied.sequencesSkipped.push({ teamNumber: T, reason: "Route has blocking validation errors (see report); not imported." });
      continue;
    }
    const seqRow = wb.sequence.find((s) => s.teamNumber === T);
    const start = wb.starting.find((s) => s.teamNumber === T);
    const entries = sheet.rows.map((r, i) => ({
      position: i + 1,
      qr: qrByCopy.get(r.copyId)!._id,
      copyId: r.copyId,
      qrId: r.qrId,
      nextCopyId: sheet.rows[i + 1]?.copyId ?? "",
      isFinish: i === sheet.rows.length - 1,
      mandatory: true,
      scanLabel: r.scanLabel,
    }));
    const startingClue = {
      qrId: start?.qrId ?? "",
      location: start?.location ?? "",
      riddle: start?.riddle ?? "",
      answer: start?.answer ?? "",
      sourceRiddle: start?.riddle ?? "",
      sourceLocation: start?.location ?? "",
      sourceAnswer: start?.answer ?? "",
      editedFields: [] as string[],
    };

    const existing = await TeamSequence.findOne({ teamNumber: T }).lean();
    if (!existing) {
      await TeamSequence.create({
        team: team._id,
        teamNumber: T,
        version: 1,
        entries,
        startingClue,
        sourceOrder: seqRow?.qrIds ?? [],
        updatedBy: "import",
      });
      applied.sequencesCreated++;
      continue;
    }

    // Starting clue: keep organizer edits.
    const sc = existing.startingClue ?? ({} as typeof startingClue);
    const edited = new Set(sc.editedFields ?? []);
    const mergedStart = {
      ...startingClue,
      riddle: edited.has("riddle") ? sc.riddle : startingClue.riddle,
      location: edited.has("location") ? sc.location : startingClue.location,
      answer: edited.has("answer") ? sc.answer : startingClue.answer,
      editedFields: [...edited],
    };
    if (edited.size) applied.startingCluesPreserved++;

    const sameRoute = same(
      existing.entries.map((e) => e.copyId),
      entries.map((e) => e.copyId),
    );
    const set: Record<string, unknown> = { startingClue: mergedStart, sourceOrder: seqRow?.qrIds ?? [] };
    if (!sameRoute) {
      if (team.currentPosition > 0 && !opts.forceSequences) {
        applied.sequencesSkipped.push({
          teamNumber: T,
          reason: `Workbook route differs, but Team ${T} already has progress (${team.currentPosition} checkpoints). Not changed. Use --force-sequences to override.`,
        });
      } else {
        set.entries = entries;
        set.version = (existing.version ?? 1) + 1;
        set.updatedBy = "import";
      }
    } else {
      // Same route: refresh references (QR ids are stable across imports).
      set.entries = entries;
    }
    await TeamSequence.updateOne({ _id: existing._id }, { $set: set });
    if (!sameRoute && set.version) applied.sequencesUpdated++;
    else if (sameRoute) applied.sequencesUnchanged++;
  }

  const run = await ImportRun.create({
    fileName: wb.fileName,
    sha256: wb.sha256,
    dryRun: false,
    summary,
    applied,
    issues,
  });
  return { fileName: wb.fileName, sha256: wb.sha256, dryRun: false, summary, applied, issues, importRunId: String(run._id) };
}
