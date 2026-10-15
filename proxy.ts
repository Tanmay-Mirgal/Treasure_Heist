import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, TEAM_COOKIE, verifySession } from "./lib/auth/session";
import { sessionSecret } from "./lib/env";

/**
 * Edge proxy / middleware guard:
 * Enforces strict role separation and redirects visitors:
 * - Teams can ONLY access /play routes. Any attempt to access /admin routes immediately redirects to /play.
 * - Organizers can ONLY access /admin routes. Any attempt to access /play redirects to /admin.
 * - Logged-in users visiting login screens are bounced to their respective active dashboards.
 */
export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const secret = sessionSecret();

  const isRoleValid = async (cookieName: string, role: "team" | "admin") => {
    const token = req.cookies.get(cookieName)?.value;
    if (!token || !secret) return false;
    const claims = await verifySession(token, role, secret);
    return Boolean(claims);
  };

  const [hasAdmin, hasTeam] = await Promise.all([
    isRoleValid(ADMIN_COOKIE, "admin"),
    isRoleValid(TEAM_COOKIE, "team"),
  ]);

  const toUrl = (path: string, withNext = false) => {
    const url = req.nextUrl.clone();
    url.pathname = path;
    if (withNext) {
      url.search = `?next=${encodeURIComponent(pathname + search)}`;
    } else {
      url.search = "";
    }
    return NextResponse.redirect(url);
  };

  if (pathname.startsWith("/admin")) {
    if (pathname === "/admin/login") {
      if (hasAdmin) return toUrl("/admin");
      if (hasTeam) return toUrl("/play");
      return NextResponse.next();
    }

    // Attempting to access admin screens
    if (hasAdmin) return NextResponse.next();
    if (hasTeam) {
      // Normal team attempting to access admin route: IMMEDIATELY kick to /play
      return toUrl("/play");
    }
    // Unauthenticated visitor
    return toUrl("/admin/login", true);
  }

  if (pathname.startsWith("/play")) {
    if (hasTeam) return NextResponse.next();
    if (hasAdmin) return toUrl("/admin");
    return toUrl("/login", true);
  }

  if (pathname === "/login") {
    if (hasTeam) return toUrl("/play");
    if (hasAdmin) return toUrl("/admin");
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/play", "/play/:path*", "/login"],
};
