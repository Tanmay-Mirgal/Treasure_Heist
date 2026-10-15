import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Types } from "mongoose";
import { ADMIN_COOKIE, TEAM_COOKIE, verifySession, type SessionClaims } from "./session";
import { sessionSecret } from "../env";
import { Admin, Team, type AdminDoc, type TeamDoc } from "../models";
import { ready } from "../services/bootstrap";

/**
 * Server Component guards for layout & page rendering.
 *
 * These run strictly on the server before any HTML or React Server Component
 * payload is generated or streamed to the client. If an unauthorized user
 * (such as a normal team attempting to access an organizer screen) requests the page,
 * an instant Next.js redirect is triggered so zero protected content is returned.
 */

export async function ensureAdminSession(): Promise<{ admin: AdminDoc | null; claims: SessionClaims }> {
  const cookieStore = await cookies();
  const secret = sessionSecret();
  const adminToken = cookieStore.get(ADMIN_COOKIE)?.value;
  const teamToken = cookieStore.get(TEAM_COOKIE)?.value;

  if (adminToken && secret) {
    const claims = await verifySession(adminToken, "admin", secret);
    if (claims && Types.ObjectId.isValid(claims.sub)) {
      try {
        await ready();
        const admin = await Admin.findById(claims.sub).lean<AdminDoc>();
        if (admin && admin.active && admin.sessionVersion === claims.sv) {
          return { admin, claims };
        }
      } catch {
        // Fallback to cryptographic session if DB connection encounters transient issue
        return { admin: null, claims };
      }
    }
  }

  // If a team is attempting to access admin routes, immediately kick them to /play
  if (teamToken && secret) {
    const teamClaims = await verifySession(teamToken, "team", secret);
    if (teamClaims) {
      redirect("/play");
    }
  }

  // Not authenticated as admin
  redirect("/admin/login");
}

export async function ensureTeamSession(): Promise<{ team: TeamDoc | null; claims: SessionClaims }> {
  const cookieStore = await cookies();
  const secret = sessionSecret();
  const teamToken = cookieStore.get(TEAM_COOKIE)?.value;
  const adminToken = cookieStore.get(ADMIN_COOKIE)?.value;

  if (teamToken && secret) {
    const claims = await verifySession(teamToken, "team", secret);
    if (claims && Types.ObjectId.isValid(claims.sub)) {
      try {
        await ready();
        const team = await Team.findById(claims.sub).lean<TeamDoc>();
        if (team && team.status === "ACTIVE" && team.sessionVersion === claims.sv) {
          return { team, claims };
        }
      } catch {
        // Fallback to cryptographic session
        return { team: null, claims };
      }
    }
  }

  // If an organizer is accessing /play without a team session, send them to control room
  if (adminToken && secret) {
    const adminClaims = await verifySession(adminToken, "admin", secret);
    if (adminClaims) {
      redirect("/admin");
    }
  }

  redirect("/login");
}

export async function redirectIfAuthenticated(currentRole: "team" | "admin"): Promise<void> {
  const cookieStore = await cookies();
  const secret = sessionSecret();
  if (!secret) return;

  const adminToken = cookieStore.get(ADMIN_COOKIE)?.value;
  const teamToken = cookieStore.get(TEAM_COOKIE)?.value;

  const adminClaims = adminToken ? await verifySession(adminToken, "admin", secret) : null;
  const teamClaims = teamToken ? await verifySession(teamToken, "team", secret) : null;

  if (currentRole === "team") {
    if (teamClaims) redirect("/play");
    if (adminClaims) redirect("/admin");
  } else {
    if (adminClaims) redirect("/admin");
    if (teamClaims) redirect("/play");
  }
}
