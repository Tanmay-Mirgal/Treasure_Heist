import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importWorkbook } from "@/lib/import/apply";
import { parseWorkbook } from "@/lib/import/workbook";
import { datasetFromWorkbook, validateDataset } from "@/lib/import/validate";
import { DEFAULT_RULES } from "@/lib/game/types";
import { CheckpointCompletion, ImportRun, QRCheckpoint, Team, TeamSequence } from "@/lib/models";
import { updateQr } from "@/lib/services/admin-content";
import { seedTeams } from "@/lib/services/seed";
import { POST as scan } from "@/app/api/qr/scan/route";
import { buildFixtureWorkbook, defaultFixture } from "../helpers/fixture-workbook";
import { call, codeAt, dropTestDb, resetGame, seedFixture, useTestDb } from "../helpers/setup";
import { loginTeam } from "../helpers/auth";

const REAL = path.resolve(__dirname, "../../data/import/HEIST.xlsx");
const hasReal = existsSync(REAL);

describe("workbook import (synthetic fixture)", () => {
  beforeAll(async () => {
    await useTestDb("import");
    await seedFixture();
  });
  afterAll(dropTestDb);

  it("imports every team's route in workbook order with team-specific QR copies", async () => {
    const seqs = await TeamSequence.find().sort({ teamNumber: 1 }).lean();
    expect(seqs).toHaveLength(3);
    for (const fx of defaultFixture()) {
      const s = seqs.find((x) => x.teamNumber === fx.n)!;
      expect(s.entries.map((e) => e.copyId)).toEqual(fx.rows.map((r) => r.copy));
      expect(s.entries.map((e) => e.position)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(s.entries.at(-1)!.isFinish).toBe(true);
      expect(s.entries.at(-1)!.qrId).toBe("QR15");
      expect(s.sourceOrder).toEqual(fx.rows.map((r) => r.copy.split("-")[0]));
    }
    expect(await QRCheckpoint.countDocuments()).toBe(18);
  });

  it("associates each starting clue with the correct team and first QR", async () => {
    for (const fx of defaultFixture()) {
      const s = await TeamSequence.findOne({ teamNumber: fx.n }).lean();
      expect(s!.startingClue).toMatchObject({ qrId: fx.start.qr, riddle: fx.start.riddle, location: fx.start.location, answer: fx.start.answer });
      expect(s!.entries[0]!.qrId).toBe(fx.start.qr);
    }
  });

  it("preserves the original clue text byte-for-byte, plus destinations and next-QR references", async () => {
    for (const fx of defaultFixture()) {
      for (const row of fx.rows) {
        const q = await QRCheckpoint.findOne({ copyId: row.copy }).lean();
        expect(q!.clueText).toBe(row.clue);
        expect(q!.source!.clueText).toBe(row.clue);
        expect(q!.placement!.label).toBe(row.placement.split("—")[1]!.trim());
        expect(q!.placement!.code).toBe(row.placement.split("—")[0]!.trim());
        expect(q!.sourceNextCopyId).toBe(row.next === "—" ? "" : row.next);
      }
    }
  });

  it("detects the special actions from the clue text", async () => {
    const actions = Object.fromEntries((await QRCheckpoint.find({ teamNumber: 1 }).lean()).map((q) => [q.copyId, q.actionType]));
    expect(actions).toMatchObject({ "QR01-T1": "NORMAL", "QR16-T1": "MAGNET", "QR18-T1": "BONUS", "QR17-T1": "SUPER_SHOES", "QR15-T1": "FINISH" });
  });

  it("is idempotent: re-importing changes nothing and creates no duplicates or new tokens", async () => {
    const before = await QRCheckpoint.collection.find({}, { projection: { copyId: 1, token: 1, manualCode: 1 } }).toArray();
    const wb = await parseWorkbook(await buildFixtureWorkbook(), "fixture.xlsx");
    const again = await importWorkbook(wb, { dryRun: false, rules: DEFAULT_RULES });
    expect(again.applied).toMatchObject({ qrCreated: 0, qrUpdated: 0, qrUnchanged: 18, sequencesCreated: 0, sequencesUnchanged: 3 });
    expect(await QRCheckpoint.countDocuments()).toBe(18);
    expect(await TeamSequence.countDocuments()).toBe(3);
    const after = await QRCheckpoint.collection.find({}, { projection: { copyId: 1, token: 1, manualCode: 1 } }).toArray();
    expect(after.map((q) => [q.copyId, q.token, q.manualCode]).sort()).toEqual(before.map((q) => [q.copyId, q.token, q.manualCode]).sort());
    expect(await seedTeams(3)).toMatchObject({ created: [] });
    expect(await Team.countDocuments()).toBe(3);
    expect(await ImportRun.countDocuments()).toBeGreaterThanOrEqual(2);
  });

  it("re-importing does not reset active game progress", async () => {
    await resetGame();
    const t1 = await loginTeam(1);
    await call(scan, { cookie: t1, body: { input: await codeAt(1, 1), source: "MANUAL" } });
    await call(scan, { cookie: t1, body: { input: await codeAt(1, 2), source: "MANUAL" } });
    const before = await Team.findOne({ teamNumber: 1 }).lean();
    const wb = await parseWorkbook(await buildFixtureWorkbook(), "fixture.xlsx");
    await importWorkbook(wb, { dryRun: false, rules: DEFAULT_RULES });
    const after = await Team.findOne({ teamNumber: 1 }).lean();
    expect(after!.currentPosition).toBe(2);
    expect(after!.score).toBe(before!.score);
    expect(await CheckpointCompletion.countDocuments({ voided: false })).toBe(2);
  });

  it("does not change a route that already has progress even if the workbook order changed", async () => {
    const fx = defaultFixture();
    // swap two checkpoints in Team 1's route
    const swapped = JSON.parse(JSON.stringify(fx)) as typeof fx;
    const rows = swapped[0]!.rows;
    [rows[3], rows[4]] = [rows[4]!, rows[3]!];
    const wb = await parseWorkbook(await buildFixtureWorkbook(swapped), "swapped.xlsx");
    const report = await importWorkbook(wb, { dryRun: false, rules: DEFAULT_RULES });
    expect(report.applied!.sequencesSkipped.some((s) => s.teamNumber === 1 && /already has progress/.test(s.reason))).toBe(true);
    const s1 = await TeamSequence.findOne({ teamNumber: 1 }).lean();
    expect(s1!.entries.map((e) => e.copyId)).toEqual(fx[0]!.rows.map((r) => r.copy));
    // restore the canonical workbook for later tests
    await importWorkbook(await parseWorkbook(await buildFixtureWorkbook(), "fixture.xlsx"), { dryRun: false, rules: DEFAULT_RULES });
  });

  it("preserves organizer edits on re-import", async () => {
    const qr = await QRCheckpoint.findOne({ copyId: "QR03-T2" }).lean();
    await updateQr({ id: qr!._id, username: "Tanmay" }, String(qr!._id), { clueText: "ORGANIZER REWRITE", hintText: "a hint" }, "clearer wording");
    const report = await importWorkbook(await parseWorkbook(await buildFixtureWorkbook(), "fixture.xlsx"), { dryRun: false, rules: DEFAULT_RULES });
    const after = await QRCheckpoint.findOne({ copyId: "QR03-T2" }).lean();
    expect(after!.clueText).toBe("ORGANIZER REWRITE");
    expect(after!.hintText).toBe("a hint");
    expect(after!.source!.clueText).not.toBe("ORGANIZER REWRITE"); // verbatim source kept alongside
    expect(report.applied!.qrEditsPreserved).toBeGreaterThanOrEqual(1);
  });
});

describe("workbook validation", () => {
  it("reports a broken next-QR reference", async () => {
    const fx = defaultFixture();
    fx[0]!.rows[1]!.next = "QR99-T1";
    const ds = datasetFromWorkbook(await parseWorkbook(await buildFixtureWorkbook(fx)));
    const issues = validateDataset(ds, DEFAULT_RULES);
    const broken = issues.find((i) => i.code === "BROKEN_NEXT_REFERENCE");
    expect(broken).toBeTruthy();
    expect(broken!.severity).toBe("ERROR");
    expect(broken!.teamNumber).toBe(1);
    expect(broken!.position).toBe(2);
  });

  it("reports a destination that does not match where the next QR is placed", async () => {
    const fx = defaultFixture();
    fx[1]!.rows[2]!.dest = "L12 — Library entrance";
    const issues = validateDataset(datasetFromWorkbook(await parseWorkbook(await buildFixtureWorkbook(fx))), DEFAULT_RULES);
    const bad = issues.find((i) => i.code === "DESTINATION_MISMATCH");
    expect(bad!.teamNumber).toBe(2);
    expect(bad!.message).toContain("Library entrance");
  });

  it("reports duplicate QR copy ids and a missing starting clue", async () => {
    const fx = defaultFixture();
    fx[1]!.rows[0]!.copy = fx[0]!.rows[0]!.copy;
    fx[2]!.start = { qr: "QR05", location: "", riddle: "", answer: "" };
    const issues = validateDataset(datasetFromWorkbook(await parseWorkbook(await buildFixtureWorkbook(fx))), DEFAULT_RULES);
    expect(issues.some((i) => i.code === "DUPLICATE_COPY_ID")).toBe(true);
    expect(issues.some((i) => i.code === "EMPTY_STARTING_RIDDLE" && i.teamNumber === 3)).toBe(true);
  });

  it("reports a sequence-sheet order that disagrees with the team sheet, and a non-finish last row", async () => {
    const fx = defaultFixture();
    fx[0]!.sequence = ["QR01", "QR18", "QR16", "QR17", "QR02", "QR15"]; // QR16/QR18 swapped vs team sheet
    fx[2]!.rows[5]!.dest = "L08 — Fourth-floor corridor";
    fx[2]!.rows[5]!.clue = "Not the vault.";
    const issues = validateDataset(datasetFromWorkbook(await parseWorkbook(await buildFixtureWorkbook(fx))), DEFAULT_RULES);
    expect(issues.filter((i) => i.code === "SEQUENCE_MISMATCH" && i.teamNumber === 1).length).toBeGreaterThanOrEqual(2);
  });

  it("flags legacy reward wording that conflicts with the authoritative rules, without changing the text", async () => {
    const issues = validateDataset(datasetFromWorkbook(await parseWorkbook(await buildFixtureWorkbook())), DEFAULT_RULES);
    const conflicts = issues.filter((i) => i.code === "REWARD_TEXT_CONFLICT");
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts.every((c) => c.severity === "WARNING")).toBe(true);
  });

  it("a dry run touches no database", async () => {
    const wb = await parseWorkbook(await buildFixtureWorkbook());
    const r = await importWorkbook(wb, { dryRun: true, rules: DEFAULT_RULES });
    expect(r.dryRun).toBe(true);
    expect(r.applied).toBeNull();
    expect(r.summary).toMatchObject({ teamsFound: 3, startingCluesFound: 3, qrCopiesFound: 18, sharedFinish: "QR15" });
  });
});

