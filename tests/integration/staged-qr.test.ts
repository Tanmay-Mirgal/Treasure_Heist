import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as scan } from "@/app/api/qr/scan/route";
import { GET as teamMe } from "@/app/api/team/me/route";
import { Team, ScanEvent } from "@/lib/models";
import { call, codeAt, dropTestDb, resetGame, seedFixture, useTestDb } from "../helpers/setup";
import { loginTeam } from "../helpers/auth";

let t1: string;

beforeAll(async () => {
  await useTestDb("staged-qr");
  await seedFixture();
});
afterAll(dropTestDb);
beforeEach(async () => {
  await resetGame();
  t1 = await loginTeam(1);
});

const doScan = (cookie: string, input: string) => call(scan, { cookie, body: { input, source: "MANUAL" } });

describe("staged QR question and verification flow", () => {
  it("initial scan of QR 1 displays Question in INTEL without awarding points immediately", async () => {
    // Before scan: team is at start
    const initialMe = await call(teamMe, { cookie: t1 });
    expect(initialMe.body.data.mission.kind).toBe("START");
    expect(initialMe.body.data.team.score).toBe(0);

    // Scan QR 1
    const r1 = await doScan(t1, await codeAt(1, 1));
    expect(r1.status).toBe(200);
    expect(r1.body.data.outcome).toBe("ACCEPTED");
    expect(r1.body.data.score).toBe(0); // Points NOT awarded yet!
    expect(r1.body.data.checkpoint.position).toBe(1);
    expect(r1.body.data.checkpoint.pointsAwarded).toBe(0);

    // Check INTEL: Question 1 is active, status is staged/unsolved
    const me1 = await call(teamMe, { cookie: t1 });
    expect(me1.body.data.mission.kind).toBe("CLUE");
    expect(me1.body.data.mission.isStaged).toBe(true);
    expect(me1.body.data.mission.stationNumber).toBe(1);
    expect(me1.body.data.mission.nextStationNumber).toBe(2);
    expect(me1.body.data.team.score).toBe(0);
  });

  it("scanning wrong QR or skipping does not award points and keeps question in INTEL", async () => {
    // Scan QR 1 to get Question 1 in INTEL
    await doScan(t1, await codeAt(1, 1));

    // Scan QR 3 (out of order, skipping QR 2)
    const rWrong = await doScan(t1, await codeAt(1, 3));
    expect(rWrong.body.data.outcome).toBe("REJECTED");

    // Verify team score is still 0 and Question 1 remains active
    const me = await call(teamMe, { cookie: t1 });
    expect(me.body.data.team.score).toBe(0);
    expect(me.body.data.mission.stationNumber).toBe(1);
    expect(me.body.data.mission.nextStationNumber).toBe(2);
  });

  it("verifying QR 2 awards points for Station 1 and unlocks Question 2 in INTEL", async () => {
    // 1. Scan QR 1 -> Question 1 in INTEL
    await doScan(t1, await codeAt(1, 1));

    // 2. Scan QR 2 -> Verified! Points for Station 1 awarded!
    const r2 = await doScan(t1, await codeAt(1, 2));
    expect(r2.body.data.outcome).toBe("ACCEPTED");
    expect(r2.body.data.score).toBe(1); // Station 1 points (1) added!
    expect(r2.body.data.checkpoint.position).toBe(2);
    expect(r2.body.data.checkpoint.pointsAwarded).toBe(1);

    // Check INTEL: now Question 2 is active, target is Station 3
    const me2 = await call(teamMe, { cookie: t1 });
    expect(me2.body.data.team.score).toBe(1);
    expect(me2.body.data.mission.stationNumber).toBe(2);
    expect(me2.body.data.mission.nextStationNumber).toBe(3);
    expect(me2.body.data.mission.isStaged).toBe(true);
  });

  it("completing full sequence verifies each stage and opens the vault", async () => {
    // Sequence positions 1 to 6
    for (let p = 1; p <= 6; p++) {
      const r = await doScan(t1, await codeAt(1, p));
      expect(r.body.data.outcome, `scan position ${p}`).toBe("ACCEPTED");
    }

    const team = await Team.findOne({ teamNumber: 1 }).lean();
    expect(team!.finishedAt).toBeTruthy();
    expect(team!.score).toBeGreaterThan(0);

    const finalMe = await call(teamMe, { cookie: t1 });
    expect(finalMe.body.data.progress.finished).toBe(true);
  });
});
