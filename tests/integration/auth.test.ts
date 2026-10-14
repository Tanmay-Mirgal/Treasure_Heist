import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { POST as teamLogin } from "@/app/api/auth/team/login/route";
import { POST as adminLogin } from "@/app/api/auth/admin/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as sessionGet } from "@/app/api/auth/session/route";
import { GET as teamMe } from "@/app/api/team/me/route";
import { GET as adminOverview } from "@/app/api/admin/overview/route";
import { GET as adminTeams, POST as adminCreateTeam } from "@/app/api/admin/teams/route";
import { POST as resetPassword } from "@/app/api/admin/teams/[id]/password/route";
import { PATCH as patchTeam } from "@/app/api/admin/teams/[id]/route";
import { GET as leaderboard } from "@/app/api/leaderboard/route";
import { Admin, Team } from "@/lib/models";
import { verifyPassword } from "@/lib/auth/password";
import { ADMIN_COOKIE, TEAM_COOKIE } from "@/lib/auth/session";
import { ADMIN_PASSWORD, call, cookieFrom, dropTestDb, resetGame, seedFixture, teamId, useTestDb } from "../helpers/setup";
import { loginAdmin, loginTeam } from "../helpers/auth";

beforeAll(async () => {
  await useTestDb("auth");
  await seedFixture();
});
afterAll(dropTestDb);
beforeEach(resetGame);

