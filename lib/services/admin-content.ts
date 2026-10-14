import { Types } from "mongoose";
import {
  ImportRun,
  QRCheckpoint,
  Team,
  TeamSequence,
  type QRCheckpointDoc,
  type TeamDoc,
  type TeamSequenceDoc,
} from "../models";
import type { ActionType, CheckpointMode, QRStatus } from "../game/types";
import { ApiError, conflict, notFound } from "../http";
import { createQrWithFreshCodes } from "../import/apply";
import { judgeClue } from "../import/clue-analysis";
import { clueSuggestions, summarizeIssues, validateDataset, type Dataset, type Issue } from "../import/validate";
import { audit, type AdminActor } from "./audit";
import { ready } from "./bootstrap";
import { formatManualCode, newManualCode, newScanToken, parseScanInput, qrSvg, scanUrl, sha256 } from "./qr";
import { getSettings, rulesOf } from "./settings";

const asId = (id: string, what = "Record") => {
  if (!Types.ObjectId.isValid(id)) throw notFound(`${what} not found.`);
  return new Types.ObjectId(id);
};

/* ------------------------------------------------------------------ */
/* QR checkpoints / clues                                              */
/* ------------------------------------------------------------------ */

type QrWithSecrets = QRCheckpointDoc & { token: string; manualCode: string; answer?: string };

async function referencesByQr() {
  const seqs = await TeamSequence.find({}, { teamNumber: 1, entries: 1 }).lean();
  const refs = new Map<string, { teamNumber: number; position: number }[]>();
  for (const s of seqs)
    for (const e of s.entries) {
      const k = String(e.qr);
      refs.set(k, [...(refs.get(k) ?? []), { teamNumber: s.teamNumber, position: e.position }]);
    }
  return refs;
}

export function qrAdminView(q: QrWithSecrets, refs: { teamNumber: number; position: number }[], baseUrl?: string) {
  return {
    id: String(q._id),
    copyId: q.copyId,
    qrId: q.qrId,
    teamNumber: q.teamNumber,
    actionType: q.actionType,
    mode: q.mode,
    status: q.status,
    clueText: q.clueText,
    challengePrompt: q.challengePrompt,
    answer: q.answer ?? "",
    hintText: q.hintText,
    rewardOverride: q.rewardOverride,
    placement: q.placement,
    destination: q.destination,
    sourceNextCopyId: q.sourceNextCopyId,
    organizerNotes: q.organizerNotes,
    annotations: q.annotations,
    editedFields: q.editedFields,
    source: q.source,
    manualCode: formatManualCode(q.manualCode),
    tokenVersion: q.tokenVersion,
    tokenIssuedAt: q.tokenIssuedAt,
    scanUrl: baseUrl ? scanUrl(baseUrl, q.token) : null,
    references: refs,
    updatedAt: q.updatedAt,
  };
}

export async function listQr(baseUrl: string) {
  await ready();
  const [qrs, refs] = await Promise.all([
    QRCheckpoint.find({}).select("+token +manualCode +answer").sort({ teamNumber: 1, copyId: 1 }).lean<QrWithSecrets[]>(),
    referencesByQr(),
  ]);
  const items = qrs.map((q) => qrAdminView(q, refs.get(String(q._id)) ?? [], baseUrl));
  return {
    items,
    warnings: {
      unassigned: items.filter((i) => i.references.length === 0).map((i) => i.copyId),
      inactive: items.filter((i) => i.status !== "ACTIVE").map((i) => i.copyId),
      multiplyReferenced: items.filter((i) => i.references.length > 1).map((i) => i.copyId),
    },
  };
}

export async function getQr(id: string, baseUrl: string) {
  await ready();
  const q = await QRCheckpoint.findById(asId(id, "QR")).select("+token +manualCode +answer").lean<QrWithSecrets>();
  if (!q) throw notFound("QR not found.");
  const refs = (await referencesByQr()).get(String(q._id)) ?? [];
  return qrAdminView(q, refs, baseUrl);
}

