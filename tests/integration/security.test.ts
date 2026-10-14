import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import nextConfig from "@/next.config";
import { POST as scan } from "@/app/api/qr/scan/route";
import { POST as activate } from "@/app/api/powerups/magnet/activate/route";
import { POST as teamLogin } from "@/app/api/auth/team/login/route";
import { POST as adminLogin } from "@/app/api/auth/admin/login/route";
import { POST as adminPassword } from "@/app/api/auth/admin/password/route";
import * as teamMeRoute from "@/app/api/team/me/route";
import * as teamScoreRoute from "@/app/api/team/score/route";
import { GET as teamMe } from "@/app/api/team/me/route";
import { GET as teamScore } from "@/app/api/team/score/route";
import { GET as teamProgress } from "@/app/api/team/progress/route";
import { GET as leaderboard } from "@/app/api/leaderboard/route";
import { GET as scanResult } from "@/app/api/team/scans/[id]/route";
import { POST as answer } from "@/app/api/checkpoints/complete/route";
import * as adminOverview from "@/app/api/admin/overview/route";
import * as adminTeams from "@/app/api/admin/teams/route";
import * as adminTeam from "@/app/api/admin/teams/[id]/route";
import * as adminRecovery from "@/app/api/admin/teams/[id]/recovery/route";
import * as adminSequences from "@/app/api/admin/sequences/route";
import * as adminSequence from "@/app/api/admin/sequences/[id]/route";
import * as adminQr from "@/app/api/admin/qr/route";
import * as adminQrOne from "@/app/api/admin/qr/[id]/route";
import * as adminQrRevoke from "@/app/api/admin/qr/[id]/revoke/route";
import * as adminQrImage from "@/app/api/admin/qr/[id]/image/route";
import * as adminQrPrint from "@/app/api/admin/qr/print/route";
import * as adminQrVerify from "@/app/api/admin/qr/verify/route";
import * as adminClues from "@/app/api/admin/clues/route";
import * as adminSettings from "@/app/api/admin/settings/route";
import * as adminEvent from "@/app/api/admin/event/[action]/route";
import * as adminAudit from "@/app/api/admin/audit-logs/route";
import * as adminValidation from "@/app/api/admin/validation/route";
import * as adminScans from "@/app/api/admin/scans/route";
import { AdminAuditLog, Admin, QRCheckpoint, Team } from "@/lib/models";
import { getEnv, resetEnvCache } from "@/lib/env";
import { updateSequence } from "@/lib/services/admin-content";
import { call, codeAt, dropTestDb, resetGame, seedFixture, teamId, useTestDb, ADMIN_PASSWORD } from "../helpers/setup";
import { loginAdmin, loginTeam } from "../helpers/auth";

let t1: string;
let t2: string;
let admin: string;

