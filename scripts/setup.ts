/**
 * One-shot setup: seed the admin, seed the 10 teams, import the workbook.
 * Safe to re-run (every step is idempotent).
 *   npm run db:setup [-- --file path/to/HEIST.xlsx]
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { initCli, runMain } from "./_cli";

const flags = initCli();

runMain(async () => {
  const { getEnv } = await import("../lib/env");
  const { seedAdmin, seedTeams } = await import("../lib/services/seed");
  const { parseWorkbook } = await import("../lib/import/workbook");
  const { importWorkbook } = await import("../lib/import/apply");
  const { getSettings, rulesOf } = await import("../lib/services/settings");
  const env = getEnv();

  const admin = await seedAdmin(env.ADMIN_USERNAME, env.ADMIN_INITIAL_PASSWORD);
  console.log(admin.created ? `✔ Admin "${admin.username}" created` : `• Admin "${admin.username}" exists`);
  const teams = await seedTeams();
  console.log(`✔ Teams created: ${teams.created.join(", ") || "none"}; existing: ${teams.existing.length}`);

  const file = path.resolve(String(flags.file || process.env.HEIST_WORKBOOK || "data/import/HEIST.xlsx"));
  if (!existsSync(file)) throw new Error(`Workbook not found: ${file}`);
  const wb = await parseWorkbook(readFileSync(file), path.basename(file));
  const report = await importWorkbook(wb, { dryRun: false, rules: rulesOf(await getSettings()) });
  const a = report.applied!;
  const s = report.summary.issueSummary;
  console.log(`✔ Workbook imported: ${a.qrCreated} QR created / ${a.qrUpdated} updated / ${a.qrUnchanged} unchanged; routes ${a.sequencesCreated} created / ${a.sequencesUpdated} updated / ${a.sequencesUnchanged} unchanged / ${a.sequencesSkipped.length} skipped`);
  console.log(`  Validation: ${s.errors} errors, ${s.warnings} warnings, ${s.info} info → review at /admin/validation`);
});