export type QrPatch = Partial<{
  clueText: string;
  challengePrompt: string;
  answer: string;
  hintText: string;
  actionType: ActionType;
  mode: CheckpointMode;
  status: QRStatus;
  rewardOverride: number | null;
  placement: { code: string; label: string };
  destination: { code: string; label: string };
  organizerNotes: string;
}>;

const TRACKED_SOURCE_FIELDS = new Set(["clueText", "actionType", "placement", "destination"]);

export async function updateQr(actor: AdminActor, id: string, patch: QrPatch, reason: string) {
  await ready();
  const q = await QRCheckpoint.findById(asId(id, "QR")).select("+answer").lean<QrWithSecrets>();
  if (!q) throw notFound("QR not found.");
  if (patch.mode === "ANSWER" && !(patch.answer ?? q.answer)?.trim())
    throw new ApiError(400, "BAD_REQUEST", "Answer-gated checkpoints need an accepted answer.");
  const before: Record<string, unknown> = {};
  const set: Record<string, unknown> = {};
  const edited = new Set(q.editedFields ?? []);
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const prev = (q as Record<string, unknown>)[k];
    if (JSON.stringify(prev ?? null) === JSON.stringify(v ?? null)) continue;
    before[k] = k === "answer" ? (prev ? "(set)" : "(empty)") : prev;
    set[k] = v;
    if (TRACKED_SOURCE_FIELDS.has(k)) edited.add(k);
  }
  if (Object.keys(set).length === 0) return { changed: false };
  set.editedFields = [...edited];
  await QRCheckpoint.updateOne({ _id: q._id }, { $set: set });
  const after = { ...set };
  if ("answer" in after) after.answer = after.answer ? "(set)" : "(empty)";
  delete after.editedFields;
  await audit(actor, { action: "QR_UPDATE", entityType: "QRCheckpoint", entityId: q.copyId, before, after, reason });
  return { changed: true };
}

export async function createQr(
  actor: AdminActor,
  input: {
    copyId: string;
    qrId: string;
    teamNumber: number | null;
    actionType: ActionType;
    mode: CheckpointMode;
    clueText: string;
    placement: { code: string; label: string };
    destination: { code: string; label: string };
  },
  reason: string,
) {
  await ready();
  if (await QRCheckpoint.exists({ copyId: input.copyId })) throw conflict(`QR copy ${input.copyId} already exists.`);
  const created = await createQrWithFreshCodes({ ...input, editedFields: ["clueText", "actionType", "placement", "destination"] });
  await audit(actor, { action: "QR_CREATE", entityType: "QRCheckpoint", entityId: input.copyId, after: input, reason });
  return { id: String(created._id) };
}

/** Revoke the printed token + manual code and issue new random ones. */
export async function revokeQr(actor: AdminActor, id: string, reason: string) {
  await ready();
  const q = await QRCheckpoint.findById(asId(id, "QR")).select("+token +manualCode").lean<QrWithSecrets>();
  if (!q) throw notFound("QR not found.");
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await QRCheckpoint.updateOne(
        { _id: q._id, tokenVersion: q.tokenVersion },
        {
          $set: { token: newScanToken(), manualCode: newManualCode(), tokenIssuedAt: new Date() },
          $inc: { tokenVersion: 1 },
          $push: { revokedTokens: { tokenHash: sha256(q.token), codeHash: sha256(q.manualCode), revokedAt: new Date(), reason } },
        },
      );
      break;
    } catch (err) {
      if (attempt === 4) throw err;
    }
  }
  await audit(actor, {
    action: "QR_REVOKE",
    entityType: "QRCheckpoint",
    entityId: q.copyId,
    before: { tokenVersion: q.tokenVersion },
    after: { tokenVersion: q.tokenVersion + 1 },
    reason,
  });
}

