import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as scan } from "@/app/api/qr/scan/route";
import { POST as hint } from "@/app/api/team/hint/route";
import { POST as answer } from "@/app/api/checkpoints/complete/route";
import { GET as teamMe } from "@/app/api/team/me/route";
import { GET as teamScore } from "@/app/api/team/score/route";
import { GET as leaderboard } from "@/app/api/leaderboard/route";
import { PATCH as patchSettings } from "@/app/api/admin/settings/route";
import { POST as recovery } from "@/app/api/admin/teams/[id]/recovery/route";
import { POST as eventAction } from "@/app/api/admin/event/[action]/route";
import { CheckpointCompletion, HintUsage, PowerUpActivation, QRCheckpoint, ScoreTransaction, Team } from "@/lib/models";
import { call, codeAt, dropTestDb, resetGame, seedFixture, setEvent, teamId, useTestDb } from "../helpers/setup";
import { loginAdmin, loginTeam } from "../helpers/auth";

let t1: string;

beforeAll(async () => {
  await useTestDb("scoring");
  await seedFixture();
});
afterAll(dropTestDb);
beforeEach(async () => {
  await resetGame();
  t1 = await loginTeam(1);
});

const doScan = (cookie: string, input: string) => call(scan, { cookie, body: { input, source: "MANUAL" } });
const score = async (n = 1) => (await Team.findOne({ teamNumber: n }).lean())!.score;

// Team 1 route: 1 NORMAL, 2 MAGNET, 3 BONUS, 4 SUPER_SHOES, 5 NORMAL, 6 FINISH
describe("point rules", () => {
  it("normal checkpoint grants +1", async () => {
    const r = await doScan(t1, await codeAt(1, 1));
    expect(r.body.data.checkpoint.pointsAwarded).toBe(1);
    expect(await score()).toBe(1);
  });

  it("MAGNET checkpoint itself grants no points but a single-use power-up", async () => {
    await doScan(t1, await codeAt(1, 1));
    const r = await doScan(t1, await codeAt(1, 2));
    expect(r.body.data.checkpoint.actionType).toBe("MAGNET");
    expect(r.body.data.checkpoint.pointsAwarded).toBe(0);
    expect(r.body.data.powerUp.type).toBe("MAGNET");
    expect(await score()).toBe(1);
    expect(await PowerUpActivation.countDocuments({ status: "AVAILABLE" })).toBe(1);
  });

  it("BONUS grants +2 in total — not +1 normal plus +2", async () => {
    for (let p = 1; p <= 2; p++) await doScan(t1, await codeAt(1, p));
    const r = await doScan(t1, await codeAt(1, 3));
    expect(r.body.data.checkpoint.actionType).toBe("BONUS");
    expect(r.body.data.checkpoint.pointsAwarded).toBe(2);
    expect(await score()).toBe(3);
    const tx = await ScoreTransaction.find({ type: "BONUS" }).lean();
    expect(tx).toHaveLength(1);
    expect(tx[0]!.delta).toBe(2);
  });

  it("SUPER SHOES grants +2 and one extra hint", async () => {
    for (let p = 1; p <= 3; p++) await doScan(t1, await codeAt(1, p));
    const r = await doScan(t1, await codeAt(1, 4));
    expect(r.body.data.checkpoint.actionType).toBe("SUPER_SHOES");
    expect(r.body.data.checkpoint.pointsAwarded).toBe(2);
    expect(r.body.data.hintsGranted).toBe(1);
    expect(await score()).toBe(5);
    expect((await Team.findOne({ teamNumber: 1 }).lean())!.hints.available).toBe(1);
  });

  it("full route total = 1 + 0 + 2 + 2 + 1 + 1 and the ledger equals the score", async () => {
    for (let p = 1; p <= 6; p++) await doScan(t1, await codeAt(1, p));
    expect(await score()).toBe(7);
    const sum = (await ScoreTransaction.aggregate([{ $group: { _id: null, s: { $sum: "$delta" } } }]))[0].s;
    expect(sum).toBe(7);
    const mine = await call(teamScore, { cookie: t1 });
    expect(mine.body.data.score).toBe(7);
    expect(mine.body.data.consistent).toBe(true);
    expect(mine.body.data.breakdown.BONUS).toEqual({ count: 1, points: 2 });
    expect(mine.body.data.breakdown.SUPER_SHOES).toEqual({ count: 1, points: 2 });
    expect(mine.body.data.breakdown.CHECKPOINT).toEqual({ count: 2, points: 2 });
  });

  it("repeated scans never create duplicate rewards", async () => {
    const code = await codeAt(1, 1);
    for (let i = 0; i < 4; i++) await doScan(t1, code);
    expect(await score()).toBe(1);
    expect(await ScoreTransaction.countDocuments()).toBe(1);
  });

  it("concurrent duplicate requests create exactly one reward", async () => {
    const code = await codeAt(1, 1);
    const results = await Promise.all(Array.from({ length: 12 }, () => doScan(t1, code)));
    const outcomes = results.map((r) => r.body.data?.outcome ?? `HTTP${r.status}`);
    expect(outcomes.filter((o) => o === "ACCEPTED")).toHaveLength(1);
    expect(outcomes.filter((o) => o === "DUPLICATE")).toHaveLength(11);
    expect(await score()).toBe(1);
    expect(await CheckpointCompletion.countDocuments({ voided: false })).toBe(1);
    expect(await ScoreTransaction.countDocuments()).toBe(1);
    expect((await Team.findOne({ teamNumber: 1 }).lean())!.currentPosition).toBe(1);
  });

  it("concurrent scans of the next two checkpoints never skip or double-count", async () => {
    await doScan(t1, await codeAt(1, 1));
    const [c2, c3] = [await codeAt(1, 2), await codeAt(1, 3)];
    const results = await Promise.all([doScan(t1, c3), doScan(t1, c2), doScan(t1, c3), doScan(t1, c2)]);
    const team = await Team.findOne({ teamNumber: 1 }).lean();
    // c3 may only be accepted after c2; at least c2 landed, and never more than one completion per position
    expect(team!.currentPosition).toBeGreaterThanOrEqual(2);
    const per = await CheckpointCompletion.aggregate([{ $match: { voided: false } }, { $group: { _id: "$position", n: { $sum: 1 } } }]);
    for (const p of per) expect(p.n).toBe(1);
    expect(results.every((r) => r.status === 200)).toBe(true);
    const ledger = (await ScoreTransaction.aggregate([{ $group: { _id: null, s: { $sum: "$delta" } } }]))[0].s;
    expect(ledger).toBe(team!.score);
  });
});

