"use client";

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { toast } from "sonner";
import { api } from "@/lib/client/api";
import { usePoll } from "@/hooks/use-poll";
import type { ActionType, EventStatus } from "@/lib/game/types";

export type TeamState = {
  team: { id: string; name: string; username: string; number: number; status: string; score: number; gameStartedAt: string | null; finishedAt: string | null };
  progress: { completed: number; total: number; remaining: number; currentMission: number; finished: boolean };
  mission: {
    kind: "START" | "CLUE" | "ANSWER" | "FINISHED" | "UNCONFIGURED";
    title: string;
    text: string;
    lastAction: ActionType | null;
    challengePrompt?: string;
    hint: { used: boolean; text: string | null };
  };
  inventory: {
    hintsAvailable: number;
    hintsUsed: number;
    powerUps: { id: string; type: "MAGNET"; status: string; amount: number; grantedAt: string; activatedAt: string | null }[];
  };
  notifications: { unread: number; items: { id: string; type: string; message: string; read: boolean; createdAt: string }[] };
  event: {
    name: string;
    status: EventStatus;
    testMode: boolean;
    participationEnabled: boolean;
    scoringEnabled: boolean;
    magnetEnabled: boolean;
    leaderboardFrozen: boolean;
    serverNow: string;
    startedAt: string | null;
    timer: { enabled: boolean; durationMs: number | null; remainingMs: number | null; elapsedMs: number; running: boolean; expired: boolean };
  };
  rules: {
    scoringEnabled: boolean;
    points: { normal: number; bonus: number; superShoes: number; magnetCheckpoint: number; magnetTransfer: number; finish: number };
    superShoes: { mode: "HINT" | "SCORE_ONLY"; hintsGranted: number };
    magnet: { enabled: boolean; consumeWhenTargetEmpty: boolean; maxTransfer: number };
  };
};

type Ctx = {
  state: TeamState | null;
  error: Error | null;
  loading: boolean;
  lastOkAt: number | null;
  refresh: () => Promise<void>;
};

const TeamStateContext = createContext<Ctx | null>(null);

export function TeamStateProvider({ children }: { children: ReactNode }) {
  const { data, error, loading, refresh, lastOkAt } = usePoll<TeamState>(
    (signal) => api<TeamState>("/api/team/me", { signal, redirectOn401: "team" }),
    10_000,
  );
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!data) return;
    const ids = data.notifications.items.map((n) => n.id);
    if (seen.current === null) {
      seen.current = new Set(ids);
      return;
    }
    for (const n of data.notifications.items) {
      if (!seen.current.has(n.id) && !n.read) {
        if (n.type === "MAGNET_HIT") toast.warning("MAGNET alert", { description: n.message, duration: 10_000 });
        else toast.info("Message from the organizers", { description: n.message, duration: 10_000 });
      }
      seen.current.add(n.id);
    }
  }, [data]);

  // Real-time WebSocket connection for instant score updates
  useEffect(() => {
    const teamId = data?.team.id;
    if (!teamId) return;
    let ws: WebSocket | null = null;
    let retryTimer: NodeJS.Timeout | null = null;
    let unmounted = false;

    function connect() {
      if (unmounted) return;
      try {
        const host = typeof window !== "undefined" ? window.location.hostname || "localhost" : "localhost";
        ws = new WebSocket(`ws://${host}:3001`);
        ws.onopen = () => {
          if (unmounted) return;
          ws?.send(JSON.stringify({ type: "SUBSCRIBE_TEAM", teamId }));
        };
        ws.onmessage = (event) => {
          if (unmounted) return;
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === "TEAM_DATA") {
              void refresh();
            }
          } catch {
            // Ignore malformed
          }
        };
        ws.onclose = () => {
          if (unmounted) return;
          retryTimer = setTimeout(connect, 3000);
        };
      } catch {
        retryTimer = setTimeout(connect, 3000);
      }
    }

    connect();

    return () => {
      unmounted = true;
      if (retryTimer) clearTimeout(retryTimer);
      try {
        ws?.close();
      } catch {
        // Closed
      }
    };
  }, [data?.team.id, refresh]);

  return (
    <TeamStateContext value={{ state: data, error, loading, lastOkAt, refresh }}>{children}</TeamStateContext>
  );
}

export function useTeamState(): Ctx {
  const ctx = useContext(TeamStateContext);
  if (!ctx) throw new Error("useTeamState must be used inside TeamStateProvider");
  return ctx;
}
