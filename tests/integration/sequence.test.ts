import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as scan } from "@/app/api/qr/scan/route";
import { GET as teamMe } from "@/app/api/team/me/route";
import { GET as scanResult } from "@/app/api/team/scans/[id]/route";
import { POST as verifyNext } from "@/app/api/admin/teams/[id]/recovery/route";
import { CheckpointCompletion, QRCheckpoint, ScanEvent, ScoreTransaction, Team, TeamSequence } from "@/lib/models";
import { revokeQr, liveValidation } from "@/lib/services/admin-content";
import { NEUTRAL_REJECT_MESSAGE } from "@/lib/game/types";
import { call, codeAt, dropTestDb, resetGame, seedFixture, setEvent, teamId, tokenAt, useTestDb } from "../helpers/setup";
import { loginAdmin, loginTeam } from "../helpers/auth";

let t1: string;
let t2: string;

beforeAll(async () => {
  await useTestDb("sequence");
  await seedFixture();
});
afterAll(dropTestDb);
beforeEach(async () => {
  await resetGame();
  t1 = await loginTeam(1);
  t2 = await loginTeam(2);
});

const doScan = (cookie: string, input: string, source = "MANUAL") => call(scan, { cookie, body: { input, source } });

describe("sequence validation", () => {
  it("starts each team at its own first checkpoint (different starting QRs)", async () => {
    const s1 = await TeamSequence.findOne({ teamNumber: 1 }).lean();
    const s2 = await TeamSequence.findOne({ teamNumber: 2 }).lean();
    expect(s1!.entries[0]!.copyId).toBe("QR01-T1");
    expect(s2!.entries[0]!.copyId).toBe("QR03-T2");
    expect(s1!.startingClue!.riddle).toContain("Pinned but never imprisoned");
    expect(s2!.startingClue!.riddle).toContain("I join doors together");
    const me = await call(teamMe, { cookie: t1 });
    expect(me.body.data.mission.kind).toBe("START");
    expect(me.body.data.mission.text).toContain("Pinned but never imprisoned");
    expect(me.body.data.progress).toMatchObject({ completed: 0, total: 6, currentMission: 1 });
  });

  it("accepts the expected first QR and shows the clue that belongs to it", async () => {
    const r = await doScan(t1, await codeAt(1, 1));
    expect(r.status).toBe(200);
    expect(r.body.data.outcome).toBe("ACCEPTED");
    expect(r.body.data.checkpoint.position).toBe(1);
    expect(r.body.data.checkpoint.clueText).toContain("Team 1 clue 1");
    const me = await call(teamMe, { cookie: t1 });
    expect(me.body.data.progress.completed).toBe(1);
    expect(me.body.data.mission.kind).toBe("CLUE");
    expect(me.body.data.mission.text).toContain("Team 1 clue 1");
  });

  it("accepts a camera-style scan of the QR URL as well as the typed code", async () => {
    const token = await tokenAt(1, 1);
    const r = await doScan(t1, `https://treasure-heist.vercel.app/s/${token}`, "CAMERA");
    expect(r.body.data.outcome).toBe("ACCEPTED");
  });

  it("accepts the next QR in order and keeps going to the finish", async () => {
    for (let p = 1; p <= 6; p++) {
      const r = await doScan(t1, await codeAt(1, p));
      expect(r.body.data.outcome, `position ${p}`).toBe("ACCEPTED");
    }
    const team = await Team.findOne({ teamNumber: 1 }).lean();
    expect(team!.currentPosition).toBe(6);
    expect(team!.finishedAt).toBeTruthy();
  });

  it("rejects an out-of-order QR with the neutral message and no progress", async () => {
    const r = await doScan(t1, await codeAt(1, 3));
    expect(r.status).toBe(200);
    expect(r.body.data.outcome).toBe("REJECTED");
    expect(r.body.data.message).toBe(NEUTRAL_REJECT_MESSAGE);
    expect(r.body.data.checkpoint).toBeUndefined();
    const team = await Team.findOne({ teamNumber: 1 }).lean();
    expect(team!.currentPosition).toBe(0);
    expect(team!.score).toBe(0);
    const ev = await ScanEvent.findOne({ outcome: "REJECTED" }).lean();
    expect(ev!.reason).toBe("OUT_OF_ORDER");
    expect(ev!.expectedPosition).toBe(1);
  });

  it("cannot skip a checkpoint by scanning a later one after completing an earlier one", async () => {
    await doScan(t1, await codeAt(1, 1));
    const skip = await doScan(t1, await codeAt(1, 4));
    expect(skip.body.data.outcome).toBe("REJECTED");
    expect((await Team.findOne({ teamNumber: 1 }).lean())!.currentPosition).toBe(1);
  });

  it("rejects a QR copy that belongs to another team's route", async () => {
    const r = await doScan(t1, await codeAt(2, 1));
    expect(r.body.data.outcome).toBe("REJECTED");
    expect(r.body.data.message).toBe(NEUTRAL_REJECT_MESSAGE);
    const ev = await ScanEvent.findOne({ outcome: "REJECTED" }).lean();
    expect(ev!.reason).toBe("NOT_IN_TEAM_SEQUENCE");
  });

  it("gives identical responses for unknown, foreign and out-of-order scans (nothing to learn)", async () => {
    const unknown = await doScan(t1, "ZZZZ-ZZZZ");
    const foreign = await doScan(t1, await codeAt(2, 1));
    const ooo = await doScan(t1, await codeAt(1, 5));
    const garbage = await doScan(t1, "https://evil.example.com/not-a-qr");
    const shape = (r: typeof unknown) => ({ outcome: r.body.data.outcome, message: r.body.data.message, keys: Object.keys(r.body.data).filter((k) => k !== "scanId").sort() });
    expect(shape(foreign)).toEqual(shape(unknown));
    expect(shape(ooo)).toEqual(shape(unknown));
    expect(shape(garbage)).toEqual(shape(unknown));
  });

  it("a completed QR cannot award points again, create another completion or advance", async () => {
    await doScan(t1, await codeAt(1, 1));
    const again = await doScan(t1, await codeAt(1, 1));
    expect(again.body.data.outcome).toBe("DUPLICATE");
    expect(again.body.data.checkpoint.pointsAwarded).toBe(0);
    const team = await Team.findOne({ teamNumber: 1 }).lean();
    expect(team!.score).toBe(1);
    expect(team!.currentPosition).toBe(1);
    expect(await CheckpointCompletion.countDocuments({ voided: false })).toBe(1);
    expect(await ScoreTransaction.countDocuments()).toBe(1);
  });

  it("an earlier (non-current) completed QR is a duplicate and reveals no clue", async () => {
    await doScan(t1, await codeAt(1, 1));
    await doScan(t1, await codeAt(1, 2));
    const old = await doScan(t1, await codeAt(1, 1));
    expect(old.body.data.outcome).toBe("DUPLICATE");
    expect(old.body.data.checkpoint).toBeUndefined();
  });

  it("a revoked QR token is rejected; the regenerated one works", async () => {
    const oldCode = await codeAt(1, 1);
    const oldToken = await tokenAt(1, 1);
    const qr = await QRCheckpoint.findOne({ copyId: "QR01-T1" }).lean();
    await revokeQr({ id: qr!._id, username: "Tanmay" }, String(qr!._id), "label was photographed");
    const viaCode = await doScan(t1, oldCode);
    const viaToken = await doScan(t1, oldToken);
    expect(viaCode.body.data.outcome).toBe("REJECTED");
    expect(viaToken.body.data.outcome).toBe("REJECTED");
    expect(viaCode.body.data.message).toBe(NEUTRAL_REJECT_MESSAGE);
    expect((await ScanEvent.findOne({ outcome: "REJECTED" }).sort({ createdAt: -1 }).lean())!.reason).toBe("REVOKED_TOKEN");
    const fresh = await doScan(t1, await codeAt(1, 1));
    expect(fresh.body.data.outcome).toBe("ACCEPTED");
  });

  it("a damaged/inactive QR is not accepted and does not advance; the organizer can verify manually", async () => {
    await QRCheckpoint.updateOne({ copyId: "QR01-T1" }, { $set: { status: "DAMAGED" } });
    const r = await doScan(t1, await codeAt(1, 1));
    expect(r.body.data.outcome).toBe("INACTIVE_QR");
    expect((await Team.findOne({ teamNumber: 1 }).lean())!.currentPosition).toBe(0);

    const admin = await loginAdmin();
    const v = await call(verifyNext, { cookie: admin, params: { id: await teamId(1) }, body: { action: "verify-next", reason: "QR torn off wall; verified in person" } });
    expect(v.status).toBe(200);
    expect(v.body.data.position).toBe(1);
    expect((await Team.findOne({ teamNumber: 1 }).lean())!.currentPosition).toBe(1);
    expect((await CheckpointCompletion.findOne({ position: 1 }).lean())!.source).toBe("ADMIN");
  });

  it("scan results are only readable by the team that made them", async () => {
    const r = await doScan(t1, await codeAt(1, 1));
    const id = r.body.data.scanId as string;
    expect((await call(scanResult, { cookie: t1, params: { id } })).status).toBe(200);
    expect((await call(scanResult, { cookie: t2, params: { id } })).status).toBe(404);
  });

  it("requires authentication to scan", async () => {
    const r = await call(scan, { body: { input: await codeAt(1, 1), source: "MANUAL" } });
    expect(r.status).toBe(401);
  });

  it("validates the request body", async () => {
    expect((await call(scan, { cookie: t1, body: {} })).status).toBe(400);
    expect((await call(scan, { cookie: t1, body: { input: "x".repeat(600) } })).status).toBe(400);
    expect((await call(scan, { cookie: t1, body: { input: "abc", source: "TELEPATHY" } })).status).toBe(400);
  });

  it("rate-limits a burst of unrecognised scans", async () => {
    let limited = false;
    for (let i = 0; i < 16; i++) {
      const r = await doScan(t1, "ZZZZ-ZZZ" + (i % 9));
      if (r.status === 429) limited = true;
    }
    expect(limited).toBe(true);
    // the other team is not affected
    expect((await doScan(t2, await codeAt(2, 1))).body.data.outcome).toBe("ACCEPTED");
  });
});