describe("configurable rules", () => {
  it("the organizer changes the BONUS value and it applies to the next award", async () => {
    const admin = await loginAdmin();
    const r = await call(patchSettings, { cookie: admin, method: "PATCH", body: { rules: { points: { bonus: 3 } }, reason: "bigger bonus" } });
    expect(r.status).toBe(200);
    for (let p = 1; p <= 3; p++) await doScan(t1, await codeAt(1, p));
    expect(await score()).toBe(1 + 3);
    await call(patchSettings, { cookie: admin, method: "PATCH", body: { rules: { points: { bonus: 2 } }, reason: "restore" } });
  });

  it("scoring switched off still advances progress but awards nothing", async () => {
    await setEvent({ scoringEnabled: false });
    const r = await doScan(t1, await codeAt(1, 1));
    expect(r.body.data.outcome).toBe("ACCEPTED");
    expect(r.body.data.checkpoint.pointsAwarded).toBe(0);
    expect(await score()).toBe(0);
    expect((await Team.findOne({ teamNumber: 1 }).lean())!.currentPosition).toBe(1);
  });

  it("SUPER SHOES can be configured as a scoring marker only (no hint)", async () => {
    const admin = await loginAdmin();
    await call(patchSettings, { cookie: admin, method: "PATCH", body: { rules: { superShoes: { mode: "SCORE_ONLY" } }, reason: "no hints" } });
    for (let p = 1; p <= 4; p++) await doScan(t1, await codeAt(1, p));
    expect((await Team.findOne({ teamNumber: 1 }).lean())!.hints.available).toBe(0);
    await call(patchSettings, { cookie: admin, method: "PATCH", body: { rules: { superShoes: { mode: "HINT" } }, reason: "restore" } });
  });

  it("rejects invalid scoring configuration", async () => {
    const admin = await loginAdmin();
    expect((await call(patchSettings, { cookie: admin, method: "PATCH", body: { rules: { points: { normal: -1 } } } })).status).toBe(400);
    expect((await call(patchSettings, { cookie: admin, method: "PATCH", body: { rules: { points: { normal: 999 } } } })).status).toBe(400);
    expect((await call(patchSettings, { cookie: await loginTeam(1), method: "PATCH", body: { rules: { points: { normal: 50 } } } })).status).toBe(403);
  });
});