/** Test-mode verification: resolve a scanned value without changing anything. */
export async function verifyScanInput(input: string) {
  await ready();
  const parsed = parseScanInput(input);
  if (!parsed) return { valid: false, reason: "Not a recognisable QR token, scan URL or manual code." };
  const q = await QRCheckpoint.findOne(parsed.kind === "token" ? { token: parsed.value } : { manualCode: parsed.value }).lean<QRCheckpointDoc>();
  if (!q) {
    const h = sha256(parsed.value);
    const revoked = await QRCheckpoint.findOne({ $or: [{ "revokedTokens.tokenHash": h }, { "revokedTokens.codeHash": h }] }).lean();
    return revoked
      ? { valid: false, reason: `This token was REVOKED (belonged to ${revoked.copyId}). Print the current QR.` }
      : { valid: false, reason: "Unknown token — not issued by this system." };
  }
  const refs = (await referencesByQr()).get(String(q._id)) ?? [];
  return {
    valid: true,
    matchedBy: parsed.kind,
    copyId: q.copyId,
    qrId: q.qrId,
    status: q.status,
    actionType: q.actionType,
    mode: q.mode,
    placement: q.placement,
    references: refs,
    reason: refs.length === 0 ? "Valid token, but this QR is not in any team route." : null,
  };
}

