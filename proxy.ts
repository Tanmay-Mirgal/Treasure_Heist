import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, TEAM_COOKIE, verifySession } from "./lib/auth/session";
import { sessionSecret } from "./lib/env";

/**
 * Optimistic page guard: redirect visitors without a valid signed session
 * cookie to the right login page. This is a UX convenience only — every API
 * route re-checks the session against MongoDB.
 */
export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const secret = sessionSecret();
  const isValid = async (cookie: string, role: "team" | "admin") => {
    const token = req.cookies.get(cookie)?.value;
    return Boolean(token && secret && (await verifySession(token, role, secret)));
  };
  const toLogin = (path: string) => {
    const url = req.nextUrl.clone();
    url.pathname = path;
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  };

  if (pathname.startsWith("/admin")) {
    if (pathname === "/admin/login") return NextResponse.next();
    return (await isValid(ADMIN_COOKIE, "admin")) ? NextResponse.next() : toLogin("/admin/login");
  }
  if (pathname.startsWith("/play")) {
    return (await isValid(TEAM_COOKIE, "team")) ? NextResponse.next() : toLogin("/login");
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/play/:path*", "/admin/:path*"],
};
