/**
 * Standalone WebSocket daemon for Subway Heist live leaderboard & score streaming.
 * Run with: npm run ws (or npx tsx scripts/ws-server.ts)
 */
import { initCli, runMain } from "./_cli";
import { startWebSocketServer } from "../lib/server/ws-server";
import { ready } from "../lib/services/bootstrap";

initCli();

runMain(async () => {
  await ready();
  const port = Number(process.env.WS_PORT) || 3001;
  startWebSocketServer(port);
  console.log(`⚡ Subway Heist WebSocket daemon is active and connected to MongoDB on port ${port}`);

  // Keep process alive indefinitely
  await new Promise(() => {});
});
