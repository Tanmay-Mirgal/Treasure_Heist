import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as scan } from "@/app/api/qr/scan/route";
import { POST as activate } from "@/app/api/powerups/magnet/activate/route";
import { GET as targets } from "@/app/api/powerups/magnet/targets/route";
import { GET as notifications, POST as markRead } from "@/app/api/team/notifications/route";
import { GET as teamMe } from "@/app/api/team/me/route";
import { GET as teamScore } from "@/app/api/team/score/route";
import { PATCH as patchSettings } from "@/app/api/admin/settings/route";
import { Notification, PowerUpActivation, ScoreTransaction, Team } from "@/lib/models";
import { call, codeAt, dropTestDb, resetGame, seedFixture, setEvent, teamId, useTestDb } from "../helpers/setup";
import { loginAdmin, loginTeam } from "../helpers/auth";

let t1: string;
let t2: string;
let t3: string;
let magnetId: string;

beforeAll(async () => {
  await useTestDb("magnet");
  await seedFixture();
});
afterAll(dropTestDb);

const doScan = (cookie: string, input: string) => call(scan, { cookie, body: { input, source: "MANUAL" } });
const score = async (n: number) => (await Team.findOne({ teamNumber: n }).lean())!.score;
const give = (n: number, points: number) => Team.updateOne({ teamNumber: n }, { $set: { score: points } });

/** Team 1 reaches its MAGNET checkpoint (position 2) and holds one unused MAGNET. Team1 score = 1. */
beforeEach(async () => {
  await resetGame();
  [t1, t2, t3] = [await loginTeam(1), await loginTeam(2), await loginTeam(3)];
  await doScan(t1, await codeAt(1, 1));
  const r = await doScan(t1, await codeAt(1, 2));
  magnetId = r.body.data.powerUp.id;
});

const fire = async (target: number, key = `key-${Math.random().toString(36).slice(2)}-xx`, cookie = t1, id = magnetId) =>
  call(activate, { cookie, body: { activationId: id, targetTeamId: await teamId(target), idempotencyKey: key } });