describe("hints", () => {
  it("spends a hint on the current mission once, and is idempotent for that mission", async () => {
    for (let p = 1; p <= 4; p++) await doScan(t1, await codeAt(1, p)); // earns 1 hint at SUPER SHOES
    const a = await call(hint, { cookie: t1 });
    expect(a.status).toBe(200);
    expect(a.body.data.alreadyUsed).toBe(false);
    expect(a.body.data.text).toMatch(/Head to:/);
    expect(a.body.data.hintsAvailable).toBe(0);
    const b = await call(hint, { cookie: t1 });
    expect(b.body.data.alreadyUsed).toBe(true);
    expect(b.body.data.text).toBe(a.body.data.text);
    expect(await HintUsage.countDocuments()).toBe(1);
    expect((await Team.findOne({ teamNumber: 1 }).lean())!.hints).toMatchObject({ available: 0, used: 1 });
  });

  it("refuses when the team has no hints and spends nothing", async () => {
    const r = await call(hint, { cookie: t1 });
    expect(r.status).toBe(409);
    expect(r.body.error?.code).toBe("NO_HINTS_LEFT");
    expect(await HintUsage.countDocuments()).toBe(0);
  });

  it("concurrent hint requests spend a single hint", async () => {
    await Team.updateOne({ teamNumber: 1 }, { $set: { "hints.available": 3 } });
    await Promise.all(Array.from({ length: 6 }, () => call(hint, { cookie: t1 })));
    expect((await Team.findOne({ teamNumber: 1 }).lean())!.hints).toMatchObject({ available: 2, used: 1 });
  });
});

describe("answer-gated checkpoints", () => {
  beforeEach(async () => {
    await QRCheckpoint.updateOne(
      { copyId: "QR01-T1" },
      { $set: { mode: "ANSWER", challengePrompt: "Which bus number reaches campus?", answer: "42|forty two" } },
    );
  });
  afterAll(async () => {
    await QRCheckpoint.updateOne({ copyId: "QR01-T1" }, { $set: { mode: "LOCATION", challengePrompt: "", answer: "" } });
  });

  it("holds progress until the correct answer is submitted, and never leaks the answer", async () => {
    const r = await doScan(t1, await codeAt(1, 1));
    expect(r.body.data.outcome).toBe("AWAITING_ANSWER");
    expect(r.body.data.challengePrompt).toBe("Which bus number reaches campus?");
    expect(r.raw).not.toContain("forty two");
    expect((await Team.findOne({ teamNumber: 1 }).lean())!.currentPosition).toBe(0);
    expect(await ScoreTransaction.countDocuments()).toBe(0);

    const me = await call(teamMe, { cookie: t1 });
    expect(me.body.data.mission.kind).toBe("ANSWER");
    expect(me.raw).not.toMatch(/forty two|"answer"/);

    // cannot skip ahead while an answer is owed
    const skip = await doScan(t1, await codeAt(1, 2));
    expect(skip.body.data.outcome).toBe("REJECTED");

    const wrong = await call(answer, { cookie: t1, body: { answer: "7" } });
    expect(wrong.body.data.correct).toBe(false);
    expect(wrong.raw).not.toContain("forty two");
    expect((await Team.findOne({ teamNumber: 1 }).lean())!.currentPosition).toBe(0);

    const right = await call(answer, { cookie: t1, body: { answer: " Forty-Two " } });
    expect(right.body.data.correct).toBe(true);
    expect(right.body.data.outcome).toBe("ACCEPTED");
    expect(right.body.data.checkpoint.clueText).toContain("Team 1 clue 1");
    expect(await score()).toBe(1);
    const again = await call(answer, { cookie: t1, body: { answer: "42" } });
    expect(again.body.data.correct).toBe(false);
    expect(await score()).toBe(1);
  });

  it("rate-limits answer guessing", async () => {
    await doScan(t1, await codeAt(1, 1));
    let limited = false;
    for (let i = 0; i < 14; i++) {
      const r = await call(answer, { cookie: t1, body: { answer: `guess${i}` } });
      if (r.status === 429) limited = true;
    }
    expect(limited).toBe(true);
    expect((await Team.findOne({ teamNumber: 1 }).lean())!.currentPosition).toBe(0);
  });
});