describe.skipIf(!hasReal)("the real HEIST.xlsx workbook", () => {
  let wb: Awaited<ReturnType<typeof parseWorkbook>>;
  beforeAll(async () => {
    await useTestDb("realimport");
    await seedFixture(); // creates admin; we then replace routes with the real data
    await seedTeams(10);
    wb = await parseWorkbook(readFileSync(REAL), "HEIST.xlsx");
    await TeamSequence.deleteMany({});
    await QRCheckpoint.deleteMany({});
    await importWorkbook(wb, { dryRun: false, rules: DEFAULT_RULES });
  });
  afterAll(dropTestDb);

  it("finds 10 teams, 10 starting clues, 110 sequence entries and 110 team-specific QR copies", async () => {
    const dry = await importWorkbook(wb, { dryRun: true, rules: DEFAULT_RULES });
    expect(dry.summary).toMatchObject({
      teamsFound: 10,
      startingCluesFound: 10,
      sequenceEntriesFound: 110,
      qrCopiesFound: 110,
      baseQrIdsFound: 30,
      sharedFinish: "QR15",
    });
    expect(await TeamSequence.countDocuments()).toBe(10);
    expect(await QRCheckpoint.countDocuments()).toBe(110);
  });

  it("preserves each team's intended QR order from the sequence sheet", async () => {
    for (const row of wb.sequence) {
      const s = await TeamSequence.findOne({ teamNumber: row.teamNumber }).lean();
      expect(s!.entries.map((e) => e.qrId), `Team ${row.teamNumber}`).toEqual(row.qrIds);
      expect(s!.entries).toHaveLength(11);
      expect(s!.entries.at(-1)!.copyId).toBe(`QR15-T${row.teamNumber}`);
    }
  });

  it("starts every team at its own first QR with its own starting riddle", async () => {
    const firsts = new Set<string>();
    for (const sc of wb.starting) {
      const s = await TeamSequence.findOne({ teamNumber: sc.teamNumber }).lean();
      expect(s!.startingClue!.riddle).toBe(sc.riddle);
      expect(s!.startingClue!.answer).toBe(sc.answer);
      expect(s!.startingClue!.qrId).toBe(sc.qrId);
      expect(s!.entries[0]!.qrId).toBe(sc.qrId);
      firsts.add(s!.entries[0]!.qrId);
    }
    expect(firsts.size).toBeGreaterThan(1); // teams do not all begin in the same place
  });

  it("preserves original clue text exactly and keeps the verbatim copy", async () => {
    for (const sheet of wb.teamSheets)
      for (const row of sheet.rows) {
        const q = await QRCheckpoint.findOne({ copyId: row.copyId }).lean();
        expect(q!.clueText).toBe(row.clueText);
        expect(q!.source!.clueText).toBe(row.clueText);
      }
  });

  it("reports the known inconsistencies in the workbook instead of silently changing the data", async () => {
    const issues = validateDataset(datasetFromWorkbook(wb), DEFAULT_RULES);
    const count = (code: string) => issues.filter((i) => i.code === code).length;
    expect(count("DESTINATION_MISMATCH")).toBe(3); // Team 1 #10, Team 6 #10, Team 7 #10
    expect(count("REWARD_TEXT_CONFLICT")).toBeGreaterThanOrEqual(10);
    expect(issues.some((i) => i.code === "ACTION_INCONSISTENT" && /QR17/.test(i.message))).toBe(true); // Team 4's QR17 is not SUPER SHOES
    expect(issues.some((i) => i.code === "CLUE_DESCRIBES_CURRENT_LOCATION")).toBe(true);
    expect(issues.some((i) => i.code === "UNLABELED_ANNOTATION" && /IPHONE/.test(i.message))).toBe(true);
    expect(issues.some((i) => i.code === "DUPLICATE_COPY_ID")).toBe(false);
    expect(issues.some((i) => i.code === "SEQUENCE_MISMATCH")).toBe(false);
  });

  it("reimporting the real workbook is idempotent", async () => {
    const r = await importWorkbook(wb, { dryRun: false, rules: DEFAULT_RULES });
    expect(r.applied).toMatchObject({ qrCreated: 0, qrUpdated: 0, qrUnchanged: 110, sequencesCreated: 0, sequencesUnchanged: 10 });
    expect(await QRCheckpoint.countDocuments()).toBe(110);
  });
});