export async function printData(baseUrl: string, filter: { team?: number | null; ids?: string[] }) {
  await ready();
  const q: Record<string, unknown> = {};
  if (filter.ids?.length) q._id = { $in: filter.ids.filter((i) => Types.ObjectId.isValid(i)).map((i) => new Types.ObjectId(i)) };
  else if (filter.team) q.teamNumber = filter.team;
  const [qrs, refs] = await Promise.all([
    QRCheckpoint.find(q).select("+token +manualCode").sort({ teamNumber: 1, copyId: 1 }).lean<QrWithSecrets[]>(),
    referencesByQr(),
  ]);
  const out = [];
  for (const item of qrs) {
    out.push({
      id: String(item._id),
      copyId: item.copyId,
      teamNumber: item.teamNumber,
      placement: item.placement,
      status: item.status,
      manualCode: formatManualCode(item.manualCode),
      references: refs.get(String(item._id)) ?? [],
      svg: await qrSvg(scanUrl(baseUrl, item.token)),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Sequences                                                           */
/* ------------------------------------------------------------------ */

export async function listSequences() {
  await ready();
  const [seqs, teams, qrs] = await Promise.all([
    TeamSequence.find({}).sort({ teamNumber: 1 }).lean<TeamSequenceDoc[]>(),
    Team.find({}).sort({ teamNumber: 1 }).lean<TeamDoc[]>(),
    QRCheckpoint.find({}).select("+answer").lean<QrWithSecrets[]>(),
  ]);
  const qrBy = new Map(qrs.map((q) => [String(q._id), q]));
  const ds = await buildDbDataset();
  const issues = validateDataset(ds, rulesOf(await getSettings()));
  return teams.map((t) => {
    const s = seqs.find((x) => String(x.team) === String(t._id));
    return {
      teamId: String(t._id),
      teamNumber: t.teamNumber,
      teamName: t.displayName,
      currentPosition: t.currentPosition,
      version: s?.version ?? null,
      updatedBy: s?.updatedBy ?? null,
      updatedAt: s?.updatedAt ?? null,
      startingClue: s?.startingClue ?? null,
      sourceOrder: s?.sourceOrder ?? [],
      issues: issues.filter((i) => i.teamNumber === t.teamNumber),
      entries: (s?.entries ?? []).map((e, idx, arr) => {
        const q = qrBy.get(String(e.qr));
        const next = arr[idx + 1] ? qrBy.get(String(arr[idx + 1]!.qr)) : null;
        return {
          position: e.position,
          qrRef: String(e.qr),
          copyId: e.copyId,
          qrId: e.qrId,
          nextCopyId: e.nextCopyId,
          isFinish: e.isFinish,
          missing: !q,
          actionType: q?.actionType ?? null,
          mode: q?.mode ?? null,
          status: q?.status ?? null,
          clueText: q?.clueText ?? "",
          placement: q?.placement ?? null,
          destination: q?.destination ?? null,
          nextPlacement: next?.placement ?? null,
          completed: e.position <= t.currentPosition,
          verdict: q && next ? judgeClue(q.clueText, q.placement?.label ?? "", next.placement?.label ?? "") : null,
        };
      }),
    };
  });
}

export async function updateSequence(
  actor: AdminActor,
  teamId: string,
  input: {
    copyIds?: string[];
    startingClue?: { riddle?: string; location?: string; answer?: string };
  },
  reason: string,
) {
  await ready();
  const team = await Team.findById(asId(teamId, "Team")).lean<TeamDoc>();
  if (!team) throw notFound("Team not found.");
  const seq = await TeamSequence.findOne({ team: team._id }).lean<TeamSequenceDoc>();
  const set: Record<string, unknown> = { updatedBy: actor.username };
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};

  if (input.copyIds) {
    const ids = input.copyIds.map((c) => c.trim().toUpperCase()).filter(Boolean);
    if (ids.length === 0) throw new ApiError(400, "BAD_REQUEST", "A route needs at least one checkpoint.");
    if (new Set(ids).size !== ids.length) throw new ApiError(400, "BAD_REQUEST", "A QR copy cannot appear twice in one route.");
    const qrs = await QRCheckpoint.find({ copyId: { $in: ids } }).lean<QRCheckpointDoc[]>();
    const missing = ids.filter((c) => !qrs.some((q) => q.copyId === c));
    if (missing.length) throw new ApiError(400, "BAD_REQUEST", `Unknown QR copies: ${missing.join(", ")}`);
    const oldIds = (seq?.entries ?? []).map((e) => e.copyId);
    const completedPrefix = oldIds.slice(0, team.currentPosition);
    if (team.currentPosition > 0 && completedPrefix.some((c, i) => ids[i] !== c)) {
      throw conflict(
        `This change would invalidate ${team.displayName}'s ${team.currentPosition} completed checkpoint(s). Keep positions 1–${team.currentPosition} unchanged or roll the team back first.`,
      );
    }
    if (ids.length < team.currentPosition) throw conflict("The new route is shorter than the team's current progress.");
    const elsewhere = await TeamSequence.find({ team: { $ne: team._id }, "entries.copyId": { $in: ids } }, { teamNumber: 1, entries: 1 }).lean();
    if (elsewhere.length) {
      const clashes = elsewhere.flatMap((s) => s.entries.filter((e) => ids.includes(e.copyId)).map((e) => `${e.copyId} (Team ${s.teamNumber})`));
      throw conflict(`These QR copies are already used in another team's route: ${clashes.join(", ")}`);
    }
    if (JSON.stringify(oldIds) !== JSON.stringify(ids)) {
      const byCopy = new Map(qrs.map((q) => [q.copyId, q]));
      set.entries = ids.map((c, i) => ({
        position: i + 1,
        qr: byCopy.get(c)!._id,
        copyId: c,
        qrId: byCopy.get(c)!.qrId,
        nextCopyId: ids[i + 1] ?? "",
        isFinish: i === ids.length - 1,
        mandatory: true,
        scanLabel: i === ids.length - 1 ? "Finish" : String(i + 1),
      }));
      set.version = (seq?.version ?? 0) + 1;
      before.route = oldIds;
      after.route = ids;
    }
  }

  if (input.startingClue) {
    const sc = { ...(seq?.startingClue ?? {}) } as TeamSequenceDoc["startingClue"] & Record<string, unknown>;
    const edited = new Set(sc.editedFields ?? []);
    for (const k of ["riddle", "location", "answer"] as const) {
      const v = input.startingClue[k];
      if (v === undefined || v === sc[k]) continue;
      before[`startingClue.${k}`] = sc[k];
      after[`startingClue.${k}`] = v;
      sc[k] = v;
      edited.add(k);
    }
    sc.editedFields = [...edited];
    set.startingClue = sc;
  }

  if (Object.keys(after).length === 0) return { changed: false };
  if (seq) await TeamSequence.updateOne({ _id: seq._id }, { $set: set });
  else
    await TeamSequence.create({
      team: team._id,
      teamNumber: team.teamNumber,
      version: 1,
      entries: (set.entries as unknown[]) ?? [],
      startingClue: set.startingClue ?? {},
      updatedBy: actor.username,
    });
  await audit(actor, { action: "SEQUENCE_UPDATE", entityType: "TeamSequence", entityId: `Team ${team.teamNumber}`, before, after, reason });
  return { changed: true };
}

/** Dry-run walk through a team's route: what each scan would return, without changing anything. */
export async function simulateSequence(teamId: string) {
  const all = await listSequences();
  const s = all.find((x) => x.teamId === teamId);
  if (!s) throw notFound("Team not found.");
  const steps = [
    {
      step: 0,
      scan: "(login)",
      shows: s.startingClue?.riddle ?? "",
      leadsTo: s.entries[0]?.placement?.label ?? null,
      ok: Boolean(s.startingClue?.riddle && s.entries.length),
      notes: s.startingClue?.riddle ? [] : ["No starting riddle."],
    },
    ...s.entries.map((e, i) => {
      const notes: string[] = [];
      if (e.missing) notes.push("QR record missing.");
      if (e.status && e.status !== "ACTIVE") notes.push(`QR is ${e.status}.`);
      if (e.mode === "ANSWER") notes.push("Answer required before the clue unlocks.");
      if (e.verdict === "DESCRIBES_CURRENT") notes.push("Clue seems to describe this QR's own location.");
      if (e.verdict === "MISMATCH") notes.push("Clue does not seem to describe the next location.");
      if (i === s.entries.length - 1 && !e.isFinish) notes.push("Last entry is not marked as finish.");
      return {
        step: e.position,
        scan: e.copyId,
        at: e.placement?.label ?? null,
        action: e.actionType,
        shows: e.clueText,
        leadsTo: e.nextPlacement?.label ?? (e.isFinish ? "FINISH" : null),
        ok: notes.filter((n) => !n.startsWith("Answer")).length === 0,
        notes,
      };
    }),
  ];
  return { teamNumber: s.teamNumber, teamName: s.teamName, steps, ok: steps.every((x) => x.ok) };
}

/* ------------------------------------------------------------------ */
/* Live data validation                                                */
/* ------------------------------------------------------------------ */

export async function buildDbDataset(): Promise<Dataset> {
  await ready();
  const [seqs, qrs] = await Promise.all([TeamSequence.find({}).lean<TeamSequenceDoc[]>(), QRCheckpoint.find({}).lean<QRCheckpointDoc[]>()]);
  const qrBy = new Map(qrs.map((q) => [String(q._id), q]));
  return {
    source: "DATABASE",
    knownCopyIds: new Set(qrs.map((q) => q.copyId)),
    teams: seqs
      .sort((a, b) => a.teamNumber - b.teamNumber)
      .map((s) => ({
        teamNumber: s.teamNumber,
        startingClue: s.startingClue
          ? { qrId: s.startingClue.qrId ?? "", location: s.startingClue.location ?? "", riddle: s.startingClue.riddle ?? "", answer: s.startingClue.answer ?? "" }
          : null,
        entries: s.entries.map((e, i) => {
          const q = qrBy.get(String(e.qr));
          return {
            teamNumber: s.teamNumber,
            position: e.position,
            scanLabel: e.scanLabel ?? String(e.position),
            copyId: e.copyId,
            qrId: e.qrId,
            copyTeam: q?.teamNumber ?? null,
            placement: { code: q?.placement?.code ?? "", label: q?.placement?.label ?? "" },
            destination: { code: q?.destination?.code ?? "", label: q?.destination?.label ?? "", isFinish: q?.actionType === "FINISH" },
            clueText: q?.clueText ?? "",
            nextCopyId: s.entries[i + 1]?.copyId ?? null,
            actionType: (q?.actionType as ActionType) ?? "NORMAL",
            annotations: [],
            status: q ? q.status : "MISSING",
          };
        }),
      })),
  };
}

export async function liveValidation() {
  await ready();
  const settings = await getSettings();
  const ds = await buildDbDataset();
  const issues: Issue[] = validateDataset(ds, rulesOf(settings));

  const [teams, qrs, seqs, lastRun] = await Promise.all([
    Team.find({}).lean<TeamDoc[]>(),
    QRCheckpoint.find({}).select("+token").lean<QrWithSecrets[]>(),
    TeamSequence.find({}).lean<TeamSequenceDoc[]>(),
    ImportRun.findOne({ dryRun: false }).sort({ createdAt: -1 }).lean(),
  ]);
  const refCount = new Map<string, number>();
  for (const s of seqs) for (const e of s.entries) refCount.set(String(e.qr), (refCount.get(String(e.qr)) ?? 0) + 1);
  for (const t of teams)
    if (!seqs.some((s) => String(s.team) === String(t._id)))
      issues.push({ severity: "ERROR", code: "NO_ROUTE", message: `${t.displayName} has no route configured.`, teamNumber: t.teamNumber });
  for (const s of seqs) {
    if (!teams.some((t) => String(t._id) === String(s.team)))
      issues.push({ severity: "WARNING", code: "ORPHAN_ROUTE", message: `Route for team number ${s.teamNumber} has no matching team account.` });
    for (const e of s.entries)
      if (!qrs.some((q) => String(q._id) === String(e.qr)))
        issues.push({ severity: "ERROR", code: "BROKEN_REFERENCE", message: `Team ${s.teamNumber} position ${e.position} references missing QR ${e.copyId}.`, teamNumber: s.teamNumber, position: e.position });
  }
  for (const q of qrs) {
    const n = refCount.get(String(q._id)) ?? 0;
    if (n === 0) issues.push({ severity: "INFO", code: "UNASSIGNED_QR", message: `${q.copyId} is not used in any team route.`, copyId: q.copyId });
    if (n > 1) issues.push({ severity: "ERROR", code: "DUPLICATE_REFERENCE", message: `${q.copyId} is used ${n} times across routes.`, copyId: q.copyId });
    if (!q.token) issues.push({ severity: "ERROR", code: "MISSING_TOKEN", message: `${q.copyId} has no scan token.`, copyId: q.copyId });
  }

  // Suggestions are only meaningful for clue issues; recompute against the live data.
  for (const i of issues) {
    if ((i.code === "CLUE_DESCRIBES_CURRENT_LOCATION" || i.code === "CLUE_LOCATION_MISMATCH") && i.teamNumber && i.position) {
      const t = ds.teams.find((x) => x.teamNumber === i.teamNumber);
      const e = t?.entries.find((x) => x.position === i.position);
      const next = t?.entries.find((x) => x.position === i.position! + 1);
      if (e && next) i.suggestions = clueSuggestions(ds, next.placement.label, e.clueText);
    }
  }

  const qrIdByCopy = new Map(qrs.map((q) => [q.copyId, String(q._id)]));
  return {
    generatedAt: new Date().toISOString(),
    summary: summarizeIssues(issues),
    issues: issues.map((i) => ({ ...i, qrRef: i.copyId ? qrIdByCopy.get(i.copyId) ?? null : null })),
    lastImport: lastRun
      ? {
          id: String(lastRun._id),
          at: lastRun.createdAt,
          fileName: lastRun.fileName,
          sha256: lastRun.sha256,
          summary: lastRun.summary,
          applied: lastRun.applied,
          issues: lastRun.issues,
        }
      : null,
  };
}