describe("MAGNET transfer", () => {
  it("moves exactly 2 points from the target to the activator, atomically, with two linked ledger rows", async () => {
    await give(2, 5);
    const r = await fire(2);
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ status: "USED", amount: 2, targetName: "Team 2", score: 3, replayed: false });
    expect(await score(1)).toBe(3);
    expect(await score(2)).toBe(3);
    const gain = await ScoreTransaction.findOne({ type: "MAGNET_GAIN" }).lean();
    const loss = await ScoreTransaction.findOne({ type: "MAGNET_LOSS" }).lean();
    expect(gain!.delta).toBe(2);
    expect(loss!.delta).toBe(-2);
    expect(String(gain!.relatedTransaction)).toBe(String(loss!._id));
    expect(String(loss!.relatedTransaction)).toBe(String(gain!._id));
    expect(gain!.transferGroup).toBe(loss!.transferGroup);
    expect(String(gain!.counterparty)).toBe(await teamId(2));
    expect(String(loss!.counterparty)).toBe(await teamId(1));
    const pu = await PowerUpActivation.findById(magnetId).lean();
    expect(pu).toMatchObject({ status: "USED", amount: 2 });
    expect(pu!.transactions).toHaveLength(2);
    // total points in the system are conserved by the transfer
    const sum = (await Team.aggregate([{ $group: { _id: null, s: { $sum: "$score" } } }]))[0].s;
    expect(sum).toBe(1 + 5);
  });

  it("transfers only 1 point when the target has exactly 1", async () => {
    await give(2, 1);
    const r = await fire(2);
    expect(r.body.data).toMatchObject({ status: "USED", amount: 1, score: 2 });
    expect(await score(2)).toBe(0);
  });

  it("wastes the MAGNET (by default) when the target has 0 points — nothing is created, nothing goes negative", async () => {
    const r = await fire(3);
    expect(r.body.data).toMatchObject({ status: "WASTED", amount: 0, score: 1 });
    expect(await score(3)).toBe(0);
    expect(await score(1)).toBe(1);
    expect(await ScoreTransaction.countDocuments({ type: { $in: ["MAGNET_GAIN", "MAGNET_LOSS"] } })).toBe(0);
    expect((await PowerUpActivation.findById(magnetId).lean())!.status).toBe("WASTED");
    expect(await Notification.countDocuments({ type: "MAGNET_HIT" })).toBe(0);
  });

  it("can be configured to keep the MAGNET when the target is empty", async () => {
    const admin = await loginAdmin();
    await call(patchSettings, { cookie: admin, method: "PATCH", body: { rules: { magnet: { consumeWhenTargetEmpty: false } }, reason: "keep it" } });
    const r = await fire(3);
    expect(r.status).toBe(409);
    expect(r.body.error?.code).toBe("TARGET_EMPTY");
    expect((await PowerUpActivation.findById(magnetId).lean())!.status).toBe("AVAILABLE");
    await call(patchSettings, { cookie: admin, method: "PATCH", body: { rules: { magnet: { consumeWhenTargetEmpty: true } }, reason: "restore" } });
  });

  it("honours a changed transfer amount from the scoring configuration", async () => {
    const admin = await loginAdmin();
    await call(patchSettings, { cookie: admin, method: "PATCH", body: { rules: { points: { magnetTransfer: 3 } }, reason: "stronger magnet" } });
    await give(2, 10);
    expect((await fire(2)).body.data.amount).toBe(3);
    await call(patchSettings, { cookie: admin, method: "PATCH", body: { rules: { points: { magnetTransfer: 2 } }, reason: "restore" } });
  });

  it("a team cannot target itself", async () => {
    const r = await fire(1);
    expect(r.status).toBe(400);
    expect(r.body.error?.code).toBe("SELF_TARGET");
    expect((await PowerUpActivation.findById(magnetId).lean())!.status).toBe("AVAILABLE");
  });

  it("rejects nonexistent, malformed, disabled and missing targets", async () => {
    const body = (targetTeamId: unknown) => ({ activationId: magnetId, targetTeamId, idempotencyKey: "valid-key-123456" });
    expect((await call(activate, { cookie: t1, body: body("507f1f77bcf86cd799439011") })).status).toBe(400); // well-formed id, no such team
    expect((await call(activate, { cookie: t1, body: body("not-an-id") })).status).toBe(400);
    expect((await call(activate, { cookie: t1, body: body(undefined) })).status).toBe(400);
    expect((await call(activate, { cookie: t1, body: { activationId: magnetId, targetTeamId: await teamId(2) } })).status).toBe(400); // no idempotency key
    await Team.updateOne({ teamNumber: 2 }, { $set: { status: "DISABLED" } });
    await give(2, 4);
    expect((await fire(2)).status).toBe(400);
    expect(await score(2)).toBe(4);
    expect((await PowerUpActivation.findById(magnetId).lean())!.status).toBe("AVAILABLE");
  });

  it("the target list excludes the activating team and shows the exact transferable amount", async () => {
    await give(2, 7);
    await give(3, 1);
    const r = await call(targets, { cookie: t1 });
    const list = r.body.data.targets;
    expect(list.map((t: { number: number }) => t.number)).toEqual([2, 3]);
    expect(list[0]).toMatchObject({ transferable: 2 });
    expect(list[1]).toMatchObject({ transferable: 1 });
  });

  it("is single-use: a second request with a different key transfers nothing more", async () => {
    await give(2, 9);
    expect((await fire(2, "first-key-123456")).status).toBe(200);
    const second = await fire(2, "second-key-123456");
    expect(second.status).toBe(409);
    expect(second.body.error?.code).toBe("ALREADY_USED");
    expect(await score(2)).toBe(7);
    expect(await score(1)).toBe(3);
  });

  it("replaying the same request (same idempotency key) returns the original result without a second transfer", async () => {
    await give(2, 9);
    const first = await fire(2, "same-key-123456");
    const replay = await fire(2, "same-key-123456");
    expect(replay.status).toBe(200);
    expect(replay.body.data).toMatchObject({ amount: first.body.data.amount, replayed: true });
    expect(await score(2)).toBe(7);
    expect(await ScoreTransaction.countDocuments({ type: "MAGNET_LOSS" })).toBe(1);
  });

  it("simultaneous requests (double-click, retries, two targets) produce a single transfer", async () => {
    await give(2, 9);
    await give(3, 9);
    const results = await Promise.all([
      fire(2, "k1-aaaaaaaaaa"),
      fire(2, "k1-aaaaaaaaaa"),
      fire(2, "k2-bbbbbbbbbb"),
      fire(3, "k3-cccccccccc"),
      fire(3, "k4-dddddddddd"),
      fire(2, "k5-eeeeeeeeee"),
    ]);
    const used = results.filter((r) => r.status === 200 && r.body.data.replayed === false);
    expect(used).toHaveLength(1);
    expect(await ScoreTransaction.countDocuments({ type: "MAGNET_GAIN" })).toBe(1);
    expect(await ScoreTransaction.countDocuments({ type: "MAGNET_LOSS" })).toBe(1);
    const total = (await score(2)) + (await score(3));
    expect(total).toBe(18 - 2);
    expect(await score(1)).toBe(3);
    expect(await Notification.countDocuments({ type: "MAGNET_HIT" })).toBe(1);
  });

  it("two teams hitting the same low-score target never push it below zero", async () => {
    // Team 2 also earns a MAGNET
    await doScan(t2, await codeAt(2, 1));
    await doScan(t2, await codeAt(2, 2));
    await doScan(t2, await codeAt(2, 3));
    const pu2 = await PowerUpActivation.findOne({ team: await teamId(2), status: "AVAILABLE" }).lean();
    expect(pu2).toBeTruthy();
    await give(3, 3);
    const [a, b] = await Promise.all([fire(3, "team1-key-12345"), call(activate, { cookie: t2, body: { activationId: String(pu2!._id), targetTeamId: await teamId(3), idempotencyKey: "team2-key-12345" } })]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const t3score = await score(3);
    expect(t3score).toBeGreaterThanOrEqual(0);
    const moved = [a, b].reduce((n, r) => n + r.body.data.amount, 0);
    expect(moved).toBe(3);
    expect(t3score).toBe(0);
  });

  it("another team's MAGNET cannot be used", async () => {
    await give(3, 5);
    const r = await fire(3, "stolen-key-12345", t2, magnetId);
    expect(r.status).toBe(404);
    expect((await PowerUpActivation.findById(magnetId).lean())!.status).toBe("AVAILABLE");
    expect(await score(3)).toBe(5);
  });

  it("respects the event gates: disabled MAGNET, paused event, scoring off", async () => {
    await give(2, 5);
    const admin = await loginAdmin();
    await call(patchSettings, { cookie: admin, method: "PATCH", body: { rules: { magnet: { enabled: false } }, reason: "disable" } });
    const off = await fire(2);
    expect(off.status).toBe(403);
    expect(off.body.error?.code).toBe("MAGNET_DISABLED");
    await call(patchSettings, { cookie: admin, method: "PATCH", body: { rules: { magnet: { enabled: true } }, reason: "enable" } });

    await setEvent({ status: "PAUSED", pausedAt: new Date() });
    expect((await fire(2)).status).toBe(423);
    await setEvent({ status: "RUNNING", pausedAt: null, scoringEnabled: false });
    expect((await fire(2)).status).toBe(423);
    expect(await score(2)).toBe(5);
    expect((await PowerUpActivation.findById(magnetId).lean())!.status).toBe("AVAILABLE");
  });

  it("requires authentication", async () => {
    const r = await call(activate, { body: { activationId: magnetId, targetTeamId: await teamId(2), idempotencyKey: "anonymous-key-1" } });
    expect(r.status).toBe(401);
  });
});