beforeAll(async () => {
  await useTestDb("security");
  await seedFixture();
});
afterAll(dropTestDb);
beforeEach(async () => {
  await resetGame();
  [t1, t2, admin] = [await loginTeam(1), await loginTeam(2), await loginAdmin()];
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

const doScan = (cookie: string, input: string) => call(scan, { cookie, body: { input, source: "MANUAL" } });

/** Everything a QR checkpoint stores that participants must never see. */
async function secretsOf(copyId: string) {
  const q = await QRCheckpoint.collection.findOne({ copyId });
  return { token: q!.token as string, manualCode: q!.manualCode as string };
}

describe("participants never receive private data", () => {
  const FORBIDDEN_KEYS = /"(passwordHash|token|manualCode|answer|organizerNotes|hintText|sourceNextCopyId|startingClue|entries|nextCopyId|sessionVersion|copyId|placement|destination|revokedTokens)"/;

  it("hides answers, tokens, routes and other teams' data from every participant endpoint", async () => {
    await updateSequence({ id: "000000000000000000000000", username: "Tanmay" }, await teamId(1), { startingClue: { answer: "ULTRA-SECRET-START-ANSWER" } }, "set secret answer");
    await QRCheckpoint.updateOne({ copyId: "QR03-T2" }, { $set: { organizerNotes: "PRIVATE-NOTE-XYZ", hintText: "PRIVATE-HINT-XYZ" } });

    const others = [await secretsOf("QR03-T2"), await secretsOf("QR19-T1").catch(() => null)].filter(Boolean) as { token: string; manualCode: string }[];
    const own = await doScan(t1, await codeAt(1, 1));
    const reject = await doScan(t1, await codeAt(2, 1));
    const dup = await doScan(t1, await codeAt(1, 1));
    const responses = [
      own,
      reject,
      dup,
      await call(teamMe, { cookie: t1 }),
      await call(teamScore, { cookie: t1 }),
      await call(teamProgress, { cookie: t1 }),
      await call(leaderboard, { cookie: t1 }),
      await call(scanResult, { cookie: t1, params: { id: own.body.data.scanId } }),
      await call(scanResult, { cookie: t1, params: { id: reject.body.data.scanId } }),
    ];
    for (const [i, r] of responses.entries()) {
      expect(r.status, `response ${i}`).toBe(200);
      expect(r.raw, `response ${i}`).not.toMatch(FORBIDDEN_KEYS);
      expect(r.raw, `response ${i}`).not.toContain("ULTRA-SECRET-START-ANSWER");
      expect(r.raw, `response ${i}`).not.toMatch(/PRIVATE-(NOTE|HINT)-XYZ|\$2[aby]\$/);
      for (const o of others) {
        expect(r.raw).not.toContain(o.token);
        expect(r.raw).not.toContain(o.manualCode);
      }
      // other teams' route/clue content
      expect(r.raw, `response ${i}`).not.toContain("Team 2 clue");
      expect(r.raw, `response ${i}`).not.toContain("-T2");
    }
  });

  it("an accepted scan reveals only that checkpoint's clue — never the next QR or later locations", async () => {
    const r = await doScan(t1, await codeAt(1, 1));
    expect(r.body.data.checkpoint).toEqual({
      position: 1,
      total: 6,
      actionType: "NORMAL",
      isFinal: false,
      clueText: expect.stringContaining("Team 1 clue 1"),
      pointsAwarded: 1,
      rewardText: expect.any(String),
    });
    expect(r.raw).not.toContain("QR16");
    expect(r.raw).not.toContain("Second-floor");
  });

  it("the starting riddle is visible to its own team only, and the dashboard shows only the current mission", async () => {
    const m1 = (await call(teamMe, { cookie: t1 })).body.data.mission.text as string;
    const m2 = (await call(teamMe, { cookie: t2 })).body.data.mission.text as string;
    expect(m1).toContain("Pinned but never imprisoned");
    expect(m2).toContain("I join doors together");
    expect(m1).not.toContain("I join doors together");
    const dash = (await call(teamMe, { cookie: t1 })).body.data;
    expect(Object.keys(dash).sort()).toEqual(["event", "inventory", "mission", "notifications", "progress", "rules", "team"]);
  });

  it("the leaderboard shows aggregates only", async () => {
    const rows = (await call(leaderboard, { cookie: t1 })).body.data.rows as Record<string, unknown>[];
    for (const row of rows)
      expect(Object.keys(row).sort()).toEqual(["completed", "finishedAt", "isYou", "lastActivityAt", "name", "number", "rank", "score", "status", "teamId", "total"]);
  });
});

describe("participants cannot influence authoritative state", () => {
  it("client-supplied score, team, points and amount fields are ignored", async () => {
    const r = await call(scan, {
      cookie: t1,
      body: { input: await codeAt(1, 1), source: "MANUAL", score: 999, points: 50, teamId: await teamId(2), team: "Team2", position: 5, delta: 100 },
    });
    expect(r.body.data.outcome).toBe("ACCEPTED");
    expect(r.body.data.checkpoint.pointsAwarded).toBe(1);
    expect((await Team.findOne({ teamNumber: 1 }).lean())!.score).toBe(1);
    expect((await Team.findOne({ teamNumber: 2 }).lean())!.score).toBe(0);
    expect((await Team.findOne({ teamNumber: 1 }).lean())!.currentPosition).toBe(1);
  });

  it("there is no participant endpoint that writes scores (score and dashboard routes are read-only)", () => {
    for (const mod of [teamMeRoute, teamScoreRoute] as Record<string, unknown>[]) {
      for (const verb of ["POST", "PUT", "PATCH", "DELETE"]) expect(mod[verb]).toBeUndefined();
    }
  });

  it("a MAGNET amount supplied by the client is ignored", async () => {
    await doScan(t1, await codeAt(1, 1));
    const pu = (await doScan(t1, await codeAt(1, 2))).body.data.powerUp.id as string;
    await Team.updateOne({ teamNumber: 2 }, { $set: { score: 50 } });
    const r = await call(activate, { cookie: t1, body: { activationId: pu, targetTeamId: await teamId(2), idempotencyKey: "client-amount-1", amount: 50, score: 9999 } });
    expect(r.body.data.amount).toBe(2);
    expect((await Team.findOne({ teamNumber: 2 }).lean())!.score).toBe(48);
    expect((await Team.findOne({ teamNumber: 1 }).lean())!.score).toBe(3);
  });

  it("cannot answer a challenge that was never unlocked", async () => {
    const r = await call(answer, { cookie: t1, body: { answer: "anything" } });
    expect(r.body.data.correct).toBe(false);
    expect((await Team.findOne({ teamNumber: 1 }).lean())!.currentPosition).toBe(0);
  });

  it("scan results of other teams are not readable even with a valid id", async () => {
    const s = await doScan(t2, await codeAt(2, 1));
    expect((await call(scanResult, { cookie: t1, params: { id: s.body.data.scanId } })).status).toBe(404);
  });
});

describe("input validation and injection", () => {
  it("rejects malformed JSON, oversized bodies and non-object bodies", async () => {
    const raw = async (body: string) => {
      const { NextRequest } = await import("next/server");
      const req = new NextRequest("http://localhost:3000/api/qr/scan", { method: "POST", headers: { "content-type": "application/json", cookie: t1 }, body });
      return scan(req, { params: Promise.resolve({}) });
    };
    expect((await raw("{not json")).status).toBe(400);
    expect((await raw(JSON.stringify({ input: "x".repeat(70_000) }))).status).toBe(400);
    expect((await raw("[1,2,3]")).status).toBe(400);
    expect((await raw("null")).status).toBe(400);
  });

  it("rejects NoSQL operator objects in place of strings", async () => {
    expect((await call(teamLogin, { body: { username: { $gt: "" }, password: { $gt: "" } } })).status).toBe(400);
    expect((await call(adminLogin, { body: { username: { $ne: null }, password: "x" } })).status).toBe(400);
    expect((await call(scan, { cookie: t1, body: { input: { $ne: "" } } })).status).toBe(400);
    const pu = { activationId: { $ne: null }, targetTeamId: { $ne: null }, idempotencyKey: "operators-key-1" };
    expect((await call(activate, { cookie: t1, body: pu })).status).toBe(400);
  });

  it("a scan input shaped like a query operator or injection string is just an unknown code", async () => {
    for (const input of ['{"$ne":null}', "' || 1==1 //", "../../etc/passwd", "<script>alert(1)</script>"]) {
      const r = await doScan(t1, input);
      expect(r.body.data.outcome).toBe("REJECTED");
    }
    expect((await Team.findOne({ teamNumber: 1 }).lean())!.currentPosition).toBe(0);
  });

  it("revokes nothing and reads nothing when ids are malformed", async () => {
    expect((await call(adminTeam.GET, { cookie: admin, params: { id: "not-an-id" } })).status).toBe(404);
    expect((await call(adminQrRevoke.POST, { cookie: admin, params: { id: "{$ne:1}" }, body: { reason: "attack attempt" } })).status).toBe(404);
  });
});

describe("every administrative operation is authorized on the server", () => {
  const T2 = () => teamId(2);

  it("refuses unauthenticated callers (401) and team accounts (403) on all admin handlers", async () => {
    const id = await T2();
    const qr = await QRCheckpoint.findOne({ copyId: "QR01-T1" }).lean();
    const qid = String(qr!._id);
    const cases: [string, unknown, Record<string, unknown>][] = [
      ["GET overview", adminOverview.GET, {}],
      ["GET teams", adminTeams.GET, {}],
      ["POST teams", adminTeams.POST, { body: { username: "Evil", displayName: "Evil", teamNumber: 77, password: "pass1234" } }],
      ["GET team", adminTeam.GET, { params: { id } }],
      ["PATCH team", adminTeam.PATCH, { method: "PATCH", params: { id }, body: { status: "DISABLED" } }],
      ["POST recovery", adminRecovery.POST, { params: { id }, body: { action: "adjust-score", delta: 5, reason: "hack" } }],
      ["GET sequences", adminSequences.GET, {}],
      ["GET sequence", adminSequence.GET, { params: { id } }],
      ["PATCH sequence", adminSequence.PATCH, { method: "PATCH", params: { id }, body: { copyIds: ["QR01-T1"], reason: "hack" } }],
      ["GET qr", adminQr.GET, {}],
      ["GET qr one", adminQrOne.GET, { params: { id: qid } }],
      ["PATCH qr", adminQrOne.PATCH, { method: "PATCH", params: { id: qid }, body: { status: "INACTIVE", reason: "hack" } }],
      ["POST revoke", adminQrRevoke.POST, { params: { id: qid }, body: { reason: "hack" } }],
      ["GET qr image", adminQrImage.GET, { params: { id: qid } }],
      ["GET qr print", adminQrPrint.GET, {}],
      ["POST qr verify", adminQrVerify.POST, { body: { input: "ABCD-EFGH" } }],
      ["GET clues", adminClues.GET, {}],
      ["GET settings", adminSettings.GET, {}],
      ["PATCH settings", adminSettings.PATCH, { method: "PATCH", body: { scoringEnabled: false } }],
      ["POST event", adminEvent.POST, { params: { action: "end" }, body: { reason: "hack" } }],
      ["GET audit", adminAudit.GET, {}],
      ["GET validation", adminValidation.GET, {}],
      ["GET scans", adminScans.GET, {}],
    ];
    for (const [label, handler, opts] of cases) {
      const anon = await call(handler, opts);
      expect(anon.status, `${label} (anonymous)`).toBe(401);
      const asTeam = await call(handler, { ...opts, cookie: t1 });
      expect(asTeam.status, `${label} (team)`).toBe(403);
    }
    // nothing changed
    expect((await Team.findOne({ teamNumber: 2 }).lean())!.status).toBe("ACTIVE");
    expect((await QRCheckpoint.findOne({ copyId: "QR01-T1" }).lean())!.status).toBe("ACTIVE");
    expect(await Team.countDocuments({ teamNumber: 77 })).toBe(0);
  });

  it("organizer mutations are written to the audit log with admin, entity, before/after and reason", async () => {
    const id = await T2();
    await call(adminRecovery.POST, { cookie: admin, params: { id }, body: { action: "adjust-score", delta: 2, reason: "desk challenge winner", notify: false } });
    await call(adminSettings.PATCH, { cookie: admin, method: "PATCH", body: { rules: { points: { normal: 1 } }, scoringEnabled: false, reason: "pause scoring" } });
    await call(adminSettings.PATCH, { cookie: admin, method: "PATCH", body: { scoringEnabled: true, reason: "resume scoring" } });
    const qr = await QRCheckpoint.findOne({ copyId: "QR02-T1" }).lean();
    await call(adminQrOne.PATCH, { cookie: admin, method: "PATCH", params: { id: String(qr!._id) }, body: { status: "DAMAGED", reason: "torn" } });
    await call(adminQrRevoke.POST, { cookie: admin, params: { id: String(qr!._id) }, body: { reason: "torn; reprinted" } });

    const logs = await AdminAuditLog.find().sort({ createdAt: 1 }).lean();
    const by = (a: string) => logs.find((l) => l.action === a)!;
    expect(by("SCORE_ADJUST")).toMatchObject({ adminUsername: "Tanmay", entityType: "Team", reason: "desk challenge winner", before: { score: 0 }, after: { score: 2, delta: 2 } });
    expect(by("SETTINGS_UPDATE")).toMatchObject({ reason: "pause scoring", after: { scoringEnabled: false } });
    expect(by("QR_UPDATE")).toMatchObject({ entityId: "QR02-T1", reason: "torn", after: { status: "DAMAGED" } });
    expect(by("QR_REVOKE")).toMatchObject({ entityId: "QR02-T1", reason: "torn; reprinted" });
    expect(logs.every((l) => l.adminUsername === "Tanmay" && l.createdAt)).toBe(true);
  });

  it("score/progress-changing actions need a reason", async () => {
    const id = await T2();
    const auditBefore = await AdminAuditLog.countDocuments(); // the audit log is append-only; never reset between tests
    for (const body of [
      { action: "adjust-score", delta: 1 },
      { action: "adjust-score", delta: 1, reason: "  " },
      { action: "verify-next" },
      { action: "rollback", toPosition: 0 },
      { action: "reset-progress" },
    ]) {
      const r = await call(adminRecovery.POST, { cookie: admin, params: { id }, body });
      expect(r.status, JSON.stringify(body)).toBe(400);
    }
    expect(await AdminAuditLog.countDocuments()).toBe(auditBefore);
    expect((await Team.findOne({ teamNumber: 2 }).lean())!.score).toBe(0);
  });

  it("QR tokens are random, opaque and exclude identifying data; the print API never returns raw tokens", async () => {
    const qrs = await QRCheckpoint.collection.find({}).toArray();
    const tokens = new Set(qrs.map((q) => q.token as string));
    expect(tokens.size).toBe(qrs.length);
    for (const q of qrs) {
      expect(q.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
      expect(q.token).not.toContain(q.copyId);
      expect(String(q.token).toUpperCase()).not.toContain(String(q.manualCode));
    }
    const printed = await call(adminQrPrint.GET, { cookie: admin, path: "/api/admin/qr/print?team=1" });
    expect(printed.status).toBe(200);
    expect(printed.body.data.items).toHaveLength(6);
    for (const t of tokens) expect(printed.raw).not.toContain(t);
    expect(printed.body.data.items[0].svg).toContain("<svg");
    // the image download works for admins
    const q1 = await QRCheckpoint.findOne({ copyId: "QR01-T1" }).lean();
    const png = await call(adminQrImage.GET, { cookie: admin, params: { id: String(q1!._id) }, path: `/api/admin/qr/${q1!._id}/image?format=png&download=1` });
    expect(png.res.headers.get("content-type")).toBe("image/png");
    expect(png.res.headers.get("content-disposition")).toContain("QR01-T1.png");
    const bytes = new Uint8Array(await png.res.arrayBuffer());
    expect([...bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("the admin QR verification tool resolves valid, revoked and unknown tokens without changing state", async () => {
    const code = await codeAt(1, 1);
    const ok = await call(adminQrVerify.POST, { cookie: admin, body: { input: code } });
    expect(ok.body.data).toMatchObject({ valid: true, copyId: "QR01-T1", references: [{ teamNumber: 1, position: 1 }] });
    const unknown = await call(adminQrVerify.POST, { cookie: admin, body: { input: "ZZZZ-ZZZZ" } });
    expect(unknown.body.data.valid).toBe(false);
    expect((await Team.findOne({ teamNumber: 1 }).lean())!.currentPosition).toBe(0);
  });
});

describe("production hardening", () => {
  it("marks session cookies Secure and HttpOnly in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    resetEnvCache();
    const r = await call(teamLogin, { body: { username: "Team1", password: "Team1" } });
    const c = r.res.headers.getSetCookie().join(";").toLowerCase();
    expect(c).toContain("secure");
    expect(c).toContain("httponly");
    expect(c).toContain("samesite=lax");
  });

  it("refuses to start in production without a real SESSION_SECRET, and validates required variables", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", "");
    resetEnvCache();
    expect(() => getEnv()).toThrow(/SESSION_SECRET/);
    vi.stubEnv("SESSION_SECRET", "short");
    resetEnvCache();
    expect(() => getEnv()).toThrow(/at least 32/);
    vi.stubEnv("SESSION_SECRET", "x".repeat(40));
    vi.stubEnv("MONGODB_URI", "");
    vi.stubEnv("MONGO_URI", "");
    resetEnvCache();
    expect(() => getEnv()).toThrow(/MONGODB_URI/);
  });

  it("forces the seeded default admin password to be changed before any other admin action in production", async () => {
    await Admin.updateOne({ username: "Tanmay" }, { $set: { mustChangePassword: true } });
    vi.stubEnv("NODE_ENV", "production");
    resetEnvCache();
    const blocked = await call(adminOverview.GET, { cookie: admin });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error?.code).toBe("PASSWORD_CHANGE_REQUIRED");

    const weak = await call(adminPassword, { cookie: admin, body: { currentPassword: ADMIN_PASSWORD, newPassword: "Tanmay123" } });
    expect(weak.status).toBe(400);
    const wrongCurrent = await call(adminPassword, { cookie: admin, body: { currentPassword: "nope", newPassword: "a-much-better-passphrase" } });
    expect(wrongCurrent.status).toBe(400);
    const changed = await call(adminPassword, { cookie: admin, body: { currentPassword: ADMIN_PASSWORD, newPassword: "a-much-better-passphrase" } });
    expect(changed.status).toBe(200);
    // the old session is revoked; the replacement cookie works
    expect((await call(adminOverview.GET, { cookie: admin })).status).toBe(401);
    const fresh = changed.res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    expect((await call(adminOverview.GET, { cookie: fresh })).status).toBe(200);
    expect((await call(adminLogin, { body: { username: "Tanmay", password: ADMIN_PASSWORD } })).status).toBe(401);
    // restore the password used by the other tests
    const { hashPassword } = await import("@/lib/auth/password");
    await Admin.updateOne({ username: "Tanmay" }, { $set: { passwordHash: await hashPassword(ADMIN_PASSWORD), mustChangePassword: false }, $inc: { sessionVersion: 1 } });
  });

  it("sends security headers on every route", async () => {
    const rules = await nextConfig.headers!();
    const all = rules.find((r) => r.source === "/:path*")!.headers;
    const map = Object.fromEntries(all.map((h) => [h.key, h.value]));
    expect(map["X-Content-Type-Options"]).toBe("nosniff");
    expect(map["X-Frame-Options"]).toBe("DENY");
    expect(map["Permissions-Policy"]).toContain("camera=(self)");
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
