import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { safeNext } from "@/lib/client/api";
import { signSession, ADMIN_COOKIE, TEAM_COOKIE } from "@/lib/auth/session";

const TEST_SECRET = "01234567890123456789012345678901";
process.env.SESSION_SECRET = TEST_SECRET;

async function makeSignedCookie(role: "team" | "admin", sub = "507f1f77bcf86cd799439011") {
  return await signSession({ sub, role, sv: 1 }, TEST_SECRET, 12);
}

describe("safeNext role isolation", () => {
  it("prevents team role from redirecting into /admin or subroutes", () => {
    expect(safeNext("/admin", "/play", "team")).toBe("/play");
    expect(safeNext("/admin/teams", "/play", "team")).toBe("/play");
    expect(safeNext("/admin/scoring", "/play", "team")).toBe("/play");
    expect(safeNext("/play/scan", "/play", "team")).toBe("/play/scan");
    expect(safeNext("/leaderboard", "/play", "team")).toBe("/leaderboard");
  });

  it("prevents admin role from redirecting into /play or subroutes", () => {
    expect(safeNext("/play", "/admin", "admin")).toBe("/admin");
    expect(safeNext("/play/scan", "/admin", "admin")).toBe("/admin");
    expect(safeNext("/admin/teams", "/admin", "admin")).toBe("/admin/teams");
    expect(safeNext("/leaderboard", "/admin", "admin")).toBe("/leaderboard");
  });

  it("blocks malicious or open redirects", () => {
    expect(safeNext("https://malicious.com", "/play", "team")).toBe("/play");
    expect(safeNext("//evil.com", "/play", "team")).toBe("/play");
    expect(safeNext("/\\evil.com", "/play", "team")).toBe("/play");
    expect(safeNext(null, "/play", "team")).toBe("/play");
  });
});

describe("proxy / middleware route protection", () => {
  it("redirects unauthenticated visitor requesting /admin to /admin/login", async () => {
    const req = new NextRequest("http://localhost:3000/admin");
    const res = await proxy(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/admin/login?next=%2Fadmin");
  });

  it("BLOCKS normal team from /admin and kicks them to /play", async () => {
    const teamJwt = await makeSignedCookie("team");
    const req = new NextRequest("http://localhost:3000/admin", {
      headers: {
        cookie: `${TEAM_COOKIE}=${teamJwt}`,
      },
    });
    const res = await proxy(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/play");
  });

  it("BLOCKS normal team from any /admin subroute (/admin/teams) and kicks them to /play", async () => {
    const teamJwt = await makeSignedCookie("team");
    const req = new NextRequest("http://localhost:3000/admin/teams", {
      headers: {
        cookie: `${TEAM_COOKIE}=${teamJwt}`,
      },
    });
    const res = await proxy(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/play");
  });

  it("BLOCKS normal team from /admin/login and redirects to /play", async () => {
    const teamJwt = await makeSignedCookie("team");
    const req = new NextRequest("http://localhost:3000/admin/login", {
      headers: {
        cookie: `${TEAM_COOKIE}=${teamJwt}`,
      },
    });
    const res = await proxy(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/play");
  });

  it("allows organizer with valid admin cookie into /admin", async () => {
    const adminJwt = await makeSignedCookie("admin");
    const req = new NextRequest("http://localhost:3000/admin", {
      headers: {
        cookie: `${ADMIN_COOKIE}=${adminJwt}`,
      },
    });
    const res = await proxy(req);
    // NextResponse.next() continues without redirect
    expect(res.headers.get("location")).toBeNull();
  });

  it("redirects organizer visiting /admin/login to /admin dashboard", async () => {
    const adminJwt = await makeSignedCookie("admin");
    const req = new NextRequest("http://localhost:3000/admin/login", {
      headers: {
        cookie: `${ADMIN_COOKIE}=${adminJwt}`,
      },
    });
    const res = await proxy(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/admin");
  });

  it("redirects unauthenticated visitor requesting /play to /login", async () => {
    const req = new NextRequest("http://localhost:3000/play");
    const res = await proxy(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/login?next=%2Fplay");
  });

  it("allows team with valid team cookie into /play", async () => {
    const teamJwt = await makeSignedCookie("team");
    const req = new NextRequest("http://localhost:3000/play", {
      headers: {
        cookie: `${TEAM_COOKIE}=${teamJwt}`,
      },
    });
    const res = await proxy(req);
    expect(res.headers.get("location")).toBeNull();
  });

  it("redirects admin visiting /play to /admin control room", async () => {
    const adminJwt = await makeSignedCookie("admin");
    const req = new NextRequest("http://localhost:3000/play", {
      headers: {
        cookie: `${ADMIN_COOKIE}=${adminJwt}`,
      },
    });
    const res = await proxy(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/admin");
  });

  it("redirects team visiting /login to /play", async () => {
    const teamJwt = await makeSignedCookie("team");
    const req = new NextRequest("http://localhost:3000/login", {
      headers: {
        cookie: `${TEAM_COOKIE}=${teamJwt}`,
      },
    });
    const res = await proxy(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/play");
  });
});
