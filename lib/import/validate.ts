import type { ActionType, GameRules } from "../game/types";
import type { ParsedWorkbook } from "./workbook";
import {
  analyzeClue,
  analyzeLocationLabel,
  clueMatchesLocation,
  describeInfo,
  judgeClue,
} from "./clue-analysis";

export type Severity = "ERROR" | "WARNING" | "INFO";

export type Issue = {
  severity: Severity;
  code: string;
  message: string;
  teamNumber?: number | null;
  position?: number | null;
  copyId?: string | null;
  sheet?: string | null;
  cell?: string | null;
  suggestions?: string[];
};

export type DatasetEntry = {
  teamNumber: number;
  position: number;
  scanLabel: string;
  copyId: string;
  qrId: string;
  copyTeam: number | null;
  placement: { code: string; label: string };
  destination: { code: string; label: string; isFinish: boolean };
  clueText: string;
  nextCopyId: string | null;
  actionType: ActionType;
  annotations: { cell: string; value: string }[];
  sheet?: string;
  cells?: { copy: string; clue: string; placement: string; destination: string; next: string };
  status?: string;
};

export type DatasetTeam = {
  teamNumber: number;
  startingClue: { qrId: string; location: string; riddle: string; answer: string; cell?: string } | null;
  entries: DatasetEntry[];
  /** Base QR ids from the workbook "sequence sheet", when validating a workbook. */
  sequenceSheet?: { qrIds: string[]; rowNumber: number } | null;
};

export type Dataset = {
  source: "WORKBOOK" | "DATABASE";
  teams: DatasetTeam[];
  notes?: { cell: string; value: string }[];
  missingSheets?: string[];
  /** Copy ids that exist (for detecting references to unknown copies). */
  knownCopyIds?: Set<string>;
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };

