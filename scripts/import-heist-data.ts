/**
 * Import THE HEIST workbook into MongoDB.
 *
 *   npm run db:import                         # data/import/HEIST.xlsx
 *   npm run db:import -- --file path/to/HEIST.xlsx
 *   npm run db:import -- --dry-run            # validate only, no database access
 *   npm run db:import -- --report report.json # also write the full report as JSON
 *   npm run db:import -- --force-sequences    # update routes even for teams with progress
 *
 * The workbook path can also be set with HEIST_WORKBOOK.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { initCli, runMain } from "./_cli";

const flags = initCli();

runMain(async () => {
  const file = path.resolve(String(flags.file || process.env.HEIST_WORKBOOK || "data/import/HEIST.xlsx"));
  if (!existsSync(file)) throw new Error(`Workbook not found: ${file}\nPass --file <path> or set HEIST_WORKBOOK.`);

  const { parseWorkbook } = await import("../lib/import/workbook");
  const { importWorkbook } = await import("../lib/import/apply");
  const { DEFAULT_RULES } = await import("../lib/game/types");
  const dryRun = Boolean(flags["dry-run"]);

  let rules = DEFAULT_RULES;
  if (!dryRun) {
    const { getSettings, rulesOf } = await import("../lib/services/settings");
    rules = rulesOf(await getSettings());
  }

  console.log(`Reading ${file}${dryRun ? " (dry run — validation only)" : ""}`);
  const wb = await parseWorkbook(readFileSync(file), path.basename(file));
  const report = await importWorkbook(wb, { dryRun, forceSequences: Boolean(flags["force-sequences"]), rules });

  const s = report.summary;
  console.log("\n── Import report ─────────────────────────────────────────");
  console.log(`Workbook sha256        ${report.sha256.slice(0, 16)}…`);
  console.log(`Worksheets             ${s.sheets}`);
  console.log(`Teams found            ${s.teamsFound}`);
  console.log(`Starting clues found   ${s.startingCluesFound}`);
  console.log(`Sequence entries found ${s.sequenceEntriesFound}`);
  console.log(`QR copies found        ${s.qrCopiesFound} (${s.baseQrIdsFound} base QR ids)`);
  console.log(`Locations found        ${s.locationsFound}`);
  console.log(`Shared finish          ${s.sharedFinish ?? "NOT SHARED"}`);
  if (report.applied) {
    const a = report.applied;
    console.log(`QR checkpoints         ${a.qrCreated} created, ${a.qrUpdated} updated, ${a.qrUnchanged} unchanged, ${a.qrEditsPreserved} organizer edits preserved`);
    console.log(`Team routes            ${a.sequencesCreated} created, ${a.sequencesUpdated} updated, ${a.sequencesUnchanged} unchanged, ${a.sequencesSkipped.length} skipped`);
    for (const sk of a.sequencesSkipped) console.log(`   ↳ Team ${sk.teamNumber}: ${sk.reason}`);
  }
  console.log(`Issues                 ${s.issueSummary.errors} errors, ${s.issueSummary.warnings} warnings, ${s.issueSummary.info} info`);
  for (const [code, n] of Object.entries(s.issueSummary.byCode)) console.log(`   ${code.padEnd(34)} ${n}`);

  const shown = report.issues.filter((i) => i.severity !== "INFO");
  if (shown.length) {
    console.log("\n── Errors and warnings ───────────────────────────────────");
    for (const i of shown) console.log(`[${i.severity}] ${i.code}: ${i.message}`);
  }
  if (flags.report) {
    const out = path.resolve(String(flags.report));
    writeFileSync(out, JSON.stringify(report, null, 2));
    console.log(`\nFull report written to ${out}`);
  }
  if (report.importRunId) console.log(`\nSaved as import run ${report.importRunId} (visible at /admin/validation).`);
});
