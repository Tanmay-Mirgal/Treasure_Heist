import { SignJWT, jwtVerify } from "jose";

/**
 * Signed, HTTP-only session cookies. The token carries only the subject id,
 * role and a session version; every protected request re-loads the account
 * from MongoDB and compares the version, so a password reset or disable
 * invalidates existing sessions immediately.
 */

export type Role = "team" | "admin";
export type SessionClaims = { sub: string; role: Role; sv: number };

export const TEAM_COOKIE = "heist_team";
export const ADMIN_COOKIE = "heist_admin";

export const cookieNameFor = (role: Role) => (role === "team" ? TEAM_COOKIE : ADMIN_COOKIE);

function secretKey(secret: string) {
  return new TextEncoder().encode(secret);
}

export async function signSession(claims: SessionClaims, secret: string, ttlHours: number): Promise<string> {
  return new SignJWT({ role: claims.role, sv: claims.sv })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setIssuer("the-heist")
    .setAudience(claims.role)
    .setExpirationTime(`${ttlHours}h`)
    .sign(secretKey(secret));
}

export async function verifySession(token: string, role: Role, secret: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(secret), {
      issuer: "the-heist",
      audience: role,
      algorithms: ["HS256"],
    });
    if (payload.role !== role || typeof payload.sub !== "string" || typeof payload.sv !== "number") return null;
    return { sub: payload.sub, role, sv: payload.sv };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(ttlHours: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: ttlHours * 60 * 60,
  };
}
