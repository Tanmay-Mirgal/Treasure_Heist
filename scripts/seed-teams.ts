/**
 * Create Team1..Team10 (password = username) if missing (idempotent; never
 * resets passwords or progress).
 *   npm run db:seed:teams
 */
import { initCli, runMain } from "./_cli";

initCli();

runMain(async () => {
  const { seedTeams } = await import("../lib/services/seed");
  const res = await seedTeams();
  console.log(`✔ Teams created: ${res.created.length ? res.created.join(", ") : "none"}`);
  if (res.existing.length) console.log(`• Already present (unchanged): ${res.existing.join(", ")}`);
});
