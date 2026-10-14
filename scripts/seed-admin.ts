/**
 * Create the administrator account if it does not exist (idempotent).
 *   npm run db:seed:admin
 * Uses ADMIN_USERNAME / ADMIN_INITIAL_PASSWORD (defaults: Tanmay / Tanmay123).
 */
import { initCli, runMain } from "./_cli";

initCli();

runMain(async () => {
  const { getEnv } = await import("../lib/env");
  const { seedAdmin, DEFAULT_ADMIN_PASSWORD } = await import("../lib/services/seed");
  const env = getEnv();
  const res = await seedAdmin(env.ADMIN_USERNAME, env.ADMIN_INITIAL_PASSWORD);
  if (res.created) {
    console.log(`✔ Admin "${res.username}" created.`);
    if (env.ADMIN_INITIAL_PASSWORD === DEFAULT_ADMIN_PASSWORD)
      console.log("  ⚠ Using the documented default password. Change it at /admin/account before the event.");
  } else {
    console.log(`• Admin "${res.username}" already exists — password left unchanged.`);
  }
});