/** Reward amount stated in a legacy action sentence ("You gain +1 point", "pull one point"). */
export function statedRewardAmount(clueText: string): number | null {
  const head = clueText.replace(/^[\s"“”']+/, "").split(/[.\n]/)[0] ?? "";
  const m = head.match(/\+?\s*(\d+|one|two|three|four|five)\s+points?/i);
  if (!m) return null;
  const v = m[1]!.toLowerCase();
  return /^\d+$/.test(v) ? Number(v) : NUMBER_WORDS[v] ?? null;
}

export function datasetFromWorkbook(wb: ParsedWorkbook): Dataset {
  const teams: DatasetTeam[] = [];
  const numbers = new Set<number>([
    ...wb.sequence.map((s) => s.teamNumber),
    ...wb.starting.map((s) => s.teamNumber),
    ...wb.teamSheets.map((s) => s.teamNumber),
  ]);
  for (const n of [...numbers].sort((a, b) => a - b)) {
    const sheet = wb.teamSheets.find((s) => s.teamNumber === n);
    const start = wb.starting.find((s) => s.teamNumber === n);
    const seq = wb.sequence.find((s) => s.teamNumber === n);
    teams.push({
      teamNumber: n,
      startingClue: start
        ? { qrId: start.qrId, location: start.location, riddle: start.riddle, answer: start.answer, cell: `Starting clues!A${start.rowNumber}` }
        : null,
      sequenceSheet: seq ? { qrIds: seq.qrIds, rowNumber: seq.rowNumber } : null,
      entries: (sheet?.rows ?? []).map((r) => ({
        teamNumber: n,
        position: r.order,
        scanLabel: r.scanLabel,
        copyId: r.copyId,
        qrId: r.qrId,
        copyTeam: r.copyTeam,
        placement: { code: r.placement.code, label: r.placement.label },
        destination: { code: r.destination.code, label: r.destination.label, isFinish: r.destination.isFinish },
        clueText: r.clueText,
        nextCopyId: r.nextCopyId,
        actionType: r.actionType,
        annotations: r.annotations,
        sheet: r.sheet,
        cells: r.cells,
      })),
    });
  }
  const knownCopyIds = new Set(wb.teamSheets.flatMap((s) => s.rows.map((r) => r.copyId)));
  return { source: "WORKBOOK", teams, notes: wb.sequenceNotes, missingSheets: wb.missingSheets, knownCopyIds };
}

/** Workbook-sourced replacement candidates for a clue that should lead to `target`. */
export function clueSuggestions(ds: Dataset, targetLabel: string, excludeText: string): string[] {
  const target = analyzeLocationLabel(targetLabel);
  const out: string[] = [];
  const seen = new Set<string>([norm(excludeText)]);
  const push = (t: string) => {
    const k = norm(t);
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push(t);
  };
  for (const t of ds.teams) {
    if (t.startingClue && norm(t.startingClue.location) === norm(targetLabel)) push(t.startingClue.riddle);
  }
  for (const t of ds.teams) {
    for (const e of t.entries) {
      if (e.actionType !== "NORMAL") continue;
      const info = analyzeClue(e.clueText);
      if (info.floors.size === 0 || info.kinds.size === 0) continue;
      if (clueMatchesLocation(info, target)) push(e.clueText);
    }
  }
  // Riddles elsewhere in the workbook that already lead (correctly) to the same place.
  for (const t of ds.teams) {
    t.entries.forEach((e, i) => {
      const next = t.entries[i + 1];
      if (!next || e.actionType !== "NORMAL" || norm(next.placement.label) !== norm(targetLabel)) return;
      if (judgeClue(e.clueText, e.placement.label, next.placement.label) === "OK") push(e.clueText);
    });
  }
  return out.slice(0, 4);
}

export function validateDataset(ds: Dataset, rules: GameRules): Issue[] {
  const issues: Issue[] = [];
  const add = (i: Issue) => issues.push(i);

  for (const s of ds.missingSheets ?? []) {
    add({ severity: "ERROR", code: "MISSING_SHEET", message: `Worksheet "${s}" was not found in the workbook.`, sheet: s });
  }
  for (const n of ds.notes ?? []) {
    add({
      severity: "INFO",
      code: "SEQUENCE_SHEET_NOTE",
      message: `The sequence sheet contains "${n.value}" at ${n.cell} with no content beneath it. No rules were imported from it.`,
      sheet: "sequence sheet",
      cell: n.cell,
    });
  }

  const allCopies = new Map<string, DatasetEntry[]>();
  const locLabels = new Map<string, Set<string>>();

  for (const team of ds.teams) {
    const T = team.teamNumber;
    const E = team.entries;
    if (E.length === 0) {
      add({ severity: "ERROR", code: "NO_SEQUENCE", message: `Team ${T} has no checkpoint rows.`, teamNumber: T });
      continue;
    }

    /* starting clue */
    const sc = team.startingClue;
    if (!sc) add({ severity: "ERROR", code: "MISSING_STARTING_CLUE", message: `Team ${T} has no starting clue.`, teamNumber: T });
    else {
      if (!sc.riddle.trim()) add({ severity: "ERROR", code: "EMPTY_STARTING_RIDDLE", message: `Team ${T}'s starting riddle is empty.`, teamNumber: T, cell: sc.cell });
      if (sc.qrId && sc.qrId !== E[0]!.qrId)
        add({
          severity: "ERROR",
          code: "START_QR_MISMATCH",
          message: `Team ${T}'s starting clue points to ${sc.qrId}, but the first checkpoint is ${E[0]!.copyId}.`,
          teamNumber: T,
          position: 1,
          cell: sc.cell,
        });
      if (sc.location && norm(sc.location) !== norm(E[0]!.placement.label))
        add({
          severity: "WARNING",
          code: "START_LOCATION_MISMATCH",
          message: `Team ${T}'s starting location "${sc.location}" differs from where ${E[0]!.copyId} is placed ("${E[0]!.placement.label}").`,
          teamNumber: T,
          position: 1,
          cell: sc.cell,
        });
    }

    /* sequence sheet vs team sheet */
    if (team.sequenceSheet) {
      const sheetIds = team.sequenceSheet.qrIds;
      const rowIds = E.map((e) => e.qrId);
      if (sheetIds.length !== rowIds.length)
        add({
          severity: "ERROR",
          code: "SEQUENCE_LENGTH_MISMATCH",
          message: `Team ${T}: sequence sheet lists ${sheetIds.length} QRs but the team sheet has ${rowIds.length} rows.`,
          teamNumber: T,
          sheet: "sequence sheet",
        });
      const n = Math.max(sheetIds.length, rowIds.length);
      for (let i = 0; i < n; i++) {
        if (sheetIds[i] !== rowIds[i])
          add({
            severity: "ERROR",
            code: "SEQUENCE_MISMATCH",
            message: `Team ${T}, position ${i + 1}: sequence sheet says ${sheetIds[i] ?? "(none)"} but the team sheet has ${E[i]?.copyId ?? "(none)"}.`,
            teamNumber: T,
            position: i + 1,
            sheet: "sequence sheet",
          });
      }
    } else if (ds.source === "WORKBOOK") {
      add({ severity: "ERROR", code: "MISSING_SEQUENCE_ROW", message: `Team ${T} is missing from the sequence sheet.`, teamNumber: T });
    }

    /* duplicates inside the team route */
    const seenBase = new Map<string, number>();
    for (const e of E) {
      if (seenBase.has(e.qrId))
        add({
          severity: "WARNING",
          code: "DUPLICATE_IN_SEQUENCE",
          message: `Team ${T} visits ${e.qrId} twice (positions ${seenBase.get(e.qrId)} and ${e.position}).`,
          teamNumber: T,
          position: e.position,
          copyId: e.copyId,
        });
      else seenBase.set(e.qrId, e.position);
    }

    /* per-entry checks */
    const placementCount = new Map<string, number[]>();
    let quoted = 0;
    E.forEach((e, i) => {
      const next = E[i + 1];
      const isLast = i === E.length - 1;
      const where = { teamNumber: T, position: e.position, copyId: e.copyId, sheet: e.sheet ?? null };
      (allCopies.get(e.copyId) ?? allCopies.set(e.copyId, []).get(e.copyId)!).push(e);
      for (const loc of [e.placement, e.destination]) {
        if (loc.code) (locLabels.get(loc.code) ?? locLabels.set(loc.code, new Set()).get(loc.code)!).add(loc.label);
      }
      const pk = e.placement.code || e.placement.label;
      placementCount.set(pk, [...(placementCount.get(pk) ?? []), e.position]);
      if (/^\s*["“]/.test(e.clueText) && /["”]\s*$/.test(e.clueText)) quoted++;

      if (!e.copyId) add({ severity: "ERROR", code: "MISSING_QR_COPY", message: `Team ${T}, row ${e.position}: QR copy id is empty.`, ...where, cell: e.cells?.copy });
      if (e.copyTeam !== null && e.copyTeam !== T)
        add({ severity: "WARNING", code: "COPY_TEAM_MISMATCH", message: `${e.copyId} is labelled for Team ${e.copyTeam} but appears in Team ${T}'s route.`, ...where, cell: e.cells?.copy });
      if (!e.clueText.trim()) add({ severity: "ERROR", code: "EMPTY_CLUE", message: `${e.copyId} has no clue text.`, ...where, cell: e.cells?.clue });
      if (e.status && e.status !== "ACTIVE")
        add({ severity: "WARNING", code: "INACTIVE_IN_SEQUENCE", message: `${e.copyId} is in Team ${T}'s route but marked ${e.status}.`, ...where });

      if (isLast) {
        if (e.actionType !== "FINISH" && !e.destination.isFinish)
          add({ severity: "ERROR", code: "FINISH_NOT_LAST", message: `Team ${T}'s last checkpoint (${e.copyId}) is not a finish checkpoint.`, ...where });
        if (e.nextCopyId)
          add({ severity: "WARNING", code: "FINISH_HAS_NEXT", message: `${e.copyId} is the finish but lists a next QR (${e.nextCopyId}).`, ...where, cell: e.cells?.next });
      } else {
        if (e.actionType === "FINISH")
          add({ severity: "ERROR", code: "FINISH_NOT_LAST", message: `${e.copyId} is marked as a finish but is position ${e.position} of ${E.length}.`, ...where });
        if (!e.nextCopyId)
          add({ severity: "ERROR", code: "MISSING_NEXT_QR", message: `${e.copyId} has no "Next QR" reference.`, ...where, cell: e.cells?.next });
        else if (e.nextCopyId !== next!.copyId)
          add({
            severity: "ERROR",
            code: ds.knownCopyIds && !ds.knownCopyIds.has(e.nextCopyId) ? "BROKEN_NEXT_REFERENCE" : "NEXT_QR_MISMATCH",
            message: `${e.copyId} says the next QR is ${e.nextCopyId}, but the route continues with ${next!.copyId}.`,
            ...where,
            cell: e.cells?.next,
          });
        const destMatches = e.destination.code
          ? e.destination.code === next!.placement.code
          : norm(e.destination.label) === norm(next!.placement.label);
        if (!destMatches)
          add({
            severity: "ERROR",
            code: "DESTINATION_MISMATCH",
            message: `${e.copyId}'s destination is "${e.destination.code ? e.destination.code + " " : ""}${e.destination.label}", but the next QR (${next!.copyId}) is placed at "${next!.placement.code ? next!.placement.code + " " : ""}${next!.placement.label}". Teams following this clue will look in the wrong place.`,
            ...where,
            cell: e.cells?.destination,
          });

        const verdict = judgeClue(e.clueText, e.placement.label, next!.placement.label);
        if (verdict === "DESCRIBES_CURRENT" || verdict === "MISMATCH") {
          const info = analyzeClue(e.clueText);
          add({
            severity: "WARNING",
            code: verdict === "DESCRIBES_CURRENT" ? "CLUE_DESCRIBES_CURRENT_LOCATION" : "CLUE_LOCATION_MISMATCH",
            message:
              verdict === "DESCRIBES_CURRENT"
                ? `${e.copyId}'s clue appears to describe its own placement (${e.placement.label}) — it mentions ${describeInfo(info)} — but it should lead to ${next!.placement.label}.`
                : `${e.copyId}'s clue appears to describe ${describeInfo(info)}, not the next checkpoint location (${next!.placement.label}).`,
            ...where,
            cell: e.cells?.clue,
            suggestions: clueSuggestions(ds, next!.placement.label, e.clueText),
          });
        }
      }

      /* legacy reward wording */
      if (e.actionType === "BONUS" || e.actionType === "MAGNET" || e.actionType === "SUPER_SHOES") {
        const stated = statedRewardAmount(e.clueText);
        const configured =
          e.actionType === "BONUS" ? rules.points.bonus : e.actionType === "MAGNET" ? rules.points.magnetTransfer : rules.points.superShoes;
        if (stated !== null && stated !== configured)
          add({
            severity: "WARNING",
            code: "REWARD_TEXT_CONFLICT",
            message: `${e.copyId}'s clue says "${e.clueText.replace(/^[\s"“]+/, "").split(/[.\n]/)[0]}." but the configured ${e.actionType.replace("_", " ")} reward is ${configured}. Scoring follows the configured rule; consider editing the wording.`,
            ...where,
            cell: e.cells?.clue,
          });
      }

      for (const a of e.annotations)
        add({
          severity: "INFO",
          code: "UNLABELED_ANNOTATION",
          message: `${e.copyId} has an unlabelled note "${a.value}" in ${a.cell}. Stored as an organizer annotation; its meaning is not defined in the workbook.`,
          ...where,
          cell: a.cell,
        });
    });

    for (const [loc, positions] of placementCount) {
      if (positions.length > 1)
        add({
          severity: "INFO",
          code: "MULTIPLE_COPIES_SAME_PLACE",
          message: `Team ${T} has ${positions.length} of its QR copies at ${loc} (positions ${positions.join(", ")}). Only the next one in order will be accepted.`,
          teamNumber: T,
        });
    }
    if (quoted > 0)
      add({
        severity: "INFO",
        code: "QUOTED_CLUE_TEXT",
        message: `${quoted} of Team ${T}'s clue texts are wrapped in literal quotation marks. They are preserved as written.`,
        teamNumber: T,
      });
  }

  /* cross-team checks */
  for (const [copyId, list] of allCopies) {
    if (copyId && list.length > 1)
      add({
        severity: "ERROR",
        code: "DUPLICATE_COPY_ID",
        message: `QR copy ${copyId} is used ${list.length} times (teams ${list.map((l) => l.teamNumber).join(", ")}, positions ${list.map((l) => l.position).join(", ")}).`,
        copyId,
      });
  }

  const actionsByBase = new Map<string, Map<ActionType, number[]>>();
  for (const t of ds.teams)
    for (const e of t.entries) {
      const m = actionsByBase.get(e.qrId) ?? actionsByBase.set(e.qrId, new Map()).get(e.qrId)!;
      m.set(e.actionType, [...(m.get(e.actionType) ?? []), t.teamNumber]);
    }
  for (const [base, m] of actionsByBase) {
    if (m.size <= 1) continue;
    const sorted = [...m.entries()].sort((a, b) => b[1].length - a[1].length);
    const [majority, majTeams] = sorted[0]!;
    for (const [action, teams] of sorted.slice(1))
      add({
        severity: "WARNING",
        code: "ACTION_INCONSISTENT",
        message: `${base} is ${majority.replace("_", " ")} for ${majTeams.length} team(s) but ${action.replace("_", " ")} for Team ${teams.join(", ")}. Imported as written (${action.replace("_", " ")}).`,
        teamNumber: teams.length === 1 ? teams[0] : null,
      });
  }

  const specials: ActionType[] = ["BONUS", "SUPER_SHOES", "MAGNET"];
  const teamsWithEntries = ds.teams.filter((t) => t.entries.length > 0);
  for (const sp of specials) {
    const have = teamsWithEntries.filter((t) => t.entries.some((e) => e.actionType === sp));
    if (have.length === 0 || have.length === teamsWithEntries.length) continue;
    for (const t of teamsWithEntries.filter((x) => !have.includes(x)))
      add({
        severity: "WARNING",
        code: "TEAM_MISSING_ACTION",
        message: `Team ${t.teamNumber} has no ${sp.replace("_", " ")} checkpoint, while ${have.length} other team(s) do. This may be unfair.`,
        teamNumber: t.teamNumber,
      });
  }

  const finishBases = new Set(teamsWithEntries.map((t) => t.entries[t.entries.length - 1]!.qrId));
  if (finishBases.size > 1)
    add({ severity: "WARNING", code: "FINISH_NOT_SHARED", message: `Teams finish at different QRs: ${[...finishBases].join(", ")}.` });

  for (const [code, labels] of locLabels) {
    if (labels.size > 1)
      add({ severity: "WARNING", code: "LOCATION_LABEL_CONFLICT", message: `Location ${code} has different names: ${[...labels].map((l) => `"${l}"`).join(", ")}.` });
  }

  const order: Record<Severity, number> = { ERROR: 0, WARNING: 1, INFO: 2 };
  return issues.sort(
    (a, b) => order[a.severity] - order[b.severity] || (a.teamNumber ?? 99) - (b.teamNumber ?? 99) || (a.position ?? 0) - (b.position ?? 0),
  );
}

export function summarizeIssues(issues: Issue[]) {
  const byCode: Record<string, number> = {};
  for (const i of issues) byCode[i.code] = (byCode[i.code] ?? 0) + 1;
  return {
    errors: issues.filter((i) => i.severity === "ERROR").length,
    warnings: issues.filter((i) => i.severity === "WARNING").length,
    info: issues.filter((i) => i.severity === "INFO").length,
    byCode,
  };
}