describe("organizer corrections", () => {
  it("adjusts the score through the ledger and never below zero", async () => {
    const admin = await loginAdmin();
    const id = await teamId(1);
    const up = await call(recovery, { cookie: admin, params: { id }, body: { action: "adjust-score", delta: 3, reason: "puzzle bonus at desk", notify: false } });
    expect(up.body.data.score).toBe(3);
    const down = await call(recovery, { cookie: admin, params: { id }, body: { action: "adjust-score", delta: -5, reason: "too much" } });
    expect(down.status).toBe(409);
    expect(await score()).toBe(3);
    const noReason = await call(recovery, { cookie: admin, params: { id }, body: { action: "adjust-score", delta: 1 } });
    expect(noReason.status).toBe(400);
    const tx = await ScoreTransaction.findOne({ type: "ADMIN_ADJUSTMENT" }).lean();
    expect(tx).toMatchObject({ delta: 3, reason: "puzzle bonus at desk", adminUsername: "Tanmay" });
  });

  it("restoring an earlier state voids later completions, power-ups and hints, and reverses points", async () => {
    const admin = await loginAdmin();
    for (let p = 1; p <= 4; p++) await doScan(t1, await codeAt(1, p));
    expect(await score()).toBe(5);
    const r = await call(recovery, { cookie: admin, params: { id: await teamId(1) }, body: { action: "rollback", toPosition: 1, reversePoints: true, reason: "wrong team scanned" } });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ currentPosition: 1, score: 1, voided: 3, pointsReversed: 4 });
    expect(await PowerUpActivation.countDocuments({ status: "VOID" })).toBe(1);
    const team = await Team.findOne({ teamNumber: 1 }).lean();
    expect(team!.hints.available).toBe(0);
    // ledger still balances, and the team can re-scan checkpoint 2 normally
    const ledger = (await ScoreTransaction.aggregate([{ $group: { _id: null, s: { $sum: "$delta" } } }]))[0].s;
    expect(ledger).toBe(team!.score);
    expect((await doScan(t1, await codeAt(1, 2))).body.data.outcome).toBe("ACCEPTED");
  });

  it("starting the event wipes rehearsal data; pause/resume/end follow the state machine", async () => {
    const admin = await loginAdmin();
    await setEvent({ status: "SETUP", testMode: true, startedAt: null });
    await doScan(t1, await codeAt(1, 1));
    expect(await score()).toBe(1);
    const start = await call(eventAction, { cookie: admin, params: { action: "start" }, body: { reason: "go" } });
    expect(start.status).toBe(200);
    expect(await score()).toBe(0);
    expect(await ScoreTransaction.countDocuments()).toBe(0);
    expect((await call(eventAction, { cookie: admin, params: { action: "start" }, body: {} })).status).toBe(409);
    expect((await call(eventAction, { cookie: admin, params: { action: "pause" }, body: {} })).body.data.status).toBe("PAUSED");
    expect((await doScan(t1, await codeAt(1, 1))).body.data.outcome).toBe("EVENT_CLOSED");
    expect((await call(eventAction, { cookie: admin, params: { action: "resume" }, body: {} })).body.data.status).toBe("RUNNING");
    expect((await doScan(t1, await codeAt(1, 1))).body.data.outcome).toBe("ACCEPTED");
    expect((await call(eventAction, { cookie: admin, params: { action: "end" }, body: {} })).status).toBe(400); // reason required
    expect((await call(eventAction, { cookie: admin, params: { action: "end" }, body: { reason: "time" } })).body.data.status).toBe("ENDED");
    expect((await doScan(t1, await codeAt(1, 2))).body.data.outcome).toBe("EVENT_CLOSED");
  });
});

describe("leaderboard", () => {
  it("ranks by points with a deterministic earliest-to-score tie-break and exposes no secrets", async () => {
    const t2 = await loginTeam(2);
    // Team 2 reaches 1 point first, Team 1 reaches 1 point second
    await doScan(t2, await codeAt(2, 1));
    await new Promise((r) => setTimeout(r, 15));
    await doScan(t1, await codeAt(1, 1));
    const lb = await call(leaderboard, { cookie: t1 });
    const rows = lb.body.data.rows;
    expect(rows.map((r: { number: number }) => r.number).slice(0, 3)).toEqual([2, 1, 3]);
    expect(rows[0]).toMatchObject({ rank: 1, score: 1, completed: 1, total: 6 });
    expect(rows.find((r: { number: number }) => r.number === 1).isYou).toBe(true);
    expect(lb.raw).not.toMatch(/passwordHash|token|manualCode|clueText|copyId|answer/);
    // identical request again → identical order
    const again = await call(leaderboard, { cookie: t1 });
    expect(again.body.data.rows.map((r: { teamId: string }) => r.teamId)).toEqual(rows.map((r: { teamId: string }) => r.teamId));
  });

  it("a frozen leaderboard keeps showing the snapshot while scores change underneath", async () => {
    const admin = await loginAdmin();
    await doScan(t1, await codeAt(1, 1));
    await call(eventAction, { cookie: admin, params: { action: "freeze" }, body: {} });
    await doScan(t1, await codeAt(1, 2));
    await call(recovery, { cookie: admin, params: { id: await teamId(1) }, body: { action: "adjust-score", delta: 5, reason: "post-freeze fix", notify: false } });
    const lb = await call(leaderboard, { cookie: t1 });
    expect(lb.body.data.frozen).toBe(true);
    expect(lb.body.data.rows.find((r: { number: number }) => r.number === 1).score).toBe(1);
    await call(eventAction, { cookie: admin, params: { action: "unfreeze" }, body: {} });
    expect((await call(leaderboard, { cookie: t1 })).body.data.rows.find((r: { number: number }) => r.number === 1).score).toBe(6);
  });
});
