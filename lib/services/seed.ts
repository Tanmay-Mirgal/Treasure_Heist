import { Admin, Team } from "../models";
import { hashPassword } from "../auth/password";
import { ready } from "./bootstrap";
import { getSettings, rulesOf } from "./settings";

/** Documented development default; an admin seeded with it must change it. */
export const DEFAULT_ADMIN_PASSWORD = "Tanmay123";

export const SEED_TEAM_COUNT = 20;

/**
 * Idempotent: creates the administrator only if missing. Never resets an
 * existing admin's password.
 */
export async function seedAdmin(username: string, password: string) {
  await ready();
  const existing = await Admin.findOne({ usernameLower: username.toLowerCase() }).lean();
  if (existing) return { created: false, username: existing.username };
  await Admin.create({
    username,
    usernameLower: username.toLowerCase(),
    passwordHash: await hashPassword(password),
    mustChangePassword: password === DEFAULT_ADMIN_PASSWORD,
  });
  return { created: true, username };
}

/**
 * Idempotent: creates Team1..Team10 (username = password = "TeamN") only if
 * missing. Existing teams, their passwords and their progress are untouched.
 */
export async function seedTeams(count = SEED_TEAM_COUNT) {
  await ready();
  const settings = await getSettings();
  const initialHints = rulesOf(settings).hints.initialPerTeam;
  const created: string[] = [];
  const existing: string[] = [];
  for (let n = 1; n <= count; n++) {
    const username = `Team${n}`;
    const found = await Team.findOne({ $or: [{ teamNumber: n }, { usernameLower: username.toLowerCase() }] }).lean();
    if (found) {
      existing.push(found.username);
      continue;
    }
    await Team.create({
      username,
      usernameLower: username.toLowerCase(),
      passwordHash: await hashPassword(username),
      displayName: `Team ${n}`,
      teamNumber: n,
      hints: { available: initialHints, used: 0 },
    });
    created.push(username);
  }
  return { created, existing };
}
