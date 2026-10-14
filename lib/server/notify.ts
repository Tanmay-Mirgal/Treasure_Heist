import { broadcastLeaderboard, broadcastTeam } from "./ws-server";

/**
 * Notify connected WebSocket clients of live game changes (leaderboard or team score changes).
 * Dispatches both in-process and via HTTP fallback.
 */
export async function notifyRealtime(options: { leaderboard?: boolean; teamIds?: string[] } = {}) {
  const { leaderboard = true, teamIds = [] } = options;

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

  // 2. HTTP broadcast to standalone ws daemon if running on port 3001
  try {
    const port = process.env.WS_PORT || "3001";
    await fetch(`http://127.0.0.1:${port}/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leaderboard, teamIds }),
      signal: AbortSignal.timeout(1000),
    }).catch(() => {});
  } catch {
    // Non-blocking fire-and-forget
  }
}