describe("finish", () => {
  it("scanning the finish QR early does not finish the team", async () => {
    const r = await doScan(t1, await codeAt(1, 6));
    expect(r.body.data.outcome).toBe("REJECTED");
    const team = await Team.findOne({ teamNumber: 1 }).lean();
    expect(team!.finishedAt).toBeNull();
    expect(team!.score).toBe(0);
  });

  it("finishing happens exactly once and then stops all progression and rewards", async () => {
    for (let p = 1; p <= 6; p++) await doScan(t1, await codeAt(1, p));
    const before = await Team.findOne({ teamNumber: 1 }).lean();
    expect(before!.finishedAt).toBeTruthy();
    const again = await doScan(t1, await codeAt(1, 6));
    expect(again.body.data.outcome).toBe("ALREADY_FINISHED");
    const later = await doScan(t1, await codeAt(1, 2));
    expect(["ALREADY_FINISHED", "DUPLICATE"]).toContain(later.body.data.outcome);
    const after = await Team.findOne({ teamNumber: 1 }).lean();
    expect(after!.score).toBe(before!.score);
    expect(String(after!.finishedAt)).toBe(String(before!.finishedAt));
    const me = await call(teamMe, { cookie: t1 });
    expect(me.body.data.progress.finished).toBe(true);
  });
});