describe("team login", () => {
  it("Team1 logs in with its seeded credentials and gets an HTTP-only session cookie", async () => {
    const r = await call(teamLogin, { body: { username: "Team1", password: "Team1" } });
    expect(r.status).toBe(200);
    expect(r.body.data.team).toMatchObject({ name: "Team 1", username: "Team1", number: 1 });
    const setCookie = r.res.headers.getSetCookie().join("\n");
    expect(setCookie).toContain(`${TEAM_COOKIE}=`);
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");
  });

  it("is case-insensitive on the username", async () => {
    const r = await call(teamLogin, { body: { username: "team1", password: "Team1" } });
    expect(r.status).toBe(200);
  });

  it("rejects an incorrect password with a generic message and no cookie", async () => {
    const r = await call(teamLogin, { body: { username: "Team1", password: "nope" } });
    expect(r.status).toBe(401);
    expect(r.body.error?.code).toBe("INVALID_CREDENTIALS");
    expect(r.res.headers.getSetCookie()).toHaveLength(0);
  });

  it("does not reveal whether a username exists", async () => {
    const a = await call(teamLogin, { body: { username: "Team1", password: "wrong" } });
    const b = await call(teamLogin, { body: { username: "NoSuchTeam", password: "wrong" } });
    expect(b.status).toBe(a.status);
    expect(b.body.error?.message).toBe(a.body.error?.message);
  });

  it("validates input", async () => {
    expect((await call(teamLogin, { body: { username: "", password: "x" } })).status).toBe(400);
    expect((await call(teamLogin, { body: { username: "Team1" } })).status).toBe(400);
    expect((await call(teamLogin, { body: { username: "Team1", password: "x".repeat(500) } })).status).toBe(400);
  });

  it("rate-limits repeated failures, then blocks even the right password until the window passes", async () => {
    for (let i = 0; i < 8; i++) await call(teamLogin, { body: { username: "Team2", password: "bad" }, headers: { "x-forwarded-for": "9.9.9.9" } });
    const blocked = await call(teamLogin, { body: { username: "Team2", password: "Team2" }, headers: { "x-forwarded-for": "9.9.9.9" } });
    expect(blocked.status).toBe(429);
    // a different client address is unaffected
    const other = await call(teamLogin, { body: { username: "Team2", password: "Team2" }, headers: { "x-forwarded-for": "8.8.8.8" } });
    expect(other.status).toBe(200);
  });

  it("refuses a disabled team", async () => {
    await Team.updateOne({ teamNumber: 3 }, { $set: { status: "DISABLED" } });
    const r = await call(teamLogin, { body: { username: "Team3", password: "Team3" } });
    expect(r.status).toBe(403);
    expect(r.body.error?.code).toBe("TEAM_DISABLED");
  });

  it("stores only bcrypt hashes — never plaintext", async () => {
    const t = await Team.findOne({ teamNumber: 1 }).select("+passwordHash").lean();
    expect(t!.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(t!.passwordHash).not.toContain("Team1");
    expect(await verifyPassword("Team1", t!.passwordHash)).toBe(true);
    const a = await Admin.findOne({ username: "Tanmay" }).select("+passwordHash").lean();
    expect(a!.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(a!.passwordHash).not.toContain(ADMIN_PASSWORD);
  });
});

describe("session isolation", () => {
  it("restores the authoritative state for the logged-in team", async () => {
    const cookie = await loginTeam(1);
    const me = await call(teamMe, { cookie });
    expect(me.status).toBe(200);
    expect(me.body.data.team.number).toBe(1);
    expect(me.body.data.progress).toMatchObject({ completed: 0, finished: false });
  });

  it("Team1 cannot read Team2 by passing another team id in the query or body", async () => {
    const cookie = await loginTeam(1);
    const t2 = await teamId(2);
    const viaQuery = await call(teamMe, { cookie, path: `/api/team/me?teamId=${t2}&team=${t2}&id=${t2}` });
    expect(viaQuery.body.data.team.number).toBe(1);
    expect(viaQuery.raw).not.toContain(t2);
    const viaHeader = await call(teamMe, { cookie, headers: { "x-team-id": t2 } });
    expect(viaHeader.body.data.team.number).toBe(1);
  });

  it("rejects a cookie signed with a different secret", async () => {
    const forged = await new SignJWT({ role: "team", sv: 1 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(await teamId(2))
      .setIssuer("the-heist")
      .setAudience("team")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("attacker-chosen-secret-that-is-long-enough-123456"));
    const r = await call(teamMe, { cookie: `${TEAM_COOKIE}=${forged}` });
    expect(r.status).toBe(401);
  });

  it("rejects an unsigned (alg=none) token", async () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const none = `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: await teamId(2), role: "team", sv: 1, iss: "the-heist", aud: "team", exp: 9999999999 })}.`;
    expect((await call(teamMe, { cookie: `${TEAM_COOKIE}=${none}` })).status).toBe(401);
  });

  it("a team token is not accepted as an admin token (separate audiences)", async () => {
    const teamCookie = await loginTeam(1);
    const token = teamCookie.split("=")[1]!;
    const r = await call(adminOverview, { cookie: `${ADMIN_COOKIE}=${token}` });
    expect([401, 403]).toContain(r.status);
  });

  it("invalidates existing sessions after a password reset or disable", async () => {
    const team = await loginTeam(3);
    expect((await call(teamMe, { cookie: team })).status).toBe(200);
    const admin = await loginAdmin();
    const reset = await call(resetPassword, { cookie: admin, params: { id: await teamId(3) }, body: { password: "NewPass3!", reason: "forgot password" } });
    expect(reset.status).toBe(200);
    expect((await call(teamMe, { cookie: team })).status).toBe(401);
    expect((await call(teamLogin, { body: { username: "Team3", password: "Team3" } })).status).toBe(401);
    expect((await call(teamLogin, { body: { username: "Team3", password: "NewPass3!" } })).status).toBe(200);
    // restore for later tests
    await call(resetPassword, { cookie: admin, params: { id: await teamId(3) }, body: { password: "Team3", reason: "restore seed password" } });

    const t1 = await loginTeam(1);
    await call(patchTeam, { cookie: admin, method: "PATCH", params: { id: await teamId(1) }, body: { status: "DISABLED", reason: "test disable" } });
    // disabling revokes the session immediately (version bump) and blocks new logins
    expect((await call(teamMe, { cookie: t1 })).status).toBe(401);
    const relogin = await call(teamLogin, { body: { username: "Team1", password: "Team1" } });
    expect(relogin.status).toBe(403);
    expect(relogin.body.error?.code).toBe("TEAM_DISABLED");
  });

  it("logout clears the cookie", async () => {
    const r = await call(logout, { body: { role: "all" } });
    const cleared = r.res.headers.getSetCookie().join("\n");
    expect(cleared).toContain(`${TEAM_COOKIE}=;`);
    expect(cleared).toContain(`${ADMIN_COOKIE}=;`);
  });

  it("session endpoint reports who is logged in", async () => {
    const r = await call(sessionGet, { cookie: await loginTeam(2) });
    expect(r.body.data.team.number).toBe(2);
    expect(r.body.data.admin).toBeNull();
  });
});

describe("administrator", () => {
  it("logs in with the configured seed credentials", async () => {
    const r = await call(adminLogin, { body: { username: "Tanmay", password: ADMIN_PASSWORD } });
    expect(r.status).toBe(200);
    expect(r.res.headers.getSetCookie().join("\n")).toContain(`${ADMIN_COOKIE}=`);
  });

  it("rejects a wrong admin password and a team password", async () => {
    expect((await call(adminLogin, { body: { username: "Tanmay", password: "bad" } })).status).toBe(401);
    expect((await call(adminLogin, { body: { username: "Team1", password: "Team1" } })).status).toBe(401);
  });

  it("the admin cannot sign in through the team login (and vice versa)", async () => {
    expect((await call(teamLogin, { body: { username: "Tanmay", password: ADMIN_PASSWORD } })).status).toBe(401);
  });

  it("seeding is idempotent and never resets the admin password", async () => {
    const { seedAdmin, seedTeams } = await import("@/lib/services/seed");
    await Admin.updateOne({ username: "Tanmay" }, { $set: { passwordHash: await (await import("@/lib/auth/password")).hashPassword("changed-by-admin-1") } });
    const again = await seedAdmin("Tanmay", ADMIN_PASSWORD);
    expect(again.created).toBe(false);
    expect((await call(adminLogin, { body: { username: "Tanmay", password: ADMIN_PASSWORD } })).status).toBe(401);
    expect((await call(adminLogin, { body: { username: "Tanmay", password: "changed-by-admin-1" } })).status).toBe(200);
    // put it back for other tests
    await Admin.updateOne({ username: "Tanmay" }, { $set: { passwordHash: await (await import("@/lib/auth/password")).hashPassword(ADMIN_PASSWORD) } });
    const teams = await seedTeams(3);
    expect(teams.created).toEqual([]);
    expect(await Team.countDocuments()).toBe(3);
  });
});

describe("authorization", () => {
  it("unauthenticated requests to protected endpoints are refused (401); leaderboard is public", async () => {
    expect((await call(teamMe)).status).toBe(401);
    expect((await call(adminOverview)).status).toBe(401);
    expect((await call(adminTeams)).status).toBe(401);
    expect((await call(leaderboard)).status).toBe(200);
  });

  it("a team account cannot reach any admin endpoint (403)", async () => {
    const cookie = await loginTeam(1);
    expect((await call(adminOverview, { cookie })).status).toBe(403);
    expect((await call(adminTeams, { cookie })).status).toBe(403);
    const create = await call(adminCreateTeam, { cookie, body: { username: "Evil", displayName: "Evil Team", teamNumber: 99, password: "pass1234" } });
    expect(create.status).toBe(403);
    expect(await Team.countDocuments({ username: "Evil" })).toBe(0);
    expect((await call(resetPassword, { cookie, params: { id: await teamId(2) }, body: { password: "owned1234", reason: "attack" } })).status).toBe(403);
    expect((await call(teamLogin, { body: { username: "Team2", password: "Team2" } })).status).toBe(200);
  });

  it("the admin can read the overview and teams; the leaderboard is open to teams and admin", async () => {
    const admin = await loginAdmin();
    expect((await call(adminOverview, { cookie: admin })).status).toBe(200);
    const teams = await call(adminTeams, { cookie: admin });
    expect(teams.body.data.teams).toHaveLength(3);
    expect(teams.raw).not.toMatch(/passwordHash|\$2[aby]\$/);
    expect((await call(leaderboard, { cookie: admin })).status).toBe(200);
    expect((await call(leaderboard, { cookie: await loginTeam(2) })).status).toBe(200);
  });

  it("blocks cross-site mutating requests (CSRF origin check)", async () => {
    const r = await call(teamLogin, { body: { username: "Team1", password: "Team1" }, headers: { origin: "https://evil.example.com", host: "localhost:3000" } });
    expect(r.status).toBe(403);
    const same = await call(teamLogin, { body: { username: "Team1", password: "Team1" }, headers: { origin: "http://localhost:3000", host: "localhost:3000" } });
    expect(same.status).toBe(200);
    expect(cookieFrom(same.res)).toContain(TEAM_COOKIE);
  });
});
