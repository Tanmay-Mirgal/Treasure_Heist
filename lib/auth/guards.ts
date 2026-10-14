import type { NextRequest } from "next/server";
import { Types } from "mongoose";
import { getEnv } from "../env";
import { Admin, Team, type AdminDoc, type TeamDoc } from "../models";
import { ready } from "../services/bootstrap";
import { ApiError, forbidden, unauthorized } from "../http";
import { ADMIN_COOKIE, TEAM_COOKIE, verifySession } from "./session";

/**
 * Server-side authorization for Route Handlers. Every protected operation
 * calls one of these; UI hiding is never relied upon.
 */

export async function getTeamFromRequest(req: NextRequest): Promise<TeamDoc | null> {
  const token = req.cookies.get(TEAM_COOKIE)?.value;
  if (!token) return null;
  const claims = await verifySession(token, "team", getEnv().SESSION_SECRET);
  if (!claims || !Types.ObjectId.isValid(claims.sub)) return null;
  await ready();
  const team = await Team.findById(claims.sub).lean<TeamDoc>();
  if (!team || team.sessionVersion !== claims.sv) return null;
  return team;
}

export async function getAdminFromRequest(req: NextRequest): Promise<AdminDoc | null> {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  const claims = await verifySession(token, "admin", getEnv().SESSION_SECRET);
  if (!claims || !Types.ObjectId.isValid(claims.sub)) return null;
  await ready();
  const admin = await Admin.findById(claims.sub).lean<AdminDoc>();
  if (!admin || !admin.active || admin.sessionVersion !== claims.sv) return null;
  return admin;
}

export async function requireTeam(req: NextRequest): Promise<TeamDoc> {
  const team = await getTeamFromRequest(req);
  if (!team) throw unauthorized();
  if (team.status !== "ACTIVE") throw new ApiError(403, "TEAM_DISABLED", "This team account is disabled. Contact the Event Desk.");
  return team;
}

/**
 * In production an admin still using the seeded default password must change
 * it before any other administrative action.
 */
export async function requireAdmin(req: NextRequest, opts: { allowPasswordChange?: boolean } = {}): Promise<AdminDoc> {
  const admin = await getAdminFromRequest(req);
  if (!admin) {
    // A logged-in team must not learn anything beyond "forbidden".
    if (req.cookies.get(TEAM_COOKIE)) throw forbidden();
    throw unauthorized("Administrator login required.");
  }
  if (admin.mustChangePassword && process.env.NODE_ENV === "production" && !opts.allowPasswordChange) {
    throw new ApiError(403, "PASSWORD_CHANGE_REQUIRED", "Change the default administrator password before continuing.");
  }
  return admin;
}

export async function requireTeamOrAdmin(req: NextRequest): Promise<{ team: TeamDoc | null; admin: AdminDoc | null }> {
  const [team, admin] = await Promise.all([getTeamFromRequest(req), getAdminFromRequest(req)]);
  if (!team && !admin) throw unauthorized();
  if (!admin && team && team.status !== "ACTIVE") throw new ApiError(403, "TEAM_DISABLED", "This team account is disabled.");
  return { team, admin };
}

export const actorOf = (admin: AdminDoc) => ({ id: admin._id, username: admin.username });