describe("MAGNET notifications", () => {
  beforeEach(() => give(2, 6));

  it("the target gets a persistent, neutral notification that does not name the attacker", async () => {
    await fire(2);
    const list = await call(notifications, { cookie: t2 });
    expect(list.body.data.unread).toBe(1);
    const n = list.body.data.items[0];
    expect(n.type).toBe("MAGNET_HIT");
    expect(n.message).toBe("Another team used a MAGNET against your team and transferred points. Check your updated score.");
    expect(list.raw).not.toMatch(/Team 1|Team1/);
    // survives "refresh" and a brand-new login session
    const fresh = await loginTeam(2);
    expect((await call(notifications, { cookie: fresh })).body.data.items).toHaveLength(1);
    const dash = await call(teamMe, { cookie: fresh });
    expect(dash.body.data.notifications.unread).toBe(1);
    expect(dash.raw).not.toMatch(/Team 1|Team1/);
    // the score page shows the deduction without naming the attacker
    const sc = await call(teamScore, { cookie: fresh });
    expect(sc.body.data.score).toBe(4);
    const loss = sc.body.data.recent.find((t: { type: string }) => t.type === "MAGNET_LOSS");
    expect(loss).toMatchObject({ delta: -2, counterpartyName: null });
    expect(sc.body.data.deductions).toBe(-2);
  });

  it("only the target is notified; the activator and bystanders are not", async () => {
    await fire(2);
    expect((await call(notifications, { cookie: t1 })).body.data.items).toHaveLength(0);
    expect((await call(notifications, { cookie: t3 })).body.data.items).toHaveLength(0);
  });

  it("can be marked read, and stays visible in history", async () => {
    await fire(2);
    const r = await call(markRead, { cookie: t2, body: { ids: "all" } });
    expect(r.body.data.marked).toBe(1);
    const list = await call(notifications, { cookie: t2 });
    expect(list.body.data.unread).toBe(0);
    expect(list.body.data.items).toHaveLength(1);
    // another team cannot mark someone else's notifications read
    await fire(2, "unused-key-123456").catch(() => null);
    expect((await call(markRead, { cookie: t3, body: { ids: "all" } })).body.data.marked).toBe(0);
  });

  it("can name the attacker only when the organizer explicitly enables it", async () => {
    const admin = await loginAdmin();
    await call(patchSettings, { cookie: admin, method: "PATCH", body: { rules: { magnet: { revealAttacker: true } }, reason: "reveal for fun" } });
    await fire(2);
    const msg = (await call(notifications, { cookie: t2 })).body.data.items[0].message as string;
    expect(msg).toContain("Team 1");
    await call(patchSettings, { cookie: admin, method: "PATCH", body: { rules: { magnet: { revealAttacker: false } }, reason: "restore" } });
  });

  it("a participant cannot see another team's score history", async () => {
    await fire(2);
    const mine = await call(teamScore, { cookie: t3 });
    expect(mine.body.data.recent).toHaveLength(0);
    expect(mine.raw).not.toContain("MAGNET_LOSS");
  });
});