describe("event state gates scanning", () => {
  it("refuses scans before the event starts, while paused, after the end and when participation is off", async () => {
    const code = await codeAt(1, 1);
    for (const [patch, label] of [
      [{ status: "SETUP", testMode: false }, "not started"],
      [{ status: "PAUSED", pausedAt: new Date() }, "paused"],
      [{ status: "ENDED", endedAt: new Date() }, "ended"],
      [{ status: "RUNNING", participationEnabled: false }, "participation off"],
    ] as const) {
      await resetGame();
      await setEvent(patch);
      const r = await doScan(t1, code);
      expect(r.body.data.outcome, label).toBe("EVENT_CLOSED");
      expect((await Team.findOne({ teamNumber: 1 }).lean())!.currentPosition, label).toBe(0);
      expect(await ScoreTransaction.countDocuments(), label).toBe(0);
    }
  });

  it("expires the run when the server timer reaches zero", async () => {
    await setEvent({ "timer.enabled": true, "timer.durationMinutes": 10, startedAt: new Date(Date.now() - 11 * 60_000) });
    const r = await doScan(t1, await codeAt(1, 1));
    expect(r.body.data.outcome).toBe("EVENT_CLOSED");
  });

  it("test mode lets teams rehearse, tagged as test data", async () => {
    await setEvent({ status: "SETUP", testMode: true, startedAt: null });
    const r = await doScan(t1, await codeAt(1, 1));
    expect(r.body.data.outcome).toBe("ACCEPTED");
    expect(r.body.data.isTest).toBe(true);
    expect((await ScoreTransaction.findOne().lean())!.isTest).toBe(true);
  });

  it("timer state survives refreshes: it is computed from server timestamps", async () => {
    await setEvent({ "timer.enabled": true, "timer.durationMinutes": 60, startedAt: new Date(Date.now() - 20 * 60_000) });
    const a = (await call(teamMe, { cookie: t1 })).body.data.event.timer;
    const b = (await call(teamMe, { cookie: t1 })).body.data.event.timer;
    expect(a.remainingMs).toBeGreaterThan(39 * 60_000);
    expect(a.remainingMs).toBeLessThan(40 * 60_000 + 1000);
    expect(Math.abs(a.remainingMs - b.remainingMs)).toBeLessThan(2000);
  });
});

