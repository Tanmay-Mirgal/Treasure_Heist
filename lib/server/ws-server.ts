import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { getLeaderboard, getScoreSummary } from "../services/leaderboard";
import { ready } from "../services/bootstrap";
import { Team } from "../models";

// Global in-memory subscriber registries
const leaderboardClients = new Set<WebSocket>();
const teamClients = new Map<string, Set<WebSocket>>();

let serverInstance: http.Server | null = null;
let wssInstance: WebSocketServer | null = null;

function safeSend(ws: WebSocket, data: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(data));
    } catch {
      // Ignored if socket closed during send
    }
  }
}

/**
 * Broadcast fresh leaderboard state to all connected leaderboard clients.
 */
export async function broadcastLeaderboard() {
  if (leaderboardClients.size === 0) return;
  try {
    await ready();
    const board = await getLeaderboard();
    const message = { type: "LEADERBOARD_DATA", payload: board, timestamp: Date.now() };
    for (const ws of leaderboardClients) {
      safeSend(ws, message);
    }
  } catch (err) {
    console.error("[WS] broadcastLeaderboard error:", err);
  }
}

/**
 * Broadcast fresh score & state to all connected sockets of a given team.
 */
export async function broadcastTeam(teamId: string) {
  const clients = teamClients.get(teamId);
  if (!clients || clients.size === 0) return;
  try {
    await ready();
    const summary = await getScoreSummary(teamId);
    if (!summary) return;
    const message = { type: "TEAM_DATA", payload: summary, timestamp: Date.now() };
    for (const ws of clients) {
      safeSend(ws, message);
    }
  } catch (err) {
    console.error(`[WS] broadcastTeam error (${teamId}):`, err);
  }
}

/**
 * Start the standalone WebSocket + HTTP broadcast server on port 3001.
 */
export function startWebSocketServer(port: number = Number(process.env.WS_PORT) || 3001) {
  if (serverInstance) {
    return serverInstance;
  }

  const server = http.createServer(async (req, res) => {
    // Enable CORS for Next.js app
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Healthcheck endpoint
    if (req.url === "/health" || req.url === "/") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "UP",
          type: "Subway Heist Real-time WebSocket Server",
          leaderboardSubscribers: leaderboardClients.size,
          teamSubscribers: Array.from(teamClients.entries()).map(([t, s]) => ({ teamId: t, count: s.size })),
        })
      );
      return;
    }

    // Internal broadcast trigger from Next.js API routes
    if (req.method === "POST" && req.url === "/broadcast") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", async () => {
        try {
          const payload = JSON.parse(body || "{}");
          if (payload.leaderboard !== false) {
            void broadcastLeaderboard();
          }
          if (Array.isArray(payload.teamIds)) {
            for (const tid of payload.teamIds) {
              if (tid) void broadcastTeam(String(tid));
            }
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid broadcast body" }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws) => {
    let subscribedTeamId: string | null = null;
    let isLeaderboardSub = false;

    // Send initial welcome message
    safeSend(ws, { type: "CONNECTED", message: "Subway Heist Real-time Socket Live 🛹" });

    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "PING") {
          safeSend(ws, { type: "PONG", timestamp: Date.now() });
          return;
        }

        if (msg.type === "SUBSCRIBE_LEADERBOARD") {
          isLeaderboardSub = true;
          leaderboardClients.add(ws);
          try {
            await ready();
            const board = await getLeaderboard();
            safeSend(ws, { type: "LEADERBOARD_DATA", payload: board, timestamp: Date.now() });
          } catch (e) {
            console.error("[WS] Initial leaderboard fetch failed:", e);
          }
        }

        if (msg.type === "SUBSCRIBE_TEAM" && msg.teamId) {
          const tid = String(msg.teamId);
          subscribedTeamId = tid;
          if (!teamClients.has(tid)) teamClients.set(tid, new Set());
          teamClients.get(tid)!.add(ws);

          try {
            await ready();
            const summary = await getScoreSummary(tid);
            if (summary) {
              safeSend(ws, { type: "TEAM_DATA", payload: summary, timestamp: Date.now() });
            }
          } catch (e) {
            console.error(`[WS] Initial team fetch failed (${tid}):`, e);
          }
        }
      } catch {
        // Bad JSON from client
      }
    });

    ws.on("close", () => {
      if (isLeaderboardSub) leaderboardClients.delete(ws);
      if (subscribedTeamId && teamClients.has(subscribedTeamId)) {
        teamClients.get(subscribedTeamId)!.delete(ws);
        if (teamClients.get(subscribedTeamId)!.size === 0) {
          teamClients.delete(subscribedTeamId);
        }
      }
    });

    ws.on("error", () => {
      // Ignored
    });
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.warn(`[WS] Port ${port} is already in use; another WS instance is running.`);
    } else {
      console.error("[WS] Server error:", err);
    }
  });

  server.listen(port, () => {
    console.log(`⚡ [WS] Real-time Subway Heist WebSocket server listening on port ${port}`);
  });

  serverInstance = server;
  wssInstance = wss;
  return server;
}
