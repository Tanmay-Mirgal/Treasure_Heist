import { handle, ok } from "@/lib/http";
import { getAdminFromRequest, getTeamFromRequest } from "@/lib/auth/guards";

export const GET = handle(async (req) => {
  const [team, admin] = await Promise.all([getTeamFromRequest(req), getAdminFromRequest(req)]);
  return ok({
    team: team
      ? { id: String(team._id), name: team.displayName, username: team.username, number: team.teamNumber, status: team.status }
      : null,
    admin: admin ? { username: admin.username, mustChangePassword: admin.mustChangePassword } : null,
  });
});
