/**
 * Set the event to official LIVE mode (status = "RUNNING", testMode = false).
 *   npx tsx scripts/set-live.ts
 */
import { initCli, runMain } from "./_cli";

initCli();

runMain(async () => {
  const { ready } = await import("../lib/services/bootstrap");
  const { EventSettings, Team, ScanEvent, ScoreTransaction, CheckpointCompletion, Notification } = await import("../lib/models");
  await ready();

  const now = new Date();
  const res = await EventSettings.findOneAndUpdate(
    { key: "event" },
    {
      $set: {
        status: "RUNNING",
        testMode: false,
        participationEnabled: true,
        scoringEnabled: true,
        startedAt: now,
        pausedAt: null,
        endedAt: null,
      },
    },
    { upsert: true, returnDocument: "after" },
  );

  await Promise.all([
    ScanEvent.updateMany({ isTest: true }, { $set: { isTest: false } }),
    ScoreTransaction.updateMany({ isTest: true }, { $set: { isTest: false } }),
    CheckpointCompletion.updateMany({ isTest: true }, { $set: { isTest: false } }),
    Notification.updateMany({ isTest: true }, { $set: { isTest: false } }),
  ]);

  const teamCount = await Team.countDocuments({ status: "ACTIVE" });
  console.log(`✔ Event is now LIVE (RUNNING, testMode = false)`);
  console.log(`✔ All existing data converted to official LIVE!`);
  console.log(`✔ Active teams ready to play: ${teamCount}`);
  console.log(`  Started at: ${res.startedAt?.toISOString()}`);
});