describe("data validation", () => {
  it("detects a route that references a missing QR record", async () => {
    const raw = await QRCheckpoint.collection.findOne({ copyId: "QR04-T2" }); // includes select:false secrets
    await QRCheckpoint.collection.deleteOne({ _id: raw!._id });
    const report = await liveValidation();
    const broken = report.issues.filter((i) => i.code === "BROKEN_REFERENCE");
    expect(broken.length).toBeGreaterThan(0);
    expect(broken[0]!.message).toContain("QR04-T2");
    expect(report.summary.errors).toBeGreaterThan(0);
    await QRCheckpoint.collection.insertOne(raw!);
  });

  it("a team with a missing QR cannot progress past it and is not given the finish", async () => {
    const qr = await QRCheckpoint.findOne({ copyId: "QR02-T1" }).lean();
    await QRCheckpoint.updateOne({ _id: qr!._id }, { $set: { status: "INACTIVE" } });
    for (let p = 1; p <= 4; p++) await doScan(t1, await codeAt(1, p));
    const blocked = await doScan(t1, await codeAt(1, 5));
    expect(blocked.body.data.outcome).toBe("INACTIVE_QR");
    expect((await Team.findOne({ teamNumber: 1 }).lean())!.finishedAt).toBeNull();
  });

  it("completion rows are unique per team and position", async () => {
    await doScan(t1, await codeAt(1, 1));
    const c = await CheckpointCompletion.findOne().lean();
    await expect(
      CheckpointCompletion.create({ team: c!.team, qr: c!.qr, copyId: c!.copyId, position: 1, sequenceVersion: 1, actionType: "NORMAL", idempotencyKey: "dup-test", source: "SCAN" }),
    ).rejects.toThrow(/duplicate key|E11000/);
  });
});
