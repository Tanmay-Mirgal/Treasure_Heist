import { broadcastLeaderboard, broadcastTeam } from "./ws-server";
import { invalidateLeaderboardCache } from "../services/leaderboard";

/**
 * Notify connected WebSocket clients of live game changes (leaderboard or team score changes).
 * Dispatches both in-process and via HTTP fallback (non-blocking for Vercel).
 */
export async function notifyRealtime(options: { leaderboard?: boolean; teamIds?: string[] } = {}) {
  const { leaderboard = true, teamIds = [] } = options;

  if (leaderboard) {
    invalidateLeaderboardCache();
  }

  // 1. Direct in-process broadcast if ws-server instance is active
  try {
    if (leaderboard) {
      void broadcastLeaderboard();
    }
    for (const tid of teamIds) {
      if (tid) void broadcastTeam(String(tid));
    }
  } catch {
    // Continue to HTTP fallback
  }

  // 2. Non-blocking HTTP broadcast to standalone ws daemon if running or external WS host configured
  const broadcastUrl =
    process.env.WS_BROADCAST_URL ||
    (!process.env.VERCEL ? `http://127.0.0.1:${process.env.WS_PORT || "3001"}/broadcast` : null);

  if (broadcastUrl) {
    void fetch(broadcastUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leaderboard, teamIds }),
      signal: AbortSignal.timeout(400),
    }).catch(() => {});
  }
}
